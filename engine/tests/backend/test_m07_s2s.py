import asyncio
import base64
import json
from types import SimpleNamespace

import pytest

from nola_translator_engine.backend.s2s_provider import MODELS, QwenS2SAdapter, S2SProtocolError


class Socket:
    def __init__(self, events):
        self.events = iter(events)
        self.sent = []
        self.closed = False

    async def recv(self):
        return json.dumps(next(self.events))

    async def send(self, message):
        self.sent.append(json.loads(message))

    async def close(self):
        self.closed = True


def event(kind, **fields):
    return {"type": kind, **fields}


def instance(model):
    return SimpleNamespace(definition=SimpleNamespace(model_id=model), configuration=SimpleNamespace(region=None))


@pytest.mark.parametrize("model", MODELS)
def test_live_translate_profiles_normalize_audio_text_and_terminal_status(model):
    async def run():
        delta = model == MODELS[0]
        modality_key = "output_modalities" if delta else "modalities"
        formats = {"audio": {
            "input": {"format": {"type": "pcm", "sample_rate": 16000}},
            "output": {"format": {"type": "pcm", "sample_rate": 24000}},
        }} if delta else {}
        socket = Socket([
            event("session.created", session={"id": "session"}),
            event("session.updated", session={"id": "session", modality_key: ["text", "audio"], **formats}),
            event("input_audio_buffer.speech_started", item_id="source", speaker_id=2, audio_start_ms=3),
            event("input_audio_buffer.speech_stopped", item_id="source", audio_end_ms=20),
            event("conversation.item.input_audio_transcription.completed", item_id="source", transcript="Bonjour"),
            event("response.audio_transcript.delta" if delta else "response.audio_transcript.text",
                  event_id="one", response_id="r", item_id="target", delta="Hel", text="H", stash="el"),
            event("response.audio_transcript.delta" if delta else "response.audio_transcript.text",
                  event_id="one", response_id="r", item_id="target", delta="ignored"),
            event("response.audio_transcript.delta" if delta else "response.audio_transcript.text",
                  response_id="r", item_id="target", delta="lo", text="Hel", stash="lo"),
            event("response.audio.delta", response_id="r", item_id="target", delta="AAA="),
            event("conversation.item.created", item={"id": "target", "role": "assistant"}, previous_item_id="source"),
            event("response.audio_transcript.done", response_id="r", item_id="target", transcript="Hello"),
            event("response.audio.done", response_id="r", item_id="target"),
            event("response.done", response={"id": "r", "status": "completed", "output": [
                {"id": "target", "role": "assistant", "status": "completed", "content": [{"type": "audio", "transcript": "Hello"}]},
            ]}),
            event("response.text.done", response_id="failed", item_id="partial", text="Partial"),
            event("response.done", response={"id": "failed", "status": "incomplete", "output": []}),
            event("session.finished"),
        ])

        async def connector(url, headers):
            assert url == f"wss://workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model={model}"
            assert headers == {"Authorization": "Bearer fake"}
            return socket

        session = await QwenS2SAdapter(connector).open(instance(model), None, config={
            "workspace_id": "workspace", "api_key": "fake", "outputs": ("source", "target", "audio"),
        })
        await session.append_audio(b"\0\0")
        await session.finish()
        observations = [observation async for observation in session.observations()]
        await session.close()

        update, append, finish = socket.sent
        assert update["session"][modality_key] == ["text", "audio"]
        assert ("input_audio_transcription" in update["session"]) is not delta
        assert base64.b64decode(append["audio"]) == b"\0\0"
        assert finish["type"] == "session.finish"
        assert socket.closed
        source = next(item for item in observations if item.kind == "source" and item.final)
        assert (source.text, source.speaker_id, source.started_at_ms) == ("Bonjour", 2, 3)
        assert not source.speech_stopped
        (speech_stopped,) = [item for item in observations if item.speech_stopped]
        assert speech_stopped.item_id == source.item_id and speech_stopped.ended_at_ms == 20
        target = [item for item in observations if item.kind == "target"]
        assert [item.text for item in target] == ["Hel", "Hello", "Hello", "Hello", "Partial", "Partial"]
        assert target[3].final and target[3].source_ids == ("source",)
        assert not target[-1].final and target[-1].status == "incomplete"
        audio = [item for item in observations if item.kind == "audio"]
        assert audio[0].pcm == b"\0\0" and audio[0].sample_rate == 24000
        assert audio[1].audio_done and audio[1].chunk_seq == 1

    asyncio.run(run())


def test_text_only_audio_language_rejected_before_connect():
    async def run():
        async def connector(*args):
            pytest.fail("unexpected connection")

        with pytest.raises(S2SProtocolError, match="output_unsupported"):
            await QwenS2SAdapter(connector).open(instance(MODELS[0]), None, config={
                "target_language": "yue", "outputs": ("target", "audio"),
            })

    asyncio.run(run())
