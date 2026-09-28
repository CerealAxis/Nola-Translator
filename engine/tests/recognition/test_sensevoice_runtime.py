"""SenseVoiceRuntime 单元测试：标签解析、语言回落与 funasr 加载桩。"""

from __future__ import annotations

import numpy as np
import pytest

import nola_translator_engine.recognition.sensevoice_runtime as sv_module
from nola_translator_engine.recognition.base import ModelUnavailable
from nola_translator_engine.recognition.sensevoice_runtime import (
    SUPPORTED_LANGUAGES,
    SenseVoiceModelUnavailable,
    SenseVoiceRuntime,
    _parse_text,
    get_sensevoice_runtime,
)


@pytest.fixture(autouse=True)
def _clear_registry():
    sv_module._runtimes.clear()
    yield
    sv_module._runtimes.clear()


class FakeAutoModel:
    def __init__(self, texts=None, error=None) -> None:
        self.texts = list(texts) if texts else None
        self.error = error
        self.calls: list[dict] = []
        self.kwargs: dict = {}

    def generate(self, input, cache=None, language=None, use_itn=None, batch_size_s=None):
        if self.error is not None:
            raise self.error
        self.calls.append(
            {
                "samples": input,
                "cache": cache,
                "language": language,
                "use_itn": use_itn,
                "batch_size_s": batch_size_s,
            }
        )
        index = len(self.calls) - 1
        text = self.texts[index] if self.texts and index < len(self.texts) else ""
        return [{"key": "sample", "text": text}]


def install_fake(monkeypatch, fake: FakeAutoModel) -> None:
    import funasr

    def build(**kwargs):
        fake.kwargs = kwargs
        return fake

    monkeypatch.setattr(funasr, "AutoModel", build)


def audio(seconds: float = 0.5) -> np.ndarray:
    return np.zeros(int(16_000 * seconds), dtype=np.float32)


# ------------------------------------------------------------------ 标签解析


def test_parse_text_splits_language_tag_from_body() -> None:
    assert _parse_text("<|zh|><|NEUTRAL|><|Speech|><|withitn|>开饭时间早上9点至下午5点。") == (
        "开饭时间早上9点至下午5点。",
        "zh",
    )


def test_parse_text_reports_detected_language_for_english() -> None:
    text, language = _parse_text("<|en|><|NEUTRAL|><|Speech|><|withitn|>hello there")

    assert text == "hello there"
    assert language == "en"


def test_parse_text_without_tags_yields_nothing() -> None:
    assert _parse_text("   ") == ("", None)
    assert _parse_text("no tags at all") == ("", None)


def test_parse_text_drops_nospeech_placeholder() -> None:
    assert _parse_text("<|nospeech|><|NEUTRAL|><|Speech|><|withitn|>❓") == ("", None)
    assert _parse_text("<|nospeech|><|NEUTRAL|><|Speech|><|withitn|>") == ("", None)


def test_parse_text_rejects_language_outside_model_vocabulary() -> None:
    assert _parse_text("<|de|><|NEUTRAL|><|Speech|><|withitn|>guten tag") == (
        "guten tag",
        None,
    )


# ------------------------------------------------------------------ 语言回落


def test_unsupported_source_language_falls_back_to_auto(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|en|><|NEUTRAL|><|Speech|><|withitn|>bonjour"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    text, language = runtime.transcribe(audio(), language="fr")

    assert fake.calls[0]["language"] == "auto"
    assert (text, language) == ("bonjour", "en")


def test_supported_source_language_is_forwarded_verbatim(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|yue|><|NEUTRAL|><|Speech|><|withitn|>唔該"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    runtime.transcribe(audio(), language="yue")

    assert fake.calls[0]["language"] == "yue"


def test_model_vocabulary_matches_documented_languages() -> None:
    assert SUPPORTED_LANGUAGES == {"zh", "en", "yue", "ja", "ko"}


# ------------------------------------------------------------------ 推理入口


def test_transcribe_ignores_prefix_and_passes_whole_segment(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|zh|><|NEUTRAL|><|Speech|><|withitn|>你好"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")
    samples = audio(1.0)

    runtime.transcribe(samples, prefix="不该出现的续写前缀", language="zh")

    sent = fake.calls[0]["samples"]
    assert sent.dtype == np.float32
    assert sent.size == samples.size
    assert fake.calls[0]["use_itn"] is True
    assert fake.calls[0]["cache"] == {}


def test_empty_audio_skips_inference_entirely(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|zh|><|NEUTRAL|><|Speech|><|withitn|>不应出现"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    assert runtime.transcribe(np.zeros(0, dtype=np.float32)) == ("", None)
    assert fake.calls == []
    assert runtime.loaded is False


def test_missing_result_list_yields_empty_text(monkeypatch) -> None:
    class Empty(FakeAutoModel):
        def generate(self, **kwargs):
            return []

    install_fake(monkeypatch, Empty())
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    assert runtime.transcribe(audio()) == ("", None)


# ------------------------------------------------------------------ 加载与单例


def test_load_is_idempotent_and_reuses_one_model(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|zh|><|NEUTRAL|><|Speech|><|withitn|>一次"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    assert runtime.loaded is False
    runtime.load()
    runtime.load()

    assert runtime.loaded is True
    assert runtime.describe() in {"cuda:0", "cpu"}


def test_load_failure_surfaces_as_model_unavailable(monkeypatch) -> None:
    import funasr

    def build(**kwargs):
        raise RuntimeError("bad checkpoint")

    monkeypatch.setattr(funasr, "AutoModel", build)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")

    with pytest.raises(SenseVoiceModelUnavailable) as excinfo:
        runtime.load()

    assert isinstance(excinfo.value, ModelUnavailable)
    assert runtime.loaded is False


def test_unload_releases_weights(monkeypatch) -> None:
    fake = FakeAutoModel(texts=["<|zh|><|NEUTRAL|><|Speech|><|withitn|>一次"])
    install_fake(monkeypatch, fake)
    runtime = SenseVoiceRuntime("C:/models/sensevoice-small")
    runtime.load()

    runtime.unload()

    assert runtime.loaded is False
    assert runtime.describe() == "unloaded"


def test_get_sensevoice_runtime_caches_by_resolved_path(tmp_path) -> None:
    first = get_sensevoice_runtime(tmp_path / "model")
    again = get_sensevoice_runtime(tmp_path / "model")
    variant = get_sensevoice_runtime(tmp_path / "MODEL")
    other = get_sensevoice_runtime(tmp_path / "other")

    assert first is again
    assert first is variant
    assert first is not other
