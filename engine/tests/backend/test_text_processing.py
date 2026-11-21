import unicodedata

import pytest

from nola_translator_engine.backend import text_processing


def document(*features, **settings):
    return {"revision": 1, "values": {"enabled": dict.fromkeys(features, True), **settings}}


def rule(pattern, replacement, *, regex=False):
    return {"pattern": pattern, "replacement": replacement, "regex": regex,
            "caseSensitive": True, "wholeWord": False, "escape": False}


@pytest.mark.parametrize(("feature", "sample", "expected"), [
    ("repeat-chars", "AAAABBBBCCCC", "ABC"),
    ("repeat-block", "ABCDABCDABCD", "ABCD"),
    ("repeat-segments", "S1S1S1S2S2S2", "S1S2"),
    ("repeat-suffix", "ABCDBCDCDD", "ABCD"),
    ("repeat-prefix", "AABABCABCD", "ABCD"),
    ("repeat-prefix", "AABABC / XXYXYZ", "ABC / XYZ"),
])
async def test_hook_cleaners_are_available_in_preview_and_ordinary_hook_text(feature, sample, expected):
    config = document(feature)
    assert (await text_processing.apply(config, "preview", sample))["text"] == expected
    assert (await text_processing.apply(config, "input", sample, kind="hook"))["text"] == expected
    assert (await text_processing.apply(config, "input", sample))["text"] == sample
    assert (await text_processing.apply(config, "input", sample, kind="embedded"))["text"] == sample


async def test_rule_order_and_luna_regex_groups_with_a_bad_rule_in_between():
    config = document("normalize", "replace", "shift-jis", **{
        "rank": ["shift-jis", "normalize", "replace"],
        "tables:replace": [
            {"rules": [rule("AB", "AB7"), rule("(", "invalid", regex=True)]},
            {"rules": [rule(r"/([0-9])/", r"<\1-$1>")]},
        ],
    })
    result = await text_processing.apply(config, "preview", "ＡＢ😀")
    assert result["text"] == "AB<7-7>"
    assert result["issues"] == [{"feature": "replace", "reason": "regex"}]


async def test_python_round_trip_and_failure_fallback():
    code = """class Process:
    def process_before(self, text):
        self.prefix = text[:1]
        return text[1:], {"suffix": "!"}

    def process_after(self, text, context):
        return self.prefix + text + context["suffix"]
"""
    config = document("python-optimize", **{"script:python-optimize": code})
    incoming = await text_processing.apply(config, "input", "abc")
    assert incoming["text"] == "bc"
    outgoing = await text_processing.apply(config, "output", "译", context=incoming["context"])
    assert outgoing["text"] == "a译!"
    bad = document("python-pre", "normalize", **{"script:python-pre": "raise RuntimeError('private')"})
    fallback = await text_processing.apply(bad, "preview", "Ａ")
    assert fallback["text"] == "A"
    assert fallback["issues"] == [{"feature": "python-pre", "reason": "script"}]


async def test_arabic_shaping_preserves_logical_order_and_checks_target_language():
    config = document("arabic")
    result = await text_processing.apply(config, "output", "سلام 123", target="ar")
    assert result["text"] != "سلام 123"
    assert unicodedata.normalize("NFKC", result["text"]) == "سلام 123"
    assert (await text_processing.apply(config, "output", "سلام 123", target="en"))["text"] == "سلام 123"
