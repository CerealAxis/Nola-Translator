import pytest

from nola_translator_engine.backend.playback_queue import PlaybackQueue, TtsJob


def job(order: int) -> TtsJob:
    return TtsJob(
        translation_commit_id=f"commit-{order}",
        translation_id=f"translation-{order}",
        segment_id=f"segment-{order}",
        target_revision=1,
        target_language="en",
        order_index=order,
        text=f"Sentence {order}",
        model_id="voice-model",
    )


@pytest.fixture
def queue(tmp_path):
    queue = PlaybackQueue(tmp_path / "playback.sqlite3", "pipeline")
    try:
        yield queue
    finally:
        queue.close()


def test_only_valid_drained_ack_advances_order(queue):
    first, second = job(1), job(2)
    assert queue.enqueue(second)
    assert queue.enqueue(first)
    assert not queue.enqueue(first)

    assert queue.begin_next().job_id == first.job_id
    assert queue.begin_next() is None
    claim = queue.claim(first.job_id, "owner", 100, attempt=1)
    assert queue.claim(first.job_id, "other", 100, attempt=1) is None
    assert queue.begin_next() is None

    def ack(state, played, owner="owner"):
        return queue.ack(first.job_id, owner, claim.claim_id, claim.generation, state, played)

    assert not ack("finished", 100)
    assert not ack("started", 0, "other")
    assert ack("started", 0)
    assert ack("progress", 90)
    assert not ack("progress", 89)
    assert not ack("finished", 99)
    assert queue.begin_next() is None
    assert ack("finished", 100)
    assert ack("finished", 100)
    assert queue.begin_next().job_id == second.job_id


def test_pause_fences_old_attempt_but_keeps_waiting_jobs(queue):
    first, second = job(1), job(2)
    queue.enqueue(first)
    queue.enqueue(second)
    assert queue.begin_next().synthesis_attempt == 1
    assert queue.pause() == 1
    assert queue.begin_next() is None
    queue.resume()
    assert queue.begin_next().synthesis_attempt == 2
    assert queue.claim(first.job_id, "owner", 100, attempt=1) is None
    assert not queue.fail(first.job_id, attempt=1)
    claim = queue.claim(first.job_id, "owner", 100, attempt=2)
    assert queue.pause() == 2
    assert not queue.ack(first.job_id, "owner", claim.claim_id, claim.generation, "started")
    queue.resume()
    assert queue.begin_next().job_id == second.job_id
    assert queue.stop() == 3
    assert queue.stop() == 3
    assert queue.claim(second.job_id, "owner", 100, attempt=1) is None
    assert not queue.enqueue(job(3))
    assert queue.begin_next() is None


def test_failure_waits_for_user_retry_or_skip(queue):
    first, second = job(1), job(2)
    queue.enqueue(first)
    queue.enqueue(second)
    assert queue.begin_next().job_id == first.job_id
    assert queue.fail(first.job_id, attempt=1)
    assert queue.begin_next() is None
    assert queue.retry(first.job_id)
    assert queue.begin_next().synthesis_attempt == 2
    assert queue.fail(first.job_id, attempt=2)
    assert queue.skip(first.job_id)
    assert queue.begin_next().job_id == second.job_id


def test_reopen_does_not_replay_grant(tmp_path):
    path = tmp_path / "playback.sqlite3"
    first, second = job(1), job(2)
    initial = PlaybackQueue(path, "pipeline")
    try:
        initial.enqueue(first)
        initial.enqueue(second)
        assert initial.begin_next().job_id == first.job_id
        claim = initial.claim(first.job_id, "owner", 100, attempt=1)
        assert initial.ack(first.job_id, "owner", claim.claim_id, claim.generation, "started")
    finally:
        initial.close()

    recovered = PlaybackQueue(path, "pipeline")
    try:
        assert not recovered.enqueue(first)
        assert recovered.begin_next() is None
        assert not recovered.retry(first.job_id)
        assert not recovered.ack(first.job_id, "owner", claim.claim_id, claim.generation, "finished", 100)
        assert recovered.skip(first.job_id)
        assert recovered.begin_next().job_id == second.job_id
    finally:
        recovered.close()


def test_lost_owner_blocks_next_sentence(queue):
    first, second = job(1), job(2)
    queue.enqueue(first)
    queue.enqueue(second)
    queue.begin_next()
    claim = queue.claim(first.job_id, "owner", 100, attempt=1)
    assert not queue.owner_lost("other")
    assert queue.owner_lost("owner")
    assert queue.begin_next() is None
    assert not queue.ack(first.job_id, "owner", claim.claim_id, claim.generation, "started")
    assert queue.skip(first.job_id)
    assert queue.begin_next().job_id == second.job_id
