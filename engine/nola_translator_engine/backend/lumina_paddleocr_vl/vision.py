"""NaViT vision encoder — single ONNX session (CPU/CUDA only, no DML)."""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from .config import VISION_FILE

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


def _tensor_dtype(inp) -> np.dtype:
    t = getattr(inp, "type", "")  # e.g. "tensor(float16)"
    return {
        "tensor(float)": np.float32,
        "tensor(float16)": np.float16,
        "tensor(double)": np.float64,
        "tensor(int64)": np.int64,
        "tensor(int32)": np.int32,
        "tensor(int16)": np.int16,
        "tensor(int8)": np.int8,
        "tensor(uint8)": np.uint8,
        "tensor(bool)": np.bool_,
    }.get(t, np.float32)


class VisionEncoder:
    """Runs vision_encoder_q8: NaViT patches -> image embeddings."""

    def __init__(self, model_dir: Path, *, provider: str = "cpu") -> None:
        from .runtime import create_session, make_session_options

        self._session: InferenceSession = create_session(
            model_dir / VISION_FILE,
            prefer=provider,
            sess_options=make_session_options(),
        )
        inputs = {i.name: i for i in self._session.get_inputs()}
        pv = inputs.get("pixel_values") or self._session.get_inputs()[0]
        self._vis_dtype = _tensor_dtype(pv)
        self._grid_dtype = _tensor_dtype(
            inputs.get("image_grid_thw") or self._session.get_inputs()[1]
        )

    def encode(self, pixel_values: np.ndarray, grid: np.ndarray) -> np.ndarray:
        """One forward pass -> image_embeds [P/4, 1024]."""
        out = self._session.run(
            None,
            {
                "pixel_values": pixel_values.astype(self._vis_dtype),
                "image_grid_thw": grid.astype(self._grid_dtype),
            },
        )[0]
        return np.asarray(out)
