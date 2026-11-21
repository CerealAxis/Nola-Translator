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


def test_diagnostics_keep_suppressed_original_causes_and_large_messages(monkeypatch, capsys):
    monkeypatch.setenv("NOLA_TRANSLATOR_RUN_LOG_STDERR", "1")
    original = "原始异常" * 20000
    try:
        try:
            raise OSError(-9999, original + " api_key=private-value")
        except OSError:
            raise RuntimeError("friendly failure") from None
    except RuntimeError as error:
        debug_log.log_exception("backend", "request.failed", error, correlationId="request-1")
    line = capsys.readouterr().err
    data = json.loads(line.removeprefix("NOLA_DIAGNOSTIC "))["data"]
    assert data["correlationId"] == "request-1"
    assert original in data["cause"]["message"]
    assert data["cause"]["errorCode"] == -9999
    assert "private-value" not in line


def test_exception_fields_keep_http_response_and_grouped_causes():
    import httpx
    request = httpx.Request("POST", "https://example.test")
    error = httpx.HTTPStatusError("provider rejected", request=request,
                                response=httpx.Response(429, text='{"error":"quota exceeded"}', request=request))
    fields = debug_log.exception_fields(ExceptionGroup("multiple", [error, ValueError("native error")]))
    assert fields["exceptions"][0]["httpStatus"] == 429
    assert "quota exceeded" in fields["exceptions"][0]["responseBody"]
    assert fields["exceptions"][1]["message"] == "native error"


def test_gateway_diagnostic_codes_match_the_public_failure(monkeypatch, capsys):
    from nola_translator_engine.backend.gateway import GatewayError, GatewayErrorCode
    monkeypatch.setenv("NOLA_TRANSLATOR_RUN_LOG_STDERR", "1")
    error = GatewayError(GatewayErrorCode.TIMEOUT, stage="mt", message="native timeout", correlation_id="request-1")
    debug_log.log_exception("backend", "translation.failed", error)
    fields = json.loads(capsys.readouterr().err.removeprefix("NOLA_DIAGNOSTIC "))["data"]
    assert fields["code"] == error.to_payload()["code"] == "TIMEOUT"
    assert fields["stage"] == "mt"
    assert fields["correlationId"] == error.correlation_id
    assert fields["retryable"] == error.retryable
