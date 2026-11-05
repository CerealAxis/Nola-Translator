"""m2m100 provider unit tests: a fake runtime captures the language pair, covering FLORES-101 validation and runtime loading."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from nola_translator_engine.translation import m2m100 as m2m100_module
from nola_translator_engine.translation.m2m100 import (
    M2M100Runtime,
    M2M100TranslationProvider,
    UnsupportedLanguagePair,
    is_supported,
    validate_session_languages,
)


class FakeRuntime:
    def __init__(self, result: str = "你好。", error: Exception | None = None) -> None:
        self.calls: list[tuple[str, str, str]] = []
        self.result = result
        self.error = error

    def translate_sync(self, text: str, source: str, target: str) -> str:
        self.calls.append((text, source, target))
        if self.error is not None:
            raise self.error
        return self.result


def _provider(runtime: FakeRuntime) -> M2M100TranslationProvider:
    provider = M2M100TranslationProvider.__new__(M2M100TranslationProvider)
    provider.runtime = runtime  # type: ignore[assignment]
    return provider


def test_flores_table_matches_transformers_language_codes() -> None:
    from transformers.models.m2m_100.tokenization_m2m_100 import FAIRSEQ_LANGUAGE_CODES

    assert set(m2m100_module.FLORES_LANGUAGES) == set(FAIRSEQ_LANGUAGE_CODES["m2m100"])
    # Cantonese and Tibetan are recognition-only; FLORES has no code for them.
    assert "yue" not in m2m100_module.FLORES_LANGUAGES
    assert "bo" not in m2m100_module.FLORES_LANGUAGES


def test_is_supported_handles_codes_and_regional_aliases() -> None:
    assert is_supported("en") and is_supported("zh")
    assert is_supported("zh-CN") and is_supported("en-US")
    assert is_supported("fil") is False
    assert not is_supported("xx") and not is_supported("")


def test_validate_session_languages_skips_auto_source() -> None:
    assert validate_session_languages(None, ["zh", "en"]) == []
    assert validate_session_languages("auto", ["zh"]) == []
    assert validate_session_languages("en", ["tlh", "tlh"]) == ["tlh"]
    assert validate_session_languages("tlh", ["en"]) == ["tlh"]


async def test_translate_passes_normalized_language_pair() -> None:
    runtime = FakeRuntime(result="今天天气很好。")
    provider = _provider(runtime)

    result = await provider.translate("The weather is nice today.", "en-US", "zh-CN")

    assert provider.name == "m2m100"
    assert result.text == "今天天气很好。"
    assert result.path == ("en-US", "zh-CN")
    assert runtime.calls == [("The weather is nice today.", "en", "zh")]


async def test_translate_rejects_unsupported_pair() -> None:
    provider = _provider(FakeRuntime())

    with pytest.raises(UnsupportedLanguagePair):
        await provider.translate("hello", "en", "yue")


def test_runtime_load_failure_is_wrapped(tmp_path: Path, monkeypatch) -> None:
    runtime = M2M100Runtime(tmp_path / "missing")

    def boom() -> None:
        raise FileNotFoundError("no such model dir")

    monkeypatch.setattr(runtime, "_load_bundle", boom)

    assert runtime.loaded is False
    with pytest.raises(m2m100_module.M2M100ModelUnavailable):
        runtime.load()
    assert runtime.loaded is False


def test_runtime_loads_once(monkeypatch, tmp_path: Path) -> None:
    runtime = M2M100Runtime(tmp_path / "m2m")
    calls: list[str] = []

    def fake_load() -> m2m100_module._Bundle:
        calls.append("load")
        return m2m100_module._Bundle(model=object(), tokenizer=object())

    monkeypatch.setattr(runtime, "_load_bundle", fake_load)

    runtime.load()
    runtime.load()

    assert calls == ["load"]
    assert runtime.loaded is True


def test_get_runtime_is_cached_per_directory(tmp_path: Path) -> None:
    first = m2m100_module.get_m2m100_runtime(tmp_path / "a")
    assert m2m100_module.get_m2m100_runtime(tmp_path / "a") is first
    assert m2m100_module.get_m2m100_runtime(tmp_path / "b") is not first


def test_device_defaults_to_cpu_and_honours_opt_in(monkeypatch) -> None:
    """The recognition model already owns the GPU, so translation stays on CPU unless asked otherwise."""
    fake_torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True))
    monkeypatch.delenv(m2m100_module.DEVICE_ENV_VAR, raising=False)
    assert m2m100_module._resolve_device(fake_torch) == "cpu"

    monkeypatch.setenv(m2m100_module.DEVICE_ENV_VAR, "cuda")
    assert m2m100_module._resolve_device(fake_torch) == "cuda:0"

    monkeypatch.setenv(m2m100_module.DEVICE_ENV_VAR, "cuda")
    no_cuda = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False))
    assert m2m100_module._resolve_device(no_cuda) == "cpu"



def test_batch_translation_generates_once_for_a_shared_language_pair(tmp_path, monkeypatch):
    import torch

    class Tokenizer:
        def set_tgt_lang_special_tokens(self, target):
            assert target == "zh"
        def get_lang_id(self, target):
            return 42
        def __call__(self, texts, **kwargs):
            assert texts == ["one", "two"] and kwargs["padding"]
            return {"input_ids": torch.ones((2, 3), dtype=torch.long)}
        def batch_decode(self, output, **kwargs):
            assert output.shape[0] == 2
            return [" first ", " second "]

    calls = []
    def generate(**kwargs):
        calls.append(kwargs)
        assert kwargs["input_ids"].shape == (2, 3)
        assert kwargs["forced_bos_token_id"] == 42
        return torch.ones((2, 4), dtype=torch.long)
    runtime = M2M100Runtime(tmp_path)
    runtime._loaded = True
    runtime._bundle = m2m100_module._Bundle(model=SimpleNamespace(device="cpu", generate=generate), tokenizer=Tokenizer())
    assert runtime.translate_batch_sync(["one", "two"], "en", "zh") == ["first", "second"]
    assert len(calls) == 1



@pytest.mark.parametrize("causal", [True, False])
def test_generic_transformers_batches_inputs_and_restores_causal_padding(tmp_path, causal):
    import torch
    from nola_translator_engine.translation.transformers_causal import CausalTranslationRuntime, Seq2SeqTranslationRuntime

    class Batch(dict):
        def to(self, _device):
            return self
    class Tokenizer:
        chat_template = None
        padding_side = "right"
        pad_token = None
        eos_token = "EOS"
        def __call__(self, texts, **kwargs):
            assert len(texts) == 2 and kwargs["padding"]
            assert texts[0].endswith("one\n") if causal else texts[0].endswith("one")
            if causal:
                assert self.padding_side == "left" and self.pad_token == "EOS"
            return Batch(input_ids=torch.zeros((2, 4), dtype=torch.long))
        def batch_decode(self, output, **kwargs):
            assert output.shape[0] == 2
            return ["first", "second"]
    tokenizer = Tokenizer()
    calls = []
    def generate(**kwargs):
        calls.append(kwargs)
        return torch.zeros((2, 6), dtype=torch.long)
    runtime = (CausalTranslationRuntime if causal else Seq2SeqTranslationRuntime)(tmp_path)
    runtime.device = "cpu"
    runtime._loaded = True
    runtime._bundle = m2m100_module._Bundle(model=SimpleNamespace(config=SimpleNamespace(max_position_embeddings=2048), generate=generate), tokenizer=tokenizer)
    assert runtime.translate_batch_sync(["one", "two"], "en", "zh") == ["first", "second"]
    assert len(calls) == 1
    assert tokenizer.padding_side == "right" and tokenizer.pad_token is None
