import pytest

from nola_translator_engine.backend.glossary import GlossaryTerm, RealtimeGlossary, RealtimeGlossaryUpdate, protect_keep_terms


def test_keep_spans_and_marker_validation():
    term = GlossaryTerm(source="Nola", target="", caseSensitive=False, mode="keep")
    text, restore = protect_keep_terms("NOLA and Nola software", [term])
    assert restore(text.replace(" and ", " 和 ")) == "NOLA 和 Nola software"
    with pytest.raises(ValueError, match="preserveTermsChanged"):
        restore("Nola")
    with pytest.raises(ValueError, match="preserveTermsChanged"):
        restore(text + text)


def test_realtime_preserve_source_language():
    glossary = RealtimeGlossary()
    glossary.update(RealtimeGlossaryUpdate(revision=1, libraries=[[{
        "source": "Nola", "target": "", "caseSensitive": True,
        "mode": "keep", "targetLanguage": "*", "sourceLanguage": "en",
    }]]))
    assert len(glossary.match("Nola", "zh", "en")) == 1
    assert glossary.match("Nola", "zh", "ja") == []


def test_preserve_spans_survive_overlapping_fixed_glossary():
    glossary = RealtimeGlossary()
    glossary.update(RealtimeGlossaryUpdate(revision=1, libraries=[[{
        "source": "Nola Translator", "target": "翻译工具", "caseSensitive": True,
        "mode": "fixed", "targetLanguage": "zh",
    }], [{
        "source": "Nola", "target": "", "caseSensitive": True,
        "mode": "keep", "targetLanguage": "*", "preserve": True,
    }]]))
    terms = glossary.match("Nola Translator", "zh", "en")
    assert any(term.mode == "keep" and term.source == "Nola" for term in terms)
    text, restore = protect_keep_terms("Nola Translator", terms)
    assert restore(text) == "Nola Translator"
