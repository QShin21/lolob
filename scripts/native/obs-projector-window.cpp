#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cwctype>
#include <iostream>
#include <limits>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

// Only the caller's explicitly identified OBS process and its exact projector
// titles are eligible. No main OBS window, other app, or process is changed.
namespace {
struct Window { HWND handle; std::wstring title; std::wstring kind; RECT rect; bool visible; bool iconic; };
struct Args { std::wstring action; std::map<std::wstring, std::wstring> options; };
std::string utf8(const std::wstring &value) {
    if (value.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (!size) throw std::runtime_error("invalid_unicode");
    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
    return result;
}
std::string jsonString(const std::wstring &value) {
    std::string result = "\"";
    for (const unsigned char ch : utf8(value)) {
        if (ch == '\\' || ch == '"') { result += '\\'; result += static_cast<char>(ch); }
        else if (ch < 32) { const char *hex = "0123456789abcdef"; result += "\\u00"; result += hex[ch >> 4]; result += hex[ch & 15]; }
        else result += static_cast<char>(ch);
    }
    return result + "\"";
}
std::wstring kindFor(const std::wstring &title) {
    // OBS 32.2.2 OBSProjector::UpdateProjectorTitle and bundled locales.
    if (title == L"投影 - 输出" || title == L"Projector - Program" ||
        title == L"投影 - 源：RiftCast 节目" || title == L"Projector - Source: RiftCast 节目" ||
        title == L"投影 - 场景：RiftCast 节目" || title == L"Projector - Scene: RiftCast 节目") return L"program";
    if (title == L"投影 - 预览" || title == L"Projector - Preview" ||
        title == L"投影 - 源：RiftCast 预监" || title == L"Projector - Source: RiftCast 预监" ||
        title == L"投影 - 场景：RiftCast 预监" || title == L"Projector - Scene: RiftCast 预监") return L"preview";
    return {};
}
std::wstring windowTitle(HWND hwnd) {
    const int size = GetWindowTextLengthW(hwnd);
    if (size < 1 || size > 1024) return {};
    std::wstring value(size + 1, L'\0');
    const int copied = GetWindowTextW(hwnd, value.data(), size + 1);
    value.resize(std::max(0, copied));
    return value;
}
std::uint64_t number(const std::wstring &value, std::uint64_t maximum) {
    if (value.empty() || !std::all_of(value.begin(), value.end(), [](wchar_t c) { return c >= L'0' && c <= L'9'; })) throw std::runtime_error("invalid_number");
    errno = 0; wchar_t *end = nullptr;
    const auto result = wcstoull(value.c_str(), &end, 10);
    if (errno == ERANGE || *end || !result || result > maximum) throw std::runtime_error("invalid_number");
    return result;
}
Args parse(int count, wchar_t **values) {
    if (count < 2) throw std::runtime_error("missing_action");
    Args result {values[1], {}};
    for (int i = 2; i < count; i += 2) {
        if (i + 1 >= count || std::wstring(values[i]).rfind(L"--", 0) != 0 || !result.options.emplace(values[i], values[i + 1]).second) throw std::runtime_error("invalid_arguments");
    }
    return result;
}
std::wstring required(const Args &args, const std::wstring &name) {
    auto found = args.options.find(name);
    if (found == args.options.end()) throw std::runtime_error("missing_argument");
    return found->second;
}
std::uint64_t numeric(const Args &args, const std::wstring &name, std::uint64_t maximum) { return number(required(args, name), maximum); }
DWORD processId(const Args &args) { return static_cast<DWORD>(numeric(args, L"--pid", 2147483647)); }
HWND handle(const Args &args, const std::wstring &name) { return reinterpret_cast<HWND>(static_cast<std::uintptr_t>(numeric(args, name, std::numeric_limits<std::uintptr_t>::max()))); }
std::uint64_t decimal(HWND hwnd) { return static_cast<std::uint64_t>(reinterpret_cast<std::uintptr_t>(hwnd)); }
std::wstring executable(DWORD pid) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) throw std::runtime_error("process_unavailable");
    std::wstring file(32768, L'\0'); DWORD size = static_cast<DWORD>(file.size());
    const bool success = QueryFullProcessImageNameW(process, 0, file.data(), &size) != FALSE;
    CloseHandle(process);
    if (!success) throw std::runtime_error("process_unavailable");
    file.resize(size);
    auto slash = file.find_last_of(L"\\/");
    if (slash != std::wstring::npos) file.erase(0, slash + 1);
    std::transform(file.begin(), file.end(), file.begin(), [](wchar_t ch) { return std::towlower(ch); });
    return file;
}
void requireObs(DWORD pid) { if (executable(pid) != L"obs64.exe") throw std::runtime_error("process_is_not_obs"); }
std::wstring requestedKind(const Args &args, bool optional = false) {
    auto found = args.options.find(L"--kind");
    if (found == args.options.end() && optional) return {};
    const auto value = required(args, L"--kind");
    if (value != L"program" && value != L"preview") throw std::runtime_error("invalid_kind");
    return value;
}
struct Enumeration { DWORD pid; std::wstring kind; std::vector<Window> windows; };
BOOL CALLBACK enumerate(HWND hwnd, LPARAM data) {
    auto &result = *reinterpret_cast<Enumeration *>(data);
    DWORD pid = 0; GetWindowThreadProcessId(hwnd, &pid);
    if (pid != result.pid) return TRUE;
    const auto title = windowTitle(hwnd), kind = kindFor(title);
    if (kind.empty() || (!result.kind.empty() && result.kind != kind)) return TRUE;
    RECT rect {}; GetWindowRect(hwnd, &rect);
    result.windows.push_back({hwnd, title, kind, rect, IsWindowVisible(hwnd) != FALSE, IsIconic(hwnd) != FALSE});
    return TRUE;
}
BOOL CALLBACK enumerateTree(HWND hwnd, LPARAM data) {
    enumerate(hwnd, data);
    EnumChildWindows(hwnd, enumerate, data);
    return TRUE;
}
Window requireWindow(HWND hwnd, DWORD pid, const std::wstring &kind, bool allowChild = false, HWND expectedHost = nullptr) {
    if (!IsWindow(hwnd) || (!allowChild && GetAncestor(hwnd, GA_ROOT) != hwnd)) throw std::runtime_error("invalid_projector_window");
    if (allowChild && (GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_CHILD) && expectedHost && GetParent(hwnd) != expectedHost) throw std::runtime_error("projector_parent_mismatch");
    DWORD actualPid = 0; GetWindowThreadProcessId(hwnd, &actualPid);
    const auto title = windowTitle(hwnd), actualKind = kindFor(title);
    if (actualPid != pid || actualKind.empty() || actualKind != kind) throw std::runtime_error("projector_identity_mismatch");
    RECT rect {}; GetWindowRect(hwnd, &rect);
    return {hwnd, title, kind, rect, IsWindowVisible(hwnd) != FALSE, IsIconic(hwnd) != FALSE};
}
void printWindow(const Window &window) {
    // A decimal string preserves HWND bits in JavaScript and matches Electron's
    // desktopCapturer source id: window:<decimal HWND>:0.
    std::cout << "{\"hwnd\":\"" << decimal(window.handle) << "\",\"ownerHwnd\":\"" << decimal(GetWindow(window.handle, GW_OWNER)) << "\",\"title\":" << jsonString(window.title)
              << ",\"kind\":" << jsonString(window.kind) << ",\"visible\":" << (window.visible ? "true" : "false")
              << ",\"minimized\":" << (window.iconic ? "true" : "false")
              << ",\"style\":" << static_cast<DWORD>(GetWindowLongPtrW(window.handle, GWL_STYLE))
              << ",\"exStyle\":" << static_cast<DWORD>(GetWindowLongPtrW(window.handle, GWL_EXSTYLE))
              << ",\"x\":" << window.rect.left << ",\"y\":" << window.rect.top
              << ",\"width\":" << window.rect.right - window.rect.left << ",\"height\":" << window.rect.bottom - window.rect.top << "}";
}
void setStyle(HWND hwnd, int index, LONG_PTR value) {
    if (GetWindowLongPtrW(hwnd, index) == value) return;
    SetLastError(ERROR_SUCCESS);
    if (!SetWindowLongPtrW(hwnd, index, value) && GetLastError() != ERROR_SUCCESS) throw std::runtime_error("window_style_failed_" + std::to_string(index) + "_" + std::to_string(GetLastError()));
}
HWND requireHost(const Args &args, DWORD pid) {
    const HWND host = handle(args, L"--host-hwnd");
    const DWORD hostPid = static_cast<DWORD>(numeric(args, L"--host-pid", 2147483647));
    DWORD actualHostPid = 0; GetWindowThreadProcessId(host, &actualHostPid);
    if (!IsWindow(host) || GetAncestor(host, GA_ROOT) != host || actualHostPid != hostPid || hostPid == pid || !IsWindowVisible(host) || IsIconic(host)) throw std::runtime_error("invalid_host_window");
    const auto hostExe = executable(hostPid);
    if (hostExe != L"electron.exe" && hostExe != L"riftcast.exe" && hostExe != L"riftcast-director.exe") throw std::runtime_error("host_is_not_director");
    return host;
}
int coordinate(const Args &args, const std::wstring &name) {
    const auto value = required(args, name);
    return value == L"0" ? 0 : static_cast<int>(number(value, 16384));
}
void embed(const Args &args, DWORD pid, const std::wstring &kind) {
    const HWND host = requireHost(args, pid);
    const HWND hwnd = handle(args, L"--hwnd");
    const auto target = requireWindow(hwnd, pid, kind, true, host);
    if (!target.visible || target.iconic) throw std::runtime_error("projector_must_be_normal");
    const int x = coordinate(args, L"--x");
    int y = coordinate(args, L"--y");
    const int width = static_cast<int>(numeric(args, L"--width", 7680));
    const int height = static_cast<int>(numeric(args, L"--height", 4320));
    RECT client {};
    if (!GetClientRect(host, &client)) throw std::runtime_error("embed_host_bounds_unavailable");
    int topInset = 0;
    const bool hasViewportWidth = args.options.count(L"--viewport-width") != 0;
    const bool hasViewportHeight = args.options.count(L"--viewport-height") != 0;
    if (hasViewportWidth != hasViewportHeight) throw std::runtime_error("embed_viewport_dimensions_required");
    if (hasViewportWidth) {
        const int viewportWidth = static_cast<int>(numeric(args, L"--viewport-width", 16384));
        const int viewportHeight = static_cast<int>(numeric(args, L"--viewport-height", 16384));
        if (viewportWidth > client.right + 1 || viewportHeight > client.bottom + 1) throw std::runtime_error("embed_viewport_outside_host");
        topInset = std::max(0, static_cast<int>(client.bottom) - viewportHeight);
        y += topInset;
    }
    if (width < 16 || height < 16 || x + width > client.right || y + height > client.bottom) throw std::runtime_error("embed_bounds_outside_host");
    const auto previousStyle = GetWindowLongPtrW(hwnd, GWL_STYLE);
    const auto previousEx = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    const HWND previousParent = GetParent(hwnd);
    try {
        setStyle(hwnd, GWL_STYLE, (previousStyle & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU)) | WS_CHILD | WS_CLIPSIBLINGS);
        setStyle(hwnd, GWL_EXSTYLE, (previousEx & ~(WS_EX_APPWINDOW | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE)) | WS_EX_NOACTIVATE);
        if (GetParent(hwnd) != host) {
            SetLastError(ERROR_SUCCESS);
            if (!SetParent(hwnd, host) && GetLastError() != ERROR_SUCCESS) throw std::runtime_error("window_parent_failed_" + std::to_string(GetLastError()));
        }
        if (!SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_NOACTIVATE | SWP_FRAMECHANGED)) throw std::runtime_error("window_embed_position_failed");
        // The projector is a monitor surface. Disable its OBS context-menu and
        // mouse handlers while preserving the native display and Qt lifetime.
        EnableWindow(hwnd, FALSE);
    } catch (...) {
        SetParent(hwnd, previousParent);
        SetWindowLongPtrW(hwnd, GWL_STYLE, previousStyle);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, previousEx);
        SetWindowPos(hwnd, nullptr, target.rect.left, target.rect.top, target.rect.right - target.rect.left, target.rect.bottom - target.rect.top, SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED);
        throw;
    }
    std::cout << "{\"embedded\":true,\"hwnd\":\"" << decimal(hwnd) << "\",\"hostHwnd\":\"" << decimal(host) << "\",\"title\":" << jsonString(target.title) << ",\"kind\":" << jsonString(kind)
              << ",\"x\":" << x << ",\"y\":" << y << ",\"width\":" << width << ",\"height\":" << height << ",\"topInset\":" << topInset << "}\n";
}
void park(const Args &args, DWORD pid, const std::wstring &kind) {
    const HWND hwnd = handle(args, L"--hwnd");
    const auto target = requireWindow(hwnd, pid, kind);
    if (!target.visible || target.iconic) throw std::runtime_error("projector_must_be_normal");
    const HWND host = requireHost(args, pid);
    const int width = static_cast<int>(numeric(args, L"--width", 1920));
    const int height = static_cast<int>(numeric(args, L"--height", 1080));
    if (width < 64 || height < 64) throw std::runtime_error("invalid_dimensions");
    RECT client {}; POINT origin {};
    if (!GetClientRect(host, &client) || !ClientToScreen(host, &origin) || client.right - client.left < width || client.bottom - client.top < height) throw std::runtime_error("host_too_small");
    const int x = origin.x + (client.right - client.left - width) / 2;
    const int y = origin.y + (client.bottom - client.top - height) / 2;
    const LONG_PTR previousStyle = GetWindowLongPtrW(hwnd, GWL_STYLE);
    const LONG_PTR previousEx = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    const LONG_PTR previousOwner = GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT);
    const auto modeOption = args.options.find(L"--style-mode");
    const auto styleMode = modeOption == args.options.end() ? L"original" : modeOption->second;
    if (styleMode != L"original" && styleMode != L"borderless" && styleMode != L"quiet" && styleMode != L"tool") throw std::runtime_error("invalid_style_mode");
    // Keep a normal on-screen native swapchain. Minimize/hide/off-screen parking
    // would prevent reliable live capture. Optional modes isolate WGC style
    // compatibility; the original mode changes only geometry and z-order.
    try {
        if (styleMode != L"original") {
            setStyle(hwnd, GWL_STYLE, (previousStyle & ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU)) | WS_POPUP);
        }
        if (styleMode == L"tool") {
            // The tool mode is optional: preserve original styles when testing
            // Windows Graphics Capture compatibility with a fresh projector.
            setStyle(hwnd, GWLP_HWNDPARENT, 0);
            setStyle(hwnd, GWL_EXSTYLE, (previousEx & ~(WS_EX_APPWINDOW | WS_EX_TOPMOST)) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
        } else if (styleMode == L"quiet") {
            // The combined TOOLWINDOW/NOACTIVATE mode rejected WGC on the
            // tested host. This optional mode isolates NOACTIVATE alone.
            setStyle(hwnd, GWL_EXSTYLE, (previousEx & ~(WS_EX_TOOLWINDOW | WS_EX_TOPMOST)) | WS_EX_NOACTIVATE);
        }
        if (!SetWindowPos(hwnd, HWND_NOTOPMOST, x, y, width, height, SWP_NOACTIVATE | SWP_FRAMECHANGED)) throw std::runtime_error("window_position_failed");
        // Inserting immediately after the director places the entire projector
        // behind its client area without changing which app has keyboard focus.
        if (!SetWindowPos(hwnd, host, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE)) throw std::runtime_error("window_zorder_failed");
    } catch (...) {
        SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, previousOwner);
        SetWindowLongPtrW(hwnd, GWL_STYLE, previousStyle);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, previousEx);
        SetWindowPos(hwnd, nullptr, target.rect.left, target.rect.top, target.rect.right - target.rect.left, target.rect.bottom - target.rect.top, SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED);
        throw;
    }
    std::cout << "{\"parked\":true,\"hwnd\":\"" << decimal(hwnd) << "\",\"title\":" << jsonString(target.title) << ",\"kind\":" << jsonString(kind) << ",\"styleMode\":" << jsonString(styleMode)
              << ",\"x\":" << x << ",\"y\":" << y << ",\"width\":" << width << ",\"height\":" << height << "}\n";
}
void selfTest() {
    if (kindFor(L"投影 - 输出") != L"program" || kindFor(L"Projector - Preview") != L"preview" || !kindFor(L"OBS Studio").empty() || !kindFor(L"Projector - Source: unrelated").empty() || number(L"4294967297", UINT64_MAX) != 4294967297ull) throw std::runtime_error("self_test_failed");
    for (const auto &value : {L"0", L"-1", L"1.2", L"1abc", L"18446744073709551616"}) {
        bool rejected = false;
        try { number(value, UINT64_MAX); } catch (...) { rejected = true; }
        if (!rejected) throw std::runtime_error("self_test_failed");
    }
    std::cout << "{\"ok\":true,\"checks\":9}\n";
}
}

