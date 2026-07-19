import numpy as np
import pytest

from fluentcaptions_engine.audio.resample import AudioFrame
from fluentcaptions_engine.recognition.sherpa_streaming import (
    DecoderResult,
    SherpaOnnxDecoder,
    SherpaStreamingRecognizer,
)


class FakeDecoder:
    def __init__(self, results: list[DecoderResult]) -> None:
        self.results = iter(results)
        self.reset_count = 0

    def accept(self, _samples: np.ndarray) -> DecoderResult:
        return next(self.results)

    def finish(self) -> DecoderResult:
        return DecoderResult("", False)

    def reset(self) -> None:
        self.reset_count += 1


def frame(timestamp: float) -> AudioFrame:
    return AudioFrame(np.zeros(320, dtype=np.float32), timestamp)


@pytest.mark.asyncio
async def test_streaming_recognizer_emits_partial_revisions_and_one_final() -> None:
    decoder = FakeDecoder(
        [
            DecoderResult("你", False),
            DecoderResult("你好", False),
            DecoderResult("你好世界", True),
        ]
    )
    recognizer = SherpaStreamingRecognizer(decoder, language="zh", partial_interval_ms=100)

    updates = []
    for timestamp in (0, 100, 200):
        updates.extend(await recognizer.accept(frame(timestamp)))

    assert [update.source_text for update in updates] == ["你", "你好", "你好世界"]
    assert [update.revision for update in updates] == [0, 1, 2]
    assert [update.is_final for update in updates] == [False, False, True]
    assert len({update.segment_id for update in updates}) == 1
    assert decoder.reset_count == 1


@pytest.mark.asyncio
async def test_streaming_recognizer_throttles_intermediate_results() -> None:
    decoder = FakeDecoder(
        [DecoderResult("a", False), DecoderResult("ab", False), DecoderResult("abc", False)]
    )
    recognizer = SherpaStreamingRecognizer(decoder, language="en", partial_interval_ms=100)

    updates = []
    for timestamp in (0, 40, 100):
        updates.extend(await recognizer.accept(frame(timestamp)))
    assert [update.source_text for update in updates] == ["a", "abc"]


@pytest.mark.asyncio
async def test_stop_flushes_an_existing_partial() -> None:
    decoder = FakeDecoder([DecoderResult("unfinished", False)])
    recognizer = SherpaStreamingRecognizer(decoder, language="en")
    await recognizer.accept(frame(0))
    updates = await recognizer.flush(ended_at_ms=600)
    assert len(updates) == 1
    assert updates[0].is_final is True
    assert updates[0].source_text == "unfinished"


class FakeOnlineStream:
    def __init__(self) -> None:
        self.accepted = []
        self.finished = False

    def accept_waveform(self, sample_rate: int, samples: np.ndarray) -> None:
        self.accepted.append((sample_rate, samples.copy()))

    def input_finished(self) -> None:
        self.finished = True


class FakeOnlineRecognizer:
    def __init__(self) -> None:
        self.stream = FakeOnlineStream()
        self.decode_count = 0
        self.reset_count = 0

    def create_stream(self) -> FakeOnlineStream:
        return self.stream

    def is_ready(self, _stream: FakeOnlineStream) -> bool:
        return self.decode_count == 0

    def decode_stream(self, _stream: FakeOnlineStream) -> None:
        self.decode_count += 1

    def get_result(self, _stream: FakeOnlineStream):
        return type("Result", (), {"text": "decoded"})()

    def is_endpoint(self, _stream: FakeOnlineStream) -> bool:
        return True

    def reset(self, _stream: FakeOnlineStream) -> None:
        self.reset_count += 1


def test_sherpa_decoder_adapter_feeds_16khz_and_exposes_endpoint() -> None:
    online = FakeOnlineRecognizer()
    decoder = SherpaOnnxDecoder(online)
    samples = np.zeros(320, dtype=np.float32)
    result = decoder.accept(samples)

    assert result == DecoderResult("decoded", True)
    assert online.stream.accepted[0][0] == 16_000
    decoder.reset()
    assert online.reset_count == 1
