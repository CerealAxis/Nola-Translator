"""QwenRuntime 单元测试：全部使用打桩加载器，不触碰 GPU 与模型文件。"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import torch

import fluentcaptions_engine.recognition.qwen_runtime as qwen_runtime
from fluentcaptions_engine.recognition.qwen_runtime import (
    CheckpointLayoutMismatch,
    QwenModelUnavailable,
    QwenRuntime,
    get_qwen_runtime,
)


@pytest.fixture(autouse=True)
def _clear_runtime_cache():
    qwen_runtime._runtimes.clear()
    yield
    qwen_runtime._runtimes.clear()


@pytest.fixture(autouse=True)
def _clean_quant_env(monkeypatch):
    monkeypatch.delenv(qwen_runtime.QUANT_ENV_VAR, raising=False)


class FakeTokenizer:
    def encode(self, text: str) -> list[str]:
        return text.split()

    def decode(self, ids) -> str:
        return " ".join(ids)


class FragileTokenizer(FakeTokenizer):
    """模拟回退点切碎多字节字符：恰好 2 个 token 时解码带 U+FFFD。"""

    def decode(self, ids) -> str:
        joined = super().decode(ids)
        return joined + "�" if len(ids) == 2 else joined


class FakeBatch(dict):
    def __init__(self, data) -> None:
        super().__init__(data)
        self.to_calls: list[tuple] = []

    def to(self, device, dtype):
        self.to_calls.append((device, dtype))
        return self


class FakeProcessor:
    def __init__(self, raw: str = "language Chinese<asr_text>你好") -> None:
        self.raw = raw
        self.tokenizer = FakeTokenizer()
        self.batch = FakeBatch({"input_ids": torch.zeros((1, 4), dtype=torch.long)})
        self.last_messages = None
        self.last_text = None
        self.parse_inputs: list[str] = []

    def apply_chat_template(self, messages, *, add_generation_prompt, tokenize):
        self.last_messages = messages
        return "PROMPT|"

    def __call__(self, *, text, audio, return_tensors, padding):
        self.last_text = text
        return self.batch

    def decode(self, ids, skip_special_tokens=False):
        return [self.raw]

    def parse_output(self, text: str) -> dict:
        self.parse_inputs.append(text)
        if "<asr_text>" not in text:
            return {"language": None, "transcription": text.strip()}
        meta, body = text.split("<asr_text>", 1)
        if meta.strip().lower() == "language none":
            return {"language": None, "transcription": body.strip()}
        language = None
        first = next((line.strip() for line in meta.splitlines() if line.strip()), "")
        if first.lower().startswith("language "):
            language = first[len("language ") :].strip()
        return {"language": language or None, "transcription": body.strip()}


class FakeModel:
    device = "cpu"

    def __init__(self, output) -> None:
        self.output = output
        self.generate_calls = 0

    def generate(self, **kwargs):
        self.generate_calls += 1
        return self.output


class SequencesOutput:
    def __init__(self, sequences) -> None:
        self.sequences = sequences


def patch_loader(monkeypatch, handler):
    calls: list[str] = []

    def fake(self, quant: str):
        calls.append(quant)
        return handler(quant)

    monkeypatch.setattr(QwenRuntime, "_load_pipeline", fake)
    return calls


def make_pipeline(processor=None, model=None):
    return SimpleNamespace(
        processor=processor if processor is not None else FakeProcessor(),
        model=model if model is not None else FakeModel(torch.tensor([[1, 2, 3, 4, 9, 8]])),
    )


# ---------------------------------------------------------------------- 加载


def test_load_defaults_to_nf4_and_second_load_is_noop(monkeypatch) -> None:
    pipeline = make_pipeline()
    calls = patch_loader(monkeypatch, lambda quant: pipeline)

    runtime = QwenRuntime(Path("models/qwen"))
    assert runtime.loaded is False
    assert runtime.quant is None

    runtime.load()
    runtime.load()

    assert calls == ["nf4"]
    assert runtime.loaded is True
    assert runtime.quant == "nf4"


def test_nf4_failure_falls_back_to_8bit(monkeypatch) -> None:
    pipeline = make_pipeline()

    def handler(quant: str):
        if quant == "nf4":
            raise RuntimeError("nf4 exploded")
        return pipeline

    calls = patch_loader(monkeypatch, handler)
    runtime = QwenRuntime(Path("models/qwen"))
    runtime.load()

    assert calls == ["nf4", "8bit"]
    assert runtime.quant == "8bit"


def test_both_quantizations_fail_raises_unavailable_with_chained_reason(monkeypatch) -> None:
    def handler(quant: str):
        raise RuntimeError(f"{quant} failed")

    patch_loader(monkeypatch, handler)
    runtime = QwenRuntime(Path("models/qwen"))

    with pytest.raises(QwenModelUnavailable) as excinfo:
        runtime.load()

    message = str(excinfo.value)
    assert "nf4" in message and "8bit" in message
    assert isinstance(excinfo.value.__cause__, RuntimeError)
    assert "8bit" in str(excinfo.value.__cause__)
    assert runtime.loaded is False
    assert runtime.quant is None


def test_checkpoint_layout_mismatch_fails_without_quant_retry(monkeypatch) -> None:
    def handler(quant: str):
        raise CheckpointLayoutMismatch("708 个参数缺失")

    calls = patch_loader(monkeypatch, handler)
    runtime = QwenRuntime(Path("models/qwen"))

    with pytest.raises(QwenModelUnavailable) as excinfo:
        runtime.load()

    # 布局不匹配与量化无关：换 8bit 只会再浪费一次加载。
    assert calls == ["nf4"]
    assert "708" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, CheckpointLayoutMismatch)
    assert runtime.loaded is False


def test_explicit_and_env_quant_resolution(monkeypatch) -> None:
    pipeline = make_pipeline()

    explicit_calls = patch_loader(monkeypatch, lambda quant: pipeline)
    explicit = QwenRuntime(Path("models/a"), quant="8bit")
    explicit.load()
    assert explicit_calls == ["8bit"]
    assert explicit.quant == "8bit"

    qwen_runtime._runtimes.clear()
    env_calls = patch_loader(monkeypatch, lambda quant: pipeline)
    monkeypatch.setenv(qwen_runtime.QUANT_ENV_VAR, "8bit")
    env_runtime = QwenRuntime(Path("models/b"))
    env_runtime.load()
    assert env_calls == ["8bit"]

    with pytest.raises(ValueError):
        QwenRuntime(Path("models/c"), quant="int4")


def test_singleton_keyed_by_resolved_dir(tmp_path: Path) -> None:
    first = get_qwen_runtime(tmp_path / "model")
    again = get_qwen_runtime(tmp_path / "model")
    case_variant = get_qwen_runtime(tmp_path / "MODEL")
    other = get_qwen_runtime(tmp_path / "other")

    assert first is again
    assert first is case_variant  # Windows 路径大小写不敏感
    assert other is not first


# ------------------------------------------------------------------ 回退文本


def test_rollback_text_drops_last_tokens_like_official(monkeypatch) -> None:
    processor = FakeProcessor()
    processor.tokenizer = FakeTokenizer()
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=object()))
    runtime = QwenRuntime(Path("models/qwen"))
    runtime.load()

    assert runtime.rollback_text("a b c d e f", 5) == "a"
    assert runtime.rollback_text("a b", 5) == ""
    assert runtime.rollback_text("", 5) == ""


def test_rollback_text_retries_when_cut_breaks_multibyte_char(monkeypatch) -> None:
    processor = FakeProcessor()
    processor.tokenizer = FragileTokenizer()
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=object()))
    runtime = QwenRuntime(Path("models/qwen"))
    runtime.load()

    # 1-token 回退先落在 2-token（带 U+FFFD）上，再多退 1 个 token
    assert runtime.rollback_text("a b c", 1) == "a"


# ------------------------------------------------------------------ 转写解析


def test_transcribe_builds_official_prompt_and_parses_tensor_output(monkeypatch) -> None:
    processor = FakeProcessor(raw="language Chinese<asr_text>你好世界")
    model = FakeModel(torch.tensor([[1, 2, 3, 4, 9, 8]]))
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=model))
    runtime = QwenRuntime(Path("models/qwen"))

    text, language = runtime.transcribe(np.zeros(1600, dtype=np.float32))

    assert (text, language) == ("你好世界", "zh")
    # 官方消息骨架：空 system + 单条 audio user
    assert processor.last_messages == [
        {"role": "system", "content": ""},
        {"role": "user", "content": [{"type": "audio", "audio": ""}]},
    ]
    # S4 陷阱 1：输入必须固定 bfloat16，而不是 model.dtype
    assert processor.batch.to_calls == [("cpu", torch.bfloat16)]
    assert model.generate_calls == 1
    assert processor.last_text[0] == "PROMPT|"


def test_transcribe_handles_sequences_object_and_prefix_concat(monkeypatch) -> None:
    processor = FakeProcessor(raw=", world")
    model = FakeModel(SequencesOutput(torch.tensor([[1, 2, 3, 4, 7]])))
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=model))
    runtime = QwenRuntime(Path("models/qwen"))

    text, language = runtime.transcribe(
        np.zeros(1600, dtype=np.float32), prefix="hello"
    )

    # 官方语义：解析对象是 prefix + 新生成的累计原文
    assert text == "hello, world"
    assert language is None
    assert processor.parse_inputs == ["hello, world"]
    assert processor.last_text[0] == "PROMPT|hello"


def test_transcribe_forces_language_hint_after_generation_prompt(monkeypatch) -> None:
    processor = FakeProcessor(raw="早安")
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=FakeModel(torch.tensor([[1, 2, 3, 4, 5]]))))
    runtime = QwenRuntime(Path("models/qwen"))

    text, language = runtime.transcribe(
        np.zeros(1600, dtype=np.float32), prefix="继续", language="zh"
    )

    # 官方顺序：chat template → language 提示 → 前缀
    assert processor.last_text[0] == "PROMPT|language Chinese<asr_text>继续"
    assert (text, language) == ("继续早安", "zh")


def test_transcribe_empty_output_and_empty_samples(monkeypatch) -> None:
    processor = FakeProcessor(raw="")
    model = FakeModel(torch.tensor([[1, 2, 3, 4]]))
    patch_loader(monkeypatch, lambda quant: SimpleNamespace(processor=processor, model=model))
    runtime = QwenRuntime(Path("models/qwen"))

    assert runtime.transcribe(np.zeros(1600, dtype=np.float32)) == ("", None)

    untouched = QwenRuntime(Path("models/untouched"))
    assert untouched.transcribe(np.zeros(0, dtype=np.float32)) == ("", None)
    assert untouched.loaded is False
    assert model.generate_calls == 1
