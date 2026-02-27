"""
comfy_helpers.py — Runtime utilities for the ARGON ComfyUI backend

All functions here are called from ArgonRuntime instance methods.
They are module-level (not class methods) so they stay small and testable.
"""

import time
import uuid
import base64
import io
import os
import json
from pathlib import Path

import requests as _requests

from comfy_workflows import (
    COMFY_API, COMFY_INPUT, COMFY_OUTPUT,
    WORKFLOW_DWPOSE, WORKFLOW_BIREFNET,
    WORKFLOW_LIVEPORTRAIT, WORKFLOW_SDXL,
    WORKFLOW_POSE_CONTROLNET, _sub,
)


# ── ComfyUI subprocess startup ────────────────────────────────────────────────

def start_comfyui(comfy_dir: str = "/opt/ComfyUI", port: int = 8188,
                  timeout: int = 120) -> bool:
    """
    Launch ComfyUI as a background subprocess and wait until ready.
    Returns True if ComfyUI is ready, False if timeout reached.
    """
    import subprocess, sys

    cmd = [
        sys.executable, "main.py",
        "--port", str(port),
        "--dont-print-server",
        "--disable-auto-launch",
        "--output-directory", COMFY_OUTPUT,
    ]
    print(f"[comfy] starting ComfyUI on port {port}...")
    proc = subprocess.Popen(
        cmd, cwd=comfy_dir,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = _requests.get(f"{COMFY_API}/system_stats", timeout=3)
            if resp.status_code == 200:
                print("[comfy] ready ✓")
                return True
        except Exception:
            pass
        time.sleep(2)

    print(f"[comfy] WARNING: ComfyUI did not become ready within {timeout}s")
    return False


# ── Workflow execution ────────────────────────────────────────────────────────

def run_comfy_workflow(workflow: dict, timeout: int = 300) -> bytes:
    """
    Submit a workflow to the running ComfyUI instance via its HTTP API.
    Polls /history/{prompt_id} until an output image is available.
    Returns raw image bytes, or b"" on failure.
    """
    try:
        resp = _requests.post(
            f"{COMFY_API}/prompt",
            json={"prompt": workflow},
            timeout=10,
        )
        resp.raise_for_status()
        prompt_id = resp.json()["prompt_id"]
    except Exception as e:
        print(f"[comfy] failed to queue workflow: {e}")
        return b""

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            hist = _requests.get(
                f"{COMFY_API}/history/{prompt_id}", timeout=5
            ).json()
            if prompt_id in hist:
                outputs = hist[prompt_id].get("outputs", {})
                for node_out in outputs.values():
                    for img_info in node_out.get("images", []):
                        r = _requests.get(
                            f"{COMFY_API}/view",
                            params={
                                "filename": img_info["filename"],
                                "subfolder": img_info.get("subfolder", ""),
                                "type":     img_info.get("type", "output"),
                            },
                            timeout=30,
                        )
                        return r.content
                # outputs present but no images — workflow may have errored
                break
        except Exception:
            pass
        time.sleep(1)

    print(f"[comfy] workflow {prompt_id} timed out or produced no output")
    return b""


# ── Image I/O helpers ─────────────────────────────────────────────────────────

def save_comfy_input(img, prefix: str = "argon") -> str:
    """
    Save a PIL image to ComfyUI's input folder.
    Returns the filename (not full path) for use in workflows.
    """
    os.makedirs(COMFY_INPUT, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    path = os.path.join(COMFY_INPUT, filename)
    img.save(path, format="PNG")
    return filename


def bytes_to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def b64_to_pil(b64: str):
    from PIL import Image
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


# ── DWPose wrapper ────────────────────────────────────────────────────────────

def extract_pose_comfy(img) -> dict:
    """
    Run DWPose via ComfyUI. Returns a pose dict with poseImageB64 field.
    Falls back to mock on failure.
    """
    filename = save_comfy_input(img, "pose_src")
    wf = _sub(WORKFLOW_DWPOSE, INPUT=filename)
    img_bytes = run_comfy_workflow(wf, timeout=60)
    if not img_bytes:
        return _mock_pose_fallback()
    pose_b64 = bytes_to_b64(img_bytes)
    return {
        "body": {},                # raw keypoints not parsed from DWPose image
        "poseImageB64": pose_b64,  # colorful skeleton — use as ControlNet input
        "confidence": 0.92,
        "model": "dwpose",
    }


# ── BiRefNet wrapper ──────────────────────────────────────────────────────────

def segment_birefnet(img, region: str = "face") -> str:
    """
    Run BiRefNet segmentation via ComfyUI.
    Returns base64-encoded mask PNG, or "" on failure.
    """
    filename = save_comfy_input(img, "seg_src")
    wf = _sub(WORKFLOW_BIREFNET, INPUT=filename)
    img_bytes = run_comfy_workflow(wf, timeout=90)
    if not img_bytes:
        return ""
    return bytes_to_b64(img_bytes)


# ── LivePortrait wrapper ──────────────────────────────────────────────────────

def liveportrait_drive(img, coefficients: dict, strength: float) -> str:
    """
    Drive expression on img using LivePortrait self-reenactment mode.
    coefficients: ARKit-style blendshape dict (used to derive driving_multiplier)
    strength: 0.0–1.0 overall expression strength
    Returns base64-encoded output PNG, or passthrough on failure.
    """
    # Derive multiplier from coefficient intensity + strength
    if coefficients:
        vals = [v for v in coefficients.values() if isinstance(v, (int, float))]
        coeff_intensity = max(vals) if vals else 0.5
    else:
        coeff_intensity = 0.5
    driving_multiplier = round(coeff_intensity * strength * 2.0, 3)
    driving_multiplier = max(0.1, min(3.0, driving_multiplier))

    src_filename = save_comfy_input(img, "lp_src")
    wf = _sub(
        WORKFLOW_LIVEPORTRAIT,
        SOURCE=src_filename,
        DRIVING=src_filename,      # self-reenactment: same image
        STRENGTH=driving_multiplier,
    )
    img_bytes = run_comfy_workflow(wf, timeout=120)
    if not img_bytes:
        # passthrough
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return bytes_to_b64(buf.getvalue())
    return bytes_to_b64(img_bytes)


# ── SDXL generation ───────────────────────────────────────────────────────────

DEFAULT_CHECKPOINT = "sd_xl_base_1.0.safetensors"
DEFAULT_NEGATIVE   = ("nsfw, nude, blurry, low quality, watermark, "
                      "text, logo, bad anatomy, deformed")
DEFAULT_CONTROLNET = "control_v11p_sd15_openpose.pth"


def build_sdxl_lora_workflow(
    base_workflow: dict,
    lora_filenames: list,
    lora_strength: float = 0.8,
) -> dict:
    """
    Dynamically chain LoRA loaders into a workflow dict.
    lora_filenames: list of bare filenames (no path), e.g. ["style.safetensors"]
    Returns a new workflow dict with LoRA nodes inserted.
    """
    if not lora_filenames:
        return base_workflow

    wf = json.loads(json.dumps(base_workflow))  # deep copy

    # Find the highest existing node id
    max_id = max(int(k) for k in wf.keys())
    prev_model = ["1", 0]  # CheckpointLoaderSimple → model output
    prev_clip  = ["1", 1]  # CheckpointLoaderSimple → clip output

    for i, lora_name in enumerate(lora_filenames):
        node_id = str(max_id + i + 1)
        wf[node_id] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model":          prev_model,
                "clip":           prev_clip,
                "lora_name":      lora_name,
                "strength_model": lora_strength,
                "strength_clip":  lora_strength,
            },
        }
        prev_model = [node_id, 0]
        prev_clip  = [node_id, 1]

    # Patch downstream nodes to use LoRA outputs instead of raw checkpoint
    for node_id, node in wf.items():
        inputs = node.get("inputs", {})
        if inputs.get("model") == ["1", 0]:
            inputs["model"] = prev_model
        if inputs.get("clip") == ["1", 1]:
            inputs["clip"] = prev_clip

    return wf


