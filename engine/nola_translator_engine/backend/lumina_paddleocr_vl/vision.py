"""Execute the exported image encoder with validated patch and grid inputs."""
from pathlib import Path
import numpy as np
from .config import VISION_FILE
from .runtime import create_session, make_session_options, tensor_dtype


class VisionEncoder:
    def __init__(self, model_dir: Path, *, provider: str = "cpu") -> None:
        self._session = create_session(model_dir / VISION_FILE, prefer=provider,
                                       sess_options=make_session_options())
        self._inputs = {item.name: tensor_dtype(item) for item in self._session.get_inputs()}
        if not {"pixel_values", "image_grid_thw"} <= self._inputs.keys():
            raise ValueError("modelCorrupt")

    def encode(self, pixel_values: np.ndarray, grid: np.ndarray) -> np.ndarray:
        patches = np.asarray(pixel_values)
        layout = np.asarray(grid)
        if patches.ndim != 5 or patches.shape[0] != 1 or layout.shape != (1, 3):
            raise ValueError("invalidImage")
        if np.prod(layout[0]) != patches.shape[1] or not np.isfinite(patches).all():
            raise ValueError("invalidImage")
        feed = {name: np.asarray(value, dtype=self._inputs[name]) for name, value in
                (("pixel_values", patches), ("image_grid_thw", layout))}
        return np.asarray(self._session.run(None, feed)[0])
