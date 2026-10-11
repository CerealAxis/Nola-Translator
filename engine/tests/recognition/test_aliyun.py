import asyncio
import base64
import json
from unittest.mock import AsyncMock

import numpy as np
import pytest

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.protocol import PrewarmConfig
from nola_translator_engine.recognition.aliyun import AliyunRecognizer, CloudRecognitionError, MODELS, connect_websocket
from nola_translator_engine.recognition import aliyun as aliyun_module


def config(**changes):
    return PrewarmConfig(**dict(dict(recognitionProvider="aliyun", sourceLanguage="auto",
        targetLanguages=["zh"], translationProvider="recognition", recognitionOptions={
            "workspaceId": "workspace", "region": "cn-beijing", "model": MODELS[0], "apiKey": "secret"}), **changes))


class FakeSocket:
    def __init__(self):
        self.events = asyncio.Queue()
        self.events.put_nowait({"type": "session.created"})
        self.sent = []
        self.closed = False
        self.auto_finish = True
        self.handshake_error = None

    async def send(self, message):
        event = json.loads(message)
        self.sent.append(event)
        if event["type"] == "session.update":
            self.events.put_nowait(self.handshake_error or {"type": "session.updated"})
        if event["type"] == "session.finish" and self.auto_finish:
            self.events.put_nowait({"type": "session.finished"})

    async def recv(self):
        return json.dumps(await self.events.get())

    async def close(self):
        self.closed = True

    def event(self, kind, **fields):
        self.events.put_nowait({"type": kind, **fields})


async def wait_for(predicate):
    for _ in range(100):
        if predicate():
            return
        await asyncio.sleep(0)
    assert predicate()


async def connected(settings=None):
    socket = FakeSocket()
    connection = []
    async def connector(url, headers):
        connection.append((url, headers))
        return socket
    recognizer = AliyunRecognizer(settings or config(), connector=connector, finish_timeout=1)
    updates = []
    async def update(item):
        updates.append(item)
    recognizer.on_update = update
    await recognizer.start()
    await recognizer.accept(AudioFrame(np.full(320, 0.5, dtype=np.float32), 1000))
    return recognizer, socket, updates, connection


@pytest.mark.asyncio
@pytest.mark.parametrize("model,asr_kind,first,second", [
    (MODELS[0], "delta", {"delta": "hello "}, {"delta": "world"}),
    (MODELS[1], "text", {"text": "hello", "stash": " wor"}, {"text": "hello ", "stash": "world"}),
])
async def test_versioned_source_updates_and_native_translation_join(model, asr_kind, first, second):
    settings = config(recognitionOptions={"workspaceId": "workspace", "model": model, "apiKey": "secret"})
    recognizer, socket, updates, connection = await connected(settings)
    try:
        assert connection[0][0].startswith("wss://workspace.cn-beijing.maas.aliyuncs.com/")
        assert connection[0][1]["Authorization"] == "Bearer secret"
        session = socket.sent[0]["session"]
        assert session["output_modalities" if model == MODELS[0] else "modalities"] == ["text"]
        audio = base64.b64decode(socket.sent[1]["audio"])
        assert np.frombuffer(audio, dtype="<i2").tolist() == [16384] * 320
        socket.event("input_audio_buffer.speech_started", item_id="source", audio_start_ms=0)
        socket.event(f"conversation.item.input_audio_transcription.{asr_kind}", item_id="source", **first)
        socket.event(f"conversation.item.input_audio_transcription.{asr_kind}", item_id="source", **second)
        socket.event("input_audio_buffer.speech_stopped", item_id="source", audio_end_ms=20)
        socket.event("conversation.item.input_audio_transcription.completed", item_id="source", transcript="hello world", language="en")
        await wait_for(lambda: updates and updates[-1].is_final)
        final_source = updates[-1]
        assert final_source.source_text == "hello world"
        assert final_source.started_at_ms == 1000 and final_source.ended_at_ms == 1020
        assert final_source.native_translation.state == "pending"
        # Translation can arrive before conversation.item.created supplies its source link.
        if model == MODELS[0]:
            socket.event("response.text.delta", item_id="assistant", delta="你好")
            socket.event("response.text.delta", item_id="assistant", delta="世界")
        else:
            socket.event("response.text.text", item_id="assistant", text="你好", stash="世")
            socket.event("response.text.text", item_id="assistant", text="你好", stash="世界")
        socket.event("conversation.item.created", previous_item_id="source", item={"id": "assistant", "role": "assistant"})
        await wait_for(lambda: updates[-1].native_translation.text == "你好世界")
        assert updates[-1].segment_id == final_source.segment_id
        assert updates[-1].is_final
        socket.event("response.done", response={"status": "completed", "output": [{"id": "assistant", "content": [{"type": "text", "text": "你好世界。"}]}]})
        await wait_for(lambda: updates[-1].native_translation.state == "complete")
        assert updates[-1].native_translation.text == "你好世界。"
        assert updates[-1].revision > final_source.revision
    finally:
        await recognizer.close()
    assert socket.closed


