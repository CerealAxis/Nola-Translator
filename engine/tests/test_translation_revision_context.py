import asyncio
import json
from types import SimpleNamespace

import pytest

from nola_translator_engine.protocol import Translation
from nola_translator_engine.recognition.base import RecognitionUpdate
from nola_translator_engine.runtime import EngineRuntime, TranslationRequest
from nola_translator_engine.translation.base import ProviderTranslation, ScheduledTranslation
from nola_translator_engine.translation.scheduler import TranslationScheduler


@pytest.mark.asyncio
@pytest.mark.parametrize('provider_name', ['index-translate', 'openai', 'openai-responses', 'anthropic', 'ollama'])
async def test_revision_uses_matching_completed_source_for_each_target(tmp_path, provider_name):
    calls = {}

    class Provider:
        name = provider_name

        async def translate(self, text, source, target):
            calls[target] = text
            return ProviderTranslation('new translation', (source, target))

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    runtime.active_config = SimpleNamespace(targetLanguages=['zh', 'ja'], translationProvider='cloud', allowIntermediateTranslation=False)
    runtime.translation_scheduler = TranslationScheduler(Provider())
    first = RecognitionUpdate('segment', 1, 0, None, 'We analyze problems.', 'en', False)
    runtime.latest_updates['segment'] = first
    runtime.latest_translations['segment'] = [Translation(targetLanguage=target, state='pending', provider=provider_name) for target in ['zh', 'ja']]
    request = TranslationRequest(first, 'en', ('zh', 'ja'), False)
    for target, text in [('zh', '我们（先）分析问题。'), ('ja', '問題を分析します。')]:
        runtime._publish_translation_result(request, ScheduledTranslation(target, 'complete', provider_name, text=text), 'session', runtime._stream_generation)
    # Recognition may advance several times before another translation completes.
    runtime.latest_updates['segment'] = RecognitionUpdate('segment', 2, 0, None, 'We analyze problems. This', 'en', False)
    final = RecognitionUpdate('segment', 3, 0, 10, 'We analyze problems. This matters.', 'en', True)
    await runtime._emit_update(final)
    await asyncio.gather(*runtime.translation_tasks.values())
    await asyncio.gather(*(task for jobs in list(runtime.translation_jobs.values()) for task in jobs))
    for target, expected in [('zh', '我们（先）分析问题。'), ('ja', '問題を分析します。')]:
        payload = json.loads(calls[target])
        assert payload['previousSource'] == first.source_text
        assert payload['previousTranslation'] == expected
        assert payload['currentSource'] == final.source_text
    await runtime._emit_update(RecognitionUpdate('other', 1, 0, 10, 'Another sentence.', 'en', True))
    await asyncio.gather(*runtime.translation_tasks.values())
    await asyncio.gather(*(task for jobs in list(runtime.translation_jobs.values()) for task in jobs))
    assert set(calls.values()) == {'Another sentence.'}
    await runtime.translation_scheduler.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('change', ['source', 'language', 'provider', 'long', 'pending', 'stale'])
async def test_revision_context_is_bounded_and_never_pairs_an_incompatible_draft(tmp_path, change):
    calls = []

    class Provider:
        name = 'index-translate'
        async def translate(self, text, source, target):
            calls.append(text)
            return ProviderTranslation('result', (source, target))

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    runtime.translation_scheduler = TranslationScheduler(Provider())
    first = RecognitionUpdate('segment', 1, 0, None, 'Hello', 'en', False)
    runtime.latest_updates['segment'] = first
    runtime.latest_translations['segment'] = [Translation(targetLanguage='zh', state='pending', provider='index-translate')]
    request = TranslationRequest(first, 'en', ('zh',), False)
    runtime._publish_translation_result(request, ScheduledTranslation('zh', 'complete', 'index-translate', text='你好'), 'session', runtime._stream_generation)
    source, language = 'Hello world', 'en'
    if change == 'source':
        source = 'Goodbye'
    elif change == 'language':
        language = 'ja'
    elif change == 'provider':
        runtime.translation_context[('segment', 'zh')] = ('Hello', '你好', 'en', 'openai')
    elif change == 'long':
        runtime._publish_translation_result(request, ScheduledTranslation('zh', 'complete', 'index-translate', text='译' * 1201), 'session', runtime._stream_generation)
    elif change == 'pending':
        runtime._publish_translation_result(request, ScheduledTranslation('zh', 'pending', 'index-translate', text='未完成'), 'session', runtime._stream_generation)
    else:
        stale = TranslationRequest(RecognitionUpdate('segment', 0, 0, None, 'H', 'en', False), 'en', ('zh',), False)
        runtime._publish_translation_result(stale, ScheduledTranslation('zh', 'complete', 'index-translate', text='旧译文'), 'session', runtime._stream_generation)
    update = RecognitionUpdate('segment', 2, 0, 10, source, language, True)
    await runtime._translate_request(TranslationRequest(update, language, ('zh',), False))
    if change in {'pending', 'stale'}:
        assert json.loads(calls[0])['previousTranslation'] == '你好'
    else:
        assert calls == [source]
    await runtime.translation_scheduler.close()


