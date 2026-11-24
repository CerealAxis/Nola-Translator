import asyncio
import ctypes as ct
import os

import pytest

from nola_translator_engine.backend.gateway import performance
from nola_translator_engine.backend.gateway.performance_hardware import GIB, _windows_processes, windows_gpu_readings


def test_same_name_adapters_use_luid_and_keep_missing_fields_and_shared_processes():
    first = "luid_0x00000000_0x00000001_phys_0"
    second = "luid_0x00000000_0x00000002_phys_0"
    inventory = {key: {"id": key, "name": "Same GPU", "capacity": 12} for key in (first, second)}
    owners = {1: {"model-a"}, 3: {"model-a", "model-b"}}
    counters = {
        "adapters": [{"Name": first, "DedicatedUsage": 7 * GIB},
                     {"Name": "luid_0x00000000_0x00000003_phys_0", "DedicatedUsage": 10}],
        "shared": [{"Name": first, "SharedUsage": 2 * GIB}],
        "engines": [
            {"Name": f"pid_1_{first}_eng_0_engtype_3D", "UtilizationPercentage": 25},
            {"Name": f"pid_2_{first}_eng_0_engtype_3D", "UtilizationPercentage": 12},
            {"Name": f"pid_3_{first}_eng_1_engtype_Copy", "UtilizationPercentage": 0},
        ],
        "memory": [
            {"Name": f"pid_2_{first}", "DedicatedUsage": 2 * GIB},
            {"Name": f"pid_2_{second}", "DedicatedUsage": 4 * GIB},
            {"Name": f"pid_3_{first}", "DedicatedUsage": GIB},
            {"Name": f"pid_4_{first}", "DedicatedUsage": 3 * GIB},
        ],
        "processes": [{"ProcessId": 2, "ParentProcessId": 1}],
    }
    left, right = windows_gpu_readings(inventory, counters, owners)
    assert left["id"] != right["id"]
    assert left["used"] == 7 and left["load"] == 37
    assert left["sharedUsed"] == 2 and "sharedUsed" not in right
    assert left["allocations"] == [{"models": ("model-a",), "used": 2},
                                  {"models": ("model-a", "model-b"), "used": 1}]
    assert right["allocations"] == [{"models": ("model-a",), "used": 4}]
    assert "used" not in right and "load" not in right


@pytest.mark.skipif(os.name != "nt", reason="Windows Toolhelp API")
def test_process_sampling_has_independent_ctypes_signatures(monkeypatch):
    first = ct.windll.kernel32.Process32FirstW
    monkeypatch.setattr(first, "argtypes", (ct.c_void_p, ct.POINTER(ct.c_int)))
    assert any(process["ProcessId"] == os.getpid() for process in _windows_processes())


async def test_sampler_recovers_after_a_failed_read(monkeypatch):
    class Sampler:
        failed = False

        def read(self, owners):
            if not self.failed:
                self.failed = True
                raise OSError("counter temporarily unavailable")
            return {"gpus": [], "cpu": 23}

        def close(self):
            pass

    monkeypatch.setattr(performance, "HardwareSampler", Sampler)
    history = performance.PerformanceHistory()
    task = asyncio.create_task(history.sample_hardware(list))
    try:
        async with asyncio.timeout(3):
            while len(history.hardware) < 2:
                await asyncio.sleep(0.01)
        assert "cpu" not in history.hardware[0]
        assert history.hardware[1]["cpu"] == 23
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
