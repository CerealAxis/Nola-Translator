#include <atomic>
#include <thread>
#include <map>
#include <algorithm>
#include <vector>
#include <set>

static std::mutex embedMutex;
static std::map<std::string, ThreadParam> capable;
static std::string enabled, token;
static std::wstring original;
static ULONGLONG deadline;
static unsigned waitMs = 500;
static uint64_t sequence;
static std::atomic_bool cancelled{false};
static std::wstring decodeHex(const std::string &hex) {
    if (hex.empty() || hex.size() % 2 || hex.find_first_not_of("0123456789abcdef") != std::string::npos) return {};
    std::string bytes;
    for (size_t i = 0; i < hex.size(); i += 2) bytes.push_back(static_cast<char>(std::stoi(hex.substr(i, 2), nullptr, 16)));
    return wide(bytes);
}

static void searchText(std::wstring query, unsigned seconds) {
    HANDLE process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, targetPid);
    if (!process) { error("permissionDenied"); emit("\"type\":\"searchDone\""); return; }
    const auto until = GetTickCount64() + seconds * 1000;
    std::vector<std::pair<std::string, std::string>> needles{
        {"RQ", std::string(reinterpret_cast<const char *>(query.data()), query.size() * sizeof(wchar_t))},
        {"RV", utf8(query)}
    };
    BOOL replaced = FALSE;
    char sjis[1024];
    int length = WideCharToMultiByte(932, WC_NO_BEST_FIT_CHARS, query.data(), static_cast<int>(query.size()), sjis, sizeof(sjis), nullptr, &replaced);
    if (length && !replaced && needles[1].second != std::string(sjis, length)) needles.emplace_back("RS932#", std::string(sjis, length));
    std::set<std::string> found;
    const size_t chunk = 65536;
    std::vector<char> bytes(chunk + 1024);
    auto active = [&] { return !cancelled && found.size() < 64 && GetTickCount64() < until; };
    uintptr_t cursor = 0;
    MEMORY_BASIC_INFORMATION region{};
    while (active() && VirtualQueryEx(process, reinterpret_cast<void *>(cursor), &region, sizeof(region))) {
        auto base = reinterpret_cast<uintptr_t>(region.BaseAddress);
        auto end = base + region.RegionSize;
        if (end <= cursor) break;
        cursor = end;
        if (region.State != MEM_COMMIT || (region.Protect & PAGE_GUARD) ||
            !(region.Protect & (PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))) continue;
        for (size_t offset = 0; offset < region.RegionSize && active(); offset += chunk) {
            SIZE_T count = 0;
            ReadProcessMemory(process, reinterpret_cast<void *>(base + offset), bytes.data(), (std::min)(bytes.size(), static_cast<size_t>(region.RegionSize - offset)), &count);
            for (const auto &[prefix, needle] : needles) {
                auto from = bytes.begin(), last = bytes.begin() + count;
                while (active() && (from = std::search(from, last, needle.begin(), needle.end())) != last) {
                    auto index = static_cast<size_t>(from - bytes.begin());
                    if (index >= chunk) break;
                    std::ostringstream code; code << prefix << '@' << std::uppercase << std::hex << (base + offset + index);
                    if (found.insert(code.str()).second) emit("\"type\":\"candidate\",\"code\":" + quote(code.str()));
                    ++from;
                }
            }
        }
    }
    CloseHandle(process);
    emit("\"type\":\"searchDone\"");
}
static void embed(const wchar_t *text, ThreadParam tp) {
    std::lock_guard<std::mutex> lock(embedMutex);
    if (!text || !*text || wcsnlen_s(text, 16001) > 16000 || threadId(tp) != enabled) return;
    token = std::to_string(++sequence);
    original = text;
    deadline = GetTickCount64() + waitMs;
    emit("\"type\":\"embedRequest\",\"id\":" + quote(enabled) + ",\"token\":" + quote(token) + ",\"text\":" + quote(utf8(original)));
}