def generate_image_comfy(
    prompt: str,
    model: str = "sdxl",
    reference_b64: str = None,
    width: int = 768,
    height: int = 1024,
    pose_conditioning: dict = None,
    lora_paths: list = None,
) -> str:
    """
    Generate an image via ComfyUI SDXL workflow.
    Returns base64-encoded output PNG, or "" on failure.
    """
    import random
    lora_filenames = [Path(p).name for p in (lora_paths or [])]
    checkpoint = DEFAULT_CHECKPOINT

    base_wf = _sub(
        WORKFLOW_SDXL,
        CHECKPOINT=checkpoint,
        PROMPT=prompt,
        NEGATIVE=DEFAULT_NEGATIVE,
        WIDTH=width,
        HEIGHT=height,
        SEED=random.randint(0, 2**31),
    )
    wf = build_sdxl_lora_workflow(base_wf, lora_filenames)
    img_bytes = run_comfy_workflow(wf, timeout=180)
    return bytes_to_b64(img_bytes) if img_bytes else ""


def generate_pose_comfy(
    prompt: str,
    pose: str = "FRONT",
    reference_b64: str = None,
    lora_paths: list = None,
) -> str:
    """
    Generate a pose-conditioned image via ControlNet.
    pose: "FRONT" | "THREE_QUARTER" | "SIDE" | "BACK"
    Returns base64-encoded output PNG, or "" on failure.
    """
    import random
    from PIL import Image

    # Get pose skeleton image (from reference or generated stick figure)
    if reference_b64:
        ref_img = b64_to_pil(reference_b64)
        pose_data = extract_pose_comfy(ref_img)
        if pose_data.get("poseImageB64"):
            pose_img_b64 = pose_data["poseImageB64"]
            pose_img_bytes = base64.b64decode(pose_img_b64)
            pose_img = Image.open(io.BytesIO(pose_img_bytes)).convert("RGB")
        else:
            pose_img = pose_template(pose, 512, 768)
    else:
        pose_img = pose_template(pose, 512, 768)

    pose_filename = save_comfy_input(pose_img, "pose_ctrl")
    lora_filenames = [Path(p).name for p in (lora_paths or [])]

    base_wf = _sub(
        WORKFLOW_POSE_CONTROLNET,
        CHECKPOINT=DEFAULT_CHECKPOINT,
        CONTROLNET=DEFAULT_CONTROLNET,
        POSE_IMAGE=pose_filename,
        PROMPT=prompt,
        NEGATIVE=DEFAULT_NEGATIVE,
        WIDTH=512,
        HEIGHT=768,
        SEED=random.randint(0, 2**31),
    )
    wf = build_sdxl_lora_workflow(base_wf, lora_filenames)
    img_bytes = run_comfy_workflow(wf, timeout=180)
    return bytes_to_b64(img_bytes) if img_bytes else ""


