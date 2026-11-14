"""PP-OCRv6 medium rec (PaddlePaddle) constants."""
from __future__ import annotations

MODEL_ID = "PaddlePaddle/PP-OCRv6_medium_rec_onnx"
MODEL_DIR_NAME = "ppocrv6"
PREFER = "auto"  # full auto: CUDA -> DML -> CPU

ONNX_FILE = "inference.onnx"
YAML_FILE = "inference.yml"

REQUIRED_FILES = [ONNX_FILE, YAML_FILE]
DOWNLOAD_FILES = REQUIRED_FILES

REC_IMAGE_SHAPE = (3, 48, 320)  # C, H, base W (PaddleX default)
MAX_IMG_W = 3200
