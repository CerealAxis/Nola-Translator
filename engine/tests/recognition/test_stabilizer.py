import pytest

from nola_translator_engine.recognition.stabilizer import (
    FinalTranscriptDeduplicator,
    RecognitionStabilizer,
)


def test_revisions_only_increase_for_meaningful_changes_and_final_emits_once() -> None:
    stabilizer = RecognitionStabilizer("segment-1", started_at_ms=100)

    first = stabilizer.update("你", language="zh", is_final=False)
    duplicate = stabilizer.update("你", language="zh", is_final=False)
    second = stabilizer.update("你好", language="zh", is_final=False)
    final = stabilizer.update("  你好  ", language="zh", is_final=True, ended_at_ms=800)
    late = stabilizer.update("迟到结果", language="zh", is_final=False)

    assert [first.revision, second.revision, final.revision] == [0, 1, 2]
    assert duplicate is None
    assert final.source_text == "你好"
    assert final.ended_at_ms == 800
    assert late is None


def test_final_normalizes_unicode_without_rewriting_internal_punctuation() -> None:
    stabilizer = RecognitionStabilizer("segment-1", started_at_ms=0)
    update = stabilizer.update("  Ａ，  B！ ", language="en", is_final=True, ended_at_ms=20)
    assert update.source_text == "A,  B!"


def test_flush_finalizes_existing_partial_but_not_empty_segment() -> None:
    empty = RecognitionStabilizer("empty", started_at_ms=0)
    assert empty.flush(ended_at_ms=100) is None

    stabilizer = RecognitionStabilizer("segment-1", started_at_ms=0)
    stabilizer.update("hello", language="en", is_final=False)
    final = stabilizer.flush(ended_at_ms=500)
    assert final is not None
    assert final.is_final is True
    assert final.source_text == "hello."


def test_deduplicator_rejects_overlapping_duplicate_final_segments() -> None:
    deduplicator = FinalTranscriptDeduplicator()
    first = RecognitionStabilizer("segment-1", 0).update(
        "hello world", language="en", is_final=True, ended_at_ms=1000
    )
    duplicate = RecognitionStabilizer("segment-2", 900).update(
        "Hello world!", language="en", is_final=True, ended_at_ms=1500
    )
    distinct = RecognitionStabilizer("segment-3", 1600).update(
        "next sentence", language="en", is_final=True, ended_at_ms=2200
    )

    assert deduplicator.accept(first) is True
    assert deduplicator.accept(duplicate) is False
    assert deduplicator.accept(distinct) is True
