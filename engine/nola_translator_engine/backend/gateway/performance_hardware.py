"""System readings and per-adapter dedicated memory attribution."""

from collections import defaultdict
import ctypes as ct
import os
from pathlib import Path
import re
from uuid import UUID

from ...debug_log import log_exception

GIB = 1024 ** 3
GPU_ID = re.compile(r"luid_0x[0-9a-f]+_0x[0-9a-f]+_phys_\d+", re.I)
PID = re.compile(r"^pid_(\d+)_", re.I)

WINDOWS_COUNTERS = {
    "adapters": (r"\GPU Adapter Memory(*)\Dedicated Usage", "DedicatedUsage"),
    "shared": (r"\GPU Adapter Memory(*)\Shared Usage", "SharedUsage"),
    "engines": (r"\GPU Engine(*)\Utilization Percentage", "UtilizationPercentage"),
    "memory": (r"\GPU Process Memory(*)\Dedicated Usage", "DedicatedUsage"),
}


class _CounterItem(ct.Structure):
    _fields_ = [("name", ct.c_wchar_p), ("status", ct.c_uint32), ("value", ct.c_double)]


class _WindowsCounters:
    def __init__(self):
        self.api = ct.windll.pdh
        self.query = ct.c_void_p()
        self.counters = {}
        if self.api.PdhOpenQueryW(None, 0, ct.byref(self.query)) != 0:
            return
        for key, (path, field) in WINDOWS_COUNTERS.items():
            counter = ct.c_void_p()
            if self.api.PdhAddEnglishCounterW(self.query, ct.c_wchar_p(path), 0, ct.byref(counter)) == 0:
                self.counters[key] = counter, field

    def read(self):
        values = {}
        if not self.query or self.api.PdhCollectQueryData(self.query) != 0:
            return values
        for key, (counter, field) in self.counters.items():
            size, count = ct.c_uint32(), ct.c_uint32()
            self.api.PdhGetFormattedCounterArrayW(counter, 0x200, ct.byref(size), ct.byref(count), None)
            if not 0 < size.value <= 16 * 1024 * 1024:
                continue
            buffer = ct.create_string_buffer(size.value)
            if self.api.PdhGetFormattedCounterArrayW(counter, 0x200, ct.byref(size), ct.byref(count), buffer) != 0:
                continue
            items = ct.cast(buffer, ct.POINTER(_CounterItem))
            values[key] = [{"Name": items[i].name, field: items[i].value} for i in range(count.value)
                           if items[i].status in (0, 1) and items[i].name and items[i].value >= 0]
        return values

    def close(self):
        if self.query:
            self.api.PdhCloseQuery(self.query)
            self.query = ct.c_void_p()


def _windows_processes():
    class Process(ct.Structure):
        _fields_ = [("size", ct.c_uint32), ("usage", ct.c_uint32), ("pid", ct.c_uint32),
                    ("heap", ct.c_size_t), ("module", ct.c_uint32), ("threads", ct.c_uint32),
                    ("parent", ct.c_uint32), ("priority", ct.c_long), ("flags", ct.c_uint32),
                    ("name", ct.c_wchar * 260)]

    # Other backend modules bind these same exports to their own ctypes structures.
    kernel = ct.WinDLL("kernel32")
    kernel.CreateToolhelp32Snapshot.argtypes = (ct.c_uint32, ct.c_uint32)
    kernel.CreateToolhelp32Snapshot.restype = ct.c_void_p
    kernel.Process32FirstW.argtypes = (ct.c_void_p, ct.POINTER(Process))
    kernel.Process32NextW.argtypes = (ct.c_void_p, ct.POINTER(Process))
    kernel.CloseHandle.argtypes = (ct.c_void_p,)
    handle = kernel.CreateToolhelp32Snapshot(2, 0)
    if handle in (None, ct.c_void_p(-1).value):
        return []
    handle = ct.c_void_p(handle)
    try:
        process = Process()
        process.size = ct.sizeof(process)
        rows = []
        present = kernel.Process32FirstW(handle, ct.byref(process))
        while present:
            rows.append({"ProcessId": process.pid, "ParentProcessId": process.parent})
            present = kernel.Process32NextW(handle, ct.byref(process))
        return rows
    finally:
        kernel.CloseHandle(handle)


