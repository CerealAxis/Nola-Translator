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


def test_exception_fields_preserve_native_error_codes_text_and_traceback():
    try:
        raise OSError(-9999, "原始 WASAPI 错误")
    except OSError as error:
        fields = debug_log.exception_fields(error)
    assert fields["errorCode"] == -9999
    assert "原始 WASAPI 错误" in fields["message"]
    assert "test_debug_log.py" in fields["stackTrace"]


def test_exception_fields_identify_missing_dependency():
    error = ModuleNotFoundError("No module named 'transformers'", name="transformers")
    assert debug_log.exception_fields(error)["missingModule"] == "transformers"
