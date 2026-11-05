import asyncio
import base64
import json
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest

from nola_translator_engine.backend.app import create_app
from nola_translator_engine.backend.gateway.adapters import MIMO_TTS_MODEL
from nola_translator_engine.backend.gateway.bootstrap import build_default_gateway
from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode
from nola_translator_engine.backend.gateway.operations import AsrObservation, SynthesisChunk, SynthesisResult, TranslationResult


def translation():
    return {"id": str(uuid4()), "model": "local-mt", "kind": "mt", "text": "Hello", "source": "en", "target": "zh"}


def test_realtime_gateway_transcribes_client_pcm_and_keeps_manual_commit_order():
    pcm = b"\x10\x00" * 320
    calls = []

    class Gateway:
        def match(self, request):
            assert request.model_id == "local-asr" and request.source_language == "en"

        async def transcribe(self, context, *, audio, language, request):
            self.match(request)
            assert context.session_id is not None and audio == pcm and language == "en"
            calls.append(audio)
            return AsrObservation("hello", "en")

        async def shutdown(self):
            pass

    with TestClient(create_app(control_token="local-control", gateway=Gateway())) as client:
        route = "/api/v2/gateway/asr-stream?model=local-asr"
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(route):
                pass
        with client.websocket_connect(route, headers={"Authorization": "Bearer local-control"}) as ws:
            ws.send_json({"op": "session.open", "manual": True, "language": "en"})
            assert ws.receive_json() == {"ack": "session.open"}
            ws.send_json({"op": "session.append", "audio": base64.b64encode(pcm).decode()})
            assert ws.receive_json() == {"ack": "session.append"}
            assert not calls
            ws.send_json({"op": "session.commit"})
            event = ws.receive_json()["event"]
            assert event["type"] == "conversation.item.input_audio_transcription.completed"
            assert event["transcript"] == "hello"
            assert ws.receive_json() == {"ack": "session.commit"}
            ws.send_json({"op": "session.finish"})
            assert ws.receive_json() == {"ack": "session.finish"}
        assert calls == [pcm]


def test_realtime_cloud_gateway_holds_provider_lease_and_keeps_credentials_private(monkeypatch):
    from nola_translator_engine.gateway_worker import GatewayWorker
    from nola_translator_engine.recognition.base import RecognitionUpdate

    class Recognizer:
        async def start(self):
            pass

        async def accept(self, frame):
            assert frame.samples.size == 320
            return [RecognitionUpdate("cloud", 1, 0, None, "hello", "en", False)]

        async def flush(self, ended):
            return [RecognitionUpdate("cloud", 2, 0, ended, "hello", "en", True)]

        async def close(self):
            pass

    def connect(worker, config):
        assert config.recognitionOptions.apiKey == "private-cloud-key"
        assert config.recognitionOptions.model == "qwen3-asr-flash-realtime"
        return Recognizer()

    monkeypatch.setattr(GatewayWorker, "remote_recognizer", connect)
    with TestClient(create_app(control_token="local-control", gateway=build_default_gateway())) as client:
        headers = {"Authorization": "Bearer local-control", "x-nola-asr-key": "private-cloud-key",
                   "x-nola-asr-model": "qwen3-asr-flash-realtime"}
        with client.websocket_connect("/api/v2/gateway/asr-stream?model=aliyun", headers=headers) as ws:
            ws.send_json({"op": "session.open", "language": "en"})
            assert ws.receive_json() == {"ack": "session.open"}
            ws.send_json({"op": "session.append", "audio": base64.b64encode(bytes(640)).decode()})
            assert ws.receive_json()["event"]["type"].endswith(".text")
            assert ws.receive_json() == {"ack": "session.append"}
            ws.send_json({"op": "session.finish"})
            assert ws.receive_json()["event"]["type"].endswith(".completed")
            assert ws.receive_json() == {"ack": "session.finish"}
        instances = client.get("/api/v2/gateway/instances", headers=headers)
        assert instances.status_code == 200 and "private-cloud-key" not in instances.text


def test_direct_mimo_inference_forwards_the_private_header_to_tts_only():
    class Gateway:
        async def synthesize(self, context, *, text, voice, request):
            expected = {"api_key": "test-mimo-key"} if request.model_id == MIMO_TTS_MODEL else {}
            assert context.provider_options == expected
            return SynthesisResult([SynthesisChunk(b"\x01\x00", 24000, terminal=True)])

        async def shutdown(self):
            pass

    with TestClient(create_app(control_token="local-control", gateway=Gateway())) as client:
        headers = {"Authorization": "Bearer local-control", "x-nola-tts-key": "test-mimo-key"}
        for model in (MIMO_TTS_MODEL, "local-tts"):
            response = client.post("/api/v2/gateway/infer", headers=headers, json={
                "id": str(uuid4()), "model": model, "kind": "tts", "text": "Hello",
            })
            assert response.status_code == 200
            assert response.json()["audio"].startswith("data:audio/wav;base64,")


