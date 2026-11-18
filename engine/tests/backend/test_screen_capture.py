from uuid import uuid4

import numpy as np
import pytest

from nola_translator_engine.backend.screen_capture import CaptureRequest, ScreenCapture, similarity


class Desktop:
    def __init__(self):
        self.image = np.full((32, 48, 3), 12, np.uint8)
        self.keys = (False,) * 5
        self.exclusion = True
        self.active_window = 33
        self.captured = []

    def dpi_context(self, _):
        return None

    def input_state(self):
        return self.keys

    def target_is_foreground(self, hwnd):
        return self.active_window == hwnd

    def excluded(self, _):
        return self.exclusion

    def flush(self):
        pass

    def grab(self, region, target, owner_pid, desktop_allowed):
        self.captured.append((region.id, target, owner_pid, desktop_allowed))
        return self.image if desktop_allowed else None


def request(mode, count=1, **options):
    return CaptureRequest(session_id=uuid4(), epoch=0, mode=mode, owner_pid=10,
                          regions=[dict(id=uuid4(), x=0, y=0, width=48, height=32) for _ in range(count)],
                          **options)


def test_screen_similarity_respects_stability_and_recognized_image_thresholds():
    darker = np.full((32, 48, 3), 12, np.uint8)
    changed = np.full_like(darker, 20)
    assert similarity(darker, darker) == pytest.approx(1)
    assert similarity(darker, None) == 0
    assert 0.5 < similarity(darker, changed) < 0.95
    blue, red = darker.copy(), darker.copy()
    blue[:, :, 0], red[:, :, 2] = 200, 200
    assert similarity(darker, blue) < similarity(darker, red)
    native = Desktop()
    capture = ScreenCapture(native)
    command = request("analysis")
    assert not capture.sample(command, 0)["frames"]
    assert len(capture.sample(command, 0.1)["frames"]) == 1
    assert not capture.sample(command, 0.2)["frames"]
    native.image = np.full_like(darker, 200)
    assert not capture.sample(command, 0.3)["frames"]
    assert len(capture.sample(command, 0.4)["frames"]) == 1
    assert not capture.sample(command, 0.5)["frames"]


def test_input_waits_for_bound_window_delay_and_all_regions_to_settle():
    native = Desktop()
    capture = ScreenCapture(native)
    command = request("trigger", 2, target="33")
    native.active_window = 11
    assert not capture.sample(command, 0)["frames"]
    native.keys = (True, False, False, False, False)
    assert not capture.sample(command, 0.05)["frames"]
    native.active_window = 33
    native.keys = (False, False, True, False, False)
    assert not capture.sample(command, 0.3)["frames"]
    native.keys = (False,) * 5
    assert not capture.sample(command, 0.4)["frames"]
    assert not capture.sample(command, 0.48)["frames"]
    assert not capture.sample(command, 0.51)["frames"]
    assert not capture.sample(command, 0.63)["frames"]
    assert len(capture.sample(command, 0.74)["frames"]) == 2
    assert not capture.sample(command, 0.8)["frames"]
    assert len(capture.sample(command.model_copy(update={"manual": True}), 0.9)["frames"]) == 2


def test_desktop_fallback_reports_when_the_overlay_must_be_hidden():
    native = Desktop()
    capture = ScreenCapture(native)
    command = request("period", overlay="19")
    native.exclusion = False
    assert capture.sample(command) == {"frames": [], "hide_overlay": True}
    native.exclusion = True
    assert len(capture.sample(command)["frames"]) == 1
    capture.release(command.session_id)
    assert capture.session is None
