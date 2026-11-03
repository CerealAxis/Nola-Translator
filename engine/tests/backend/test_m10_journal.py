from uuid import uuid4

from nola_translator_engine.backend.contracts import CreateSessionRequest
from nola_translator_engine.backend.events import SessionJournal
from nola_translator_engine.backend.sessions import SessionManager


async def test_only_committed_meeting_text_is_kept_in_the_realtime_journal(tmp_path):
    path = tmp_path / "session-journal.jsonl"
    payload = {
        "commit_id": "c1", "segment_id": "s1", "utterance_id": "u1",
        "segment_index": 0, "source_revision": 2, "text": "Saved sentence",
        "language": "en", "boundary_reason": "input_end", "cutoff_sample": 1600,
    }
    for owner in ("quick_interpret", "browser_captions"):
        journal = SessionJournal(path)
        manager = SessionManager("server", journal=journal)
        session = await manager.create(CreateSessionRequest.model_validate({
            "command_id": str(uuid4()), "owner": owner, "config": {
                "pipeline": {"kind": "cascade", "asr_model": "fixture"},
                "input": {"kind": "browser_tab" if owner == "browser_captions" else "microphone"},
            },
        }))
        session._log.submit("source_text", {
            "segment_id": "s1", "utterance_id": "u1", "segment_index": 0,
            "source_revision": 1, "text": "Transient draft", "text_state": "draft",
        })
        session._log.submit("source_committed", payload)
        journal.close()
    entries = SessionJournal(path).read_all()
    assert len(entries) == 1
    assert entries[0].kind == "source_committed"
    assert entries[0].payload["payload"]["text"] == "Saved sentence"
    assert "Transient draft" not in path.read_text(encoding="utf-8")
