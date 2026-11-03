"""Offline CAM++ speaker embeddings for 1.5-second mono 16 kHz windows."""

from __future__ import annotations

from hashlib import file_digest
from pathlib import Path

import numpy as np

from ..audio.resample import TARGET_SAMPLE_RATE

_WINDOW_SAMPLES = 24_000
_MODEL = Path(__file__).with_name("speaker_campplus.onnx")
_MODEL_SHA256 = "5d623e283b10fe27cd356e62868f567471c8071a177fb7549becaca97ebe2262"


class SpeakerInstallationError(RuntimeError):
    """Bundled model or its CPU runtime is missing or invalid."""


class SpeakerEmbedder:
    def __init__(self) -> None:
        try:
            import kaldi_native_fbank as kaldi
            import onnxruntime as ort

            with _MODEL.open("rb") as model:
                if file_digest(model, "sha256").hexdigest() != _MODEL_SHA256:
                    raise ValueError("CAM++ model checksum mismatch")
            options = ort.SessionOptions()
            options.intra_op_num_threads = 1
            self._session = ort.InferenceSession(
                str(_MODEL), sess_options=options, providers=["CPUExecutionProvider"]
            )
        except Exception as error:
            raise SpeakerInstallationError("Bundled CAM++ speaker model could not be loaded") from error

        self._kaldi = kaldi
        self._options = kaldi.FbankOptions()
        self._options.frame_opts.dither = 0.0
        self._options.mel_opts.num_bins = 80
        self._options.energy_floor = 1.0

    def _features(self, samples: np.ndarray) -> np.ndarray:
        fbank = self._kaldi.OnlineFbank(self._options)
        fbank.accept_waveform(TARGET_SAMPLE_RATE, samples)
        fbank.input_finished()
        features = np.stack([fbank.get_frame(index) for index in range(fbank.num_frames_ready)])
        return features - features.mean(axis=0, keepdims=True)

    def embed(self, samples: np.ndarray) -> np.ndarray | None:
        if samples.ndim != 1 or samples.size < _WINDOW_SAMPLES:
            return None
        window = np.asarray(samples[-_WINDOW_SAMPLES:], dtype=np.float32)
        if not np.isfinite(window).all() or not np.any(window):
            return None
        features = self._features(window)
        embedding, = self._session.run(["embedding"], {"features": features[None]})
        vector = embedding[0]
        norm = np.linalg.norm(vector)
        if not np.isfinite(norm) or norm == 0:
            return None
        return vector / norm
