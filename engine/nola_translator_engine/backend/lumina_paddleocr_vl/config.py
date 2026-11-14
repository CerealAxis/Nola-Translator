"""PaddleOCR-VL 1.6 (iaa2005/PaddleOCR-VL-1.6-ONNX) constants."""
from __future__ import annotations

MODEL_ID = "iaa2005/PaddleOCR-VL-1.6-ONNX"
MODEL_DIR_NAME = "paddleocr-vl-1.6"
PREFER_VISION = "cuda"    # NaViT identity-Reshape crashes under DML -> CUDA or CPU
PREFER_DECODER = "cuda"   # same DML crash -> CUDA or CPU
PREFER_EMBEDDING = "cpu"  # 404MB token-lookup read per token -> CPU

VISION_FILE = "onnx/vision_encoder_q8.onnx"
DECODER_FILE = "onnx/decoder_q8.onnx"
EMBEDDING_FILE = "onnx/embedding.onnx"
TOKENIZER_FILE = "tokenizer.json"
PREPROCESSOR_FILE = "preprocessor_config.json"

REQUIRED_FILES = [
    VISION_FILE,
    DECODER_FILE,
    EMBEDDING_FILE,
    TOKENIZER_FILE,
    PREPROCESSOR_FILE,
    "config.json",
]
DOWNLOAD_FILES = REQUIRED_FILES

MAX_NEW_TOKENS = 256
MAX_PATCHES = 1024  # cap on [P] after resize (int8 degrades on long seqs)
REGION_PAD_PX = 16  # default pad when growing crop windows to ~min_pixels
_PLACEHOLDER_ID = 100295  # <|IMAGE_PLACEHOLDER|>; verified at load
_EOS_FALLBACK = 100294  # <|end_of_sentence|>; verified at load
_PREFIX = "<|begin_of_sentence|>User: <|IMAGE_START|>"
_SUFFIX = "<|IMAGE_END|>OCR:\nAssistant:\n"
_PATCH = 14  # NaViT patch size
