import asyncio
import json
from types import SimpleNamespace

import pytest

from nola_translator_engine.protocol import Translation
from nola_translator_engine.recognition.base import RecognitionUpdate
from nola_translator_engine.runtime import MAX_STABLE_TEXT_CHARS, EngineRuntime, TranslationRequest
from nola_translator_engine.translation.base import (
    ProviderTranslation,
    ScheduledTranslation,
    split_common_prefix,
)
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
        published = runtime.latest_translations['segment'][0]
        assert published.text == '译' * 1201
        assert published.stableText == ''
        assert len(runtime.translation_stable[('segment', 'zh')].stable) <= MAX_STABLE_TEXT_CHARS
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
async def test_streamed_revisions_keep_the_confirmed_prefix_and_never_shrink_it(tmp_path):
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
    runtime.latest_translations['segment'] = [Translation(targetLanguage='zh', state='pending', provider=provider.name)]
    confirmed = ''
    for revision, snapshot in enumerate(snapshots):
        provider.next_text = snapshot
        update = RecognitionUpdate('segment', revision, 0, None, 'source ' * (revision + 1), 'en', False)
        runtime.latest_updates['segment'] = update
        emitted.clear()
        await runtime._translate_request(TranslationRequest(update, 'en', ('zh',), True))
        visible = [event.segment.translations[0] for event in emitted if event.type == 'caption']
        for item in visible:
            assert item.text.startswith(confirmed), f'The confirmed text was erased: {item.text!r}'
            assert len(item.stableText or '') >= len(confirmed)
            confirmed = item.stableText or confirmed
        assert visible[-1].text == snapshot
    await runtime.translation_scheduler.close()


@pytest.mark.parametrize('fragment,expected', [
    ('将平均', '将平均响应时间缩短到6小时以内。'),
    (None, '将平均响应时间缩短到6小时以内。'),
    ('将最大', '将平均响应时间缩短到6小时以内。'),
    ('将平均响应时间缩短到6小时以内。', '将平均响应时间缩短到6小时以内。'),
])
def test_a_streamed_fragment_never_confirms_and_never_hides_the_confirmed_prefix(tmp_path, fragment, expected):
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    update = RecognitionUpdate('segment', 0, 0, None, 'source', 'en', False)
    runtime.latest_updates['segment'] = update
    runtime.latest_translations['segment'] = [Translation(targetLanguage='zh', state='pending', provider='openai')]
    request = TranslationRequest(update, 'en', ('zh',), True)
    # Two rounds that agree on their beginning confirm that beginning.
    runtime._publish_translation_result(request, ScheduledTranslation('zh', 'complete', 'openai', text='将平均响应时间缩短到6小时以内。'), 'session', runtime._stream_generation)
    runtime._publish_translation_result(request, ScheduledTranslation('zh', 'complete', 'openai', text='将平均响应时间缩短到6小时以内。这是一个巨大的改进。'), 'session', runtime._stream_generation)
    confirmed = runtime.latest_translations['segment'][0].stableText
    assert confirmed == '将平均响应时间缩短到6小时以内。'
    runtime._publish_translation_result(request, ScheduledTranslation('zh', 'pending', 'openai', text=fragment), 'session', runtime._stream_generation)
    published = runtime.latest_translations['segment'][0]
    assert published.text == expected
    assert published.stableText == confirmed
    assert published.state == 'pending'


@pytest.mark.parametrize('left,right,language,expected', [
    ('a b c', 'a b c', 'en', ('a b c', '', '')),
    ('a b c', 'a b', 'en', ('a b', 'c', '')),
    ('a b', 'a b c', 'en', ('a b', '', 'c')),
    ('a b c', 'a b d', 'en', ('a b', 'c', 'd')),
    ('a b', 'x y', 'en', ('', 'a b', 'x y')),
    ('你好世界', '你好世界', 'zh', ('你好世界', '', '')),
    ('你好世界', '你好世界啊', 'zh', ('你好世界', '', '啊')),
    ('你好世界', '你好世男', 'zh', ('你好世', '界', '男')),
    ('你好', '晚安', 'zh', ('', '你好', '晚安')),
])
def test_the_common_prefix_keeps_every_unit_the_two_texts_share(left, right, language, expected):
    assert split_common_prefix(left, right, language) == expected


def test_the_common_prefix_never_ends_inside_a_word():
    common, rest_left, rest_right = split_common_prefix('hello world', 'hello worlds', 'en')
    assert (common, rest_left, rest_right) == ('hello', 'world', 'worlds')
    common, _, _ = split_common_prefix('你好世界', '你好世男', 'zh')
    assert common == '你好世'


def _publish(runtime, text, revision, *, target='en', state='complete', provider='openai',
             is_final=False, segment='segment'):
    update = RecognitionUpdate(segment, revision, 0, None, 'source', 'en', is_final)
    runtime.latest_updates[segment] = update
    runtime.latest_translations.setdefault(segment, [
        Translation(targetLanguage=target, state='pending', provider=provider)])
    runtime._publish_translation_result(
        TranslationRequest(update, 'en', (target,), True),
        ScheduledTranslation(target, state, provider, text=text),
        'session', runtime._stream_generation)
    return runtime.latest_translations[segment][0]


def _runtime(tmp_path):
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    return runtime


def test_the_confirmed_prefix_grows_only_when_the_model_repeats_itself(tmp_path):
    runtime = _runtime(tmp_path)
    first = _publish(runtime, 'Hello world', 0)
    assert first.text == 'Hello world'
    assert first.stableText == ''
    second = _publish(runtime, 'Hello world again', 1)
    assert second.text == 'Hello world again'
    assert second.stableText == 'Hello world'
    third = _publish(runtime, 'Hello world again', 2)
    assert third.text == 'Hello world again'
    assert third.stableText == 'Hello world again'


