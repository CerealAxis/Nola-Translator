import base64
import hashlib
import json
import io
import sqlite3
import wave
from pathlib import Path
from unittest.mock import Mock

import pytest
from pydantic import ValidationError, TypeAdapter

from nola_translator_engine.backend.tts_contracts import SynthesisRequest, TTS_SCHEMA_VERSION, ResolvedVoiceConditioning
from nola_translator_engine.local_call import generate_qwen3_tts
from nola_translator_engine.backend.tts_history import TtsGenerationHistory
from nola_translator_engine.backend.playback_queue import TtsJob
from nola_translator_engine.backend.gateway.operations import SynthesisChunk, SynthesisResult
from nola_translator_engine.backend.tts_contracts import tts_language_matches


def test_shared_renderer_conditioning_fixtures():
    fixtures = json.loads((Path(__file__).parents[2] / "contracts/v2/tts-fixtures.json").read_text(encoding="utf8"))
    assert fixtures["schemaVersion"] == TTS_SCHEMA_VERSION
    adapter = TypeAdapter(ResolvedVoiceConditioning)
    for fixture in fixtures["valid"]:
        adapter.validate_python(fixture)
    for fixture in fixtures["invalid"]:
        with pytest.raises(ValidationError):
            adapter.validate_python(fixture)


def test_request_preserves_language_and_conditioning():
    request = SynthesisRequest(text="你好", language="zh-TW",
        conditioning={"kind": "design", "description": "A low voice", "recipe": {},
            "recipeSchema": "nola-description-v1", "authoringModelBinding": "resource:design"})
    assert request.schema_version == TTS_SCHEMA_VERSION == 1
    assert request.worker_payload()["language"] == "zh-TW"
    assert request.worker_payload()["conditioning"]["description"] == "A low voice"
    with pytest.raises(ValidationError):
        SynthesisRequest(text="hello", language="en", conditioning={"kind": "gallery", "id": "a"})


def test_reference_digest_and_no_local_paths():
    data = b"reference"
    condition = {"kind": "reference-audio", "assetId": "recording", "sha256": hashlib.sha256(data).hexdigest(),
        "recordedLanguage": "en", "purpose": "human-reference"}
    request = SynthesisRequest(text="hola", language="es", conditioning=condition,
        reference_audio="data:audio/wav;base64," + base64.b64encode(data).decode())
    assert request.language == "es"
    for audio in ["C:/secret.wav", "data:audio/wav;base64,bWlzbWF0Y2g="]:
        with pytest.raises(ValidationError):
            SynthesisRequest(text="hola", language="es", conditioning=condition, reference_audio=audio)


def test_qwen_custom_and_design_receive_language_and_real_description():
    model = Mock()
    model.get_supported_speakers.return_value = ["serena"]
    generate_qwen3_tts(model, "custom_voice", "Hallo", "serena", language="de")
    model.generate_custom_voice.assert_called_once_with(text="Hallo", speaker="serena", language="German")
    generate_qwen3_tts(model, "voice_design", "Bonjour", language="fr", conditioning={"kind": "design", "description": "A deep voice"})
    model.generate_voice_design.assert_called_once_with(text="Bonjour", language="French", instruct="A deep voice")
    with pytest.raises(ValueError, match="description"):
        generate_qwen3_tts(model, "voice_design", "hello")
    with pytest.raises(ValueError, match="reference voice"):
        generate_qwen3_tts(model, "base", "hello")


def test_qwen_clone_receives_reference_samples_and_target_language():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        output.writeframes(b"\x01\x00" * 100)
    model = Mock()
    generate_qwen3_tts(model, "base", "Bonjour", language="fr", conditioning={"kind": "reference-audio", "transcript": "Hello"},
        reference_audio="data:audio/wav;base64," + base64.b64encode(buffer.getvalue()).decode())
    args = model.generate_voice_clone.call_args.kwargs
    assert args["language"] == "French" and args["ref_text"] == "Hello"
    assert args["ref_audio"][1] == 24000 and len(args["ref_audio"][0]) == 100


@pytest.mark.parametrize("supported,target,result", [("zh", "zh-CN", True), ("zh-CN", "zh-TW", False),
    ("zh", "zh-HK", False), ("zh", "yue", False), ("yue", "yue-HK", True), ("en", "en-US", True)])
def test_gateway_language_matching(supported, target, result):
    assert tts_language_matches(supported, target) is result


def test_realtime_history_pins_snapshot_and_stores_relative_output(tmp_path):
    database = tmp_path / "voices.sqlite3"
    with sqlite3.connect(database) as db:
        db.executescript("""CREATE TABLE tts_generations(id TEXT PRIMARY KEY, request_json TEXT, state TEXT,
            output_asset_id TEXT, error_code TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE voice_assets(id TEXT PRIMARY KEY, profile_id TEXT, role TEXT, relative_path TEXT,
                mime TEXT, sha256 TEXT, duration_ms REAL, bytes INTEGER, created_at TEXT);""")
    snapshot = {"schemaVersion": 1, "modelBinding": "resource:test", "profileRevision": 2,
        "voiceRef": {"kind": "profile", "profileId": "profile"}, "conditioning": {"kind": "engine-default"}}
    job = TtsJob("commit", "translation", "segment", 1, "fr", 1, "Bonjour", "test",
        synthesis_options={"resolved_request": snapshot})
    history = TtsGenerationHistory(tmp_path)
    history.enqueue(job)
    snapshot["profileRevision"] = 3
    history.complete(job, SynthesisResult([SynthesisChunk(b"\0\0" * 10, 24000, terminal=True)]))
    with sqlite3.connect(database) as db:
        request, state, asset_id = db.execute("SELECT request_json, state, output_asset_id FROM tts_generations").fetchone()
        path, digest = db.execute("SELECT relative_path, sha256 FROM voice_assets WHERE id=?", (asset_id,)).fetchone()
    assert json.loads(request)["profileRevision"] == 2 and json.loads(request)["targetLanguage"] == "fr"
    assert state == "complete" and not Path(path).is_absolute()
    assert hashlib.sha256((tmp_path / "voices" / path).read_bytes()).hexdigest() == digest
    history.close()
