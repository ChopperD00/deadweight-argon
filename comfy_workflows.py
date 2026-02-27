"""
comfy_workflows.py — ComfyUI workflow templates for ARGON

All workflow dicts use string placeholders like __PLACEHOLDER__ which are
replaced at runtime via the _sub() helper. Node outputs are referenced as
["node_id", output_index] per the ComfyUI API format.

Custom nodes required:
  - comfyui_controlnet_aux  → DWPreprocessor
  - ComfyUI-LivePortraitKJ  → LivePortraitLoadModels, LivePortraitCropping, LivePortraitProcess
  - ComfyUI-BiRefNet-ZHO    → BiRefNetUltra
"""

import json

COMFY_API    = "http://127.0.0.1:8188"
COMFY_INPUT  = "/opt/ComfyUI/input"
COMFY_OUTPUT = "/opt/ComfyUI/output"

# ── DWPose extraction ─────────────────────────────────────────────────────────
# Input:  __INPUT__  (filename in ComfyUI input folder)
# Output: node "3" → pose visualization image (colorful skeleton on black bg)
WORKFLOW_DWPOSE = {
    "1": {
        "class_type": "LoadImage",
        "inputs": {"image": "__INPUT__"},
    },
    "2": {
        "class_type": "DWPreprocessor",
        "inputs": {
            "image":        ["1", 0],
            "detect_hand":  "enable",
            "detect_body":  "enable",
            "detect_face":  "enable",
            "resolution":   512,
        },
    },
    "3": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["2", 0]},
    },
}

# ── BiRefNet segmentation ──────────────────────────────────────────────────────
# Input:  __INPUT__  (filename)
# Output: node "3" → alpha mask image
WORKFLOW_BIREFNET = {
    "1": {
        "class_type": "LoadImage",
        "inputs": {"image": "__INPUT__"},
    },
    "2": {
        "class_type": "BiRefNetUltra",
        "inputs": {"images": ["1", 0]},
    },
    "3": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["2", 0]},
    },
}

# ── LivePortrait self-reenactment (coefficient-driven expression) ──────────────
# Pragmatic approach: source == driver image; driving_multiplier scales intensity.
# __SOURCE__   : source image filename
# __DRIVING__  : driving image filename (same as source for coefficient mode)
# __STRENGTH__ : float 0.0–2.0, maps from expression coefficient intensity
WORKFLOW_LIVEPORTRAIT = {
    "1": {
        "class_type": "LoadImage",
        "inputs": {"image": "__SOURCE__"},
    },
    "2": {
        "class_type": "LoadImage",
        "inputs": {"image": "__DRIVING__"},
    },
    "3": {
        "class_type": "LivePortraitLoadModels",
        "inputs": {"precision": "fp16", "pipeline": "human"},
    },
    "4": {
        "class_type": "LivePortraitCropping",
        "inputs": {
            "src_image":       ["1", 0],
            "dri_video":       ["2", 0],
            "get_mask":        False,
            "driving_smooth":  0.0,
            "models":          ["3", 0],
        },
    },
    "5": {
        "class_type": "LivePortraitProcess",
        "inputs": {
            "src_image":         ["1", 0],
            "dri_motion":        ["4", 0],
            "models":            ["3", 0],
            "relative_motion":   True,
            "do_crop":           True,
            "pasteback":         True,
            "driving_multiplier": "__STRENGTH__",
        },
    },
    "6": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["5", 0]},
    },
}

# ── SDXL image generation (base, no LoRA) ────────────────────────────────────
# __CHECKPOINT__ : ckpt filename in /models/checkpoints/
# __PROMPT__     : positive prompt string
# __NEGATIVE__   : negative prompt string
# __WIDTH__      : int
# __HEIGHT__     : int
# __SEED__       : int
WORKFLOW_SDXL = {
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "__CHECKPOINT__"},
    },
    "2": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "__PROMPT__", "clip": ["1", 1]},
    },
    "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "__NEGATIVE__", "clip": ["1", 1]},
    },
    "4": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": "__WIDTH__", "height": "__HEIGHT__", "batch_size": 1},
    },
    "5": {
        "class_type": "KSampler",
        "inputs": {
            "model":         ["1", 0],
            "positive":      ["2", 0],
            "negative":      ["3", 0],
            "latent_image":  ["4", 0],
            "seed":          "__SEED__",
            "steps":         30,
            "cfg":           7.0,
            "sampler_name":  "dpmpp_2m",
            "scheduler":     "karras",
            "denoise":       1.0,
        },
    },
    "6": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
    },
    "7": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["6", 0]},
    },
}

# ── Pose-conditioned ControlNet generation ────────────────────────────────────
# __CHECKPOINT__  : ckpt filename
# __CONTROLNET__  : controlnet model filename (e.g. control_v11p_sd15_openpose.pth)
# __POSE_IMAGE__  : pose visualization image filename (from DWPose output)
# __PROMPT__      : positive prompt
# __NEGATIVE__    : negative prompt
# __WIDTH__       : int
# __HEIGHT__      : int
# __SEED__        : int
WORKFLOW_POSE_CONTROLNET = {
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "__CHECKPOINT__"},
    },
    "2": {
        "class_type": "ControlNetLoader",
        "inputs": {"control_net_name": "__CONTROLNET__"},
    },
    "3": {
        "class_type": "LoadImage",
        "inputs": {"image": "__POSE_IMAGE__"},
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "__PROMPT__", "clip": ["1", 1]},
    },
    "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "__NEGATIVE__", "clip": ["1", 1]},
    },
    "6": {
        "class_type": "ControlNetApplyAdvanced",
        "inputs": {
            "positive":      ["4", 0],
            "negative":      ["5", 0],
            "control_net":   ["2", 0],
            "image":         ["3", 0],
            "strength":      0.9,
            "start_percent": 0.0,
            "end_percent":   1.0,
        },
    },
    "7": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": "__WIDTH__", "height": "__HEIGHT__", "batch_size": 1},
    },
    "8": {
        "class_type": "KSampler",
        "inputs": {
            "model":         ["1", 0],
            "positive":      ["6", 0],
            "negative":      ["6", 1],
            "latent_image":  ["7", 0],
            "seed":          "__SEED__",
            "steps":         30,
            "cfg":           7.0,
            "sampler_name":  "dpmpp_2m",
            "scheduler":     "karras",
            "denoise":       1.0,
        },
    },
    "9": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["8", 0], "vae": ["1", 2]},
    },
    "10": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["9", 0]},
    },
}


# ── Substitution helper ───────────────────────────────────────────────────────

def _sub(template: dict, **kwargs) -> dict:
    """
    Deep-replace __PLACEHOLDER__ strings in a workflow dict.
    Numeric values are substituted directly (int/float), strings as strings.

    Usage:
        wf = _sub(WORKFLOW_SDXL,
                  CHECKPOINT="v1-5-pruned.safetensors",
                  PROMPT="portrait of a woman",
                  NEGATIVE="blurry, low quality",
                  WIDTH=768, HEIGHT=1024, SEED=42)
    """
    raw = json.dumps(template)
    for key, val in kwargs.items():
        placeholder = f'"__{key}__"'
        if isinstance(val, (int, float)):
            raw = raw.replace(placeholder, str(val))
        else:
            escaped = json.dumps(str(val))  # adds surrounding quotes + escapes
            raw = raw.replace(f'"__{key}__"', escaped)
    return json.loads(raw)