# ── Canonical pose stick figures ──────────────────────────────────────────────

# Normalized keypoint positions [x, y] in 0–1 space for each pose angle.
# Based on approximate OpenPose skeleton layout.
_POSE_KEYPOINTS = {
    "FRONT": {
        "nose":          (0.50, 0.10),
        "neck":          (0.50, 0.20),
        "lShoulder":     (0.37, 0.28),
        "rShoulder":     (0.63, 0.28),
        "lElbow":        (0.28, 0.46),
        "rElbow":        (0.72, 0.46),
        "lWrist":        (0.24, 0.62),
        "rWrist":        (0.76, 0.62),
        "lHip":          (0.41, 0.55),
        "rHip":          (0.59, 0.55),
        "lKnee":         (0.40, 0.73),
        "rKnee":         (0.60, 0.73),
        "lAnkle":        (0.39, 0.92),
        "rAnkle":        (0.61, 0.92),
    },
    "THREE_QUARTER": {
        "nose":          (0.46, 0.10),
        "neck":          (0.47, 0.20),
        "lShoulder":     (0.35, 0.28),
        "rShoulder":     (0.60, 0.28),
        "lElbow":        (0.26, 0.46),
        "rElbow":        (0.68, 0.45),
        "lWrist":        (0.22, 0.62),
        "rWrist":        (0.73, 0.60),
        "lHip":          (0.40, 0.55),
        "rHip":          (0.57, 0.55),
        "lKnee":         (0.39, 0.73),
        "rKnee":         (0.57, 0.72),
        "lAnkle":        (0.38, 0.92),
        "rAnkle":        (0.58, 0.91),
    },
    "SIDE": {
        "nose":          (0.55, 0.10),
        "neck":          (0.52, 0.20),
        "lShoulder":     (0.45, 0.28),
        "rShoulder":     (0.55, 0.28),
        "lElbow":        (0.38, 0.46),
        "rElbow":        (0.62, 0.44),
        "lWrist":        (0.34, 0.62),
        "rWrist":        (0.64, 0.58),
        "lHip":          (0.46, 0.55),
        "rHip":          (0.54, 0.55),
        "lKnee":         (0.45, 0.73),
        "rKnee":         (0.55, 0.72),
        "lAnkle":        (0.44, 0.92),
        "rAnkle":        (0.56, 0.91),
    },
    "BACK": {
        "nose":          (0.50, 0.10),
        "neck":          (0.50, 0.20),
        "lShoulder":     (0.37, 0.28),
        "rShoulder":     (0.63, 0.28),
        "lElbow":        (0.28, 0.46),
        "rElbow":        (0.72, 0.46),
        "lWrist":        (0.24, 0.62),
        "rWrist":        (0.76, 0.62),
        "lHip":          (0.41, 0.55),
        "rHip":          (0.59, 0.55),
        "lKnee":         (0.40, 0.73),
        "rKnee":         (0.60, 0.73),
        "lAnkle":        (0.39, 0.92),
        "rAnkle":        (0.61, 0.92),
    },
}

