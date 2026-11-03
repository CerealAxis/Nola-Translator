"""Discover Windows application audio and issue short-lived capture selections."""

from __future__ import annotations

import ctypes as c
import os
import secrets
import sys
import time
from contextlib import ExitStack, contextmanager
from threading import Lock

from .capture_process_loopback import (
    CLSID_MM_DEVICE_ENUMERATOR, DWORD, GUID, HRESULT, IID_IMM_DEVICE_ENUMERATOR,
    MIN_OS_BUILD, _com_method, _release_interface, _windows_build, guid_from_str,
)

_SELECTION_SECONDS = 300
_lock = Lock()
_selections: dict[str, tuple[int, int, float]] = {}


class ProcessSourceError(RuntimeError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _win_function(dll, name, result, *args):
    fn = getattr(dll, name)
    fn.restype = result
    fn.argtypes = args
    return fn


@contextmanager
def _process(pid: int):
    kernel = c.windll.kernel32
    open_process = _win_function(kernel, "OpenProcess", c.c_void_p, DWORD, c.c_int, DWORD)
    close = _win_function(kernel, "CloseHandle", c.c_int, c.c_void_p)
    handle = open_process(0x101000, False, pid)  # SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        raise ProcessSourceError("process_access_denied" if kernel.GetLastError() == 5 else "process_exited")
    try:
        yield handle
    finally:
        close(handle)


def _created(handle: int) -> int:
    stamp = c.c_uint64()
    unused = [c.c_uint64() for _ in range(3)]
    query = _win_function(c.windll.kernel32, "GetProcessTimes", c.c_int, c.c_void_p, *([c.POINTER(c.c_uint64)] * 4))
    if not query(handle, c.byref(stamp), *(c.byref(value) for value in unused)):
        raise ProcessSourceError("process_access_denied")
    return stamp.value


def _alive(handle: int) -> bool:
    wait = _win_function(c.windll.kernel32, "WaitForSingleObject", DWORD, c.c_void_p, DWORD)
    return wait(handle, 0) == 258  # WAIT_TIMEOUT


@contextmanager
def open_selection(selection_id: str):
    if sys.platform != "win32" or _windows_build() < MIN_OS_BUILD:
        raise ProcessSourceError("process_unsupported")
    with _lock:
        selection = _selections.get(selection_id)
    if selection is None or selection[2] < time.monotonic():
        raise ProcessSourceError("process_selection_expired")
    pid, created, _ = selection
    with _process(pid) as handle:
        if _created(handle) != created or not _alive(handle):
            raise ProcessSourceError("process_exited")
        try:
            yield pid, lambda: _alive(handle)
        finally:
            if _alive(handle):
                with _lock:
                    _selections[selection_id] = (pid, created, time.monotonic() + _SELECTION_SECONDS)


def _windows() -> dict[int, str]:
    windows: dict[int, str] = {}
    user = c.windll.user32
    visible = _win_function(user, "IsWindowVisible", c.c_int, c.c_void_p)
    title = _win_function(user, "GetWindowTextW", c.c_int, c.c_void_p, c.c_wchar_p, c.c_int)
    get_pid = _win_function(user, "GetWindowThreadProcessId", DWORD, c.c_void_p, c.POINTER(DWORD))
    callback = c.WINFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p)

    @callback
    def collect(hwnd, _):
        name = c.create_unicode_buffer(256)
        if visible(hwnd) and title(hwnd, name, len(name)):
            pid = DWORD()
            get_pid(hwnd, c.byref(pid))
            if pid.value:
                windows.setdefault(pid.value, name.value)
        return 1

    user.EnumWindows(collect, None)
    return windows


def _processes() -> dict[int, tuple[int, str]]:
    class ProcessEntry(c.Structure):
        _fields_ = [("size", DWORD), ("usage", DWORD), ("pid", DWORD), ("heap", c.c_size_t),
                    ("module", DWORD), ("threads", DWORD), ("parent", DWORD), ("priority", c.c_long),
                    ("flags", DWORD), ("name", c.c_wchar * 260)]

    kernel = c.windll.kernel32
    snapshot = _win_function(kernel, "CreateToolhelp32Snapshot", c.c_void_p, DWORD, DWORD)(2, 0)
    if snapshot == c.c_void_p(-1).value:
        return {}
    try:
        entry = ProcessEntry(size=c.sizeof(ProcessEntry))
        first = _win_function(kernel, "Process32FirstW", c.c_int, c.c_void_p, c.POINTER(ProcessEntry))
        next_entry = _win_function(kernel, "Process32NextW", c.c_int, c.c_void_p, c.POINTER(ProcessEntry))
        found = first(snapshot, c.byref(entry))
        processes = {}
        while found:
            processes[entry.pid] = (entry.parent, entry.name)
            found = next_entry(snapshot, c.byref(entry))
        return processes
    finally:
        _win_function(kernel, "CloseHandle", c.c_int, c.c_void_p)(snapshot)