def _windows_has_physical_address(low, high):
    class AdapterHandle(ct.Structure):
        _fields_ = [("low", ct.c_uint32), ("high", ct.c_uint32), ("handle", ct.c_uint32)]

    class Query(ct.Structure):
        _fields_ = [("handle", ct.c_uint32), ("kind", ct.c_uint32),
                    ("data", ct.c_void_p), ("size", ct.c_uint32)]

    gdi = ct.windll.gdi32
    adapter = AdapterHandle(low, high)
    if gdi.D3DKMTOpenAdapterFromLuid(ct.byref(adapter)) != 0:
        return True
    try:
        address = (ct.c_uint32 * 3)()
        adapter_address = 6  # KMTQAITYPE_ADAPTERADDRESS
        query = Query(adapter.handle, adapter_address, ct.addressof(address), ct.sizeof(address))
        # Windows returns the all-ones PCI bus sentinel for software display and alias adapters.
        return gdi.D3DKMTQueryAdapterInfo(ct.byref(query)) != 0 or address[0] != 0xFFFFFFFF
    finally:
        gdi.D3DKMTCloseAdapter(ct.byref(ct.c_uint32(adapter.handle)))


def _com_method(obj, index, result, *arguments):
    vtable = ct.cast(obj, ct.POINTER(ct.POINTER(ct.c_void_p)))[0]
    return ct.WINFUNCTYPE(result, ct.c_void_p, *arguments)(vtable[index])


def _windows_is_integrated(low, high):
    try:
        create = ct.windll.dxcore.DXCoreCreateAdapterFactory
    except (OSError, AttributeError):
        return None
    factory = ct.c_void_p()
    factory_id = UUID("78ee5945-c36e-4b13-a669-005dd11c0f06").bytes_le
    if create(ct.c_char_p(factory_id), ct.byref(factory)) != 0:
        return None
    try:
        adapter = ct.c_void_p()
        adapter_id = UUID("f0db4c7f-fe5a-42a2-bd62-f2a6cf6fc83e").bytes_le
        luid = (ct.c_uint32 * 2)(low, high)
        get_adapter = _com_method(factory, 4, ct.c_long, ct.c_void_p, ct.c_char_p, ct.c_void_p)
        if get_adapter(factory, ct.byref(luid), adapter_id, ct.byref(adapter)) != 0:
            return None
        try:
            is_integrated = 12  # DXCoreAdapterProperty::IsIntegrated
            supported = _com_method(adapter, 5, ct.c_bool, ct.c_uint32)
            get_property = _com_method(adapter, 6, ct.c_long, ct.c_uint32, ct.c_size_t, ct.c_void_p)
            value = ct.c_bool()
            if supported(adapter, is_integrated) and get_property(adapter, is_integrated, ct.sizeof(value), ct.byref(value)) == 0:
                return value.value
            return None
        finally:
            _com_method(adapter, 2, ct.c_ulong)(adapter)
    finally:
        _com_method(factory, 2, ct.c_ulong)(factory)


def _windows_adapters():
    class Descriptor(ct.Structure):
        _fields_ = [("name", ct.c_wchar * 128), ("ids", ct.c_uint * 4),
                    ("dedicated", ct.c_size_t), ("dedicated_system", ct.c_size_t),
                    ("shared", ct.c_size_t), ("low", ct.c_uint32), ("high", ct.c_uint32),
                    ("flags", ct.c_uint)]

    factory = ct.c_void_p()
    iid = (ct.c_char * 16).from_buffer_copy(UUID("770aae78-f26f-4dba-a829-253c83d1b387").bytes_le)
    if ct.windll.dxgi.CreateDXGIFactory1(ct.byref(iid), ct.byref(factory)) != 0:
        return {}
    devices = {}
    try:
        enum = _com_method(factory, 12, ct.c_long, ct.c_uint, ct.POINTER(ct.c_void_p))
        for index in range(64):
            adapter = ct.c_void_p()
            if enum(factory, index, ct.byref(adapter)) != 0:
                break
            try:
                desc = Descriptor()
                if _com_method(adapter, 10, ct.c_long, ct.POINTER(Descriptor))(adapter, ct.byref(desc)) == 0 and not desc.flags & 2:
                    if not _windows_has_physical_address(desc.low, desc.high):
                        continue
                    key = f"luid_0x{desc.high:08x}_0x{desc.low:08x}_phys_0"
                    devices[key] = {"id": key, "name": desc.name, "capacity": desc.dedicated / GIB}
                    integrated = _windows_is_integrated(desc.low, desc.high)
                    if integrated is not None:
                        devices[key]["integrated"] = integrated
            finally:
                _com_method(adapter, 2, ct.c_ulong)(adapter)
    finally:
        _com_method(factory, 2, ct.c_ulong)(factory)
    return devices