_SKELETON_EDGES = [
    ("nose", "neck"),
    ("neck", "lShoulder"), ("neck", "rShoulder"),
    ("lShoulder", "lElbow"), ("lElbow", "lWrist"),
    ("rShoulder", "rElbow"), ("rElbow", "rWrist"),
    ("neck", "lHip"), ("neck", "rHip"),
    ("lHip", "rHip"),
    ("lHip", "lKnee"), ("lKnee", "lAnkle"),
    ("rHip", "rKnee"), ("rKnee", "rAnkle"),
]

_JOINT_COLORS = {
    "nose":      (255, 0,   0),
    "neck":      (255, 85,  0),
    "lShoulder": (255, 170, 0),
    "rShoulder": (0,   255, 0),
    "lElbow":    (0,   255, 85),
    "rElbow":    (0,   255, 170),
    "lWrist":    (0,   0,   255),
    "rWrist":    (85,  0,   255),
    "lHip":      (170, 0,   255),
    "rHip":      (255, 0,   170),
    "lKnee":     (255, 0,   85),
    "rKnee":     (255, 255, 0),
    "lAnkle":    (0,   255, 255),
    "rAnkle":    (255, 0,   255),
}


def pose_template(pose_name: str, width: int = 512, height: int = 768):
    """
    Generate a canonical DWPose-style skeleton visualization image using cv2.
    Returns a PIL Image (RGB, black background with colored skeleton).
    """
    import cv2
    import numpy as np
    from PIL import Image

    kp_norm = _POSE_KEYPOINTS.get(pose_name.upper(), _POSE_KEYPOINTS["FRONT"])
    canvas = np.zeros((height, width, 3), dtype=np.uint8)

    def px(name):
        nx, ny = kp_norm[name]
        return (int(nx * width), int(ny * height))

    # Draw limb edges
    for a, b in _SKELETON_EDGES:
        if a in kp_norm and b in kp_norm:
            col = _JOINT_COLORS.get(a, (200, 200, 200))
            cv2.line(canvas, px(a), px(b), col, thickness=4, lineType=cv2.LINE_AA)

    # Draw joints
    for name in kp_norm:
        col = _JOINT_COLORS.get(name, (255, 255, 255))
        cv2.circle(canvas, px(name), radius=6, color=col,
                   thickness=-1, lineType=cv2.LINE_AA)

    return Image.fromarray(canvas[..., ::-1])  # BGR→RGB


# ── ARKit blendshape mapping ──────────────────────────────────────────────────

