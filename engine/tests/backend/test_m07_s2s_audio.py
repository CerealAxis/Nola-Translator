"""Direct S2S PCM forwarding, terminal packets, and playback fencing."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from nola_translator_engine.backend.s2s_audio import S2SAudioOutput
from nola_translator_engine.backend.s2s_provider import S2SObservation


def test_audio_chunks_preserve_offsets_and_emit_one_terminal_packet():
    async def run():
        session = SimpleNamespace(playback_generation=3)
        events = []
        output = S2SAudioOutput(session, lambda name, payload: events.append((name, payload)), latency_detection=True)
        packets = []

        async def sink(packet):
            packets.append(packet)

        assert output.attach("owner", sink)
        await output.accept(S2SObservation("audio", "item", "response", pcm=b"\0\0" * 2,
                                           chunk_seq=0, sample_rate=24000), "translation", "source")
        await output.accept(S2SObservation("audio", "item", "response", pcm=b"\0\0",
                                           chunk_seq=1, sample_rate=24000), "translation")
        await output.accept(S2SObservation("audio", "item", "response", chunk_seq=2,
                                           sample_rate=24000, audio_done=True), "translation")
        assert [(p.chunk_seq, p.sample_start, p.is_last, p.pcm) for p in packets] == [
            (0, 0, False, b"\0\0" * 2), (1, 2, False, b"\0\0"), (2, 3, True, b"")]
        last = packets[-1]
        (name, readiness), = events
        assert name == "latency_observation"
        assert readiness["kind"] == "audio_ready"
        assert readiness["audio_stream_id"] == last.audio_stream_id
        assert readiness["segment_id"] == "source"
        assert output.ack(last.audio_stream_id, "owner", last.claim_id, last.generation, "finished", 3)
        await output.accept(S2SObservation("response", response_id="response", status="completed"), None)
        await asyncio.wait_for(output.wait_idle(), 1)
        assert len(packets) == 3

    asyncio.run(run())


def test_response_failure_fences_and_missing_owner_is_reported():
    async def run():
        events = []
        output = S2SAudioOutput(SimpleNamespace(playback_generation=0),
                                lambda name, payload: events.append((name, payload)))
        await output.accept(S2SObservation("audio", "i", "r", pcm=b"\0\0", sample_rate=24000), None)
        assert events[0][0] == "error"
        assert events[0][1]["error"]["code"] == "PLAYBACK_DEVICE_LOST"
        await output.accept(S2SObservation("response", response_id="r", status="completed"), None)
        assert output.attach("owner", lambda packet: None)
        await output.accept(S2SObservation("audio", "i", "r2", pcm=b"\0\0", sample_rate=24000), "t")
        old_generation = output.generation
        await output.accept(S2SObservation("response", response_id="r2", status="incomplete"), None)
        assert output.generation == old_generation + 1
        assert [name for name, _ in events] == ["error", "playback_state", "error"]
        assert events[-2][1]["state"] == "cancelled"
        assert events[-1][1]["error"]["code"] == "SYNTHESIS_FAILED"
        assert not output.ack("r:i", "owner", "anything", old_generation, "started")
        await output.wait_idle()

    asyncio.run(run())
