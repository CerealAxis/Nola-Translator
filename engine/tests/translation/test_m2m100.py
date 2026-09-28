"""m2m100 provider 单元测试：假 runtime 捕获语言对，覆盖 FLORES-101 校验与运行时装载。"""

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
    # 粤语与藏语只在识别侧支持，翻译侧没有对应 FLORES 码。
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
    """识别模型已独占显存；翻译模型默认不上显卡，除非显式要求。"""
    fake_torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True))
    monkeypatch.delenv(m2m100_module.DEVICE_ENV_VAR, raising=False)
    assert m2m100_module._resolve_device(fake_torch) == "cpu"

    monkeypatch.setenv(m2m100_module.DEVICE_ENV_VAR, "cuda")
    assert m2m100_module._resolve_device(fake_torch) == "cuda:0"

    monkeypatch.setenv(m2m100_module.DEVICE_ENV_VAR, "cuda")
    no_cuda = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False))
    assert m2m100_module._resolve_device(no_cuda) == "cpu"
