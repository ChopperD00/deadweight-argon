"""
ARGON Modal Server — ComfyUI inference backend for deadweight-argon

Deploys ComfyUI + required custom nodes as a serverless GPU function on Modal.
Exposes the same HTTP API surface as argon-server.js so vercel.json rewrite
just swaps the destination URL.

Stack:
  - ComfyUI (latest) with custom nodes: LivePortrait, DWPose/ControlNet, BiRefNet
  - CivitAI LoRA download + caching via Modal Volume
  - FastAPI HTTP layer matching the argon-server.js endpoint contract
  - GPU: L4 (fast cold start, great for inference) or A10G for heavy loads
  - Volume: /models — persists checkpoints, LoRAs, embeddings across runs

Helper modules (bundled into image via add_local_python_source):
  - comfy_workflows.py — workflow templates + _sub()
  - comfy_helpers.py   — run_comfy_workflow, ARKit mapping, pose templates, etc.

Deploy:
  pip install modal
  modal setup          # authenticate once
  modal deploy modal_server.py

After deploy, Modal gives you a URL like:
  https://chopperD00--deadweight-argon-argon-api.modal.run

Put that URL in vercel.json rewrites destination.
"""

import modal
import json
import os
import uuid
import time
from pathlib import Path

# ── Modal App ────────────────────────────────────────────────────────────────
app = modal.App("deadweight-argon")

# ── Persistent Volume (checkpoints, LoRAs, embeddings) ───────────────────────
volume = modal.Volume.from_name("argon-models", create_if_missing=True)

MODELS_DIR    = Path("/models")
LORA_DIR      = MODELS_DIR / "loras"
CKPT_DIR      = MODELS_DIR / "checkpoints"
COMFY_DIR     = Path("/opt/ComfyUI")
COMFY_MODELS  = COMFY_DIR / "models"

# ── ComfyUI Image ─────────────────────────────────────────────────────────────
comfy_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git", "wget", "curl", "ffmpeg",
        "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6",
    )
    .pip_install(
        "torch==2.1.2", "torchvision==0.16.2", "torchaudio==2.1.2",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "fastapi[standard]", "uvicorn", "httpx", "requests",
        "Pillow", "numpy", "opencv-python-headless",
        "safetensors", "einops", "transformers", "accelerate",
        "onnxruntime-gpu", "insightface", "mediapipe",
    )
    # ComfyUI core
    .run_commands(
        "git clone --depth=1 https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI",
        "cd /opt/ComfyUI && pip install -r requirements.txt",
    )
    # DWPose + ControlNet preprocessing
    .run_commands(
        "git clone --depth=1 https://github.com/Fannovel16/comfyui_controlnet_aux "
        "/opt/ComfyUI/custom_nodes/comfyui_controlnet_aux",
        "cd /opt/ComfyUI/custom_nodes/comfyui_controlnet_aux && pip install -r requirements.txt",
    )
    # LivePortrait — expression drive
    .run_commands(
        "git clone --depth=1 https://github.com/kijai/ComfyUI-LivePortraitKJ "
        "/opt/ComfyUI/custom_nodes/ComfyUI-LivePortraitKJ",
        "cd /opt/ComfyUI/custom_nodes/ComfyUI-LivePortraitKJ && pip install -r requirements.txt",
    )
    # BiRefNet — segmentation (node manages its own model downloads)
    .run_commands(
        "git clone --depth=1 https://github.com/ZHO-ZHO-ZHO/ComfyUI-BiRefNet-ZHO "
        "/opt/ComfyUI/custom_nodes/ComfyUI-BiRefNet-ZHO",
    )
    # Bundle our helper modules into the image
    .add_local_python_source("comfy_workflows")
    .add_local_python_source("comfy_helpers")
)

# ── Secrets ───────────────────────────────────────────────────────────────────
secrets = [modal.Secret.from_name("argon-secrets", required_keys=["CIVITAI_API_KEY"])]

# ── Cross-request job store ───────────────────────────────────────────────────
job_dict = modal.Dict.from_name("argon-jobs", create_if_missing=True)


