"""StreamingRecognizer 单元测试：合成 20 ms 帧 + 真实 VolumeGateSegmenter（快速参数）。"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import numpy as np
import pytest

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.recognition.qwen_runtime import (
    QwenModelUnavailable,
    get_qwen_runtime,
)
from nola_translator_engine.recognition.qwen_streaming import (
    UNFIXED_CHUNK_NUM,
    create_qwen_recognizer,
)
from nola_translator_engine.recognition.streaming import StreamingRecognizer
from nola_translator_engine.recognition.volume_gate import VolumeGateSegmenter

FRAME_SAMPLES = 320
FRAME_MS = 20


def make_frame(index: int, amplitude: float) -> AudioFrame:
    start = index * FRAME_SAMPLES
    t = np.arange(start, start + FRAME_SAMPLES, dtype=np.float64)
    # 500 Hz 在 16 kHz 下每帧恰好 10 个周期，帧内 RMS 恒定。
    samples = (amplitude * np.sin(2.0 * np.pi * t / 32.0)).astype(np.float32)
    return AudioFrame(samples=samples, started_at_ms=float(index * FRAME_MS))


def fast_segmenter(**overrides) -> VolumeGateSegmenter:
    params: dict = dict(pre_roll_ms=20, silence_end_ms=60, min_voiced_ms=40)
    params.update(overrides)
    return VolumeGateSegmenter(**params)


@dataclass
class Call:
    index: int
    sample_count: int
    prefix: str | None
    language: str | None


class FakeRuntime:
    def __init__(self, results=None, delays=None, error=None) -> None:
        self.results = list(results) if results is not None else None
        self.delays = list(delays) if delays is not None else None
        self.error = error
        self.calls: list[Call] = []

    def rollback_text(self, text: str, n_tokens: int = 5) -> str:
        words = text.split()
        if len(words) <= n_tokens:
            return ""
        return " ".join(words[:-n_tokens])

    def transcribe(self, samples, *, prefix=None, language=None):
        index = len(self.calls)
        delay = self.delays[index] if self.delays and index < len(self.delays) else 0.0
        if delay:
            time.sleep(delay)
        self.calls.append(Call(index, int(samples.size), prefix, language))
        if self.error is not None:
            raise self.error
        if self.results is not None:
            return self.results[index] if index < len(self.results) else self.results[-1]
        return (f"transcript {index + 1}", "en")


def make_recognizer(
    runtime,
    *,
    block_ms: int = 100,
    source_language: str | None = None,
    segmenter: VolumeGateSegmenter | None = None,
    run_transcribe=None,
) -> StreamingRecognizer:
    return StreamingRecognizer(
        runtime,
        source_language=source_language,
        segmenter=segmenter if segmenter is not None else fast_segmenter(),
        block_ms=block_ms,
        prefix_builder=lambda text: runtime.rollback_text(text, 5) or None,
        prefix_after_blocks=UNFIXED_CHUNK_NUM,
        run_transcribe=run_transcribe,
    )


async def settle(recognizer: StreamingRecognizer, timeout: float = 5.0) -> None:
    """等待后台 worker 排空（测试辅助）。"""
    deadline = time.monotonic() + timeout
    while not recognizer._idle.is_set():
        assert time.monotonic() < deadline, "worker 未在期限内空闲"
        await asyncio.sleep(0.005)


async def test_multiblock_speech_emits_intermediates_then_single_final() -> None:
    runtime = FakeRuntime()
    rec = make_recognizer(runtime)
    updates = []
    for index in range(30):  # 600 ms 语音 → 6 次分块派发
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(30, 33):  # 60 ms 静音断句
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    final = [u for u in updates if u.is_final]
    intermediate = [u for u in updates if not u.is_final]
    assert len(intermediate) >= 2
    assert len(final) == 1
    assert len({u.segment_id for u in updates}) == 1
    assert [u.revision for u in updates] == list(range(len(updates)))
    assert all(u.ended_at_ms is None for u in intermediate)
    assert final[0].ended_at_ms is not None
    assert final[0].ended_at_ms > final[0].started_at_ms
    assert all(u.language == "en" for u in updates)
    assert runtime.calls


async def test_short_speech_emits_no_intermediate_exactly_one_final() -> None:
    runtime = FakeRuntime()
    rec = make_recognizer(runtime)
    updates = []
    for index in range(2):  # 40 ms 语音 < block_ms
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(2, 5):  # 60 ms 静音断句，断句帧先于分块阈值
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    assert len(runtime.calls) == 1
    assert len(updates) == 1
    assert updates[0].is_final is True
    assert updates[0].revision == 0
    assert updates[0].ended_at_ms is not None


async def test_completed_result_is_delivered_without_another_audio_frame() -> None:
    delivered = []

    async def on_update(update) -> None:
        delivered.append(update)

    rec = make_recognizer(FakeRuntime(), block_ms=40)
    rec.on_update = on_update
    await rec.accept(make_frame(0, 0.5))
    await rec.accept(make_frame(1, 0.5))
    await settle(rec)
    assert len(delivered) == 1
    assert delivered[0].source_text == "transcript 1"
    assert rec._drain() == []
    await rec.close()


async def test_first_two_dispatches_have_no_prefix_then_rollback() -> None:
    results = [
        ("w1 w2 w3 w4 w5 w6 w7", "en"),
        ("x1 x2 x3 x4 x5 x6 x7 x8", "en"),
        ("y1 y2 y3 y4 y5 y6", "en"),
        ("z1 z2 z3 z4 z5 z6 z7", "en"),
    ]
    runtime = FakeRuntime(results=results)
    rec = make_recognizer(runtime)
    for index in range(15):  # 300 ms → 派发 3 次（100/200/300 ms）
        await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(15, 18):
        await rec.accept(make_frame(index, 0.0))
        await settle(rec)

    prefixes = [call.prefix for call in runtime.calls]
    assert len(prefixes) == 4  # 3 次中间 + 1 次最终
    assert prefixes[0] is None
    assert prefixes[1] is None
    assert prefixes[2] == "x1 x2 x3"  # 回退第 2 次结果的末尾 5 个 token
    assert prefixes[3] == "y1"  # final 同样回退


async def test_empty_transcript_emits_nothing() -> None:
    runtime = FakeRuntime(results=[("", None)])
    rec = make_recognizer(runtime)
    updates = []
    for index in range(12):
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(12, 15):
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    assert updates == []
    assert len(runtime.calls) >= 2


async def test_empty_final_carries_last_nonempty_text() -> None:
    runtime = FakeRuntime(results=[("hello there friend", "en"), ("", None)])
    rec = make_recognizer(runtime)
    updates = []
    for index in range(15):
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(15, 18):
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    finals = [u for u in updates if u.is_final]
    intermediate = [u for u in updates if not u.is_final]
    assert intermediate and intermediate[0].source_text == "hello there friend"
    assert len(finals) == 1
    assert finals[0].source_text == "hello there friend"
    assert finals[0].revision == len(updates) - 1


async def test_slow_transcribe_coalesces_and_latest_snapshot_wins() -> None:
    runtime = FakeRuntime(delays=[0.3])
    rec = make_recognizer(runtime)
    updates = []
    for index in range(30):  # 600 ms → 6 次派发，全部挤在首个慢任务期间
        updates += await rec.accept(make_frame(index, 0.5))
        await asyncio.sleep(0)
    await settle(rec)  # 首个中间结果 + 合并后的最新快照
    for index in range(30, 33):
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    # 6 次中间派发 + 1 次最终 → 实际推理只有 3 次（中间合并为最新快照）
    assert len(runtime.calls) == 3
    counts = [call.sample_count for call in runtime.calls]
    assert counts[1] > counts[0]  # 合并后存活的是最新（最长）快照
    assert counts[2] >= counts[1]  # final 覆盖全段
    assert len([u for u in updates if u.is_final]) == 1


async def test_final_drops_pending_intermediate_and_discards_stale_result() -> None:
    runtime = FakeRuntime(delays=[0.2])
    rec = make_recognizer(runtime)
    updates = []
    for index in range(10):  # 200 ms → 派发 2 次，首个任务在飞
        updates += await rec.accept(make_frame(index, 0.5))
        await asyncio.sleep(0)
    for index in range(10, 13):  # 断句：final 入队时丢弃待处理中间任务
        updates += await rec.accept(make_frame(index, 0.0))
    await settle(rec)
    updates += rec._drain()

    # 在飞的中间结果先显示，待处理的中间任务由 final 顶掉。
    assert len(runtime.calls) == 2
    finals = [u for u in updates if u.is_final]
    assert len(finals) == 1
    assert len([u for u in updates if not u.is_final]) == 1
    assert finals[0].revision == 1


async def test_force_split_produces_two_segments_with_distinct_ids() -> None:
    runtime = FakeRuntime()
    rec = make_recognizer(runtime, segmenter=fast_segmenter(max_segment_ms=400))
    updates = []
    for index in range(40):  # 800 ms 连续语音 → 400 ms 强切
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(40, 43):
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    finals = [u for u in updates if u.is_final]
    assert len(finals) == 2
    assert finals[0].segment_id != finals[1].segment_id
    assert finals[1].started_at_ms > finals[0].started_at_ms
    assert finals[0].ended_at_ms == pytest.approx(finals[1].started_at_ms, abs=FRAME_MS)


async def test_flush_mid_speech_returns_final_and_close_cancels_worker() -> None:
    runtime = FakeRuntime()
    rec = make_recognizer(runtime)
    updates = []
    for index in range(10):  # 200 ms 语音，尚无收尾静音
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)

    updates += await rec.flush(200.0)
    final = [u for u in updates if u.is_final]
    assert len(final) == 1
    assert final[0].ended_at_ms == pytest.approx(200.0, abs=1e-6)
    assert updates[-1] is final[0]
    assert len([u for u in updates if not u.is_final]) == 2  # 100/200 ms 两次中间结果

    worker = rec._worker
    assert worker is not None
    await rec.close()
    assert rec._worker is None
    assert worker.cancelled()


async def test_model_unavailable_surfaces_from_accept_and_flush() -> None:
    runtime = FakeRuntime(error=QwenModelUnavailable("model missing"))
    rec = make_recognizer(runtime)
    for index in range(5):  # 100 ms → 派发首个任务，线程内加载失败
        await rec.accept(make_frame(index, 0.5))
    await settle(rec)

    with pytest.raises(QwenModelUnavailable):
        await rec.accept(make_frame(5, 0.0))
    with pytest.raises(QwenModelUnavailable):
        await rec.flush(200.0)
    await rec.close()


async def test_source_language_overrides_language_and_forces_hint() -> None:
    runtime = FakeRuntime(results=[("你好世界", "en")])
    rec = make_recognizer(runtime, source_language="zh")
    updates = []
    for index in range(5):
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    updates += rec._drain()

    assert runtime.calls[0].language == "zh"  # 强制语言提示进入 job
    assert updates and all(u.language == "zh" for u in updates)
    assert updates[0].source_text == "你好世界"


async def test_run_transcribe_injection_receives_job_fields() -> None:
    runtime = FakeRuntime()  # 注入后 runtime 不应被调用
    seen = []

    async def fake_run(job):
        seen.append(job)
        return ("injected", "en")

    rec = make_recognizer(runtime, run_transcribe=fake_run)
    updates = []
    for index in range(5):
        updates += await rec.accept(make_frame(index, 0.5))
        await settle(rec)
    for index in range(5, 8):
        updates += await rec.accept(make_frame(index, 0.0))
        await settle(rec)
    updates += rec._drain()

    assert runtime.calls == []
    assert len(seen) == 2
    intermediate, final = seen
    assert intermediate.is_final is False
    assert intermediate.prefix is None
    assert intermediate.samples.size == 5 * FRAME_SAMPLES
    assert final.is_final is True
    assert final.ended_at_ms is not None
    assert updates[-1].is_final


def test_create_qwen_recognizer_wires_defaults(tmp_path) -> None:
    rec = create_qwen_recognizer(tmp_path / "qwen", source_language="en")

    assert isinstance(rec, StreamingRecognizer)
    assert rec.runtime is get_qwen_runtime(tmp_path / "qwen")
    assert isinstance(rec.segmenter, VolumeGateSegmenter)
    assert rec.block_ms == 2000
    assert rec._forced_language == "en"


def test_06b_realtime_profile_limits_repeated_inference(tmp_path) -> None:
    rec = create_qwen_recognizer(tmp_path / "qwen3-asr-0.6b-hf")

    assert rec.block_ms == 3000
    assert rec.segmenter.max_segment_ms == 6000
