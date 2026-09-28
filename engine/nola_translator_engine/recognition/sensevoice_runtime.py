"""SenseVoiceSmall 识别运行时：funasr 本地目录加载、标签解析与协议语言码映射。

模型是非自回归的：每次 ``transcribe`` 都对传入音频整段重转写，不接受续写前缀，
因此 ``prefix`` 在这里被忽略。输出形如
``<|zh|><|NEUTRAL|><|Speech|><|withitn|>开饭时间早上9点至下午5点。``，
开头的标签串依次是语言、情感、音频事件、ITN 开关。
"""

from __future__ import annotations

import gc
import os
import re
import threading
from pathlib import Path
from typing import Any

import numpy as np
import torch
from numpy.typing import NDArray

from .base import ModelUnavailable

SAMPLE_RATE = 16_000
# 单次转写的动态批量时长上限（秒）；与官方 demo 一致。
BATCH_SIZE_S = 60

# 模型 lid_dict 覆盖的五种语言；其余协议语言码一律回落 auto 由模型自行判定。
SUPPORTED_LANGUAGES = frozenset({"zh", "en", "yue", "ja", "ko"})

_TAG_PREFIX = re.compile(r"^(?:<\|[^|]*\|>)+")
_TAG = re.compile(r"<\|([^|]*)\|>")

# 语音活动检测由引擎自己的音量门负责，这里不引入 funasr 的 fsmn-vad 额外模型。
# disable_update 关闭 funasr 启动时的版本检查，避免离线场景外联。


class SenseVoiceModelUnavailable(ModelUnavailable):
    """SenseVoiceSmall 不可用：目录缺失或 funasr 加载失败。"""


class SenseVoiceRuntime:
    """SenseVoiceSmall 进程内运行时：一次加载、单飞推理入口。"""

    def __init__(self, model_dir: Path) -> None:
        self.model_dir = Path(model_dir)
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._device: str | None = None
        self._model: Any = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str | None:
        return self._device

    def describe(self) -> str:
        return self._device if self._loaded else "unloaded"

    def load(self) -> None:
        """线程安全的一次性加载；失败抛 SenseVoiceModelUnavailable。"""
        with self._load_lock:
            if self._loaded:
                return
            try:
                from funasr import AutoModel
            except Exception as error:
                raise SenseVoiceModelUnavailable(
                    f"无法导入 funasr：{type(error).__name__}: {error}"
                ) from error
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            try:
                model = AutoModel(
                    model=str(self.model_dir), device=device, disable_update=True
                )
            except Exception as error:
                raise SenseVoiceModelUnavailable(
                    f"无法从 {self.model_dir} 加载 SenseVoiceSmall 模型"
                    f"（{type(error).__name__}: {error}）"
                ) from error
            self._model = model
            self._device = device
            self._loaded = True

    def unload(self) -> None:
        """等待正在运行的推理结束，再释放权重与 CUDA 缓存。"""
        with self._inference_lock:
            with self._load_lock:
                model = self._model
                self._model = None
                self._loaded = False
                self._device = None
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def transcribe(
        self,
        samples: NDArray[np.float32],
        *,
        prefix: str | None = None,
        language: str | None = None,
    ) -> tuple[str, str | None]:
        del prefix  # 非自回归模型不接续写前缀，每块都是独立整段转写
        with self._inference_lock:
            return self._transcribe_locked(samples, language=language)

    def _transcribe_locked(
        self, samples: NDArray[np.float32], *, language: str | None
    ) -> tuple[str, str | None]:
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if audio.size == 0:
            return "", None
        self.load()
        assert self._model is not None

        requested = (language or "auto").strip().lower()
        hint = requested if requested in SUPPORTED_LANGUAGES else "auto"
        results = self._model.generate(
            input=np.ascontiguousarray(audio, dtype=np.float32),
            cache={},
            language=hint,
            use_itn=True,
            batch_size_s=BATCH_SIZE_S,
        )
        if not results:
            return "", None
        return _parse_text(str(results[0].get("text") or ""))


def _parse_text(raw: str) -> tuple[str, str | None]:
    """``<|lang|><|emo|><|event|><|itn|>正文`` → (正文, 协议语言码)。"""
    text = raw.strip()
    tags = _TAG_PREFIX.match(text)
    if tags is None:
        return "", None
    language = _TAG.match(tags.group(0))
    body = text[tags.end() :].strip()
    if not body or body == "❓":
        return "", None
    detected = language.group(1).lower() if language else ""
    return body, detected if detected in SUPPORTED_LANGUAGES else None


_runtimes: dict[str, SenseVoiceRuntime] = {}
_runtimes_lock = threading.Lock()


def get_sensevoice_runtime(model_dir: Path) -> SenseVoiceRuntime:
    """按 resolved model_dir 缓存的进程级单例（会话期间只加载一次）。"""
    resolved = Path(model_dir).resolve()
    key = os.path.normcase(str(resolved))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = SenseVoiceRuntime(resolved)
            _runtimes[key] = runtime
        return runtime