def test_the_confirmed_prefix_never_shrinks_and_the_text_always_contains_it(tmp_path):
    runtime = _runtime(tmp_path)
    confirmed = ''
    for revision, text in enumerate(['Hello', 'Hello world', 'Hello world again', 'Hello world again']):
        published = _publish(runtime, text, revision)
        assert published.text.startswith(published.stableText or '')
        assert len(published.stableText or '') >= len(confirmed)
        confirmed = published.stableText or confirmed


def test_the_tail_is_confirmed_when_the_segment_ends(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    published = _publish(runtime, 'Hello world again', 1)
    assert published.text == 'Hello world again'
    assert published.stableText == 'Hello world'
    settled = _publish(runtime, 'Hello world again', 2, is_final=True)
    assert settled.text == settled.stableText == 'Hello world again'


def test_a_rewritten_translation_is_dropped_and_the_prefix_is_rebuilt_after_three_conflicts(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    _publish(runtime, 'Hello world again', 1)
    for revision in (2, 3):
        dropped = _publish(runtime, 'Goodbye moon', revision)
        assert dropped.text == 'Hello world again'
        assert dropped.stableText == 'Hello world'
    rebuilt = _publish(runtime, 'Goodbye moon', 4)
    assert rebuilt.text == 'Goodbye moon'
    assert rebuilt.stableText == ''


def test_an_empty_translation_keeps_the_tail_that_was_already_displayed(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    published = _publish(runtime, 'Hello world again', 1)
    empty = _publish(runtime, '', 2)
    assert empty.text == published.text
    assert empty.stableText == published.stableText


def test_a_new_provider_starts_the_confirmed_prefix_over(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    _publish(runtime, 'Hello world again', 1)
    switched = _publish(runtime, 'Totally different words', 2, provider='fallback')
    assert switched.text == 'Totally different words'
    assert switched.stableText == ''


def test_a_new_source_language_starts_the_confirmed_prefix_over(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    _publish(runtime, 'Hello world again', 1)
    update = RecognitionUpdate('segment', 2, 0, None, 'source', 'ja', False)
    runtime.latest_updates['segment'] = update
    runtime._publish_translation_result(
        TranslationRequest(update, 'ja', ('en',), True),
        ScheduledTranslation('en', 'complete', 'openai', text='Hello world again'),
        'session', runtime._stream_generation)
    published = runtime.latest_translations['segment'][0]
    assert published.stableText == ''


def test_a_streamed_fragment_never_confirms_and_never_hides_the_confirmed_prefix(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    published = _publish(runtime, 'Hello world again', 1)
    assert published.stableText == 'Hello world'
    fragment = _publish(runtime, 'Hello wor', 2, state='pending')
    assert fragment.text == 'Hello world'
    assert fragment.stableText == 'Hello world'
    covering = _publish(runtime, 'Hello world ag', 3, state='pending')
    assert covering.text == 'Hello world ag'
    assert covering.stableText == 'Hello world'


def test_the_confirmed_prefix_stays_within_the_protocol_limit(tmp_path):
    runtime = _runtime(tmp_path)
    oversized = '译' * (MAX_STABLE_TEXT_CHARS + 10)
    update = RecognitionUpdate('segment', 0, 0, None, 'source', 'en', False)
    runtime.latest_updates['segment'] = update
    request = TranslationRequest(update, 'en', ('zh',), True)
    text, stable = runtime._commit_translation(
        ('segment', 'zh'), request,
        ScheduledTranslation('zh', 'complete', 'openai', text=oversized))
    assert text == oversized
    assert stable == ''
    later = RecognitionUpdate('segment', 1, 0, None, 'source', 'en', False)
    runtime.latest_updates['segment'] = later
    text, stable = runtime._commit_translation(
        ('segment', 'zh'), TranslationRequest(later, 'en', ('zh',), True),
        ScheduledTranslation('zh', 'complete', 'openai', text=oversized))
    assert stable == ''
    assert len(runtime.translation_stable[('segment', 'zh')].stable) <= MAX_STABLE_TEXT_CHARS


def test_the_confirmed_prefix_is_dropped_with_the_segment_it_belongs_to(tmp_path):
    runtime = _runtime(tmp_path)
    runtime.completed_segment_limit = 1
    _publish(runtime, 'Hello world', 0, segment='first', is_final=True)
    runtime._retire_completed(runtime.latest_updates['first'])
    assert ('first', 'en') in runtime.translation_stable
    _publish(runtime, 'Hello world', 0, segment='second', is_final=True)
    runtime._retire_completed(runtime.latest_updates['second'])
    assert ('first', 'en') not in runtime.translation_stable
    assert ('second', 'en') in runtime.translation_stable


@pytest.mark.asyncio
async def test_the_confirmed_prefix_is_cleared_with_the_session(tmp_path):
    runtime = _runtime(tmp_path)
    _publish(runtime, 'Hello world', 0)
    assert runtime.translation_stable
    await runtime._cancel_stream_tasks()
    assert runtime.translation_stable == {}


def test_an_unconfirmed_translation_reports_an_empty_prefix_rather_than_a_missing_one(tmp_path):
    runtime = _runtime(tmp_path)
    published = _publish(runtime, 'Hello world', 0)
    # The engine layered this translation, so the prefix is present but empty. A missing
    # prefix means the engine did not layer the text at all, which is what the renderer
    # needs to tell apart when it decides whether the caption is provisional.
    assert published.stableText == ''
    assert published.stableText is not None