# ─────────────────────────────────────────────────────────────────────────────
# ArgonRuntime — warm ComfyUI instance per container
# ─────────────────────────────────────────────────────────────────────────────
@app.cls(
    image=comfy_image,
    gpu="L4",
    volumes={str(MODELS_DIR): volume},
    secrets=secrets,
    timeout=600,
    container_idle_timeout=300,
    allow_concurrent_inputs=4,
)
class ArgonRuntime:

    @modal.enter()
    def setup(self):
        import sys
        sys.path.insert(0, str(COMFY_DIR))

        # Symlink volume model dirs into ComfyUI's model folder
        for subdir in ["checkpoints", "loras", "controlnet", "clip_vision", "vae"]:
            src = MODELS_DIR / subdir
            dst = COMFY_MODELS / subdir
            src.mkdir(parents=True, exist_ok=True)
            dst.mkdir(parents=True, exist_ok=True)
            # Symlink volume subdirs into ComfyUI model tree
            link = COMFY_MODELS / subdir
            if not link.is_symlink() and link.exists():
                link.rename(link.with_suffix(".bak"))
            if not link.is_symlink():
                link.symlink_to(src)

        # Start ComfyUI as a background subprocess, wait for readiness
        from comfy_helpers import start_comfyui
        self.comfy_available = start_comfyui(str(COMFY_DIR), port=8188, timeout=120)

        # MediaPipe face mesh
        try:
            import mediapipe as mp
            self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
            )
            self.mp_available = True
            print("[argon] MediaPipe initialized")
        except Exception as e:
            print(f"[argon] MediaPipe init failed: {e}")
            self.mp_available = False

    # ── LoRA Management ───────────────────────────────────────────────────────

    @modal.method()
    def download_civitai_lora(self, version_id: str) -> dict:
        """Download a LoRA from CivitAI by model version ID. Cached to volume."""
        import requests, re

        LORA_DIR.mkdir(parents=True, exist_ok=True)
        api_key = os.environ.get("CIVITAI_API_KEY", "")

        if "civitai.com" in version_id:
            match = re.search(
                r"modelVersionId=(\d+)|/models/\d+\?.*modelVersionId=(\d+)|versions/(\d+)",
                version_id,
            )
            if match:
                version_id = match.group(1) or match.group(2) or match.group(3)

        cache_path = LORA_DIR / f"civitai_{version_id}.safetensors"
        if cache_path.exists():
            volume.reload()
            return {"path": str(cache_path), "name": f"civitai_{version_id}", "cached": True}

        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        meta = requests.get(
            f"https://civitai.com/api/v1/model-versions/{version_id}",
            headers=headers, timeout=30,
        ).json()

        name      = meta.get("model", {}).get("name", f"lora_{version_id}")
        files     = meta.get("files", [])
        lora_file = next((f for f in files if f.get("type") == "Model"), files[0] if files else None)
        if not lora_file:
            raise ValueError(f"No model file found for CivitAI version {version_id}")

        dl_url    = lora_file["downloadUrl"]
        safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)
        dest      = LORA_DIR / f"{safe_name}_{version_id}.safetensors"

        print(f"[lora] Downloading {name} → {dest}")
        with requests.get(dl_url, headers=headers, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)

        volume.commit()
        return {"path": str(dest), "name": safe_name, "cached": False}

    @modal.method()
    def list_loras(self) -> list:
        volume.reload()
        LORA_DIR.mkdir(parents=True, exist_ok=True)
        loras = []
        for f in LORA_DIR.iterdir():
            if f.suffix in (".safetensors", ".pt", ".ckpt"):
                loras.append({
                    "name":     f.stem,
                    "path":     str(f),
                    "size_mb":  round(f.stat().st_size / 1024 / 1024, 1),
                    "modified": f.stat().st_mtime,
                })
        return sorted(loras, key=lambda x: x["modified"], reverse=True)

    # ── Analysis ──────────────────────────────────────────────────────────────

    @modal.method()
    def analyze_motion(self, source_b64: str, fps: int = 24) -> dict:
        import base64, io
        from PIL import Image

        try:
            if source_b64.startswith("data:"):
                source_b64 = source_b64.split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(source_b64))).convert("RGB")
        except Exception as e:
            return self._mock_motion_track(fps=fps, error=str(e))

        landmarks  = self._extract_face_landmarks(img)
        expression = self._landmarks_to_expression(landmarks)
        pose       = self._extract_pose_comfy(img)

        track_id = str(uuid.uuid4())
        frame = {
            "frameIndex": 0, "timeMs": 0,
            "pose": pose, "expression": expression,
            "faceLandmarks": landmarks,
            "motionEnergy":  0.3,
            "faceVisible":   landmarks is not None,
        }
        return {
            "id": track_id, "source": "uploaded", "fps": fps,
            "durationMs": 1000 // fps, "frameCount": 1, "frames": [frame],
            "summary": self._summarize_frames([frame]),
            "meta": {
                "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "models": ["mediapipe"] + (["dwpose"] if self.comfy_available else []),
                "mock": not self.comfy_available,
            },
        }

    @modal.method()
    def analyze_expression(self, source_b64: str) -> list:
        import base64, io
        from PIL import Image
        try:
            if source_b64.startswith("data:"):
                source_b64 = source_b64.split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(source_b64))).convert("RGB")
        except Exception:
            return [self._mock_expression(0.0)]
        landmarks  = self._extract_face_landmarks(img)
        expression = self._landmarks_to_expression(landmarks)
        return [{"frameIndex": 0, "timeMs": 0, "expression": expression}]

    @modal.method()
    def analyze_face(self, source_b64: str) -> dict:
        import base64, io
        from PIL import Image
        try:
            if source_b64.startswith("data:"):
                source_b64 = source_b64.split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(source_b64))).convert("RGB")
        except Exception:
            return self._mock_face_landmarks()
        lm = self._extract_face_landmarks(img)
        return lm if lm else self._mock_face_landmarks()

    @modal.method()
    def analyze_segment(self, source_b64: str, region: str = "face") -> dict:
        import base64, io, numpy as np
        from PIL import Image
        try:
            if source_b64.startswith("data:"):
                source_b64 = source_b64.split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(source_b64))).convert("RGB")
        except Exception as e:
            return {"ok": False, "error": str(e)}

        from comfy_helpers import segment_birefnet
        mask = segment_birefnet(img, region) if self.comfy_available else self._threshold_mask(img)
        return {
            "region": region, "maskBase64": mask,
            "model": "birefnet" if self.comfy_available else "threshold_fallback",
        }

    # ── Transfer ──────────────────────────────────────────────────────────────

    @modal.method()
    def transfer_expression(
        self, character_image_b64: str, coefficients: dict, strength: float = 1.0
    ) -> dict:
        import base64, io
        from PIL import Image
        try:
            if character_image_b64.startswith("data:"):
                character_image_b64 = character_image_b64.split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(character_image_b64))).convert("RGB")
        except Exception as e:
            return {"ok": False, "error": str(e)}

        from comfy_helpers import liveportrait_drive
        if self.comfy_available:
            result_b64 = liveportrait_drive(img, coefficients, strength)
            model = "liveportrait"
        else:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            result_b64 = base64.b64encode(buf.getvalue()).decode()
            model = "passthrough_mock"

        return {"outputBase64": result_b64, "model": model, "strength": strength}

    @modal.method()
    def transfer_sequence(
        self,
        character_image_b64: str,
        motion_track: dict,
        beat_curve: list = None,
        output_fps: int = 24,
        style: str = "",
        lora_paths: list = None,
    ) -> dict:
        frames = motion_track.get("frames", [])
        if not frames:
            return {"ok": False, "error": "Empty motion track"}

        from comfy_helpers import liveportrait_drive
        import base64, io
        from PIL import Image

        try:
            raw = character_image_b64
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            base_img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
        except Exception as e:
            return {"ok": False, "error": str(e)}

        output_frames = []
        for i, frame in enumerate(frames):
            expression = frame.get("expression", {})
            if beat_curve:
                beat_factor = self._beat_proximity(frame.get("timeMs", 0), beat_curve)
                expression  = self._scale_expression(expression, beat_factor)

            if self.comfy_available:
                coefficients = expression.get("blendshapes", expression)
                strength     = expression.get("intensity", 1.0)
                img_b64      = liveportrait_drive(base_img, coefficients, strength)
            else:
                img_b64 = character_image_b64

            output_frames.append({
                "frameIndex":  i,
                "timeMs":      frame.get("timeMs", i * (1000 // output_fps)),
                "imageBase64": img_b64,
            })

        return {
            "ok": True, "frameCount": len(output_frames), "outputFps": output_fps,
            "frames": output_frames, "beatBound": beat_curve is not None,
            "loras": lora_paths or [], "mock": not self.comfy_available,
        }

    # ── Generation ────────────────────────────────────────────────────────────

    @modal.method()
    def generate_image(
        self, prompt: str, model: str = "sdxl",
        reference_image_b64: str = None, width: int = 768, height: int = 1024,
        pose_conditioning: dict = None, style_lock: dict = None, lora_paths: list = None,
    ) -> dict:
        if not self.comfy_available:
            return {"ok": True, "outputBase64": None, "mock": True, "model": model}
        from comfy_helpers import generate_image_comfy
        result_b64 = generate_image_comfy(
            prompt, model, reference_image_b64, width, height,
            pose_conditioning, lora_paths or [],
        )
        return {"ok": True, "outputBase64": result_b64, "mock": False, "model": model}

    @modal.method()
    def generate_pose(
        self, prompt: str, pose: str = "FRONT",
        reference_image_b64: str = None, lora_paths: list = None,
    ) -> dict:
        if not self.comfy_available:
            return {"ok": True, "outputBase64": None, "mock": True}
        from comfy_helpers import generate_pose_comfy
        result_b64 = generate_pose_comfy(prompt, pose, reference_image_b64, lora_paths or [])
        return {"ok": True, "outputBase64": result_b64, "mock": False}

    # ── Internal Helpers ──────────────────────────────────────────────────────

    def _extract_face_landmarks(self, img) -> dict | None:
        if not self.mp_available:
            return None
        import numpy as np, cv2
        arr     = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        results = self.mp_face_mesh.process(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))
        if not results.multi_face_landmarks:
            return None
        raw       = results.multi_face_landmarks[0].landmark
        landmarks = [{"index": i, "x": lm.x, "y": lm.y, "z": lm.z} for i, lm in enumerate(raw)]
        from comfy_helpers import landmarks_to_arkit
        return {
            "landmarks":   landmarks,
            "blendshapes": landmarks_to_arkit(raw),
            "confidence":  0.92,
            "identityHash": None,
        }

    def _extract_pose_comfy(self, img) -> dict:
        if not self.comfy_available:
            return self._mock_pose()
        from comfy_helpers import extract_pose_comfy
        return extract_pose_comfy(img)

    def _threshold_mask(self, img) -> str:
        import numpy as np, io, base64
        from PIL import Image
        arr     = np.array(img.convert("L"))
        mask    = Image.fromarray((arr > 128).astype("uint8") * 255)
        buf     = io.BytesIO()
        mask.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    def _landmarks_to_expression(self, landmarks: dict | None) -> dict:
        if not landmarks:
            return self._mock_expression(0.0)
        bs  = landmarks.get("blendshapes", {})
        jaw = bs.get("jawOpen", 0)
        return {
            "jaw": jaw, "mouthOpen": bs.get("jawOpen", 0),
            "mouthCornerUp":   (bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0)) / 2,
            "mouthCornerDown": (bs.get("mouthFrownLeft", 0) + bs.get("mouthFrownRight", 0)) / 2,
            "lipPucker":       bs.get("mouthPucker", 0),
            "lipStretch":      (bs.get("mouthStretchLeft", 0) + bs.get("mouthStretchRight", 0)) / 2,
            "browInner":       bs.get("browInnerUp", 0),
            "browOuter":       (bs.get("browOuterUpLeft", 0) + bs.get("browOuterUpRight", 0)) / 2,
            "browFurrow":      (bs.get("browDownLeft", 0) + bs.get("browDownRight", 0)) / 2,
            "eyeWide":         (bs.get("eyeWideLeft", 0) + bs.get("eyeWideRight", 0)) / 2,
            "eyeClose":        (bs.get("eyeBlinkLeft", 0) + bs.get("eyeBlinkRight", 0)) / 2,
            "eyeSquint":       (bs.get("eyeSquintLeft", 0) + bs.get("eyeSquintRight", 0)) / 2,
            "cheekRaise":      (bs.get("cheekSquintLeft", 0) + bs.get("cheekSquintRight", 0)) / 2,
            "noseFlair":       (bs.get("noseSneerLeft", 0) + bs.get("noseSneerRight", 0)) / 2,
            "noseWrinkle":     0.0,
            "emotionVector":   {"valence": 0.3, "arousal": jaw, "dominance": 0.6},
            "emotionClass":    {
                "neutral": 1.0, "happy": 0, "sad": 0, "angry": 0,
                "surprised": 0, "fearful": 0, "disgusted": 0, "contempt": 0,
            },
            "intensity": min(jaw * 2, 1.0),
        }

    def _beat_proximity(self, time_ms: float, beat_curve: list) -> float:
        if not beat_curve:
            return 1.0
        min_dist = min(abs(b.get("timeMs", 0) - time_ms) for b in beat_curve)
        return max(0.0, 1.0 - min_dist / 500)

    def _scale_expression(self, expression: dict, factor: float) -> dict:
        scalar_keys = ["jaw", "mouthOpen", "mouthCornerUp", "mouthCornerDown",
                       "lipPucker", "lipStretch", "browInner", "browOuter",
                       "browFurrow", "eyeWide", "eyeClose", "eyeSquint",
                       "cheekRaise", "noseFlair", "noseWrinkle", "intensity"]
        result = dict(expression)
        for k in scalar_keys:
            if k in result:
                result[k] = min(1.0, result[k] * factor)
        return result

    def _summarize_frames(self, frames: list) -> dict:
        intensities = [f.get("expression", {}).get("intensity", 0) for f in frames]
        return {
            "meanMotionEnergy":  sum(intensities) / max(len(intensities), 1),
            "peakMotionEnergy":  max(intensities) if intensities else 0,
            "dominantPoseClass": "standing",
            "faceVisibleRatio":  sum(1 for f in frames if f.get("faceVisible")) / max(len(frames), 1),
        }

    # ── Mock Data ─────────────────────────────────────────────────────────────

    def _mock_motion_track(self, fps: int = 24, error: str = "") -> dict:
        import math
        frames = []
        for i in range(fps * 4):
            t = i / fps
            frames.append({
                "frameIndex": i, "timeMs": int(t * 1000),
                "pose": self._mock_pose(t), "expression": self._mock_expression(t),
                "faceLandmarks": None,
                "motionEnergy": abs(math.sin(t * 0.9)) * 0.6, "faceVisible": True,
            })
        return {
            "id": str(uuid.uuid4()), "source": "mock", "fps": fps,
            "durationMs": 4000, "frameCount": len(frames), "frames": frames,
            "summary": self._summarize_frames(frames),
            "meta": {"extractedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "models": [], "mock": True},
            "_error": error,
        }

    def _mock_pose(self, t: float = 0.0) -> dict:
        import math
        sway = math.sin(t * 1.2) * 0.05
        return {
            "body": {
                "nose":          {"x": 0.50 + sway, "y": 0.14, "conf": 0.98},
                "neck":          {"x": 0.50 + sway * 0.5, "y": 0.22, "conf": 0.95},
                "leftShoulder":  {"x": 0.38, "y": 0.30, "conf": 0.90},
                "rightShoulder": {"x": 0.62, "y": 0.30, "conf": 0.90},
                "leftElbow":     {"x": 0.30, "y": 0.48, "conf": 0.85},
                "rightElbow":    {"x": 0.70, "y": 0.48, "conf": 0.85},
                "leftWrist":     {"x": 0.28, "y": 0.62, "conf": 0.80},
                "rightWrist":    {"x": 0.72, "y": 0.62, "conf": 0.80},
                "leftHip":       {"x": 0.42, "y": 0.56, "conf": 0.88},
                "rightHip":      {"x": 0.58, "y": 0.56, "conf": 0.88},
            },
            "poseImageB64": None,
            "confidence": 0.92,
        }

    def _mock_expression(self, t: float = 0.0) -> dict:
        import math
        w = lambda f, a=1: (math.sin(t * f) * 0.5 + 0.5) * a
        return {
            "jaw": w(0.8, 0.3), "mouthOpen": w(0.8, 0.4),
            "mouthCornerUp": w(0.6, 0.5), "mouthCornerDown": 0.0,
            "lipPucker": 0.0, "lipStretch": w(0.3, 0.2),
            "browInner": w(1.2, 0.4), "browOuter": w(0.7, 0.35), "browFurrow": 0.0,
            "eyeWide": w(0.5, 0.2), "eyeClose": w(0.3, 0.15), "eyeSquint": 0.0,
            "cheekRaise": w(0.6, 0.3), "noseFlair": w(1.0, 0.15), "noseWrinkle": 0.0,
            "emotionVector": {
                "valence": math.sin(t * 0.4) * 0.5 + 0.3,
                "arousal": w(0.5, 0.8), "dominance": 0.6,
            },
            "emotionClass": {
                "neutral": 0.4, "happy": 0.4, "sad": 0, "angry": 0,
                "surprised": 0.1, "fearful": 0, "disgusted": 0, "contempt": 0.1,
            },
            "intensity": w(0.9, 0.85),
        }

    def _mock_face_landmarks(self) -> dict:
        return {
            "landmarks": [{"index": i, "x": 0.5, "y": 0.5, "z": 0.0} for i in range(468)],
            "blendshapes": {k: 0.0 for k in [
                "eyeBlinkLeft", "eyeBlinkRight", "jawOpen",
                "mouthSmileLeft", "mouthSmileRight", "browInnerUp",
            ]},
            "confidence": 0.0, "identityHash": None, "mock": True,
        }


# ── FastAPI HTTP Layer ────────────────────────────────────────────────────────

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

web_app = FastAPI(title="Argon Modal API", version="0.2.0")
web_app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

runtime = ArgonRuntime()


def gen_id() -> str:
    return str(uuid.uuid4())


@web_app.get("/api/health")
async def health():
    return {"ok": True, "version": "0.2.0", "backend": "modal", "status": "ok"}


@web_app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = job_dict.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return {"ok": True, **job}


@web_app.post("/api/analyze/motion")
async def analyze_motion(request: Request):
    body   = await request.json()
    source = body.get("source", "")
    fps    = body.get("fps", 24)
    if not source:
        raise HTTPException(400, "source required")
    job_id = gen_id()
    job_dict[job_id] = {"id": job_id, "type": "analyze:motion", "status": "queued",
                        "result": None, "error": None, "createdAt": time.time()}
    runtime.analyze_motion.spawn(source, fps)
    return {"ok": True, "trackId": job_id, "jobId": job_id, "status": "queued"}


@web_app.post("/api/analyze/expression")
async def analyze_expression(request: Request):
    body   = await request.json()
    source = body.get("source", "")
    if not source:
        raise HTTPException(400, "source required")
    result = runtime.analyze_expression.remote(source)
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/analyze/face")
async def analyze_face(request: Request):
    body   = await request.json()
    source = body.get("source", "")
    if not source:
        raise HTTPException(400, "source required")
    result = runtime.analyze_face.remote(source)
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/analyze/segment")
async def analyze_segment(request: Request):
    body   = await request.json()
    source = body.get("source", "")
    region = body.get("region", "face")
    if not source:
        raise HTTPException(400, "source required")
    result = runtime.analyze_segment.remote(source, region)
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/transfer/expression")
async def transfer_expression(request: Request):
    body  = await request.json()
    img   = body.get("characterImage") or body.get("targetImage", "")
    coeff = body.get("coefficients") or body.get("expression", {})
    str_  = body.get("strength", 1.0)
    if not img:
        raise HTTPException(400, "characterImage required")
    result = runtime.transfer_expression.remote(img, coeff, str_)
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/transfer/sequence")
async def transfer_sequence(request: Request):
    body       = await request.json()
    img        = body.get("characterImage") or body.get("targetImage", "")
    track      = body.get("motionTrack", {})
    beat_curve = body.get("beatCurve", [])
    output_fps = body.get("outputFps", 24)
    style      = body.get("style", "")
    lora_paths = body.get("loraPaths", [])
    if not img:
        raise HTTPException(400, "characterImage required")
    if not track:
        raise HTTPException(400, "motionTrack required")
    job_id = gen_id()
    job_dict[job_id] = {"id": job_id, "type": "transfer:sequence", "status": "queued",
                        "result": None, "error": None, "createdAt": time.time()}
    runtime.transfer_sequence.spawn(img, track, beat_curve, output_fps, style, lora_paths)
    return {"ok": True, "jobId": job_id, "status": "queued",
            "frameCount": len(track.get("frames", []))}


@web_app.post("/api/loras/download")
async def download_lora(request: Request):
    body       = await request.json()
    version_id = body.get("versionId", "")
    if not version_id:
        raise HTTPException(400, "versionId required")
    result = runtime.download_civitai_lora.remote(version_id)
    return {"ok": True, **result}


@web_app.get("/api/loras")
async def list_loras():
    loras = runtime.list_loras.remote()
    return {"ok": True, "loras": loras}


@web_app.post("/api/generate/image")
async def generate_image(request: Request):
    body = await request.json()
    if not body.get("prompt"):
        raise HTTPException(400, "prompt required")
    result = runtime.generate_image.remote(
        prompt=body["prompt"], model=body.get("model", "sdxl"),
        reference_image_b64=body.get("reference_image"),
        width=body.get("width", 768), height=body.get("height", 1024),
        pose_conditioning=body.get("pose_conditioning"),
        style_lock=body.get("style_lock"),
        lora_paths=body.get("loraPaths", []),
    )
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/generate/pose")
async def generate_pose(request: Request):
    body = await request.json()
    if not body.get("prompt"):
        raise HTTPException(400, "prompt required")
    result = runtime.generate_pose.remote(
        prompt=body["prompt"], pose=body.get("pose", "FRONT"),
        reference_image_b64=body.get("reference_image"),
        lora_paths=body.get("loraPaths", []),
    )
    return {"ok": True, "jobId": gen_id(), "status": "complete", "result": result}


@web_app.post("/api/generate/video")
async def generate_video(request: Request):
    body = await request.json()
    if not body.get("prompt"):
        raise HTTPException(400, "prompt required")
    return {"ok": True, "jobId": gen_id(), "status": "queued",
            "message": "Video generation not yet implemented — use external API"}


# ── Modal web endpoint ────────────────────────────────────────────────────────

@app.function(
    image=comfy_image,
    volumes={str(MODELS_DIR): volume},
    secrets=secrets,
    allow_concurrent_inputs=10,
    container_idle_timeout=300,
)
@modal.asgi_app()
def argon_api():
    """
    Main Argon API endpoint.
    After `modal deploy modal_server.py`:
      https://YOUR_USERNAME--deadweight-argon-argon-api.modal.run
    Update vercel.json rewrites destination to this URL.
    """
    return web_app


# ── Local dev ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(web_app, host="0.0.0.0", port=7860)