def _owner_groups(owners, processes):
    parents = {row["ProcessId"]: row["ParentProcessId"] for row in processes}
    def resolve(pid):
        visited = set()
        while pid and pid not in visited:
            if pid in owners:
                return tuple(sorted(owners[pid]))
            visited.add(pid)
            pid = parents.get(pid)
        return ()
    return resolve


def windows_gpu_readings(inventory, counters, owners):
    devices = {key: dict(value) for key, value in inventory.items()}
    engines = defaultdict(lambda: defaultdict(float))
    allocations = defaultdict(lambda: defaultdict(int))
    owner = _owner_groups(owners, counters.get("processes", ()))
    for source, (_, field) in WINDOWS_COUNTERS.items():
        for row in counters.get(source, ()):
            match = GPU_ID.search(row["Name"])
            value = row.get(field)
            if match is None or value is None:
                continue
            key = match[0].lower()
            if key not in devices:
                continue
            device = devices[key]
            if source == "adapters":
                device["used"] = value / GIB
            elif source == "shared":
                device["sharedUsed"] = value / GIB
            elif source == "engines":
                # Each instance is a process's share of one physical engine.
                engine = row["Name"][match.end():].split("_engtype_", 1)[0]
                engines[key][engine] += value
            elif process := PID.match(row["Name"]):
                if models := owner(int(process[1])):
                    allocations[key][models] += value
    for key, values in engines.items():
        devices[key]["load"] = min(100, max(values.values()))
    for key, values in allocations.items():
        devices[key]["allocations"] = [{"models": models, "used": value / GIB} for models, value in values.items()]
    return list(devices.values())


class HardwareSampler:
    def __init__(self):
        self.cpu_times = None
        self.counters = _WindowsCounters() if os.name == "nt" else None

    def close(self):
        if self.counters is not None:
            self.counters.close()

    def _system(self):
        if self.counters is not None:
            class MemoryStatus(ct.Structure):
                _fields_ = [("length", ct.c_uint32), ("load", ct.c_uint32),
                            ("total", ct.c_uint64), ("available", ct.c_uint64), ("other", ct.c_uint64 * 5)]

            idle, kernel, user = (ct.c_uint64() for _ in range(3))
            times = ct.windll.kernel32.GetSystemTimes(ct.byref(idle), ct.byref(kernel), ct.byref(user))
            memory = MemoryStatus()
            memory.length = ct.sizeof(memory)
            available = ct.windll.kernel32.GlobalMemoryStatusEx(ct.byref(memory))
            return ((kernel.value + user.value, idle.value) if times else None,
                    (memory.total, memory.available) if available else None)
        try:
            fields = list(map(int, Path("/proc/stat").read_text().splitlines()[0].split()[1:9]))
            values = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
            mem = tuple(int(values[key].split()[0]) * 1024 for key in ("MemTotal", "MemAvailable"))
            return (sum(fields), fields[3] + fields[4]), mem
        except (OSError, KeyError, ValueError, IndexError):
            return None, None

    def read(self, owners):
        times, mem = self._system()
        readings = {"gpus": []}
        if times and self.cpu_times:
            elapsed = times[0] - self.cpu_times[0]
            if elapsed > 0:
                readings["cpu"] = round(100 * (1 - (times[1] - self.cpu_times[1]) / elapsed), 2)
        self.cpu_times = times
        if mem:
            readings.update(ram=(mem[0] - mem[1]) / GIB, ramCapacity=mem[0] / GIB)
        if os.name == "nt":
            try:
                inventory = _windows_adapters()
                counters = self.counters.read()
                if owners:
                    try:
                        counters["processes"] = _windows_processes()
                    except (OSError, ct.ArgumentError) as error:
                        log_exception("backend", "gateway.performance.process_read_failed", error)
                readings["gpus"] = windows_gpu_readings(inventory, counters, owners)
            except (OSError, ValueError) as error:
                log_exception("backend", "gateway.performance.gpu_read_failed", error)
        return readings
