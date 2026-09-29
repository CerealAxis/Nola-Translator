"""Qwen3-ASR runtime: offline local load, NF4→8bit fallback, chat-template prefix continuation."""

from __future__ import annotations

import os
import gc
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from numpy.typing import NDArray

from .base import ModelUnavailable

SAMPLE_RATE = 16_000
MAX_NEW_TOKENS = 512
QUANT_ENV_VAR = "NOLA_TRANSLATOR_QWEN_QUANT"
VALID_QUANTS = ("nf4", "8bit")

# The 30 languages Qwen3-ASR supports, protocol code ↔ official name.
CODE_TO_NAME: dict[str, str] = {
    "zh": "Chinese",
    "en": "English",
    "yue": "Cantonese",
    "ar": "Arabic",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "pt": "Portuguese",
    "id": "Indonesian",
    "it": "Italian",
    "ko": "Korean",
    "ru": "Russian",
    "th": "Thai",
    "vi": "Vietnamese",
    "ja": "Japanese",
    "tr": "Turkish",
    "hi": "Hindi",
    "ms": "Malay",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "pl": "Polish",
    "cs": "Czech",
    "fil": "Filipino",
    "fa": "Persian",
    "el": "Greek",
    "hu": "Hungarian",
    "mk": "Macedonian",
    "ro": "Romanian",
}
NAME_TO_CODE = {name: code for code, name in CODE_TO_NAME.items()}


class QwenModelUnavailable(ModelUnavailable):
    """Qwen3-ASR unavailable: directory missing, or both the NF4 and 8bit loads failed."""


class CheckpointLayoutMismatch(RuntimeError):
    """Checkpoint weight keys don't match the architecture: from_pretrained silently random-initializes."""


@dataclass(slots=True)
class _Pipeline:
    model: Any
    processor: Any


def _language_name(value: str) -> str:
    """Protocol code or full name → official name, for the `language X<asr_text>` hint."""
    text = value.strip()
    direct = CODE_TO_NAME.get(text.lower())
    if direct is not None:
        return direct
    base = text.split("-")[0].lower()
    if base in CODE_TO_NAME:
        return CODE_TO_NAME[base]
    return text[:1].upper() + text[1:].lower()


def _language_code(value: str | None) -> str | None:
    """Official name or protocol code → protocol code; None when unknown."""
    if not value:
        return None
    text = value.strip()
    if text.lower() in CODE_TO_NAME:
        return text.lower()
    name = text[:1].upper() + text[1:].lower()
    if name in NAME_TO_CODE:
        return NAME_TO_CODE[name]
    base = text.split("-")[0].lower()
    return base if base in CODE_TO_NAME else None


