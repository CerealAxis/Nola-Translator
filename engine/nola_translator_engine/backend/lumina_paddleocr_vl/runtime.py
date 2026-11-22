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
    try:
        session = ort.InferenceSession(str(path), options, providers=chain)
    except ort.capi.onnxruntime_pybind11_state.NotImplemented as error:
        if prefer != "cpu" or path.name != "vision_encoder_q8.onnx" or "ConvInteger" not in str(error):
            raise
        session = ort.InferenceSession(str(cpu_vision_model(path)), options, providers=chain)
    if prefer != "cpu" and providers[prefer] not in session.get_providers():
        raise ValueError("runtimeUnavailable")
    return session


def cpu_vision_model(path: Path) -> Path:
    import hashlib
    import os
    import tempfile
    import numpy as np
    import onnx
    from onnx import numpy_helper

    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    cached = path.with_name(f".cpu-u8-v1-{digest[:16]}.onnx")
    if cached.is_file():
        return cached
    graph = onnx.load(str(path))
    initializers = {item.name: item for item in graph.graph.initializer}
    converted = 0
    for node in graph.graph.node:
        if node.op_type != "ConvInteger":
            continue
        if len(node.input) < 4 or any(name not in initializers for name in (node.input[1], node.input[3])):
            raise ValueError("modelCorrupt")
        if any(initializers[node.input[index]].data_type != onnx.TensorProto.INT8 for index in (1, 3)):
            raise ValueError("modelCorrupt")
        # Shifting both the weight and zero point preserves (weight - zero_point) exactly.
        for index in (1, 3):
            item = initializers[node.input[index]]
            values = numpy_helper.to_array(item).astype(np.int16) + 128
            name = f"{node.name}_cpu_u8_{index}"
            graph.graph.initializer.append(numpy_helper.from_array(values.astype(np.uint8), name))
            node.input[index] = name
        converted += 1
    if not converted:
        raise ValueError("modelCorrupt")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".onnx.tmp", delete=False) as output:
            temporary = Path(output.name)
        onnx.save(graph, str(temporary))
        os.replace(temporary, cached)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return cached


def tensor_dtype(argument):
    import numpy as np

    aliases = {"float": "float32", "double": "float64", "bool": "bool"}
    kind = argument.type.removeprefix("tensor(").removesuffix(")")
    try:
        return np.dtype(aliases.get(kind, kind))
    except TypeError as error:
        raise ValueError("modelCorrupt") from error
