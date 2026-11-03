"""Owns realtime tasks for the production backend."""

import asyncio
from contextlib import suppress
from pathlib import Path
from uuid import uuid4

from ..audio.recorder import Mp3Recorder
from .asr_pipeline import AsrPipeline, CloudAsrPipeline
from .contracts import ErrorPayload, SessionCommand
from .desktop_capture import start_desktop_capture
from .gateway.adapters import MIMO_TTS_MODEL
from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.gateway import MatchRequest, ModelGateway
from .latency import LatencyCapture
from .playback_queue import PlaybackQueue
from .s2s_audio import S2SAudioOutput
from .s2s_pipeline import S2SPipeline
from .s2s_provider import S2SProtocolError
from .translation_pipeline import TranslationScheduler
from .tts_pipeline import TtsPipeline


class RealtimePipelines:
    def __init__(self, gateway, ingestion, *, playback_db=":memory:"):
        self.gateway = gateway
        self.ingestion = ingestion
        self.active = {}
        self.captures = {}
        self.provider_connections = {}
        self.playbacks = {}
        self.playback_db = playback_db
        self.reconnected = set()
        self.recorders = {}
        self.translation_contexts = {}

    @staticmethod
    def _latency_enabled(session):
        return session.owner == "quick_interpret" and session.config.latency_detection

    async def _start_capture(self, session, latency_detection):
        observe = None
        if latency_detection and "audio" in session.config.required_outputs:
            observe = LatencyCapture(session._log.submit).observe
        return await start_desktop_capture(
            session.config.input, self.ingestion(session), session.epoch, observe=observe,
        )

    def _prepare_recording(self, session):
        path = session.config.recording_path
        if path and session.session_id not in self.recorders:
            target = Path(path)
            if not target.is_absolute() or target.name != "audio.mp3":
                raise ValueError("Invalid meeting audio destination")
            self.recorders[session.session_id] = Mp3Recorder(target, 16000, 1, exclusive=True)

    async def _close_recording(self, session_id):
        recorder = self.recorders.pop(session_id, None)
        if recorder is not None:
            await asyncio.to_thread(recorder.close)

    def effect(self, session, command):
        return asyncio.create_task(self._command(session, command.type))

    async def _command(self, session, command):
        key = session.session_id
        if command in ("stop", "pause", "reset_stream", "switch_pipeline"):
            playback = self.playbacks.get(key)
            retain_playback = command == "pause" and isinstance(playback, TtsPipeline)
            if playback is not None:
                session.playback_generation = playback.pause() if retain_playback else playback.stop()
                session._log.submit("playback_state", {
                    "state": "interrupted" if command == "pause" else "cancelled",
                    "playback_generation": session.playback_generation,
                })
            if command == "pause":
                capture = self.captures.get(key)
                if capture is not None:
                    await capture.stop()
                self.ingestion(session).seal_input()
                task = self.active.get(key)
                if task is not None:
                    await task
            else:
                await self._stop(key)
                self.translation_contexts.pop(key, None)
            if playback is not None and not retain_playback:
                self.playbacks.pop(key, None)
                await playback.close()
            self.ingestion(session).reset()
        if command == "stop":
            await self._close_recording(key)
            self.provider_connections.pop(key, None)
            self.reconnected.discard(key)
            return "closed"
        if command == "pause":
            return "failed" if session.state == "failed" else "paused"
        if command in ("reset_stream", "switch_pipeline") and session.state == "paused":
            return "paused"
        if command in ("start", "resume", "reset_stream", "switch_pipeline"):
            config = session.config.pipeline
            if config.kind == "s2s":
                return await self._start_s2s(session)
            pending_source = []
            latency_detection = self._latency_enabled(session)

            def emit(event, payload):
                session._log.submit(event, payload)
                if config.translation_model and event in ("source_text", "source_committed"):
                    pending_source.append((event, payload))

            pipeline = None
            provider_context = None
            mt = None
            playback = self.playbacks.get(key)
            speech_language = session.config.speech_target_language

            def emit_translation(event, payload):
                session._log.submit(event, payload)
                if playback is not None and event == "translation_committed" and payload["target_language"] == speech_language:
                    playback.translation_committed(payload)

            connection = self.provider_connections.get(key, {})
            if config.translation_model:
                mt = TranslationScheduler(
                    self.gateway, session_id=str(key), pipeline_id=str(session.pipeline_id),
                    epoch=session.epoch, model_id=config.translation_model,
                    target_languages=session.config.target_languages, event_sink=emit_translation,
                    provider_options=connection.get("mt_options"),
                    fallback_model_id=config.fallback_translation_model,
                    fallback_provider_options=connection.get("fallback_mt_options"),
                    latency_detection=latency_detection,
                )
            try:
                if config.asr_model in ("aliyun", "minimax"):
                    request = MatchRequest(Operation.TRANSCRIBE, model_id=config.asr_model, source_language=session.config.source_language)
                    context = self.gateway.cloud_asr_session(request, connection.get("asr_options", {}))
                    provider_config = await context.__aenter__()
                    provider_context = context
                    provider_config = provider_config.model_copy(update={
                        "max_segment_ms": session.config.max_segment_ms, "silence_end_ms": session.config.silence_end_ms,
                    })
                    pipeline = CloudAsrPipeline(session, provider_config, emit, latency_detection=latency_detection)
                else:
                    pipeline = AsrPipeline(session, self.gateway, emit, latency_detection=latency_detection)
                await pipeline.prepare()
                if config.translation_model and isinstance(self.gateway, ModelGateway):
                    for target in session.config.target_languages:
                        request = MatchRequest(Operation.TRANSLATE, model_id=config.translation_model, target_language=target)
                        if not self.gateway.match(request).entry.configuration.is_cloud:
                            instance, lease, _, _ = await self.gateway.acquire(request)
                            await self.gateway.release(instance, lease)
                self._prepare_recording(session)
                if config.tts_model and playback is None:
                    if not config.translation_model or speech_language not in session.config.target_languages:
                        raise ValueError("Speech output requires a matching translation target")
                    self.gateway.match(MatchRequest(
                        Operation.SYNTHESIZE, model_id=config.tts_model,
                        target_language=speech_language, required_outputs=["speech"],
                    ))
                    tts_key = connection.get("tts_api_key", "")
                    if config.tts_model == MIMO_TTS_MODEL and not tts_key:
                        raise ValueError("Speech provider credential is missing")
                    playback = TtsPipeline(
                        self.gateway, PlaybackQueue(
                            self.playback_db, f"{session.pipeline_id}:{session.epoch}",
                            initial_generation=session.playback_generation,
                        ),
                        pipeline_id=str(session.pipeline_id), epoch=session.epoch,
                        model_id=config.tts_model, voice=config.tts_voice, event_sink=session._log.submit,
                        provider_options={"api_key": tts_key} if tts_key else None,
                        latency_detection=latency_detection,
                    )
                    self.playbacks[key] = playback
                capture = await self._start_capture(session, latency_detection)
            except (GatewayError, OSError, RuntimeError, ImportError, ValueError) as error:
                try:
                    if pipeline is not None:
                        await pipeline.close()
                finally:
                    if provider_context is not None:
                        await provider_context.__aexit__(None, None, None)
                if mt is not None:
                    await mt.close()
                await self._close_recording(key)
                if playback is not None:
                    self.playbacks.pop(key, None)
                    await playback.close()
                self._report(session, error)
                session._log.submit("error", {"error": session.last_error.model_dump(mode="json")})
                return "failed"
            if capture is not None:
                self.captures[key] = capture
            if playback is not None and command == "resume":
                playback.epoch = session.epoch
                playback.resume()
            self.active[key] = asyncio.create_task(self._run(session, pipeline, capture, mt, pending_source, provider_context))
            return "running"
        return session.state

    async def _start_s2s(self, session):
        config = session.config
        key = session.session_id
        latency_detection = self._latency_enabled(session)
        connection = self.provider_connections.get(key)
        outputs = set(config.required_outputs)
        if not connection or connection.get("provider") != "aliyun" or len(config.target_languages) != 1:
            session.last_error = ErrorPayload(
                code="INVALID_CONFIG", stage="pipeline", message_key="pipeline.s2sConfigurationUnavailable",
            )
            session._log.submit("error", {"error": session.last_error.model_dump(mode="json")})
            return "failed"
        model = config.pipeline.s2s_model
        target = config.target_languages[0]
        if "audio" in outputs and target != config.speech_target_language:
            session.last_error = ErrorPayload(
                code="INVALID_CONFIG", stage="pipeline", message_key="pipeline.s2sSpeechLanguageMismatch",
            )
            session._log.submit("error", {"error": session.last_error.model_dump(mode="json")})
            return "failed"
        required = ["source_text"] if "source_text" in outputs else []
        provider_outputs = ["target", "source"] if "source_text" in outputs else ["target"]
        if "audio" in outputs:
            required.append("speech")
            provider_outputs.append("audio")
        request = MatchRequest(
            operation=Operation.S2S_SESSION, model_id=model, source_language=config.source_language,
            target_language=target, required_outputs=required,
        )
        ctx = CallContext(Operation.S2S_SESSION, str(key), session_id=key,
                          pipeline_id=str(session.pipeline_id), epoch=session.epoch)
        provider_context = self.gateway.s2s_session(ctx, request=request, config={
            **connection, "source_language": config.source_language, "target_language": target,
            "outputs": provider_outputs,
        })
        try:
            provider = await provider_context.__aenter__()
            try:
                self._prepare_recording(session)
                capture = await self._start_capture(session, latency_detection)
            except BaseException:
                await provider_context.__aexit__(None, None, None)
                raise
        except (GatewayError, OSError, RuntimeError, ValueError) as error:
            await self._close_recording(key)
            self._report(session, error)
            session._log.submit("error", {"error": session.last_error.model_dump(mode="json")})
            return "failed"
        playback = S2SAudioOutput(
            session, event_sink=session._log.submit, latency_detection=latency_detection,
        ) if "audio" in outputs else None
        if playback is not None:
            self.playbacks[key] = playback

        pipeline = S2SPipeline(
            session, provider, session._log.submit,
            on_audio=playback.accept if playback is not None else None,
            latency_detection=latency_detection,
        )
        if capture is not None:
            self.captures[key] = capture
        self.active[key] = asyncio.create_task(self._run(session, pipeline, capture, None, [], provider_context))
        return "running"

    async def _run(self, session, pipeline, capture, mt, pending_source, provider_context=None):
        reconnect = False
        try:
            while session.state in ("preparing", "recovering"):
                await asyncio.sleep(0)
            if capture is None:
                await self._consume(session, pipeline, mt, pending_source)
            else:
                async with asyncio.TaskGroup() as tasks:
                    tasks.create_task(capture.pump())
                    tasks.create_task(self._consume(session, pipeline, mt, pending_source))
        except Exception as error:
            playback = self.playbacks.get(session.session_id)
            if playback is not None:
                session.playback_generation = playback.stop()
                session._log.submit("playback_state", {
                    "state": "cancelled", "playback_generation": session.playback_generation,
                })
            self._report(session, error)
            reconnect = (
                provider_context is not None and session.state == "running"
                and session.last_error.code == "PROVIDER_DISCONNECTED"
                and session.session_id not in self.reconnected
            )
            if reconnect:
                self.reconnected.add(session.session_id)
                self.manager.recover_session(session.session_id, session.last_error)
            else:
                self.manager.fail_session(session.session_id, session.last_error)
        finally:
            try:
                await pipeline.close()
            finally:
                if provider_context is not None:
                    await provider_context.__aexit__(None, None, None)
            if mt is not None:
                await mt.close()
            if capture is not None:
                await capture.stop()
                self.captures.pop(session.session_id, None)
            if self.active.get(session.session_id) is asyncio.current_task():
                self.active.pop(session.session_id)
            if reconnect or session.state in ("closed", "failed"):
                if not reconnect:
                    self.provider_connections.pop(session.session_id, None)
                    self.reconnected.discard(session.session_id)
                    self.translation_contexts.pop(session.session_id, None)
                    await self._close_recording(session.session_id)
                playback = self.playbacks.pop(session.session_id, None)
                if playback is not None:
                    await playback.close()
        if reconnect and session.state == "recovering":
            ack = await self.manager.command(session.session_id, SessionCommand(
                command_id=str(uuid4()), type="reset_stream",
            ))
            if ack.result_state == "failed":
                self.provider_connections.pop(session.session_id, None)
                self.reconnected.discard(session.session_id)

    async def _consume(self, session, pipeline, mt, pending_source):
        ingestion = self.ingestion(session)
        context = self.translation_contexts.setdefault(session.session_id, []) if mt is not None else []

        async def dispatch_source():
            batch = pending_source[:]
            pending_source.clear()
            for event, payload in batch:
                if event == "source_committed":
                    await mt.source_final(payload, {"history": list(context)})
                    if payload["text"]:
                        context.append(payload["text"])
                        del context[:-3]
                elif session.config.translation_preview and payload["text_state"] != "committed":
                    await mt.source_snapshot(payload, {"history": list(context)})

        while True:
            if isinstance(pipeline, (AsrPipeline, CloudAsrPipeline)):
                pipeline.check()
            elif isinstance(pipeline, S2SPipeline) and pipeline.receiver.done():
                await pipeline.receiver
                raise S2SProtocolError("provider_finished_unexpectedly")
            if mt is not None and pending_source:
                await dispatch_source()
            ingestion.consume_vad_windows()
            frames = ingestion.consume_frames(1)
            if frames:
                for frame, start in frames:
                    recorder = self.recorders.get(session.session_id)
                    if recorder is not None:
                        recorder.write_capture(frame.samples.astype("<f4", copy=False).tobytes(), "float32")
                    if isinstance(pipeline, AsrPipeline):
                        await pipeline.accept(frame, start, allow_preview=ingestion.buffered_ms < ingestion.buffer_warn_ms)
                    else:
                        await pipeline.accept(frame, start)
                await asyncio.sleep(0)
            elif ingestion.input_finished:
                pausing = session.state == "pausing"
                await pipeline.finish()
                if not pausing:
                    self.manager.drain_session(session.session_id)
                if mt is not None:
                    await dispatch_source()
                    await mt.wait_idle()
                if pausing:
                    return
                playback = self.playbacks.get(session.session_id)
                if playback is not None:
                    await playback.wait_idle()
                await self._close_recording(session.session_id)
                self.manager.complete_drain(session.session_id)
                return
            else:
                await asyncio.sleep(0.02)

    @staticmethod
    def _report(session, error):
        from ..recognition.aliyun import CloudRecognitionError
        from .capture_process_loopback import ProcessLoopbackError
        from .process_sources import ProcessSourceError

        if isinstance(error, BaseExceptionGroup):
            error = error.exceptions[0]
        if isinstance(error, ProcessSourceError) or (isinstance(error, ProcessLoopbackError) and session.config.input.kind == "process_audio"):
            reason = error.reason if isinstance(error, ProcessSourceError) else error.stage
            session.last_error = ErrorPayload(
                code="AUDIO_SOURCE_UNAVAILABLE", stage="capture", message_key=f"audio.{reason}",
                safe_details={"reason": reason},
            )
            return
        if isinstance(error, S2SProtocolError):
            session.last_error = ErrorPayload(
                code="PROVIDER_DISCONNECTED", stage="s2s", message_key="pipeline.s2sConnectionLost",
                retryable=True, safe_details={"provider_error": str(error)[:128]},
            )
            return
        if isinstance(error, CloudRecognitionError):
            retryable = error.reason in ("recognitionNetworkError", "recognitionTimeout")
            session.last_error = ErrorPayload(
                code="PROVIDER_DISCONNECTED" if retryable else "MODEL_NOT_READY",
                stage="asr", message_key=f"pipeline.{error.reason}", retryable=retryable,
                safe_details={"provider_error": error.reason},
            )
            return
        if isinstance(error, GatewayError) and error.stage == "speaker":
            session.last_error = ErrorPayload(
                code="MODEL_NOT_READY", stage="speaker", message_key="pipeline.speakerInstallationInvalid",
            )
            return
        if isinstance(error, GatewayError) and error.stage == "asr" and error.code == GatewayErrorCode.RESOURCE_EXHAUSTED:
            session.last_error = ErrorPayload(
                code="RESOURCE_EXHAUSTED", stage="asr", scope="session", fatal=True,
                message_key="pipeline.finalRecognitionQueueFull", correlation_id=error.correlation_id,
            )
            return
        session.last_error = ErrorPayload(
            code="INTERNAL_ERROR", stage="pipeline", message_key="pipeline.recognitionFailed",
            safe_details={"exception": type(error).__name__},
        )

    async def _stop(self, key):
        task = self.active.pop(key, None)
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def shutdown(self):
        for key in list(self.active):
            await self._stop(key)
        for playback in self.playbacks.values():
            await playback.close()
        self.playbacks.clear()
        for key in list(self.recorders):
            await self._close_recording(key)
        self.provider_connections.clear()
        self.translation_contexts.clear()
