#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <iostream>

static wchar_t dialogue[256] = L"Nola native hook fixture 日本語";
__declspec(noinline) static void displayDialogue(const wchar_t *value) {
    if (wcscmp(value, L"Expired translation") == 0) std::cout << "{\"expired\":true}\n" << std::flush;
    if (wcscmp(value, L"Nola embedded translation") == 0) std::cout << "{\"embedded\":true}\n" << std::flush;
}
static void (*volatile display)(const wchar_t *) = displayDialogue;

// An owned, hidden GDI target for injection/detach checks; never attaches to a user's application.
static LRESULT CALLBACK windowProcedure(HWND window, UINT message, WPARAM first, LPARAM second) {
    if (message == WM_TIMER) {
        HDC dc = GetDC(window);
        const wchar_t *text = dialogue;
        display(text);
        TextOutW(dc, 4, 4, text, lstrlenW(text));
        ReleaseDC(window, dc);
        return 0;
    }
    return DefWindowProcW(window, message, first, second);
}
int main() {
    WNDCLASSW type{}; type.lpfnWndProc = windowProcedure; type.hInstance = GetModuleHandleW(nullptr); type.lpszClassName = L"NolaHookFixture";
    if (!RegisterClassW(&type)) return 1;
    HWND window = CreateWindowW(type.lpszClassName, L"Nola Hook Fixture", WS_OVERLAPPEDWINDOW, 0, 0, 300, 200, nullptr, nullptr, type.hInstance, nullptr);
    if (!window) return 1;
    std::cout << "{\"handle\":\"" << reinterpret_cast<uintptr_t>(window) << "\",\"offset\":\"" << std::hex << (reinterpret_cast<uintptr_t>(displayDialogue) - reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr))) << "\"}\n" << std::flush;
    SetTimer(window, 1, 200, nullptr);
    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    return 0;
}