int wmain(int argc, wchar_t **argv) {
    try {
        SetProcessDPIAware();
        const auto args = parse(argc, argv);
        if (args.action == L"self-test") { selfTest(); return 0; }
        if (args.action != L"list" && args.action != L"find" && args.action != L"park" && args.action != L"embed" && args.action != L"position" && args.action != L"close") throw std::runtime_error("invalid_action");
        const auto pid = processId(args);
        requireObs(pid);
        const auto kind = requestedKind(args, args.action == L"list");
        if (args.action == L"list" || args.action == L"find") {
            Enumeration result {pid, kind, {}};
            if (!EnumWindows(enumerateTree, reinterpret_cast<LPARAM>(&result))) throw std::runtime_error("enumeration_failed");
            std::cout << "{\"obsProcessId\":" << pid << ",\"windows\":[";
            for (std::size_t i = 0; i < result.windows.size(); ++i) { if (i) std::cout << ','; printWindow(result.windows[i]); }
            std::cout << "]}\n";
        } else if (args.action == L"park") park(args, pid, kind);
        else if (args.action == L"embed" || args.action == L"position") embed(args, pid, kind);
        else {
            const auto hwnd = handle(args, L"--hwnd");
            if (!IsWindow(hwnd)) { std::cout << "{\"closed\":true,\"alreadyClosed\":true}\n"; return 0; }
            requireWindow(hwnd, pid, kind, true);
            // Asynchronous close allows Qt to tear down its native OBS display
            // in its own UI thread. It never terminates the OBS process.
            if (!PostMessageW(hwnd, WM_CLOSE, 0, 0)) throw std::runtime_error("window_close_failed");
            // Release is serialized before the next acquisition by Electron.
            // Wait briefly for Qt teardown so a following find cannot reuse a
            // window that is already queued for destruction.
            const auto deadline = GetTickCount64() + 500;
            bool pending = true;
            while (GetTickCount64() < deadline) {
                DWORD currentPid = 0;
                GetWindowThreadProcessId(hwnd, &currentPid);
                if (!IsWindow(hwnd) || currentPid != pid || kindFor(windowTitle(hwnd)) != kind) { pending = false; break; }
                Sleep(10);
            }
            std::cout << "{\"closed\":" << (pending ? "false" : "true") << ",\"closeRequested\":true,\"pending\":" << (pending ? "true" : "false") << ",\"hwnd\":\"" << decimal(hwnd) << "\"}\n";
        }
        return 0;
    } catch (const std::exception &error) { std::cout << "{\"error\":\"" << error.what() << "\"}\n"; return 1; }
}