@pytest.mark.asyncio
async def test_finish_waits_for_tail_and_finished_before_disconnect():
    recognizer, socket, updates, _ = await connected()
    socket.auto_finish = False
    flushing = asyncio.create_task(recognizer.flush(1020))
    await wait_for(lambda: socket.sent[-1]["type"] == "session.finish")
    assert not flushing.done() and not socket.closed
    socket.event("conversation.item.input_audio_transcription.completed", item_id="tail", transcript="tail", language="en")
    socket.event("conversation.item.created", previous_item_id="tail", item={"id": "translated-tail", "role": "assistant"})
    socket.event("response.text.done", item_id="translated-tail", text="尾句")
    socket.event("response.done", response={"status": "completed", "output": [{"id": "translated-tail", "content": [{"type": "text", "text": "尾句"}]}]})
    socket.event("session.finished")
    await flushing
    assert socket.closed
    assert updates[-1].source_text == "tail" and updates[-1].native_translation.state == "complete"
    await recognizer.close()


@pytest.mark.asyncio
async def test_handshake_error_and_async_error_are_sanitized():
    socket = FakeSocket()
    socket.handshake_error = {"type": "error", "error": {"code": "invalid_api_key", "message": "secret private transcript"}}
    async def connector(url, headers):
        return socket
    recognizer = AliyunRecognizer(config(), connector=connector)
    with pytest.raises(CloudRecognitionError, match="recognitionUnauthorized") as failure:
        await recognizer.start()
    assert "secret" not in str(failure.value) and socket.closed
    assert not any(item["type"] == "input_audio_buffer.append" for item in socket.sent)

    recognizer, socket, _, _ = await connected()
    errors = []
    recognizer.on_error = errors.append
    socket.event("error", error={"code": "rate_limit", "message": "secret private transcript"})
    await wait_for(lambda: errors)
    await wait_for(lambda: socket.closed)
    assert errors[0].reason == "recognitionRateLimited"
    with pytest.raises(CloudRecognitionError, match="recognitionRateLimited"):
        await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 1020))
    await recognizer.close()


@pytest.mark.asyncio
async def test_cancel_finish_closes_promptly_and_drops_receiver():
    recognizer, socket, updates, _ = await connected()
    socket.auto_finish = False
    flushing = asyncio.create_task(recognizer.flush(1020))
    await wait_for(lambda: socket.sent[-1]["type"] == "session.finish")
    flushing.cancel()
    await asyncio.gather(flushing, return_exceptions=True)
    await asyncio.wait_for(recognizer.close(), 0.2)
    assert socket.closed and recognizer._receiver is None
    socket.event("conversation.item.input_audio_transcription.completed", item_id="old", transcript="stale")
    await asyncio.sleep(0)
    assert not updates


@pytest.mark.asyncio
async def test_timestamp_anchors_preserve_capture_pause_gap():
    recognizer, socket, updates, _ = await connected(config(translationProvider="mymemory"))
    await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 3000))
    socket.event("input_audio_buffer.speech_started", item_id="later", audio_start_ms=20)
    socket.event("input_audio_buffer.speech_stopped", item_id="later", audio_end_ms=40)
    socket.event("conversation.item.input_audio_transcription.completed", item_id="later", transcript="later", language="nb")
    await wait_for(lambda: updates)
    assert updates[-1].started_at_ms == 3000 and updates[-1].ended_at_ms == 3020
    assert updates[-1].language == "no" and updates[-1].native_translation is None
    await recognizer.close()


@pytest.mark.parametrize("changes", [
    {"sourceLanguage": "en"}, {"targetLanguages": ["tlh"]}, {"targetLanguages": ["zh", "en"]},
    {"recognitionOptions": {"workspaceId": "workspace.example"}},
])
def test_unsupported_configuration_rejected_without_connecting(changes):
    with pytest.raises(ValueError):
        AliyunRecognizer(config(**changes))


def test_aliases_and_unconnected_prewarm_allow_missing_credentials():
    recognizer = AliyunRecognizer(config(sourceLanguage="no", targetLanguages=["tl"],
        recognitionOptions={"workspaceId": "workspace", "model": MODELS[1]}))
    assert recognizer._session_config()["input_audio_transcription"]["language"] == "nb"
    assert recognizer._session_config()["translation"]["language"] == "fil"
    assert recognizer._ws is None
    with pytest.raises(ValueError, match="API key"):
        recognizer.validate_credentials()


def test_external_translation_targets_do_not_restrict_recognition_provider():
    recognizer = AliyunRecognizer(config(targetLanguages=["zh-Hant", "tlh"], translationProvider="mymemory"))
    assert recognizer.target == "en"


def test_disabled_native_translation_uses_discarded_default_target():
    recognizer = AliyunRecognizer(config(targetLanguages=[]))
    assert not recognizer.native_translation and recognizer.target == "en"


