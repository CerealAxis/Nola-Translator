import json

from nola_translator_engine import debug_log


def test_pipeline_diagnostics_forward_to_main_logger(monkeypatch, capsys, tmp_path):
    target = tmp_path / "old-pipeline.jsonl"
    monkeypatch.setenv("NOLA_TRANSLATOR_RUN_LOG_STDERR", "1")
    monkeypatch.setenv("NOLA_TRANSLATOR_DEBUG_LOG", str(target))
    monkeypatch.setattr(debug_log, "_resolved", False)
    monkeypatch.setattr(debug_log, "_path", None)
    debug_log.write("engine", "translation.timing", {"queueMs": 10})
    line = capsys.readouterr().err
    assert line.startswith("NOLA_DIAGNOSTIC ")
    assert json.loads(line.removeprefix("NOLA_DIAGNOSTIC "))["data"] == {"queueMs": 10}
    assert not target.exists()


def test_legacy_file_logging_remains_available(monkeypatch, tmp_path):
    target = tmp_path / "pipeline.jsonl"
    monkeypatch.delenv("NOLA_TRANSLATOR_RUN_LOG_STDERR", raising=False)
    monkeypatch.setenv("NOLA_TRANSLATOR_DEBUG_LOG", str(target))
    monkeypatch.setattr(debug_log, "_resolved", False)
    monkeypatch.setattr(debug_log, "_path", None)
    debug_log.write("engine", "stream.started", {"epoch": 1})
    assert json.loads(target.read_text())["event"] == "stream.started"
