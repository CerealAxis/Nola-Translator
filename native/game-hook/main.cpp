#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <filesystem>
#include <iostream>
#include <string>
#include <mutex>
#include <sstream>
#include <cassert>

// LunaHost ABI at LunaTranslator revision 31b502ebf34c35d27276a3d5aaf58ca7b45f0f3b.
struct ThreadParam { DWORD processId; uint64_t addr, ctx, ctx2; };
static_assert(sizeof(ThreadParam) == 32);
static std::mutex outputMutex;
static DWORD targetPid;
static std::string utf8(const std::wstring &value) {
    if (value.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0, nullptr, nullptr);
    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), result.data(), size, nullptr, nullptr);
    return result;
}
static std::wstring wide(const std::string &value) {
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), (int)value.size(), nullptr, 0);
    std::wstring result(size, L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), (int)value.size(), result.data(), size);
    return result;
}
static std::string quote(const std::string &value) {
    std::string result = "\"";
    const char *hex = "0123456789abcdef";
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') { result += '\\'; result += c; }
        else if (c < 32) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += c;
    }
    return result + '"';
}
static void emit(const std::string &body) { std::lock_guard<std::mutex> lock(outputMutex); std::cout << '{' << body << "}\n" << std::flush; }
static void error(const char *code) { emit("\"type\":\"error\",\"code\":" + quote(code)); }
static std::string threadId(ThreadParam tp) {
    std::ostringstream value; value << tp.processId << ':' << std::hex << tp.addr << ':' << tp.ctx << ':' << tp.ctx2; return value.str();
}
static void connected(DWORD pid) { if (pid == targetPid) emit("\"type\":\"connected\""); }
static void disconnected(DWORD pid) { if (pid == targetPid) emit("\"type\":\"disconnected\""); }
static void created(const wchar_t *code, const char *name, ThreadParam tp, bool embed) {
    if (tp.processId == targetPid) emit("\"type\":\"thread\",\"id\":" + quote(threadId(tp)) + ",\"name\":" + quote(name ? name : "") + ",\"code\":" + quote(utf8(code ? code : L"")) + ",\"embed\":" + (embed ? "true" : "false"));
}
static void removed(const wchar_t *, const char *, ThreadParam tp) { if (tp.processId == targetPid) emit("\"type\":\"remove\",\"id\":" + quote(threadId(tp))); }
static void text(const wchar_t *, const char *, ThreadParam tp, const wchar_t *value) {
    if (tp.processId != targetPid || !value) return;
    std::wstring bounded(value);
    if (bounded.size() > 16000) { error("textTooLong"); return; }
    emit("\"type\":\"text\",\"id\":" + quote(threadId(tp)) + ",\"text\":" + quote(utf8(bounded)));
}
static void info(int, const wchar_t *) {}
static void inserted(DWORD, uint64_t, const wchar_t *) {}
static void embed(const wchar_t *, ThreadParam) {}
static wchar_t *i18n(const wchar_t *) { return nullptr; }
static void emulator(const wchar_t *, const wchar_t *, const wchar_t *) {}