@pytest.mark.asyncio
async def test_text_done_is_not_settled_when_response_is_incomplete():
    recognizer, socket, updates, _ = await connected()
    socket.event("conversation.item.input_audio_transcription.completed", item_id="source", transcript="hello", language="en")
    socket.event("conversation.item.created", previous_item_id="source", item={"id": "assistant", "role": "assistant"})
    socket.event("response.text.done", item_id="assistant", text="partial")
    await wait_for(lambda: updates and updates[-1].native_translation.text == "partial")
    assert updates[-1].native_translation.state == "pending"
    socket.event("response.done", response={"status": "incomplete", "output": [{"id": "assistant", "content": [{"type": "text", "text": "partial"}]}]})
    await wait_for(lambda: updates[-1].native_translation.state == "failed")
    assert not any(item.native_translation.state == "complete" for item in updates)
    await recognizer.close()


@pytest.mark.asyncio
async def test_production_websocket_transport_against_local_server():
    from websockets.asyncio.server import serve
    received = []
    async def handler(socket):
        assert socket.request.headers["Authorization"] == "Bearer secret"
        await socket.send(json.dumps({"type": "session.created"}))
        received.append(json.loads(await socket.recv()))
        await socket.send(json.dumps({"type": "session.updated"}))
        received.append(json.loads(await socket.recv()))
        received.append(json.loads(await socket.recv()))
        await socket.send(json.dumps({"type": "session.finished"}))
    async with serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        async def connector(url, headers):
            return await connect_websocket(f"ws://127.0.0.1:{port}", headers)
        recognizer = AliyunRecognizer(config(), connector=connector)
        await recognizer.start()
        await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0))
        await recognizer.flush(20)
        await recognizer.close()
    assert [event["type"] for event in received] == ["session.update", "input_audio_buffer.append", "session.finish"]


@pytest.mark.asyncio
async def test_finish_timeout_marks_native_translation_failed_and_closes():
    recognizer, socket, updates, _ = await connected()
    socket.auto_finish = False
    recognizer.finish_timeout = 0.01
    socket.event("conversation.item.input_audio_transcription.completed", item_id="source", transcript="hello", language="en")
    await wait_for(lambda: updates)
    with pytest.raises(CloudRecognitionError, match="recognitionTimeout"):
        await recognizer.flush(1020)
    assert socket.closed and updates[-1].native_translation.state == "failed"


@pytest.mark.asyncio
@pytest.mark.parametrize("status,association", [("failed", "output_item"), ("incomplete", "text")])
async def test_empty_terminal_response_settles_only_its_linked_native_translation(status, association):
    recognizer, socket, updates, _ = await connected()
    socket.event("conversation.item.input_audio_transcription.completed", item_id="source", transcript="hello", language="en")
    socket.event("conversation.item.created", previous_item_id="source", item={"id": "assistant", "role": "assistant"})
    socket.event("conversation.item.input_audio_transcription.completed", item_id="other", transcript="other", language="en")
    socket.event("conversation.item.created", previous_item_id="other", item={"id": "other-assistant", "role": "assistant"})
    if association == "output_item":
        socket.event("response.output_item.added", response_id="response", item={"id": "assistant", "role": "assistant"})
    else:
        socket.event("response.text.text", response_id="response", item_id="assistant", text="draft", stash="")
    socket.event("response.done", response={"id": "response", "status": status, "output": []})
    await wait_for(lambda: any(item.native_translation.state == "failed" for item in updates))
    assert recognizer._items["source"].translation_state == "failed"
    assert recognizer._items["other"].translation_state == "pending"
    assert not recognizer._responses
    await recognizer.close()


@pytest.mark.asyncio
async def test_response_association_bound_and_close_cleanup():
    recognizer = AliyunRecognizer(config())
    for index in range(128):
        recognizer._associate_response(f"response-{index}", f"assistant-{index}")
    with pytest.raises(CloudRecognitionError, match="recognitionBufferOverflow"):
        recognizer._associate_response("overflow", "assistant")
    await recognizer.close()
    assert not recognizer._responses


@pytest.mark.asyncio
@pytest.mark.parametrize("url,bypass,expected", [
    ("wss://workspace.cn-beijing.maas.aliyuncs.com/path", False, "http://system-secure-proxy:8080"),
    ("ws://127.0.0.1:1234/path", True, None),
])
async def test_websocket_proxy_matches_http_system_proxy_policy(monkeypatch, url, bypass, expected):
    from websockets.asyncio import client
    connect = AsyncMock(return_value=FakeSocket())
    bypass_hosts = []
    def should_bypass(host):
        bypass_hosts.append(host)
        return bypass
    monkeypatch.setattr(client, "connect", connect)
    monkeypatch.setattr(aliyun_module, "proxy_bypass", should_bypass)
    monkeypatch.setattr(aliyun_module, "getproxies", lambda: {"https": "http://system-secure-proxy:8080", "http": "http://system-proxy:8080"})
    await connect_websocket(url, {"Authorization": "Bearer secret"})
    assert connect.await_args.kwargs["proxy"] == expected
    assert bypass_hosts == [url.split("/")[2]]
