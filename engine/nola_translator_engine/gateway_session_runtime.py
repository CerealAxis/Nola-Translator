"""Keep capture and subtitle state local while all model ownership stays in the gateway."""

from __future__ import annotations

import os

from .gateway_client import (GATEWAY_TRANSLATION_TIMEOUT_SECONDS, GatewayRecognizer,
                             GatewayTranslationProvider, gateway_status, private_gateway_address)
from .protocol import ModelsPrewarmedEvent, StartSessionCommand
from .recognition.base import ModelUnavailable
from .runtime import EngineRuntime, RemoteRecognitionRuntime
from .translation.scheduler import TranslationScheduler


class GatewaySessionRuntime(EngineRuntime):
    def __init__(self, model_root, emit):
        super().__init__(model_root, emit)
        self.gateway_address = private_gateway_address(os.environ['NOLA_GATEWAY_ADDRESS'])
        self.gateway_key = os.environ['NOLA_GATEWAY_KEY']
        if not self.gateway_key:
            raise ValueError('The private model gateway credential is required')

    async def _import_recognition_dependencies(self, model_id):
        return

    def _validate_model_selection(self, config):
        # Capability selection is validated by the owner; this process cannot load weights.
        return 'nola-asr', []

    async def _check_capabilities(self, config):
        status = await gateway_status(self.gateway_address, self.gateway_key)
        services = status.get('services', {})
        required = ['asr']
        if config.targetLanguages and config.translationProvider != 'recognition':
            required.append('mt')
        for kind in required:
            if services.get(kind, {}).get('state') != 'ready':
                raise ModelUnavailable(f'The {kind.upper()} gateway capability is not ready')
        if (config.targetLanguages and config.translationProvider == 'recognition'
                and not services.get('asr', {}).get('nativeTranslation')):
            raise ModelUnavailable('The ASR gateway does not provide native translation')
        return services

    async def _prewarm(self, command):
        try:
            await self._check_capabilities(command.config)
        except ModelUnavailable:
            return [self._resource_error(command.requestId, 'modelUnavailable')]
        return [ModelsPrewarmedEvent(protocolVersion=1, type='modelsPrewarmed',
            requestId=command.requestId, state='ready', recognitionModelId='nola-asr',
            translationModelId='nola-mt' if command.config.targetLanguages else None,
            device='gateway', runtime='gateway')]

    def _remote_recognizer(self, config):
        recognizer = GatewayRecognizer(self.gateway_address, self.gateway_key, config)
        for provider in (self.translation_provider, self.fallback_translation_provider):
            if isinstance(provider, GatewayTranslationProvider):
                provider.session = recognizer.session
        return recognizer

    def _fresh_recognizer(self):
        assert self.active_config is not None
        return self._remote_recognizer(self.active_config)

    async def _prepare_models(self, command):
        services = await self._check_capabilities(command.config)
        recognizer = self._remote_recognizer(command.config)
        self.active_model_id = 'nola-asr'
        self._active_recognition_runtime = RemoteRecognitionRuntime('gateway', 'nola-asr')
        mt = services.get('mt', {})
        binding = getattr(command.config, 'translationBinding', '') or ''
        self.translation_provider = GatewayTranslationProvider(self.gateway_address, self.gateway_key,
            name=mt.get('providerName', 'gateway-mt'), session=recognizer.session, binding=binding)
        self.translation_scheduler = TranslationScheduler(self.translation_provider,
            timeout_seconds=GATEWAY_TRANSLATION_TIMEOUT_SECONDS)
        self.fallback_translation_provider = None
        self.fallback_translation_scheduler = None
        # A backup belongs to the model the gateway bound, so a session that named its own
        # translation binding must not borrow the bound model's fallback.
        if not binding and mt.get('state') == 'ready' and mt.get('fallbackReady'):
            self.fallback_translation_provider = GatewayTranslationProvider(self.gateway_address,
                self.gateway_key, name=mt.get('fallbackProviderName', 'gateway-fallback'),
                fallback=True, session=recognizer.session)
            self.fallback_translation_scheduler = TranslationScheduler(
                self.fallback_translation_provider, timeout_seconds=GATEWAY_TRANSLATION_TIMEOUT_SECONDS)
        if isinstance(command, StartSessionCommand):
            try:
                await recognizer.start()
            except BaseException:
                await recognizer.close()
                raise
        return recognizer

    async def _unload_session_models(self):
        self._retain_models = False
        self._loaded_model_key = None
        self._loaded_translation_model_id = None
        for provider in (self.translation_provider, self.fallback_translation_provider):
            close = getattr(provider, 'aclose', None)
            if close is not None:
                await close()
        self._active_recognition_runtime = None

    def _write_engine_status(self):
        # Multiple business processes must not overwrite the model owner's status file.
        return

    def _remove_engine_status(self):
        return
