"""Qwen3-ASR 识别运行时：本地离线加载、NF4→8bit 回退与 chat template 前缀续写。"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from numpy.typing import NDArray

SAMPLE_RATE = 16_000
MAX_NEW_TOKENS = 512
QUANT_ENV_VAR = "FLUENTCAPTIONS_QWEN_QUANT"
VALID_QUANTS = ("nf4", "8bit")

# S4 钉值：Qwen3-ASR 支持的 30 种语言（协议码 ↔ 官方全名）。
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


class QwenModelUnavailable(RuntimeError):
    """模型不可用：目录缺失或 NF4/8bit 量化均加载失败。"""


@dataclass(slots=True)
class _Pipeline:
    model: Any
    processor: Any


def _language_name(value: str) -> str:
    """协议码或全名 → 官方全名（用于 `language X<asr_text>` 强制提示）。"""
    text = value.strip()
    direct = CODE_TO_NAME.get(text.lower())
    if direct is not None:
        return direct
    base = text.split("-")[0].lower()
    if base in CODE_TO_NAME:
        return CODE_TO_NAME[base]
    return text[:1].upper() + text[1:].lower()


def _language_code(value: str | None) -> str | None:
    """官方全名或协议码 → 协议码；未知返回 None。"""
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
    """Qwen3-ASR 进程内运行时：一次加载、量化回退、单飞推理入口。"""

    def __init__(self, model_dir: Path, quant: str | None = None) -> None:
        if quant is not None and quant not in VALID_QUANTS:
            raise ValueError(f"quant 必须是 {'/'.join(VALID_QUANTS)} 之一：{quant!r}")
        self.model_dir = Path(model_dir)
        self._quant_param = quant
        self._load_lock = threading.Lock()
        self._loaded = False
        self._quant: str | None = None
        self._pipeline: _Pipeline | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def quant(self) -> str | None:
        return self._quant

    def load(self) -> None:
        """线程安全的一次性加载：NF4 失败回退 8bit，均失败抛 QwenModelUnavailable。"""
        with self._load_lock:
            if self._loaded:
                return
            requested = self._resolve_quant()
            attempts = VALID_QUANTS if requested == "nf4" else ("8bit",)
            errors: list[tuple[str, Exception]] = []
            for quant in attempts:
                try:
                    pipeline = self._load_pipeline(quant)
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

    def _resolve_quant(self) -> str:
        # 显式参数 > 环境变量 > 默认 nf4（S2.2/S4）
        if self._quant_param is not None:
            return self._quant_param
        env_value = os.environ.get(QUANT_ENV_VAR, "").strip().lower()
        if env_value in VALID_QUANTS:
            return env_value
        return "nf4"

    def _load_pipeline(self, quant: str) -> _Pipeline:
        """实际 from_pretrained 块，独立成方法便于测试打桩。"""
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
        model = Qwen3ASRForConditionalGeneration.from_pretrained(
            str(self.model_dir),
            quantization_config=bnb,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
            local_files_only=True,
        )
        return _Pipeline(model=model, processor=processor)

    def rollback_text(self, text: str, n_tokens: int = 5) -> str:
        """官方流式 5-token 回退：切碎多字节字符（U+FFFD）时再多回退一个 token。"""
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
        """转写 16 kHz 单声道 float32 音频；prefix 走 chat template 续写（官方流式前缀，非热词）。"""
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
            # S4 陷阱 1：bnb 下首次 generate() 后 model.dtype 翻成 float32，
            # 输入必须固定 bfloat16，绝不能用 model.dtype。
            inputs = inputs.to(pipeline.model.device, torch.bfloat16)
            output = pipeline.model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS)

        # transformers 5.17 可能返回纯张量或带 .sequences 的对象（S4 陷阱 4）
        sequences = output.sequences if hasattr(output, "sequences") else output
        generated = sequences[:, inputs["input_ids"].shape[1] :]
        decoded = pipeline.processor.decode(generated, skip_special_tokens=True)
        raw = decoded[0] if isinstance(decoded, list) and decoded else decoded
        if not isinstance(raw, str):
            raw = ""

        # 官方流式语义：解析对象是 prefix + 新生成的累计原文
        parsed = pipeline.processor.parse_output(f"{prefix or ''}{raw}")
        text = str(parsed.get("transcription") or "").strip()
        if not text:
            return "", None
        return text, _language_code(parsed.get("language")) or forced_code

    def _build_prompt(self, *, prefix: str | None, hint: str | None) -> str:
        """官方消息骨架：语言提示与前缀依次拼在 generation prompt 之后。"""
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
    """按 resolved model_dir 缓存的进程级单例（会话期间只加载一次）。"""
    resolved = Path(model_dir).resolve()
    key = os.path.normcase(str(resolved))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = QwenRuntime(resolved)
            _runtimes[key] = runtime
        return runtime
