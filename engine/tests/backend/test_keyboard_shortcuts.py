from types import SimpleNamespace

import pytest

from nola_translator_engine.backend import meeting


def test_key_reader_matches_exact_modifiers_and_both_windows_keys(monkeypatch):
    pressed = set()
    def read(key):
        return 0x8000 if key in pressed else 0
    monkeypatch.setattr(meeting.ctypes, "windll", SimpleNamespace(user32=SimpleNamespace(GetAsyncKeyState=read)), raising=False)
    shortcut = meeting._key_reader("Control+Shift+K")
    pressed.update((0x11, 0x10, ord("K")))
    assert shortcut()
    pressed.add(0x12)
    assert not shortcut()
    pressed.clear()
    pressed.update((0x5C, ord("J")))
    assert meeting._key_reader("Super+J")()
    assert not meeting._key_reader("J")()


def test_disabled_key_does_not_access_the_windows_listener(monkeypatch):
    monkeypatch.delattr(meeting.ctypes, "windll", raising=False)
    assert not meeting._key_reader("")()


@pytest.mark.parametrize("binding", ["", "F9", "Control+Shift+K", "Alt+Comma"])
def test_meeting_shortcut_validation_accepts_supported_bindings(binding):
    assert meeting.MeetingRequest.model_fields["passthrough_key"].annotation is str
    assert meeting.MeetingRequest.validate_passthrough_key(binding) == binding


@pytest.mark.parametrize("binding", ["Control", "Control+Ctrl+K", "F25", "Control+Unknown", "A+B"])
def test_meeting_shortcut_validation_rejects_invalid_bindings(binding):
    with pytest.raises(ValueError):
        meeting.MeetingRequest.validate_passthrough_key(binding)
