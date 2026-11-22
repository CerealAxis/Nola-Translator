"""File names and tensor protocol of the PaddleOCR-VL ONNX export."""
VISION_FILE, DECODER_FILE, EMBEDDING_FILE = (
    "onnx/vision_encoder_q8.onnx", "onnx/decoder_q8.onnx", "onnx/embedding.onnx"
)
TOKENIZER_FILE = "tokenizer.json"
PREFER_EMBEDDING = "cpu"
MAX_NEW_TOKENS, MAX_PATCHES = 256, 1024
_PATCH = 14
_PLACEHOLDER_ID = 100295
_PREFIX = "<|begin_of_sentence|>User: <|IMAGE_START|>"
_SUFFIX = "<|IMAGE_END|>OCR:\nAssistant:\n"