class QwenRuntime:
    """In-process Qwen3-ASR runtime: load once, fall back across quants, single-flight inference."""

    def __init__(self, model_dir: Path, quant: str | None = None) -> None:
        if quant is not None and quant not in VALID_QUANTS:
            raise ValueError(f"quant 必须是 {'/'.join(VALID_QUANTS)} 之一：{quant!r}")
        self.model_dir = Path(model_dir)
        self._quant_param = quant
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._quant: str | None = None
        self._pipeline: _Pipeline | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def quant(self) -> str | None:
        return self._quant

    def describe(self) -> str:
        return self._quant if self._loaded else "unloaded"

    def load(self) -> None:
        """Thread-safe one-shot load: NF4 falls back to 8bit; both failing raises QwenModelUnavailable."""
        with self._load_lock:
            if self._loaded:
                return
            requested = self._resolve_quant()
            attempts = VALID_QUANTS if requested == "nf4" else ("8bit",)
            errors: list[tuple[str, Exception]] = []
            for quant in attempts:
                try:
                    pipeline = self._load_pipeline(quant)
                except CheckpointLayoutMismatch as error:
                    # Quantization-independent: an 8bit retry fails the same way, so report unavailable now.
                    raise QwenModelUnavailable(str(error)) from error
                except Exception as error:
                    errors.append((quant, error))
                    continue
                self._pipeline = pipeline
                self._quant = quant
                self._loaded = True
                return
            detail = "; ".join(
                f"{quant}: {type(error).__name__}: {error}" for quant, error in errors
            )
            raise QwenModelUnavailable(
                f"无法从 {self.model_dir} 加载 Qwen3-ASR 模型（{detail}）"
            ) from errors[-1][1]

    def unload(self) -> None:
        """Wait for in-flight inference to finish, then drop weights and clear the CUDA cache."""
        with self._inference_lock:
            with self._load_lock:
                pipeline = self._pipeline
                self._pipeline = None
                self._loaded = False
                self._quant = None
            del pipeline
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def _resolve_quant(self) -> str:
        # explicit arg > env var > nf4 default
        if self._quant_param is not None:
            return self._quant_param
        env_value = os.environ.get(QUANT_ENV_VAR, "").strip().lower()
        if env_value in VALID_QUANTS:
            return env_value
        return "nf4"

    def _load_pipeline(self, quant: str) -> _Pipeline:
        """The real from_pretrained block, split into its own method so tests can stub it."""
        from transformers import (
            AutoProcessor,
            BitsAndBytesConfig,
            Qwen3ASRForConditionalGeneration,
        )

        if quant == "nf4":
            bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4")
        else:
            bnb = BitsAndBytesConfig(load_in_8bit=True)
        processor = AutoProcessor.from_pretrained(str(self.model_dir), local_files_only=True)
        model, loading_info = Qwen3ASRForConditionalGeneration.from_pretrained(
            str(self.model_dir),
            quantization_config=bnb,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
            local_files_only=True,
            output_loading_info=True,
        )
        # On a weight-key layout mismatch (e.g. the thinker-layout Qwen/Qwen3-ASR-0.6B),
        # from_pretrained random-initializes every parameter and returns normally — it
        # only falls apart at inference time.
        missing = sorted(loading_info.get("missing_keys", ()))
        if missing:
            raise CheckpointLayoutMismatch(
                f"{self.model_dir} 的权重与 Qwen3ASRForConditionalGeneration 不匹配："
                f"{len(missing)} 个参数缺失（首个 {missing[0]}）。"
                "请重新安装 transformers 原生的 -hf 仓库快照"
            )
        return _Pipeline(model=model, processor=processor)

    def rollback_text(self, text: str, n_tokens: int = 5) -> str:
        """Official streaming 5-token rollback, backed off one extra token when that would
        split a multibyte char (U+FFFD).
        """
        if not text:
            return ""
        self.load()
        pipeline = self._pipeline
        assert pipeline is not None
        tokenizer = pipeline.processor.tokenizer
        token_ids = tokenizer.encode(text)
        keep = int(n_tokens)
        while True:
            end = max(0, len(token_ids) - keep)
            prefix = tokenizer.decode(token_ids[:end]) if end > 0 else ""
            if "�" not in prefix:
                return prefix
            if end == 0:
                return ""
            keep += 1

    def transcribe(
        self,
        samples: NDArray[np.float32],
        *,
        prefix: str | None = None,
        language: str | None = None,
    ) -> tuple[str, str | None]:
        with self._inference_lock:
            return self._transcribe_locked(samples, prefix=prefix, language=language)

    def _transcribe_locked(
        self,
        samples: NDArray[np.float32],
        *,
        prefix: str | None = None,
        language: str | None = None,
    ) -> tuple[str, str | None]:
        """Transcribe 16 kHz mono float32 audio; prefix continues through the chat
        template (official streaming prefix, not a hotword list).
        """
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if audio.size == 0:
            return "", None
        self.load()
        pipeline = self._pipeline
        assert pipeline is not None

        hint: str | None = None
        forced_code: str | None = None
        if language is not None and language.strip() and language.strip().lower() != "auto":
            hint = _language_name(language)
            forced_code = _language_code(language)

        prompt = self._build_prompt(prefix=prefix, hint=hint)
        with torch.inference_mode():
            inputs = pipeline.processor(
                text=[prompt], audio=[audio], return_tensors="pt", padding=True
            )
            # bnb flips model.dtype to float32 after the first generate() call, so inputs
            # must stay bfloat16 — never use model.dtype.
            inputs = inputs.to(pipeline.model.device, torch.bfloat16)
            output = pipeline.model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS)

        # transformers 5.17 may return a bare tensor or an object carrying .sequences
        sequences = output.sequences if hasattr(output, "sequences") else output
        generated = sequences[:, inputs["input_ids"].shape[1] :]
        decoded = pipeline.processor.decode(generated, skip_special_tokens=True)
        raw = decoded[0] if isinstance(decoded, list) and decoded else decoded
        if not isinstance(raw, str):
            raw = ""

        # Official streaming semantics: the parsed value is prefix + newly generated cumulative text
        parsed = pipeline.processor.parse_output(f"{prefix or ''}{raw}")
        text = str(parsed.get("transcription") or "").strip()
        if not text:
            return "", None
        return text, _language_code(parsed.get("language")) or forced_code

    def _build_prompt(self, *, prefix: str | None, hint: str | None) -> str:
        """Official message skeleton; the language hint and the prefix are appended after
        the generation prompt, in that order.
        """
        messages = [
            {"role": "system", "content": ""},
            {"role": "user", "content": [{"type": "audio", "audio": ""}]},
        ]
        prompt = self._pipeline.processor.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
        if hint:
            prompt += f"language {hint}<asr_text>"
        if prefix:
            prompt += prefix
        return prompt


_runtimes: dict[str, QwenRuntime] = {}
_runtimes_lock = threading.Lock()


def get_qwen_runtime(model_dir: Path) -> QwenRuntime:
    """Process-wide singleton cached by resolved model_dir, so weights load once per session."""
    resolved = Path(model_dir).resolve()
    key = os.path.normcase(str(resolved))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = QwenRuntime(resolved)
            _runtimes[key] = runtime
        return runtime