def landmarks_to_arkit(raw_landmarks) -> dict:
    """
    Compute ARKit 52 blendshapes from MediaPipe 468 face landmarks.
    Uses geometric ratios — no neural net required.

    Key landmark indices (MediaPipe FaceMesh):
      33/263  : outer eye corners (right/left)
      133/362 : inner eye corners (right/left)
      159/386 : upper eyelid center (right/left)
      145/374 : lower eyelid center (right/left)
      107/336 : brow inner (right/left)
      66/296  : brow outer (right/left)
      168     : brow center
       0      : nose tip
      13/14   : upper/lower lip inner
      61/291  : mouth corner right/left
      17      : chin
      4       : nose lower
      45/275  : cheek right/left
    """
    import numpy as np

    lm = np.array([[l.x, l.y, l.z] for l in raw_landmarks])

    def dist(a: int, b: int) -> float:
        return float(np.linalg.norm(lm[a] - lm[b]))

    def c(v: float) -> float:
        return float(max(0.0, min(1.0, v)))

    face_w = dist(33, 263)
    if face_w < 1e-6:
        face_w = 1.0

    # ── Eyes ──────────────────────────────────────────────────────────────────
    r_eye_h    = dist(159, 145)
    l_eye_h    = dist(386, 374)
    r_eye_w    = max(dist(33, 133),  1e-6)
    l_eye_w    = max(dist(362, 263), 1e-6)
    r_eye_open = r_eye_h / r_eye_w   # ~0.25 neutral, ~0.05 closed, ~0.45 wide
    l_eye_open = l_eye_h / l_eye_w

    r_blink = c((0.25 - r_eye_open) / 0.20)
    l_blink = c((0.25 - l_eye_open) / 0.20)
    r_wide  = c((r_eye_open - 0.30) / 0.15)
    l_wide  = c((l_eye_open - 0.30) / 0.15)
    # Squint: lower lid raised (lower lid y moves up = smaller value in normalized)
    r_squint = c((dist(159, 145) * 0.5 - dist(144, 145)) / 0.02)
    l_squint = c((dist(386, 374) * 0.5 - dist(373, 374)) / 0.02)

    # ── Brows ──────────────────────────────────────────────────────────────────
    # Brow-to-eye-corner vertical gap (normalized by face height)
    face_h = max(dist(10, 152), 1e-6)
    r_brow_eye = (lm[145][1] - lm[107][1]) / face_h  # positive = brow above lid
    l_brow_eye = (lm[374][1] - lm[336][1]) / face_h
    neutral_brow = 0.10
    brow_inner_up  = c((r_brow_eye + l_brow_eye) / 2 - neutral_brow) * 5
    brow_outer_r   = c(r_brow_eye - neutral_brow) * 4
    brow_outer_l   = c(l_brow_eye - neutral_brow) * 4
    brow_down_r    = c(neutral_brow - r_brow_eye) * 4
    brow_down_l    = c(neutral_brow - l_brow_eye) * 4

    # ── Jaw ────────────────────────────────────────────────────────────────────
    jaw_open = c(dist(13, 14) / face_w * 5)

    # ── Mouth ──────────────────────────────────────────────────────────────────
    # Corner heights relative to mouth center (landmark 0 = nose tip, use 164 lips center)
    lip_center_y = (lm[13][1] + lm[14][1]) / 2
    r_corner_rise = c((lip_center_y - lm[61][1]) / face_w * 8)
    l_corner_rise = c((lip_center_y - lm[291][1]) / face_w * 8)
    r_corner_drop = c((lm[61][1] - lip_center_y) / face_w * 8)
    l_corner_drop = c((lm[291][1] - lip_center_y) / face_w * 8)

    mouth_w    = max(dist(61, 291), 1e-6)
    mouth_open = c(dist(13, 14) / mouth_w * 2)
    pucker     = c((face_w * 0.20 - mouth_w) / (face_w * 0.05))
    stretch_r  = c((lm[61][0] - lm[0][0]) / face_w * 4)
    stretch_l  = c((lm[0][0] - lm[291][0]) / face_w * 4)

    # Upper / lower lip relative motion
    upper_lip_up = c((lm[0][1] - lm[13][1]) / face_w * 8 - 0.2)
    lower_lip_dn = c((lm[14][1] - lm[17][1]) / face_w * 4)

    # Dimples: compress laterally
    r_dimple = c(r_corner_rise * 0.4)
    l_dimple = c(l_corner_rise * 0.4)

    # ── Cheeks ─────────────────────────────────────────────────────────────────
    cheek_puff   = c((dist(234, 454) - face_w) / (face_w * 0.05))
    cheek_sq_r   = c(r_corner_rise * 0.5)
    cheek_sq_l   = c(l_corner_rise * 0.5)

    # ── Nose ───────────────────────────────────────────────────────────────────
    nose_sneer_r = c((lm[4][1] - lm[45][1]) / face_w * 6 - 0.1)
    nose_sneer_l = c((lm[4][1] - lm[275][1]) / face_w * 6 - 0.1)

    # ── Tongue ─────────────────────────────────────────────────────────────────
    # Only visible when jaw is very open and lower-lip is forward
    tongue_out = c(jaw_open * lower_lip_dn * 0.5)

    return {
        # Eyes
        "eyeBlinkLeft":        c(l_blink),
        "eyeBlinkRight":       c(r_blink),
        "eyeWideLeft":         c(l_wide),
        "eyeWideRight":        c(r_wide),
        "eyeSquintLeft":       c(l_squint),
        "eyeSquintRight":      c(r_squint),
        "eyeLookDownLeft":     0.0,
        "eyeLookDownRight":    0.0,
        "eyeLookInLeft":       0.0,
        "eyeLookInRight":      0.0,
        "eyeLookOutLeft":      0.0,
        "eyeLookOutRight":     0.0,
        "eyeLookUpLeft":       0.0,
        "eyeLookUpRight":      0.0,
        # Brows
        "browInnerUp":         c(brow_inner_up),
        "browOuterUpLeft":     c(brow_outer_l),
        "browOuterUpRight":    c(brow_outer_r),
        "browDownLeft":        c(brow_down_l),
        "browDownRight":       c(brow_down_r),
        # Jaw
        "jawOpen":             c(jaw_open),
        "jawLeft":             0.0,
        "jawRight":            0.0,
        "jawForward":          0.0,
        # Mouth
        "mouthSmileLeft":      c(l_corner_rise),
        "mouthSmileRight":     c(r_corner_rise),
        "mouthFrownLeft":      c(l_corner_drop),
        "mouthFrownRight":     c(r_corner_drop),
        "mouthPucker":         c(pucker),
        "mouthStretchLeft":    c(stretch_l),
        "mouthStretchRight":   c(stretch_r),
        "mouthDimpleLeft":     c(l_dimple),
        "mouthDimpleRight":    c(r_dimple),
        "mouthOpen":           c(mouth_open),
        "mouthClose":          c(1.0 - mouth_open),
        "mouthUpperUpLeft":    c(upper_lip_up),
        "mouthUpperUpRight":   c(upper_lip_up),
        "mouthLowerDownLeft":  c(lower_lip_dn),
        "mouthLowerDownRight": c(lower_lip_dn),
        "mouthLeft":           0.0,
        "mouthRight":          0.0,
        "mouthRollLower":      0.0,
        "mouthRollUpper":      0.0,
        "mouthShrugLower":     0.0,
        "mouthShrugUpper":     0.0,
        "mouthPressLeft":      0.0,
        "mouthPressRight":     0.0,
        # Cheeks
        "cheekPuff":           c(cheek_puff),
        "cheekSquintLeft":     c(cheek_sq_l),
        "cheekSquintRight":    c(cheek_sq_r),
        # Nose
        "noseSneerLeft":       c(nose_sneer_l),
        "noseSneerRight":      c(nose_sneer_r),
        # Tongue
        "tongueOut":           c(tongue_out),
    }


# ── Fallback ──────────────────────────────────────────────────────────────────

def _mock_pose_fallback() -> dict:
    return {
        "body": {
            "nose":          {"x": 0.50, "y": 0.14, "conf": 0.0},
            "neck":          {"x": 0.50, "y": 0.22, "conf": 0.0},
            "leftShoulder":  {"x": 0.38, "y": 0.30, "conf": 0.0},
            "rightShoulder": {"x": 0.62, "y": 0.30, "conf": 0.0},
        },
        "poseImageB64": None,
        "confidence": 0.0,
        "model": "fallback",
    }