int wmain(int argc, wchar_t **argv) {
    if (argc == 2 && std::wstring(argv[1]) == L"--self-test") {
        if (quote("a\n\"\\") != "\"a\\u000a\\\"\\\\\"" || wide(utf8(L"日本語")) != L"日本語") return 1;
        emit("\"type\":\"selfTest\",\"ok\":true"); return 0;
    }
    if (argc < 3) return 2;
    const HWND window = reinterpret_cast<HWND>(_wcstoui64(argv[2], nullptr, 10));
    if (!IsWindow(window) || !GetWindowThreadProcessId(window, &targetPid) || targetPid == GetCurrentProcessId()) { error("targetUnavailable"); return 3; }
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, targetPid);
    if (!process) { error("permissionDenied"); return 3; }
    FILETIME started, ended, kernel, user;
    wchar_t executable[32768]; DWORD executableSize = 32768;
    BOOL wow64 = FALSE;
    if (!GetProcessTimes(process, &started, &ended, &kernel, &user) || !QueryFullProcessImageNameW(process, 0, executable, &executableSize) || !IsWow64Process(process, &wow64)) { CloseHandle(process); error("targetUnavailable"); return 3; }
    const uint64_t startTime = (uint64_t(started.dwHighDateTime) << 32) | started.dwLowDateTime;
    SYSTEM_INFO system; GetNativeSystemInfo(&system);
    const bool target64 = system.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64 && !wow64;
    if (std::wstring(argv[1]) == L"--probe") {
        emit("\"type\":\"target\",\"pid\":" + std::to_string(targetPid) + ",\"started\":" + quote(std::to_string(startTime)) + ",\"architecture\":" + quote(target64 ? "x64" : "x86") + ",\"executable\":" + quote(utf8(executable)));
        CloseHandle(process); return 0;
    }
    if (argc != 5 || std::wstring(argv[1]) != L"--attach" || targetPid != wcstoul(argv[3], nullptr, 10) || startTime != _wcstoui64(argv[4], nullptr, 10) || target64 != (sizeof(void *) == 8)) { CloseHandle(process); error("targetChanged"); return 3; }
    wchar_t self[32768]; GetModuleFileNameW(nullptr, self, 32768);
    auto root = std::filesystem::path(self).parent_path();
    const wchar_t *hostName = sizeof(void *) == 8 ? L"LunaHost64.dll" : L"LunaHost32.dll";
    const wchar_t *hookName = sizeof(void *) == 8 ? L"LunaHook64.dll" : L"LunaHook32.dll";
    HMODULE host = LoadLibraryExW((root / hostName).c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!host) { CloseHandle(process); error("hookUnavailable"); return 4; }
    auto start = reinterpret_cast<void (*)(decltype(&connected), decltype(&disconnected), decltype(&created), decltype(&removed), decltype(&text), decltype(&info), decltype(&inserted), decltype(&embed), decltype(&i18n), decltype(&emulator))>(GetProcAddress(host, "Luna_Start"));
    auto connect = reinterpret_cast<void (*)(DWORD)>(GetProcAddress(host, "Luna_ConnectProcess"));
    auto detach = reinterpret_cast<void (*)(DWORD)>(GetProcAddress(host, "Luna_DetachProcess"));
    auto needsInject = reinterpret_cast<bool (*)(DWORD)>(GetProcAddress(host, "Luna_CheckIfNeedInject"));
    auto settings = reinterpret_cast<void (*)(int,int,int,int,bool)>(GetProcAddress(host, "Luna_Settings"));
    auto insertHook = reinterpret_cast<void (*)(DWORD,const wchar_t *)>(GetProcAddress(host, "Luna_InsertHookCode"));
    if (!start || !connect || !detach || !needsInject || !settings || !insertHook) { error("hookUnavailable"); CloseHandle(process); return 4; }
    start(connected, disconnected, created, removed, text, info, inserted, embed, i18n, emulator);
    settings(100, 932, 16384, 16384, true);
    connect(targetPid);
    if (needsInject(targetPid)) {
        HANDLE injectable = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ, FALSE, targetPid);
        if (!injectable) { error("permissionDenied"); detach(targetPid); CloseHandle(process); return 5; }
        const std::wstring path = (root / hookName).wstring();
        const size_t bytes = (path.size() + 1) * sizeof(wchar_t);
        void *remote = VirtualAllocEx(injectable, nullptr, bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        HANDLE thread = nullptr;
        if (remote && WriteProcessMemory(injectable, remote, path.c_str(), bytes, nullptr)) thread = CreateRemoteThread(injectable, nullptr, 0, reinterpret_cast<LPTHREAD_START_ROUTINE>(GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW")), remote, 0, nullptr);
        const bool completed = thread && WaitForSingleObject(thread, 5000) == WAIT_OBJECT_0;
        DWORD loaded = 0; if (completed) GetExitCodeThread(thread, &loaded);
        // A timed-out loader may still read its argument; never free it underneath that thread.
        if (remote && (!thread || completed)) VirtualFreeEx(injectable, remote, 0, MEM_RELEASE);
        if (thread) CloseHandle(thread); CloseHandle(injectable);
        if (!completed || !loaded) { error(thread && !completed ? "injectionTimeout" : "injectionFailed"); detach(targetPid); CloseHandle(process); return 5; }
    }
    emit("\"type\":\"ready\"");
    std::string command;
    while (std::getline(std::cin, command)) {
        if (command == "stop") break;
        if (WaitForSingleObject(process, 0) == WAIT_OBJECT_0) break;
        if (command.size() > 1024) { error("invalidCommand"); break; }
        if (command.rfind("hook\t", 0) == 0) {
            const auto code = wide(command.substr(5));
            if (code.empty() || code.find_first_of(L"\r\n\t") != std::wstring::npos) { error("invalidCommand"); continue; }
            insertHook(targetPid, code.c_str());
        }
    }
    detach(targetPid); CloseHandle(process);
    // LunaHost owns callback threads until process exit; unloading it can race those callbacks.
    return 0;
}