def _audio_sessions() -> dict[int, bool]:
    ole = c.windll.ole32
    hr = ole.CoInitializeEx(None, 0)
    if hr not in (0, 1):
        return {}
    pointer = c.c_void_p
    pointer_out = c.POINTER(pointer)
    guid = c.POINTER(GUID)

    def call(obj, slot, signature, *args):
        return _com_method(obj, slot, c.WINFUNCTYPE(HRESULT, pointer, *signature))(obj, *args)

    def retain(stack, obj):
        stack.callback(_release_interface, obj)

    try:
        with ExitStack() as stack:
            enumerator = pointer()
            clsid = guid_from_str(CLSID_MM_DEVICE_ENUMERATOR)
            iid = guid_from_str(IID_IMM_DEVICE_ENUMERATOR)
            if ole.CoCreateInstance(c.byref(clsid), None, 1, c.byref(iid), c.byref(enumerator)) < 0:
                return {}
            retain(stack, enumerator)
            devices = pointer()
            if call(enumerator, 3, (DWORD, DWORD, pointer_out), 0, 1, c.byref(devices)) < 0:
                return {}
            retain(stack, devices)
            count = DWORD()
            if call(devices, 3, (c.POINTER(DWORD),), c.byref(count)) < 0:
                return {}
            manager_id = guid_from_str("{77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F}")
            control_id = guid_from_str("{bfb7ff88-7239-4fc9-8fa2-07c950be9c6d}")
            found: dict[int, bool] = {}
            for index in range(count.value):
                with ExitStack() as device_refs:
                    device, manager, sessions = pointer(), pointer(), pointer()
                    if call(devices, 4, (DWORD, pointer_out), index, c.byref(device)) < 0:
                        continue
                    retain(device_refs, device)
                    if call(device, 3, (guid, DWORD, pointer, pointer_out), c.byref(manager_id), 1, None, c.byref(manager)) < 0:
                        continue
                    retain(device_refs, manager)
                    if call(manager, 5, (pointer_out,), c.byref(sessions)) < 0:
                        continue
                    retain(device_refs, sessions)
                    size = c.c_int()
                    if call(sessions, 3, (c.POINTER(c.c_int),), c.byref(size)) < 0:
                        continue
                    for number in range(size.value):
                        with ExitStack() as session_refs:
                            session, control = pointer(), pointer()
                            if call(sessions, 4, (c.c_int, pointer_out), number, c.byref(session)) < 0:
                                continue
                            retain(session_refs, session)
                            if call(session, 0, (guid, pointer_out), c.byref(control_id), c.byref(control)) < 0:
                                continue
                            retain(session_refs, control)
                            pid, state = DWORD(), c.c_int()
                            if call(control, 14, (c.POINTER(DWORD),), c.byref(pid)) == 0 and pid.value:
                                if call(control, 3, (c.POINTER(c.c_int),), c.byref(state)) == 0 and state.value != 2:
                                    found[pid.value] = found.get(pid.value, False) or state.value == 1
            return found
    finally:
        ole.CoUninitialize()


def list_process_sources() -> dict:
    if sys.platform != "win32" or _windows_build() < MIN_OS_BUILD:
        return {"available": False, "reason": "process_unsupported", "processes": []}
    processes, windows, sessions = _processes(), _windows(), _audio_sessions()
    selected: dict[int, bool] = {}
    for pid in windows.keys() | sessions.keys():
        root, parent = pid, pid
        seen = {pid}
        while parent in processes:
            parent = processes[parent][0]
            if parent in seen or parent == os.getppid() or parent == os.getpid():
                break
            seen.add(parent)
            if root == pid and parent in windows and processes.get(parent, (0, ""))[1].lower() != "explorer.exe":
                root = parent
        if os.getpid() in seen or parent in (os.getpid(), os.getppid()) or root in (os.getpid(), os.getppid()):
            continue
        selected[root] = selected.get(root, False) or sessions.get(pid, False)
    now = time.monotonic()
    rows = []
    with _lock:
        stale = [token for token, value in _selections.items() if value[2] < now]
        for token in stale:
            del _selections[token]
        existing = {(pid, created): token for token, (pid, created, _) in _selections.items()}
        for pid, active in selected.items():
            name = processes.get(pid, (0, ""))[1] or windows.get(pid, str(pid))
            row = {"pid": pid, "name": name, "active": active, "selection_id": None, "reason": None}
            try:
                with _process(pid) as handle:
                    created = _created(handle)
                    if not _alive(handle):
                        raise ProcessSourceError("process_exited")
                token = existing.get((pid, created)) or secrets.token_urlsafe(24)
                _selections[token] = (pid, created, now + _SELECTION_SECONDS)
                row["selection_id"] = token
            except ProcessSourceError as error:
                row["reason"] = error.reason
            rows.append(row)
    rows.sort(key=lambda row: (not row["active"], row["name"].casefold(), row["pid"]))
    return {"available": True, "reason": None, "processes": rows}
