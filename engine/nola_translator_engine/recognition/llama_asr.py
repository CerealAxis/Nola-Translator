"""Qwen3-ASR GGUF audio input through llama.cpp's local libmtmd server."""
from __future__ import annotations

import base64
import io
import re
import wave

import numpy as np

from .qwen_runtime import CODE_TO_NAME, NAME_TO_CODE
from ..translation.llama_server import LlamaServerManager


class LlamaAsrRuntime:
    def __init__(self, manager: LlamaServerManager, *, qwen_format: bool = True):
        self.manager = manager
        self.qwen_format = qwen_format

    @property
    def loaded(self) -> bool:
        return self.manager.ready

    def describe(self) -> str:
        return self.manager.device or "unloaded"

    def wait_idle(self) -> None:
        self.manager.wait_idle()

    async def unload(self) -> None:
        await self.manager.stop()

    def transcribe(self, samples, *, prefix=None, language=None):
        messages, prefill = self._messages(samples, language)
        if not messages:
            return "", None
        raw = self.manager.chat_sync(messages, timeout_s=120, max_tokens=512)
        return self._parse(raw, prefill, language)

    def transcribe_batch(self, samples, *, language=None):
        inputs = [self._messages(item, language) for item in samples]
        indices = [index for index, item in enumerate(inputs) if item[0]]
        output = [("", None)] * len(samples)
        if indices:
            results = self.manager.chat_batch_sync([inputs[index][0] for index in indices], timeout_s=120, max_tokens=512)
            if len(results) != len(indices):
                raise ValueError("ASR batch result count mismatch")
            for index, raw in zip(indices, results):
                output[index] = self._parse(raw, inputs[index][1], language)
        return output

    def _messages(self, samples, language):
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if not audio.size:
            return [], ""
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16000)
            output.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
        messages = [{"role": "system", "content": ""}, {"role": "user", "content": [
            {"type": "input_audio", "input_audio": {"data": base64.b64encode(buffer.getvalue()).decode('ascii'), "format": "wav"}},
        ]}]
        if not self.qwen_format:
            prompt = 'Transcribe this audio. Return only the transcript.'
            if language:
                prompt += f' The spoken language is {language}.'
            messages[1]['content'].insert(0, {'type': 'text', 'text': prompt})
        # The official Qwen3-ASR format supports language-prefilled assistant output.
        hint = CODE_TO_NAME.get(language or "") if self.qwen_format else None
        prefill = f"language {hint}<asr_text>" if hint else ""
        if prefill:
            messages.append({"role": "assistant", "content": prefill})
        return messages, prefill

    @staticmethod
    def _parse(raw, prefill, language):
        # Some server templates emit the prefilled header again; parse one header.
        if not re.match(r"language\s+[^<]+<asr_text>", raw):
            raw = prefill + raw
        match = re.match(r"language\s+([^<]+)<asr_text>(.*)", raw, re.S)
        detected = language
        if match:
            detected = NAME_TO_CODE.get(match[1].strip(), language)
            raw = match[2]
        raw = re.sub(r"<\|[^|]+\|>|<asr_text>", "", raw).strip()
        return raw, detected
