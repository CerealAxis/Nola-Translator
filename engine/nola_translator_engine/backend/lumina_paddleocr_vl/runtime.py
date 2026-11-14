"""Bounded CPU ONNX sessions for the optional PaddleOCR-VL model."""
from __future__ import annotations

from pathlib import Path


def make_session_options():
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.log_severity_level = 3
    return options


def create_session(path: Path, *, prefer: str = "cpu", sess_options=None):
    import onnxruntime as ort

    providers = {"cpu": "CPUExecutionProvider", "cuda": "CUDAExecutionProvider"}
    if prefer not in providers or providers[prefer] not in ort.get_available_providers():
        raise ValueError("runtimeUnavailable")
    options = sess_options or make_session_options()
    chain = [providers[prefer], "CPUExecutionProvider"] if prefer != "cpu" else ["CPUExecutionProvider"]
    session = ort.InferenceSession(str(path), options, providers=chain)
    if prefer != "cpu" and providers[prefer] not in session.get_providers():
        raise ValueError("runtimeUnavailable")
    return session