@pytest.mark.asyncio
async def test_unchanged_final_source_reuses_completed_translation_without_another_llm_call(tmp_path):
    class Provider:
        name = 'openai'
        async def translate(self, *args):
            pytest.fail('An unchanged final source must not trigger a stylistic rewrite')

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    runtime.translation_scheduler = TranslationScheduler(Provider())
    runtime.translation_context[('segment', 'zh')] = ('Hello', '你好', 'en', 'openai')
    update = RecognitionUpdate('segment', 2, 0, 10, 'Hello', 'en', True)
    result = await runtime._translate_request(TranslationRequest(update, 'en', ('zh',), False))
    assert result[0].text == '你好'
    assert result[0].state == 'complete'
    await runtime.translation_scheduler.close()


@pytest.mark.asyncio
async def test_streamed_revisions_never_erase_and_replay_an_existing_translation(tmp_path):
    snapshots = [
        '将平均响应时间缩短到6小时以内。',
        '将平均响应时间缩短到6小时以内。这是一个巨大的改进。是的，这个目标很有挑战性，',
        '将平均响应时间缩短到6小时以内。这是一个巨大的改进。是的，这个目标很有挑战性，但我们相信可以实现。你的团队采取了哪些措施来实现这一目标？首先。',
    ]
    emitted = []

    class Provider:
        name = 'index-translate'
        next_text = snapshots[0]
        async def translate_stream(self, text, source, target, on_text):
            # Each new HTTP stream restarts at the first character, even for append-only revisions.
            for end in range(1, len(self.next_text) + 1):
                on_text(self.next_text[:end])
            return ProviderTranslation(self.next_text, (source, target))

    provider = Provider()
    runtime = EngineRuntime(tmp_path / 'models', emitted.append)
    runtime.service.session_id = 'session'
    runtime.translation_scheduler = TranslationScheduler(provider)
    previous = ''
    for revision, snapshot in enumerate(snapshots):
        provider.next_text = snapshot
        update = RecognitionUpdate('segment', revision, 0, None, 'source ' * (revision + 1), 'en', False)
        runtime.latest_updates['segment'] = update
        if not previous:
            runtime.latest_translations['segment'] = [Translation(targetLanguage='zh', state='pending', provider=provider.name)]
        emitted.clear()
        await runtime._translate_request(TranslationRequest(update, 'en', ('zh',), True))
        visible = [event.segment.translations[0].text for event in emitted if event.type == 'caption']
        assert visible[-1] == snapshot
        for text in visible:
            assert text.startswith(previous), f'Existing text was erased by a replayed stream prefix: {text!r}'
        previous = snapshot
    await runtime.translation_scheduler.close()


@pytest.mark.parametrize('state,text,expected', [
    ('pending', '将平均', '将平均响应时间缩短到6小时以内。'),
    ('pending', None, '将平均响应时间缩短到6小时以内。'),
    ('pending', '将最大', '将最大'),
    ('complete', '将平均', '将平均'),
])
def test_stream_prefix_hold_still_allows_corrections_and_final_shortening(tmp_path, state, text, expected):
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    update = RecognitionUpdate('segment', 2, 0, None, 'source', 'en', False)
    runtime.latest_updates['segment'] = update
    runtime.latest_translations['segment'] = [Translation(targetLanguage='zh', state='complete', provider='openai', text='将平均响应时间缩短到6小时以内。')]
    runtime._publish_translation_result(TranslationRequest(update, 'en', ('zh',), True), ScheduledTranslation('zh', state, 'openai', text=text), 'session', runtime._stream_generation)
    assert runtime.latest_translations['segment'][0].text == expected
    assert runtime.latest_translations['segment'][0].state == state