def test_direct_workbench_inference_is_private_and_rejects_invalid_payload_without_echo():
    class Gateway:
        async def translate(self, context, *, text, source, target, request):
            if request.model_id == "microsoft":
                assert context.provider_options == {"api_key": "cloud-token", "region": "eastasia"}
            else:
                assert request.model_id == "local-mt"
                assert context.provider_options == {}
            return TranslationResult("你好", source, target)

        async def shutdown(self):
            pass

    auth = {"Authorization": "Bearer local-control"}
    with TestClient(create_app(control_token="local-control", gateway=Gateway())) as client:
        assert client.post("/api/v2/gateway/infer", json=translation()).status_code == 401
        response = client.post("/api/v2/gateway/infer", headers=auth, json=translation())
        assert response.json() == {"text": "你好"}
        headers = {**auth, "x-nola-provider-key": "cloud-token", "x-nola-provider-region": "eastasia"}
        assert client.post("/api/v2/gateway/infer", headers=headers, json={**translation(), "model": "microsoft"}).json() == {"text": "你好"}
        assert client.post("/api/v2/gateway/infer", headers=headers, json=translation()).json() == {"text": "你好"}
        malformed = client.post("/api/v2/gateway/infer", headers=auth, json={**translation(), "api_key": "opaque-secret"})
        assert malformed.status_code == 422 and "opaque-secret" not in malformed.text
        malformed_wav = client.post("/api/v2/gateway/infer", headers=auth, json={
            "id": str(uuid4()), "model": "local-asr", "kind": "asr", "batch": True,
            "audio": "data:audio/wav;base64,not-a-wav",
        })
        assert malformed_wav.status_code == 400


@pytest.mark.parametrize(("cause", "status", "code"), [
    (GatewayErrorCode.MODEL_NOT_INSTALLED, 404, "MODEL_NOT_READY"),
    (GatewayErrorCode.RESOURCE_EXHAUSTED, 429, "RESOURCE_EXHAUSTED"),
    (GatewayErrorCode.WORKER_OOM, 503, "RESOURCE_EXHAUSTED"),
    (GatewayErrorCode.TIMEOUT, 504, "INTERNAL_ERROR"),
])
def test_direct_inference_reports_the_actual_failure(cause, status, code):
    class Gateway:
        async def translate(self, *args, **kwargs):
            raise GatewayError(cause, stage="mt", message="private provider detail")

        async def shutdown(self):
            pass

    with TestClient(create_app(control_token="local-control", gateway=Gateway())) as client:
        response = client.post("/api/v2/gateway/infer", headers={"Authorization": "Bearer local-control"}, json=translation())
        assert response.status_code == status
        error = response.json()["error"]
        assert (error["code"], error["message_key"], error["stage"]) == (code, f"gateway.{cause.value}", "mt")
        assert "private provider detail" not in response.text


def test_gateway_asr_stream_reports_an_unavailable_model_before_closing():
    class Gateway:
        def match(self, request):
            raise GatewayError(GatewayErrorCode.MODEL_NOT_INSTALLED, stage="asr", message="private model path")

        async def shutdown(self):
            pass

    with TestClient(create_app(control_token="local-control", gateway=Gateway())) as client:
        with client.websocket_connect("/api/v2/gateway/asr-stream?model=local-asr",
                                      headers={"Authorization": "Bearer local-control"}) as socket:
            socket.send_json({"op": "session.open", "language": "en"})
            frame = socket.receive_json()
            assert frame["status"] == 404
            assert frame["error"]["message_key"] == "gateway.MODEL_NOT_INSTALLED"
            assert "private model path" not in str(frame)


def test_workbench_lease_is_held_until_explicit_release(monkeypatch):
    from nola_translator_engine.backend import direct_language_model

    releases = []

    async def release():
        releases.append(True)

    async def acquire(gateway, model):
        assert model == "qwen-fixture"
        return SimpleNamespace(endpoint="http://127.0.0.1:5000/v1", context_window=4096, release=release)

    async def shutdown():
        pass

    monkeypatch.setattr(direct_language_model, "open_direct_language_model", acquire)
    auth = {"Authorization": "Bearer local-control"}
    body = {"model": "qwen-fixture", "lease_id": str(uuid4())}
    route = "/api/v2/gateway/language-models"
    with TestClient(create_app(control_token="local-control", gateway=SimpleNamespace(shutdown=shutdown))) as client:
        opened = client.post(route, headers=auth, json=body)
        assert opened.status_code == 200 and opened.json()["lease_id"] == body["lease_id"]
        assert client.post(route, headers=auth, json=body).status_code == 409
        assert not releases
        for _ in range(2):
            assert client.delete(route + "/" + body["lease_id"], headers=auth).status_code == 200
        assert releases == [True]


async def test_workbench_http_disconnect_cancels_inflight_inference():
    started = asyncio.Event()
    cancelled = asyncio.Event()

    class Gateway:
        async def translate(self, *args, **kwargs):
            started.set()
            try:
                await asyncio.Future()
            finally:
                cancelled.set()

        async def shutdown(self):
            pass

    app = create_app(control_token="local-control", gateway=Gateway())
    body = json.dumps(translation()).encode()

    async def receive():
        nonlocal body
        if body:
            message, body = body, b""
            return {"type": "http.request", "body": message, "more_body": False}
        await started.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        pass

    async with app.router.lifespan_context(app):
        await asyncio.wait_for(app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
            "scheme": "http", "path": "/api/v2/gateway/infer", "query_string": b"", "root_path": "",
            "headers": [(b"authorization", b"Bearer local-control")],
            "server": ("127.0.0.1", 80), "client": ("127.0.0.1", 9000),
        }, receive, send), 2)
        assert cancelled.is_set()
