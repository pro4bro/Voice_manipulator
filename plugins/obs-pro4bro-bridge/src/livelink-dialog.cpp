#include "livelink-dialog.h"
#include "livelink-mixer.h"
#include "livelink-capture.h"
#include "livelink-spool.h"

#include <obs-module.h>
#include <obs-frontend-api.h>

#include <windows.h>
#include <objbase.h>
#include <shellapi.h>
#include <winhttp.h>
#include <commctrl.h>
#include <bcrypt.h>
#include <uxtheme.h>
#include <dwmapi.h>
#include <util/platform.h>

#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include <thread>
#include <array>
#include <algorithm>
#include <map>
#include <memory>
#include <set>
#include <vector>
#include <deque>
#include <filesystem>
#include <iomanip>
#include <sstream>

namespace {
constexpr UINT STATUS_CHANGED = WM_APP + 37;
constexpr UINT COMMAND_READY = WM_APP + 38;
constexpr int OPEN_APP = 101;
constexpr int FIRST_FORWARD = 200;
constexpr int FIRST_ALIAS = 300;
constexpr int VISIBLE_ROWS = 5;
constexpr int ROW_HEIGHT = 68;
constexpr int FIRST_ROW_TOP = 237;
constexpr int CLIENT_WIDTH = 680;
constexpr int CLIENT_HEIGHT = 642;
constexpr wchar_t WINDOW_CLASS[] = L"Pro4BroLiveLinkDialog";

struct Palette {
	COLORREF background, header, panel, row, input, border, text, muted, accent, meter, meter_empty;
};

Palette palette(bool dark)
{
	if (dark) return {RGB(24, 24, 27), RGB(32, 32, 36), RGB(37, 37, 41), RGB(43, 43, 47),
		RGB(29, 29, 32), RGB(75, 75, 80), RGB(240, 240, 242), RGB(172, 172, 179),
		RGB(75, 145, 235), RGB(90, 183, 104), RGB(63, 63, 68)};
	return {RGB(244, 244, 246), RGB(255, 255, 255), RGB(255, 255, 255), RGB(255, 255, 255),
		RGB(255, 255, 255), RGB(204, 204, 210), RGB(32, 32, 36), RGB(103, 103, 110),
		RGB(28, 112, 208), RGB(61, 161, 80), RGB(223, 223, 227)};
}

void fill_box(HDC dc, RECT rect, COLORREF color, COLORREF border, int radius)
{
	HBRUSH brush = CreateSolidBrush(color);
	HPEN pen = CreatePen(PS_SOLID, 1, border);
	HGDIOBJ old_brush = SelectObject(dc, brush);
	HGDIOBJ old_pen = SelectObject(dc, pen);
	RoundRect(dc, rect.left, rect.top, rect.right, rect.bottom, radius, radius);
	SelectObject(dc, old_pen);
	SelectObject(dc, old_brush);
	DeleteObject(pen);
	DeleteObject(brush);
}

std::wstring wide(const std::string &text)
{
	if (text.empty()) return {};
	int length = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, nullptr, 0);
	std::wstring output(static_cast<size_t>(length), L'\0');
	MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, output.data(), length);
	output.pop_back();
	return output;
}

std::string utf8(const std::wstring &text)
{
	int length = WideCharToMultiByte(CP_UTF8, 0, text.c_str(), -1, nullptr, 0, nullptr, nullptr);
	std::string output(static_cast<size_t>(length), '\0');
	WideCharToMultiByte(CP_UTF8, 0, text.c_str(), -1, output.data(), length, nullptr, nullptr);
	output.pop_back();
	return output;
}

std::string new_uuid()
{
	GUID guid{};
	if (CoCreateGuid(&guid) != S_OK) return {};
	wchar_t text[40]{};
	StringFromGUID2(guid, text, 40);
	std::wstring value(text);
	return utf8(value.substr(1, value.size() - 2));
}

struct Pairing {
	std::string install_id, token, api_base;
	std::wstring launcher;
};

Pairing read_pairing()
{
	Pairing result;
	char *path = obs_module_config_path("livelink-install.json");
	if (!path) return result;
	obs_data_t *data = obs_data_create_from_json_file(path);
	bfree(path);
	if (!data) return result;
	result.install_id = obs_data_get_string(data, "installId");
	result.token = obs_data_get_string(data, "token");
	result.api_base = obs_data_get_string(data, "apiBase");
	result.launcher = wide(obs_data_get_string(data, "launcherPath"));
	obs_data_release(data);
	while (!result.api_base.empty() && result.api_base.back() == '/') result.api_base.pop_back();
	// Pairing metadata is local; never let a changed file send its token off-machine.
	if (result.api_base != "http://127.0.0.1:18120" && result.api_base != "http://localhost:18120")
		result = {};
	return result;
}

struct Reply { DWORD status{}; std::string body; };

Reply request(const Pairing &pairing, const wchar_t *method, const char *path,
	const std::string &body = {}, const wchar_t *content_type = L"application/json")
{
	Reply result;
	const std::wstring url = wide(pairing.api_base + path);
	URL_COMPONENTS parts{};
	parts.dwStructSize = sizeof(parts);
	parts.dwHostNameLength = parts.dwUrlPathLength = parts.dwExtraInfoLength = static_cast<DWORD>(-1);
	if (!WinHttpCrackUrl(url.c_str(), 0, 0, &parts)) return result;
	HINTERNET session = WinHttpOpen(L"Pro4Bro LiveLink/0.6", WINHTTP_ACCESS_TYPE_NO_PROXY,
		WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
	if (!session) return result;
	WinHttpSetTimeouts(session, 1000, 1000, 1500, 1500);
	HINTERNET connection = WinHttpConnect(session, std::wstring(parts.lpszHostName, parts.dwHostNameLength).c_str(), parts.nPort, 0);
	if (connection) {
		std::wstring route(parts.lpszUrlPath, parts.dwUrlPathLength);
		if (parts.dwExtraInfoLength) route.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
		HINTERNET handle = WinHttpOpenRequest(connection, method,
			route.c_str(), nullptr,
			WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
		if (handle) {
			const std::wstring headers = L"Content-Type: " + std::wstring(content_type) +
				L"\r\nAuthorization: Bearer " + wide(pairing.token) + L"\r\n";
			if (WinHttpSendRequest(handle, headers.c_str(), static_cast<DWORD>(-1L),
				const_cast<char *>(body.data()), static_cast<DWORD>(body.size()), static_cast<DWORD>(body.size()), 0) &&
				WinHttpReceiveResponse(handle, nullptr)) {
				DWORD size = sizeof(result.status);
				WinHttpQueryHeaders(handle, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
					WINHTTP_HEADER_NAME_BY_INDEX, &result.status, &size, WINHTTP_NO_HEADER_INDEX);
				for (;;) {
					DWORD available = 0;
					if (!WinHttpQueryDataAvailable(handle, &available) || !available) break;
					size_t offset = result.body.size();
					result.body.resize(offset + available);
					DWORD read = 0;
					if (!WinHttpReadData(handle, result.body.data() + offset, available, &read)) break;
					result.body.resize(offset + read);
				}
			}
			WinHttpCloseHandle(handle);
		}
		WinHttpCloseHandle(connection);
	}
	WinHttpCloseHandle(session);
	return result;
}

std::string sha256(const std::vector<int16_t> &pcm)
{
	BCRYPT_ALG_HANDLE algorithm = nullptr;
	BCRYPT_HASH_HANDLE hash = nullptr;
	DWORD object_size = 0, bytes = 0;
	std::vector<UCHAR> object, digest(32);
	if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return {};
	if (BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&object_size),
		sizeof(object_size), &bytes, 0) < 0) goto done;
	object.resize(object_size);
	if (BCryptCreateHash(algorithm, &hash, object.data(), object_size, nullptr, 0, 0) < 0) goto done;
	if (BCryptHashData(hash, reinterpret_cast<PUCHAR>(const_cast<int16_t *>(pcm.data())),
		static_cast<ULONG>(pcm.size() * sizeof(int16_t)), 0) < 0) goto done;
	if (BCryptFinishHash(hash, digest.data(), static_cast<ULONG>(digest.size()), 0) < 0) digest.clear();
done:
	if (hash) BCryptDestroyHash(hash);
	if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
	std::ostringstream out;
	for (UCHAR value : digest) out << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(value);
	return out.str();
}

Reply send_chunk(const Pairing &pairing, const std::string &install_id,
	const std::string &connection_id, const std::string &epoch,
	const LiveLinkAudioChunk &chunk)
{
	std::string route = "/api/obs-livelink/v3/recordings/" + chunk.recording_id +
		"/channels/" + chunk.channel_id + "/chunks/" + std::to_string(chunk.sequence) +
		"?installId=" + install_id + "&connectionId=" + connection_id +
		"&epoch=" + epoch + "&sourceUuid=" + chunk.source_uuid +
		"&firstSampleIndex=" + std::to_string(chunk.first_sample_index) +
		"&frameCount=" + std::to_string(chunk.frames) +
		"&sampleRate=" + std::to_string(chunk.sample_rate) +
		"&channels=" + std::to_string(chunk.channels) +
		"&obsAudioTimestampNs=" + std::to_string(chunk.obs_timestamp_ns) +
		"&pluginMonotonicNs=" + std::to_string(chunk.plugin_monotonic_ns) +
		"&sha256=" + sha256(chunk.pcm);
	std::string body(reinterpret_cast<const char *>(chunk.pcm.data()), chunk.pcm.size() * sizeof(int16_t));
	return request(pairing, L"PUT", route.c_str(), body, L"application/octet-stream");
}

std::string field(obs_data_t *data, const char *name)
{
	return obs_data_get_string(data, name);
}

class Dialog {
public:
	void start()
	{
		INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_PROGRESS_CLASS};
		InitCommonControlsEx(&controls);
		mixer_ = std::make_unique<LiveLinkMixer>();
		process_id_ = new_uuid();
		active_ = true;
		obs_frontend_add_tools_menu_item("Pro4Bro Voice Manipulator LiveLink", show, this);
		show_window(false);
		worker_ = std::thread([this] { run(); });
	}

	void stop()
	{
		active_ = false;
		capture_.finish_at(os_gettime_ns());
		if (worker_.joinable()) worker_.join();
		scene_collection_changing();
		if (window_) DestroyWindow(window_);
		window_ = nullptr;
		mixer_.reset();
	}

	void scene_collection_changing()
	{
		collection_changing_ = true;
		capture_.stop();
		if (mixer_) mixer_->suspend();
	}

	void scene_collection_changed()
	{
		collection_changing_ = false;
	}

	void recording_state(bool active, bool paused)
	{
		recording_active_ = active;
		recording_paused_ = paused;
	}

	void recording_event(const char *kind)
	{
		if (!kind || !active_) return;
		std::string event_kind(kind);
		if (event_kind == "obs-start") span_id_ = new_uuid();
		if (span_id_.empty()) return;
		obs_data_t *event = obs_data_create();
		obs_data_set_string(event, "processInstanceId", process_id_.c_str());
		obs_data_set_string(event, "eventId", new_uuid().c_str());
		obs_data_set_int(event, "sequence", next_event_sequence_++);
		obs_data_set_string(event, "kind", kind);
		obs_data_set_int(event, "monotonicNs", static_cast<long long>(os_gettime_ns()));
		obs_data_set_string(event, "spanId", span_id_.c_str());
		if (event_kind == "obs-stop" && connect_recording_folder_) {
			char *last_recording = obs_frontend_get_last_recording();
			if (last_recording) {
				const std::string folder = std::filesystem::path(last_recording).parent_path().string();
				obs_data_set_string(event, "recordingFolder", folder.c_str());
				obs_data_set_string(event, "lastRecordingPath", last_recording);
			}
			if (last_recording) bfree(last_recording);
		}
		{
			std::lock_guard lock(mutex_);
			events_.emplace_back(obs_data_get_json(event));
		}
		obs_data_release(event);
		if (event_kind == "obs-stop") span_id_.clear();
	}

private:
	std::atomic<bool> active_{false};
	std::atomic<bool> collection_changing_{false};
	std::atomic<bool> open_requested_{false};
	std::atomic<bool> recording_active_{false}, recording_paused_{false};
	std::atomic<bool> connect_recording_folder_{false};
	std::thread worker_;
	std::mutex mutex_;
	std::atomic<HWND> window_{nullptr};
	UINT dpi_{96};
	bool dark_{};
	Palette colors_ = palette(false);
	HBRUSH background_brush_{}, panel_brush_{}, row_brush_{}, input_brush_{};
	HFONT body_font_{}, bold_font_{}, title_font_{}, small_font_{};
	std::array<HWND, 3> status_titles_{};
	HWND connection_label_{}, project_label_{}, recording_label_{};
	HWND collection_label_{}, count_label_{}, open_button_{};
	struct Strip { HWND name{}, meter{}, forward{}, alias{}; int level{}; std::string uuid; };
	std::array<Strip, VISIBLE_ROWS> strips_{};
	std::unique_ptr<LiveLinkMixer> mixer_;
	LiveLinkCapture capture_;
	std::vector<MixerRow> rows_;
	int scroll_{};
	int timer_ticks_{};
	std::wstring connection_text_ = L"Connecting";
	std::wstring project_text_ = L"No active project";
	std::wstring recording_text_ = L"Idle";
	std::string process_id_, connection_id_, epoch_;
	std::string current_epoch_;
	std::string inventory_json_ = "{}";
	std::vector<std::string> queued_commands_;
	std::set<std::string> queued_ids_;
	std::map<std::string, std::string> acknowledged_;
	std::deque<std::string> events_;
	std::string span_id_;
	int64_t next_event_sequence_{};

	static void show(void *opaque)
	{
		blog(LOG_INFO, "[Pro4Bro] LiveLink Tools dialog requested");
		static_cast<Dialog *>(opaque)->show_window();
	}

	void show_window(bool visible = true)
	{
		if (window_ && IsWindow(window_)) {
			if (visible) {
				ShowWindow(window_, SW_SHOWNORMAL);
				SetForegroundWindow(window_);
			}
			return;
		}
		WNDCLASSW cls{};
		cls.lpfnWndProc = window_proc;
		cls.hInstance = GetModuleHandleW(nullptr);
		cls.lpszClassName = WINDOW_CLASS;
		cls.hCursor = LoadCursorW(nullptr, IDC_ARROW);
		cls.hbrBackground = nullptr;
		RegisterClassW(&cls);
		HWND parent = reinterpret_cast<HWND>(obs_frontend_get_main_window_handle());
		const UINT dpi = parent ? GetDpiForWindow(parent) : GetDpiForSystem();
		constexpr DWORD style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_VSCROLL;
		RECT bounds{0, 0, MulDiv(CLIENT_WIDTH, dpi, 96), MulDiv(CLIENT_HEIGHT, dpi, 96)};
		AdjustWindowRectExForDpi(&bounds, style, FALSE, WS_EX_APPWINDOW, dpi);
		window_ = CreateWindowExW(WS_EX_APPWINDOW, WINDOW_CLASS, L"Pro4Bro Voice Manipulator LiveLink",
			style, CW_USEDEFAULT, CW_USEDEFAULT, bounds.right - bounds.left,
			bounds.bottom - bounds.top, parent, nullptr, cls.hInstance, this);
		if (window_) {
			blog(LOG_INFO, "[Pro4Bro] LiveLink dialog opened");
			if (visible) {
				ShowWindow(window_, SW_SHOW);
				UpdateWindow(window_);
			}
		} else {
			blog(LOG_ERROR, "[Pro4Bro] LiveLink dialog creation failed: %lu", GetLastError());
		}
	}

	int px(int value) const { return MulDiv(value, static_cast<int>(dpi_), 96); }

	static LRESULT CALLBACK control_proc(HWND control, UINT message, WPARAM wparam, LPARAM lparam,
		UINT_PTR, DWORD_PTR context)
	{
		auto *self = reinterpret_cast<Dialog *>(context);
		if (message == WM_KEYDOWN && wparam == VK_TAB) {
			std::vector<HWND> order;
			for (const auto &strip : self->strips_) {
				if (IsWindowVisible(strip.forward) && IsWindowEnabled(strip.forward)) order.push_back(strip.forward);
				if (IsWindowVisible(strip.alias) && IsWindowEnabled(strip.alias)) order.push_back(strip.alias);
			}
			order.push_back(self->open_button_);
			auto at = std::find(order.begin(), order.end(), control);
			if (at != order.end()) {
				int offset = (GetKeyState(VK_SHIFT) & 0x8000) ? -1 : 1;
				int index = static_cast<int>(at - order.begin());
				SetFocus(order[(index + offset + static_cast<int>(order.size())) % order.size()]);
			}
			return 0;
		}
		if (message == WM_KEYDOWN && wparam == VK_ESCAPE) {
			ShowWindow(self->window_, SW_HIDE);
			return 0;
		}
		if (message == WM_NCDESTROY) RemoveWindowSubclass(control, control_proc, 1);
		return DefSubclassProc(control, message, wparam, lparam);
	}

	void create_controls()
	{
		HWND window = window_;
		for (int i = 0; i < 3; ++i) {
			const wchar_t *titles[] = {L"Connection", L"Active project", L"OBS recording"};
			status_titles_[i] = CreateWindowW(L"STATIC", titles[i], WS_CHILD | WS_VISIBLE,
				0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		}
		connection_label_ = CreateWindowW(L"STATIC", L"Connecting", WS_CHILD | WS_VISIBLE | SS_ENDELLIPSIS,
			0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		project_label_ = CreateWindowW(L"STATIC", L"No active project", WS_CHILD | WS_VISIBLE | SS_ENDELLIPSIS,
			0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		recording_label_ = CreateWindowW(L"STATIC", L"Idle", WS_CHILD | WS_VISIBLE,
			0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		collection_label_ = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE | SS_ENDELLIPSIS,
			0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		count_label_ = CreateWindowW(L"STATIC", L"Audio Mixer sources", WS_CHILD | WS_VISIBLE,
			0, 0, 0, 0, window, nullptr, nullptr, nullptr);
		for (int i = 0; i < VISIBLE_ROWS; ++i) {
			auto &strip = strips_[i];
			strip.name = CreateWindowW(L"STATIC", L"", WS_CHILD | SS_ENDELLIPSIS,
				0, 0, 0, 0, window, nullptr, nullptr, nullptr);
			strip.forward = CreateWindowW(L"BUTTON", L"Forward", WS_CHILD | WS_TABSTOP | BS_AUTOCHECKBOX,
				0, 0, 0, 0, window, reinterpret_cast<HMENU>(static_cast<INT_PTR>(FIRST_FORWARD + i)), nullptr, nullptr);
			strip.meter = CreateWindowW(L"STATIC", L"", WS_CHILD | SS_OWNERDRAW,
				0, 0, 0, 0, window, nullptr, nullptr, nullptr);
			strip.alias = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"", WS_CHILD | WS_TABSTOP | ES_AUTOHSCROLL,
				0, 0, 0, 0, window, reinterpret_cast<HMENU>(static_cast<INT_PTR>(FIRST_ALIAS + i)), nullptr, nullptr);
			SendMessageW(strip.alias, EM_SETLIMITTEXT, 80, 0);
			SetWindowSubclass(strip.forward, control_proc, 1, reinterpret_cast<DWORD_PTR>(this));
			SetWindowSubclass(strip.alias, control_proc, 1, reinterpret_cast<DWORD_PTR>(this));
		}
		open_button_ = CreateWindowW(L"BUTTON", L"Open Pro4Bro Voice Manipulator",
			WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW, 0, 0, 0, 0,
			window, reinterpret_cast<HMENU>(static_cast<INT_PTR>(OPEN_APP)), nullptr, nullptr);
		SetWindowSubclass(open_button_, control_proc, 1, reinterpret_cast<DWORD_PTR>(this));
		layout();
	}

	void layout()
	{
		if (!window_) return;
		RECT client{};
		GetClientRect(window_, &client);
		const int width = MulDiv(client.right, 96, static_cast<int>(dpi_));
		auto move = [&](HWND control, int x, int y, int w, int h) {
			if (control) MoveWindow(control, px(x), px(y), px(w), px(h), TRUE);
		};
		HWND values[] = {connection_label_, project_label_, recording_label_};
		for (int i = 0; i < 3; ++i) {
			move(status_titles_[i], 30, 101 + i * 24, 122, 20);
			move(values[i], 156, 101 + i * 24, std::max(100, width - 184), 20);
		}
		move(collection_label_, 250, 191, std::max(100, width - 278), 20);
		move(count_label_, 18, 214, std::max(100, width - 36), 19);
		for (int i = 0; i < VISIBLE_ROWS; ++i) {
			int y = FIRST_ROW_TOP + i * ROW_HEIGHT;
			auto &strip = strips_[i];
			move(strip.name, 28, y + 8, std::max(100, width - 192), 22);
			move(strip.forward, width - 139, y + 7, 111, 24);
			move(strip.meter, 28, y + 42, 217, 12);
			move(strip.alias, 262, y + 35, std::max(100, width - 290), 25);
		}
		move(open_button_, 16, FIRST_ROW_TOP + VISIBLE_ROWS * ROW_HEIGHT + 10, 284, 36);
		InvalidateRect(window_, nullptr, TRUE);
	}

	void release_style()
	{
		for (HBRUSH brush : {background_brush_, panel_brush_, row_brush_, input_brush_})
			if (brush) DeleteObject(brush);
		for (HFONT font : {body_font_, bold_font_, title_font_, small_font_})
			if (font) DeleteObject(font);
		background_brush_ = panel_brush_ = row_brush_ = input_brush_ = nullptr;
		body_font_ = bold_font_ = title_font_ = small_font_ = nullptr;
	}

	void refresh_style(bool force = false)
	{
		const bool dark = obs_frontend_is_theme_dark();
		if (!force && dark == dark_) return;
		release_style();
		dark_ = dark;
		colors_ = palette(dark);
		const BOOL dark_titlebar = dark ? TRUE : FALSE;
		DwmSetWindowAttribute(window_, DWMWA_USE_IMMERSIVE_DARK_MODE,
			&dark_titlebar, sizeof(dark_titlebar));
		background_brush_ = CreateSolidBrush(colors_.background);
		panel_brush_ = CreateSolidBrush(colors_.panel);
		row_brush_ = CreateSolidBrush(colors_.row);
		input_brush_ = CreateSolidBrush(colors_.input);
		auto font = [&](int points, int weight) {
			return CreateFontW(-MulDiv(points, static_cast<int>(dpi_), 72), 0, 0, 0, weight,
				FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
				CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
		};
		body_font_ = font(10, FW_NORMAL);
		bold_font_ = font(10, FW_SEMIBOLD);
		title_font_ = font(17, FW_SEMIBOLD);
		small_font_ = font(9, FW_NORMAL);
		for (HWND control : status_titles_) SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(small_font_), TRUE);
		for (HWND control : {connection_label_, project_label_, recording_label_, collection_label_, count_label_})
			SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(body_font_), TRUE);
		for (auto &strip : strips_) {
			SendMessageW(strip.name, WM_SETFONT, reinterpret_cast<WPARAM>(bold_font_), TRUE);
			SendMessageW(strip.forward, WM_SETFONT, reinterpret_cast<WPARAM>(body_font_), TRUE);
			SendMessageW(strip.alias, WM_SETFONT, reinterpret_cast<WPARAM>(body_font_), TRUE);
			SetWindowTheme(strip.forward, dark ? L"DarkMode_Explorer" : L"Explorer", nullptr);
			SetWindowTheme(strip.alias, dark ? L"DarkMode_Explorer" : L"Explorer", nullptr);
		}
		SendMessageW(open_button_, WM_SETFONT, reinterpret_cast<WPARAM>(bold_font_), TRUE);
		InvalidateRect(window_, nullptr, TRUE);
	}

	void paint(HDC dc)
	{
		RECT client{};
		GetClientRect(window_, &client);
		FillRect(dc, &client, background_brush_);
		const int width = MulDiv(client.right, 96, static_cast<int>(dpi_));
		auto box = [&](int x, int y, int w, int h, COLORREF fill, COLORREF border, int radius) {
			fill_box(dc, {px(x), px(y), px(x + w), px(y + h)}, fill, border, px(radius));
		};
		auto caption = [&](const wchar_t *value, int x, int y, int w, int h, HFONT font, COLORREF color) {
			HGDIOBJ old = SelectObject(dc, font);
			SetBkMode(dc, TRANSPARENT);
			SetTextColor(dc, color);
			RECT rect{px(x), px(y), px(x + w), px(y + h)};
			DrawTextW(dc, value, -1, &rect, DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
			SelectObject(dc, old);
		};
		RECT header{0, 0, client.right, px(75)};
		HBRUSH header_brush = CreateSolidBrush(colors_.header);
		FillRect(dc, &header, header_brush);
		DeleteObject(header_brush);
		HBITMAP logo = LoadBitmapW(GetModuleHandleW(L"pro4bro-obs-bridge.dll"), MAKEINTRESOURCEW(101));
		if (logo) {
			HDC source = CreateCompatibleDC(dc);
			HGDIOBJ previous = SelectObject(source, logo);
			const int saved = SaveDC(dc);
			HRGN circle = CreateEllipticRgn(px(18), px(17), px(60), px(59));
			SelectClipRgn(dc, circle);
			SetStretchBltMode(dc, HALFTONE);
			StretchBlt(dc, px(18), px(17), px(42), px(42), source, 0, 0, 128, 128, SRCCOPY);
			RestoreDC(dc, saved);
			DeleteObject(circle);
			SelectObject(source, previous);
			DeleteDC(source);
			DeleteObject(logo);
		}
		caption(L"Pro4Bro", 72, 14, width - 90, 31, title_font_, colors_.text);
		caption(L"OBS LiveLink  ·  Audio bridge", 73, 42, width - 90, 20, small_font_, colors_.muted);
		box(16, 87, width - 32, 92, colors_.panel, colors_.border, 10);
		caption(L"AUDIO MIXER SOURCES", 18, 189, 220, 22, bold_font_, colors_.text);
		for (int i = 0; i < VISIBLE_ROWS && scroll_ + i < static_cast<int>(rows_.size()); ++i)
			box(16, FIRST_ROW_TOP + i * ROW_HEIGHT, width - 32, ROW_HEIGHT - 7,
				colors_.row, colors_.border, 8);
	}

	void draw_item(const DRAWITEMSTRUCT &item)
	{
		if (item.hwndItem == open_button_) {
			const COLORREF fill = (item.itemState & ODS_SELECTED) ? RGB(19, 91, 174) : colors_.accent;
			fill_box(item.hDC, item.rcItem, fill, fill, px(7));
			HGDIOBJ old = SelectObject(item.hDC, bold_font_);
			SetBkMode(item.hDC, TRANSPARENT);
			SetTextColor(item.hDC, RGB(255, 255, 255));
			RECT text_rect = item.rcItem;
			DrawTextW(item.hDC, L"Open Pro4Bro Voice Manipulator", -1, &text_rect,
				DT_CENTER | DT_VCENTER | DT_SINGLELINE);
			SelectObject(item.hDC, old);
			if (item.itemState & ODS_FOCUS) DrawFocusRect(item.hDC, &item.rcItem);
			return;
		}
		for (const auto &strip : strips_) {
			if (item.hwndItem != strip.meter) continue;
			RECT rect = item.rcItem;
			HBRUSH empty = CreateSolidBrush(colors_.meter_empty);
			FillRect(item.hDC, &rect, empty);
			DeleteObject(empty);
			const int filled = MulDiv(rect.right - rect.left, std::clamp(strip.level, 0, 100), 100);
			if (filled > 0) {
				RECT active{rect.left, rect.top, rect.left + filled, rect.bottom};
				HBRUSH meter = CreateSolidBrush(strip.level >= 90 ? RGB(220, 74, 67) :
					strip.level >= 70 ? RGB(224, 170, 66) : colors_.meter);
				FillRect(item.hDC, &active, meter);
				DeleteObject(meter);
			}
			return;
		}
	}

	static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam)
	{
		Dialog *self = reinterpret_cast<Dialog *>(GetWindowLongPtrW(window, GWLP_USERDATA));
		if (message == WM_NCCREATE) {
			self = static_cast<Dialog *>(reinterpret_cast<CREATESTRUCTW *>(lparam)->lpCreateParams);
			SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
		}
		if (self && message == WM_CREATE) {
			self->window_ = window;
			self->dpi_ = GetDpiForWindow(window);
			self->create_controls();
			self->refresh_style(true);
			SetTimer(window, 1, 200, nullptr);
			self->refresh_mixer();
			PostMessageW(window, STATUS_CHANGED, 0, 0);
			return 0;
		}
		if (self && message == WM_TIMER && wparam == 1) {
			self->refresh_style();
			if (self->collection_changing_) return 0;
			if (++self->timer_ticks_ >= 5) { self->timer_ticks_ = 0; self->refresh_mixer(); }
			else { self->render_rows(); self->publish_inventory(); }
			return 0;
		}
		if (self && message == COMMAND_READY) { self->apply_commands(); return 0; }
		if (self && message == WM_DPICHANGED) {
			self->dpi_ = HIWORD(wparam);
			const RECT *bounds = reinterpret_cast<const RECT *>(lparam);
			SetWindowPos(window, nullptr, bounds->left, bounds->top,
				bounds->right - bounds->left, bounds->bottom - bounds->top,
				SWP_NOZORDER | SWP_NOACTIVATE);
			self->refresh_style(true);
			self->layout();
			return 0;
		}
		if (self && message == WM_SIZE) { self->layout(); return 0; }
		if (self && message == WM_THEMECHANGED) { self->refresh_style(true); return 0; }
		if (self && message == WM_ERASEBKGND) return 1;
		if (self && message == WM_PAINT) {
			PAINTSTRUCT paint{};
			HDC dc = BeginPaint(window, &paint);
			self->paint(dc);
			EndPaint(window, &paint);
			return 0;
		}
		if (self && message == WM_DRAWITEM) {
			self->draw_item(*reinterpret_cast<const DRAWITEMSTRUCT *>(lparam));
			return TRUE;
		}
		if (self && (message == WM_CTLCOLORSTATIC || message == WM_CTLCOLORBTN || message == WM_CTLCOLOREDIT)) {
			HDC dc = reinterpret_cast<HDC>(wparam);
			HWND control = reinterpret_cast<HWND>(lparam);
			SetBkMode(dc, OPAQUE);
			if (message == WM_CTLCOLOREDIT) {
				SetTextColor(dc, self->colors_.text);
				SetBkColor(dc, self->colors_.input);
				return reinterpret_cast<LRESULT>(self->input_brush_);
			}
			for (HWND title : self->status_titles_) {
				if (control == title) {
					SetTextColor(dc, self->colors_.muted);
					SetBkColor(dc, self->colors_.panel);
					return reinterpret_cast<LRESULT>(self->panel_brush_);
				}
			}
			for (HWND value : {self->connection_label_, self->project_label_, self->recording_label_}) {
				if (control == value) {
					SetTextColor(dc, value == self->recording_label_ && self->recording_active_
						? RGB(224, 98, 88) : self->colors_.text);
					SetBkColor(dc, self->colors_.panel);
					return reinterpret_cast<LRESULT>(self->panel_brush_);
				}
			}
			if (control == self->collection_label_ || control == self->count_label_) {
				SetTextColor(dc, self->colors_.muted);
				SetBkColor(dc, self->colors_.background);
				return reinterpret_cast<LRESULT>(self->background_brush_);
			}
			SetTextColor(dc, self->colors_.text);
			SetBkColor(dc, self->colors_.row);
			return reinterpret_cast<LRESULT>(self->row_brush_);
		}
		if (self && message == WM_VSCROLL) {
			SetFocus(window);
			int next = self->scroll_;
			switch (LOWORD(wparam)) {
			case SB_LINEUP: --next; break;
			case SB_LINEDOWN: ++next; break;
			case SB_PAGEUP: next -= VISIBLE_ROWS; break;
			case SB_PAGEDOWN: next += VISIBLE_ROWS; break;
			case SB_THUMBTRACK: next = HIWORD(wparam); break;
			default: return 0;
			}
			self->scroll_ = std::clamp(next, 0, std::max(0, static_cast<int>(self->rows_.size()) - VISIBLE_ROWS));
			self->render_rows();
			return 0;
		}
		if (self && message == WM_MOUSEWHEEL) {
			SetFocus(window);
			int step = GET_WHEEL_DELTA_WPARAM(wparam) > 0 ? -1 : 1;
			self->scroll_ = std::clamp(self->scroll_ + step, 0,
				std::max(0, static_cast<int>(self->rows_.size()) - VISIBLE_ROWS));
			self->render_rows();
			return 0;
		}
		if (self && message == WM_COMMAND && LOWORD(wparam) >= FIRST_FORWARD &&
			LOWORD(wparam) < FIRST_FORWARD + VISIBLE_ROWS && HIWORD(wparam) == BN_CLICKED) {
			int index = LOWORD(wparam) - FIRST_FORWARD;
			const auto &strip = self->strips_[index];
			if (!strip.uuid.empty())
				self->mixer_->set_forward(strip.uuid, SendMessageW(strip.forward, BM_GETCHECK, 0, 0) == BST_CHECKED);
			self->refresh_mixer();
			return 0;
		}
		if (self && message == WM_COMMAND && LOWORD(wparam) >= FIRST_ALIAS &&
			LOWORD(wparam) < FIRST_ALIAS + VISIBLE_ROWS && HIWORD(wparam) == EN_KILLFOCUS) {
			self->commit_alias(LOWORD(wparam) - FIRST_ALIAS);
			return 0;
		}
		if (self && message == WM_COMMAND && LOWORD(wparam) == OPEN_APP) {
			self->open_requested_ = true;
			return 0;
		}
		if (self && message == STATUS_CHANGED) {
			std::lock_guard lock(self->mutex_);
			SetWindowTextW(self->connection_label_, self->connection_text_.c_str());
			SetWindowTextW(self->project_label_, self->project_text_.c_str());
			SetWindowTextW(self->recording_label_, self->recording_text_.c_str());
			return 0;
		}
		if (self && message == WM_CLOSE) { ShowWindow(window, SW_HIDE); return 0; }
		if (self && message == WM_DESTROY) {
			KillTimer(window, 1);
			self->mixer_->suspend();
			self->release_style();
			self->window_ = nullptr;
			for (auto &strip : self->strips_) strip = {};
			return 0;
		}
		return DefWindowProcW(window, message, wparam, lparam);
	}

	void refresh_mixer()
	{
		if (collection_changing_) return;
		mixer_->refresh();
		rows_ = mixer_->rows();
		capture_.sync(mixer_->rows(true));
		scroll_ = std::clamp(scroll_, 0, std::max(0, static_cast<int>(rows_.size()) - VISIBLE_ROWS));
		SCROLLINFO info{sizeof(info)};
		info.fMask = SIF_RANGE | SIF_PAGE | SIF_POS;
		info.nMin = 0;
		info.nMax = std::max(0, static_cast<int>(rows_.size()) - 1);
		info.nPage = VISIBLE_ROWS;
		info.nPos = scroll_;
		SetScrollInfo(window_, SB_VERT, &info, TRUE);
		SetWindowTextW(collection_label_, (L"Scene collection · " + wide(mixer_->collection())).c_str());
		SetWindowTextW(count_label_, (L"Audio Mixer sources: " + std::to_wstring(rows_.size()) +
			L"  |  Forward selection syncs with app").c_str());
		render_rows();
		InvalidateRect(window_, nullptr, FALSE);
		publish_inventory();
	}

	void publish_inventory()
	{
		obs_data_t *snapshot = obs_data_create();
		obs_data_set_string(snapshot, "sceneCollection", mixer_->collection().c_str());
		obs_data_array_t *channels = obs_data_array_create();
		for (const auto &row : mixer_->rows(true)) {
			obs_data_t *item = obs_data_create();
			obs_data_set_string(item, "channelId", row.channel_id.c_str());
			obs_data_set_string(item, "sourceUuid", row.uuid.c_str());
			obs_data_set_string(item, "nativeName", row.name.c_str());
			obs_data_set_string(item, "alias", row.alias.c_str());
			obs_data_set_int(item, "aliasRevision", row.alias_revision);
			obs_data_set_int(item, "slot", row.slot);
			obs_data_set_bool(item, "forward", row.forward);
			obs_data_set_bool(item, "missing", row.missing);
			obs_data_set_int(item, "meterPeak", row.level);
			obs_data_set_int(item, "sampleRate", row.sample_rate);
			obs_data_set_int(item, "audioChannels", row.audio_channels);
			obs_data_set_bool(item, "muted", row.muted);
			obs_data_array_push_back(channels, item);
			obs_data_release(item);
		}
		obs_data_set_array(snapshot, "channels", channels);
		obs_data_array_release(channels);
		{
			std::lock_guard lock(mutex_);
			inventory_json_ = obs_data_get_json(snapshot);
		}
		obs_data_release(snapshot);
	}

	void apply_commands()
	{
		std::vector<std::string> commands;
		{
			std::lock_guard lock(mutex_);
			commands.swap(queued_commands_);
		}
		for (const auto &json : commands) {
			obs_data_t *command = obs_data_create_from_json(json.c_str());
			if (!command) continue;
			std::string id = field(command, "commandId");
			{
				std::lock_guard lock(mutex_);
				if (field(command, "connectionEpoch") != current_epoch_) {
					queued_ids_.erase(id);
					obs_data_release(command);
					continue;
				}
			}
			bool desired = obs_data_get_bool(command, "desiredState");
			std::string kind = field(command, "kind");
			bool applied = kind == "app-action" || (kind == "set-channel-forward" &&
				mixer_->apply_forward(field(command, "channelId"), field(command, "sourceUuid"), desired));
			obs_data_t *ack = obs_data_create();
			uint64_t applied_ns = os_gettime_ns();
			if (applied && kind == "set-channel-forward")
				obs_data_set_int(ack, "sampleIndex", static_cast<long long>(
					capture_.set_forward(field(command, "channelId"), desired)));
			if (applied && kind == "app-action") {
				std::string action = field(command, "action");
				if (action == "start") capture_.set_recording(field(command, "recordingId"), applied_ns, false, applied_ns);
				else if (action == "pause") capture_.pause_at(applied_ns);
				else if (action == "resume") capture_.resume_at(applied_ns);
				else if (action == "stop") capture_.finish_at(applied_ns);
			}
			obs_data_set_string(ack, "commandId", id.c_str());
			obs_data_set_int(ack, "revision", obs_data_get_int(command, "revision"));
			obs_data_set_int(ack, "appliedMonotonicNs", static_cast<long long>(applied_ns));
			if (applied && kind == "app-action")
				obs_data_set_string(ack, "appliedState", field(command, "action").c_str());
			else if (applied) obs_data_set_bool(ack, "appliedState", desired);
			else obs_data_set_string(ack, "error", "OBS channel is missing or changed identity");
			{
				std::lock_guard lock(mutex_);
				acknowledged_[id] = obs_data_get_json(ack);
				queued_ids_.erase(id);
			}
			obs_data_release(ack);
			obs_data_release(command);
		}
		refresh_mixer();
	}

	void render_rows()
	{
		for (int i = 0; i < VISIBLE_ROWS; ++i) {
			auto &strip = strips_[i];
			int index = scroll_ + i;
			bool visible = index < static_cast<int>(rows_.size());
			for (HWND control : {strip.name, strip.meter, strip.forward, strip.alias})
				if (control) ShowWindow(control, visible ? SW_SHOW : SW_HIDE);
			if (!visible) { strip.uuid.clear(); continue; }
			const auto &row = rows_[index];
			if (strip.uuid != row.uuid) {
				strip.uuid = row.uuid;
				const std::string old_default = "Channel " + std::to_string(row.slot);
				SetWindowTextW(strip.alias, wide(row.alias == old_default ?
					"Track " + std::to_string(row.slot) : row.alias).c_str());
			}
			std::wstring name = L"Track " + std::to_wstring(row.slot) + L"  |  " + wide(row.name);
			if (row.missing) name += L" (missing)";
			SetWindowTextW(strip.name, name.c_str());
			strip.level = row.level;
			InvalidateRect(strip.meter, nullptr, TRUE);
			SendMessageW(strip.forward, BM_SETCHECK, row.forward ? BST_CHECKED : BST_UNCHECKED, 0);
			EnableWindow(strip.forward, !row.missing);
			EnableWindow(strip.alias, !row.missing);
		}
	}

	void commit_alias(int index)
	{
		auto &strip = strips_[index];
		if (strip.uuid.empty()) return;
		int length = GetWindowTextLengthW(strip.alias);
		std::wstring value(static_cast<size_t>(length) + 1, L'\0');
		GetWindowTextW(strip.alias, value.data(), length + 1);
		value.resize(static_cast<size_t>(length));
		if (!mixer_->set_alias(strip.uuid, utf8(value))) {
			MessageBoxW(window_, L"Alias must be nonempty and unique in this scene collection.",
				L"LiveLink alias", MB_OK | MB_ICONWARNING);
		}
		refresh_mixer();
		for (const auto &row : rows_)
			if (row.uuid == strip.uuid) { SetWindowTextW(strip.alias, wide(row.alias).c_str()); break; }
	}

	void publish(const std::wstring &connection, const std::wstring &project)
	{
		{
			std::lock_guard lock(mutex_);
			connection_text_ = connection;
			project_text_ = project;
			recording_text_ = recording_active_ ? (recording_paused_ ? L"Paused" : L"Recording") : L"Idle";
		}
		if (window_) PostMessageW(window_, STATUS_CHANGED, 0, 0);
	}

	void open_app(const Pairing &pairing)
	{
		if (pairing.api_base.empty()) return;
		Pairing frontend = pairing;
		frontend.api_base = "http://127.0.0.1:18119";
		frontend.token.clear();
		auto ready = [&] {
			return request(pairing, L"GET", "/api/health").status == 200 &&
				request(frontend, L"GET", "/").status == 200;
		};
		if (!ready() && !pairing.launcher.empty()) {
			ShellExecuteW(nullptr, L"open", pairing.launcher.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
			for (int attempt = 0; active_ && attempt < 40; ++attempt) {
				std::this_thread::sleep_for(std::chrono::milliseconds(500));
				if (ready()) break;
			}
		}
		if (ready())
			ShellExecuteW(nullptr, L"open", L"http://127.0.0.1:18119", nullptr, nullptr, SW_SHOWNORMAL);
	}

	void run()
	{
		int64_t command_cursor = 0;
		char *config_path = obs_module_config_path("livelink-pcm-spool.sqlite3");
		const auto spool_path = config_path ? std::filesystem::path(wide(config_path)) : std::filesystem::path();
		if (config_path) bfree(config_path);
		LiveLinkSpool spool(spool_path);
		if (!spool.ready()) blog(LOG_ERROR, "[Pro4Bro] PCM disk spool unavailable: %s", spool.error().c_str());
		else if (const auto count = spool.pending())
			blog(LOG_WARNING, "[Pro4Bro] PCM disk spool recovered %llu unacknowledged chunks",
				static_cast<unsigned long long>(count));
		std::vector<LiveLinkAudioChunk> unspooled;
		std::optional<LiveLinkSpoolEntry> outstanding;
		auto next_flush = std::chrono::steady_clock::now();
		auto drain = [&](bool force = false) -> bool {
			const auto now = std::chrono::steady_clock::now();
			if (!force && now < next_flush) return false;
			next_flush = now + std::chrono::milliseconds(250);
			if (!spool.ready()) return false;
			if (unspooled.empty()) {
				while (unspooled.size() < 32) {
					auto chunk = capture_.take();
					if (!chunk) break;
					unspooled.push_back(std::move(*chunk));
				}
			}
			const bool full_batch = unspooled.size() == 32;
			if (unspooled.empty()) return false;
			if (spool.append(unspooled)) { unspooled.clear(); return full_batch; }
			blog(LOG_ERROR, "[Pro4Bro] PCM disk spool write failed; keeping chunks in memory: %s",
				spool.error().c_str());
			return false;
		};
		std::string active_recording_id;
		uint64_t ended_recording_ns = 0;
		std::map<std::string, uint64_t> stop_boundaries;
		std::set<std::string> needs_finalization;
		std::set<std::string> recovered_recordings;
		std::set<std::string> finalized_recordings;
		std::map<std::string, uint64_t> reported_overflow_frames;
		std::map<std::string, uint64_t> reported_callback_wait_ns;
		auto last_spool_report = std::chrono::steady_clock::now();
		uint64_t sent_chunks = 0;
		uint64_t send_elapsed_ms = 0;
		uint64_t max_send_ms = 0;
		uint64_t ack_commits = 0, ack_elapsed_ms = 0;
		auto last_rejection_log = std::chrono::steady_clock::now() - std::chrono::seconds(5);
		while (active_) {
			drain();
			if (std::chrono::steady_clock::now() - last_spool_report >= std::chrono::seconds(5)) {
				const auto count = spool.pending();
				if (count || !unspooled.empty() || sent_chunks)
					blog(LOG_INFO, "[Pro4Bro] PCM disk spool pending=%llu volatile=%llu sends=%llu http_avg_ms=%llu http_max_ms=%llu ack_commits=%llu ack_total_ms=%llu",
						static_cast<unsigned long long>(count),
						static_cast<unsigned long long>(unspooled.size()),
						static_cast<unsigned long long>(sent_chunks),
						static_cast<unsigned long long>(sent_chunks ? send_elapsed_ms / sent_chunks : 0),
						static_cast<unsigned long long>(max_send_ms),
						static_cast<unsigned long long>(ack_commits),
						static_cast<unsigned long long>(ack_elapsed_ms));
				sent_chunks = send_elapsed_ms = max_send_ms = 0;
				ack_commits = ack_elapsed_ms = 0;
				last_spool_report = std::chrono::steady_clock::now();
			}
			Pairing pairing = read_pairing();
			if (open_requested_.exchange(false)) open_app(pairing);
			if (pairing.install_id.empty() || pairing.token.empty()) {
				publish(L"Pairing unavailable", L"Install or Repair in app Preferences");
			} else {
				std::string inventory;
				{
					std::lock_guard lock(mutex_);
					inventory = inventory_json_;
				}
				obs_data_t *payload = obs_data_create_from_json(inventory.c_str());
				if (!payload) payload = obs_data_create();
				obs_data_set_string(payload, "installId", pairing.install_id.c_str());
				obs_data_set_bool(payload, "recordingActive", recording_active_);
				obs_data_set_bool(payload, "recordingPaused", recording_paused_);
				if (connect_recording_folder_) {
					char *output_path = obs_frontend_get_current_record_output_path();
					if (output_path) {
						const std::string folder = std::filesystem::path(output_path).parent_path().string();
						obs_data_set_string(payload, "recordingFolder", folder.c_str());
						bfree(output_path);
					}
				}
				Reply reply;
				if (connection_id_.empty()) {
					obs_data_set_string(payload, "processInstanceId", process_id_.c_str());
					obs_data_set_string(payload, "pluginVersion", "0.6.8");
					obs_data_set_string(payload, "obsVersion", obs_get_version_string());
					obs_data_set_int(payload, "protocolMin", 3);
					obs_data_set_int(payload, "protocolMax", 3);
					reply = request(pairing, L"POST", "/api/obs-livelink/v3/hello", obs_data_get_json(payload));
				} else {
					obs_data_set_string(payload, "connectionId", connection_id_.c_str());
					obs_data_set_string(payload, "connectionEpoch", epoch_.c_str());
					reply = request(pairing, L"POST", "/api/obs-livelink/v3/heartbeat", obs_data_get_json(payload));
				}
				obs_data_release(payload);
				if (reply.status == 200) {
					drain();
					obs_data_t *snapshot = obs_data_create_from_json(reply.body.c_str());
					if (snapshot) {
						std::string previous_epoch = epoch_;
						connection_id_ = field(snapshot, "connectionId");
						connect_recording_folder_ = obs_data_get_bool(snapshot, "connectRecordingFolder");
						epoch_ = field(snapshot, "connectionEpoch");
						if (epoch_ != previous_epoch) {
							command_cursor = 0;
							recovered_recordings.clear();
						}
						{
							std::lock_guard lock(mutex_);
							current_epoch_ = epoch_;
						}
						obs_data_t *project = obs_data_get_obj(snapshot, "activeProject");
						std::wstring name = project ? wide(field(project, "name")) : L"No active project";
						publish(L"Connected", name);
						if (project) obs_data_release(project);
						obs_data_t *recording = obs_data_get_obj(snapshot, "appRecording");
						obs_data_array_t *recent = obs_data_get_array(snapshot, "recentRecordings");
						if (recent) {
							for (size_t i = 0; i < obs_data_array_count(recent); ++i) {
								obs_data_t *item = obs_data_array_item(recent, i);
								const auto end = static_cast<uint64_t>(std::max<int64_t>(0, obs_data_get_int(item, "endedMonotonicNs")));
								const std::string id = field(item, "recordingId");
								if (end) stop_boundaries[id] = end;
								if (end && field(item, "archiveStatus") == "pending") needs_finalization.insert(id);
								obs_data_release(item);
							}
							obs_data_array_release(recent);
						}
						if (recording) {
							std::string next_id = field(recording, "recordingId");
							if (next_id != active_recording_id) ended_recording_ns = 0;
							active_recording_id = next_id;
							capture_.set_recording(active_recording_id,
								static_cast<uint64_t>(obs_data_get_int(recording, "startedMonotonicNs")),
								field(recording, "status") == "paused",
								static_cast<uint64_t>(std::max<int64_t>(0, obs_data_get_int(snapshot, "lastTransitionMonotonicNs"))));
							obs_data_release(recording);
						} else if (!active_recording_id.empty()) {
							obs_data_array_t *completed = obs_data_get_array(snapshot, "recentRecordings");
							if (completed) {
								for (size_t i = 0; i < obs_data_array_count(completed); ++i) {
									obs_data_t *item = obs_data_array_item(completed, i);
									if (field(item, "recordingId") == active_recording_id) {
										ended_recording_ns = static_cast<uint64_t>(obs_data_get_int(item, "endedMonotonicNs"));
										capture_.finish_at(ended_recording_ns);
									}
									obs_data_release(item);
								}
								obs_data_array_release(completed);
							}
						}
						obs_data_release(snapshot);
					}
					for (const auto &id : spool.recordings()) {
						if (id == active_recording_id || stop_boundaries.count(id) || recovered_recordings.count(id)) continue;
						obs_data_t *body = obs_data_create();
						obs_data_set_string(body, "installId", pairing.install_id.c_str());
						obs_data_set_string(body, "connectionId", connection_id_.c_str());
						obs_data_set_string(body, "connectionEpoch", epoch_.c_str());
						const std::string path = "/api/obs-livelink/v3/recordings/" + id + "/recover";
						Reply restored = request(pairing, L"POST", path.c_str(), obs_data_get_json(body));
						obs_data_release(body);
						if (restored.status == 200) {
							obs_data_t *info = obs_data_create_from_json(restored.body.c_str());
							if (info) {
								stop_boundaries[id] = static_cast<uint64_t>(obs_data_get_int(info, "endedMonotonicNs"));
								if (field(info, "archiveStatus") == "pending") needs_finalization.insert(id);
								obs_data_release(info);
							}
							recovered_recordings.insert(id);
							blog(LOG_INFO, "[Pro4Bro] PCM spool recording recovered: %s", id.c_str());
						}
					}
					if (!connection_id_.empty() && active_) {
						const auto burst_started = std::chrono::steady_clock::now();
						std::vector<int64_t> durable_acks;
						for (int sent_count = 0; sent_count < 20; ++sent_count) {
							// Keep control commands responsive, while amortizing each
							// heartbeat/command round trip across more queued PCM.
							if (sent_count && std::chrono::steady_clock::now() - burst_started >=
								std::chrono::seconds(1)) break;
							if (!outstanding) outstanding = spool.oldest(
								durable_acks.empty() ? 0 : durable_acks.back());
							if (!outstanding) break;
							const auto boundary = stop_boundaries.find(outstanding->chunk.recording_id);
							if (boundary != stop_boundaries.end()) {
								const auto &chunk = outstanding->chunk;
								const uint64_t allowed = chunk.plugin_monotonic_ns < boundary->second
									? (boundary->second - chunk.plugin_monotonic_ns) * chunk.sample_rate / 1'000'000'000ULL : 0;
								if (allowed < chunk.frames) {
									if (!spool.clip_to_stop(outstanding->id, static_cast<uint32_t>(allowed))) {
										blog(LOG_ERROR, "[Pro4Bro] PCM spool Stop clip failed: %s", spool.error().c_str());
										break;
									}
									blog(LOG_INFO, "[Pro4Bro] PCM spool clipped to Stop recording=%s channel=%s kept_frames=%llu",
										chunk.recording_id.c_str(), chunk.channel_id.c_str(),
										static_cast<unsigned long long>(allowed));
									if (!allowed) { outstanding.reset(); continue; }
									outstanding->chunk.frames = static_cast<uint32_t>(allowed);
									outstanding->chunk.pcm.resize(static_cast<size_t>(allowed) * chunk.channels);
								}
							}
							const auto send_started = std::chrono::steady_clock::now();
							Reply sent = send_chunk(pairing, pairing.install_id, connection_id_, epoch_, outstanding->chunk);
							const auto elapsed = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
								std::chrono::steady_clock::now() - send_started).count());
							++sent_chunks;
							send_elapsed_ms += elapsed;
							max_send_ms = std::max(max_send_ms, elapsed);
							if (sent.status != 200) {
								if (sent.status == 413 || sent.status == 422) {
									blog(LOG_ERROR, "[Pro4Bro] PCM spool chunk rejected recording=%s channel=%s sequence=%llu status=%lu; retained on disk",
										outstanding->chunk.recording_id.c_str(), outstanding->chunk.channel_id.c_str(),
										static_cast<unsigned long long>(outstanding->chunk.sequence), sent.status);
									spool.reject(outstanding->id, static_cast<int>(sent.status));
									outstanding.reset();
									continue;
								}
								if (sent.status == 409 &&
									std::chrono::steady_clock::now() - last_rejection_log >= std::chrono::seconds(5)) {
									blog(LOG_WARNING, "[Pro4Bro] PCM spool chunk not accepted yet recording=%s channel=%s sequence=%llu; will retry",
										outstanding->chunk.recording_id.c_str(), outstanding->chunk.channel_id.c_str(),
										static_cast<unsigned long long>(outstanding->chunk.sequence));
									last_rejection_log = std::chrono::steady_clock::now();
								}
								std::this_thread::sleep_for(std::chrono::milliseconds(100));
								break;
							}
							// The API already flushed this source PCM. Keep it in the
							// outbox until one FULL transaction commits this burst's ACKs.
							// A crash before commit safely replays the same sequences.
							durable_acks.push_back(outstanding->id);
							outstanding = spool.oldest(outstanding->id);
						}
						const auto ack_started = std::chrono::steady_clock::now();
						const bool ack_committed = spool.acknowledge(durable_acks);
						if (!durable_acks.empty()) {
							++ack_commits;
							ack_elapsed_ms += static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
								std::chrono::steady_clock::now() - ack_started).count());
						}
						if (!ack_committed) {
							blog(LOG_ERROR, "[Pro4Bro] PCM spool ACK commit failed: %s", spool.error().c_str());
							// Retry from the oldest retained row, including already
							// durable API chunks; do not skip them on a failed commit.
							outstanding.reset();
						}
						if (!outstanding) outstanding = spool.oldest();
						for (const auto &status : capture_.queue_status()) {
							uint64_t &reported_wait = reported_callback_wait_ns[status.channel_id];
							if (status.max_callback_wait_ns < reported_wait) reported_wait = 0;
							if (status.max_callback_wait_ns >= 5'000'000 &&
								status.max_callback_wait_ns > std::max<uint64_t>(reported_wait * 2, 5'000'000)) {
								blog(LOG_WARNING, "[Pro4Bro] PCM callback lock wait channel=%s max_wait_ns=%llu",
									status.channel_id.c_str(),
									static_cast<unsigned long long>(status.max_callback_wait_ns));
								reported_wait = status.max_callback_wait_ns;
							}
							uint64_t &reported = reported_overflow_frames[status.channel_id];
							if (status.overflow_frames < reported) reported = 0;
							if (status.overflow_frames > reported) {
								blog(LOG_ERROR, "[Pro4Bro] PCM queue overflow recording=%s channel=%s lost_frames=%llu total_lost_frames=%llu queued_frames=%llu peak_frames=%llu max_callback_wait_ns=%llu",
									active_recording_id.c_str(),
									status.channel_id.c_str(),
									static_cast<unsigned long long>(status.overflow_frames - reported),
									static_cast<unsigned long long>(status.overflow_frames),
									static_cast<unsigned long long>(status.queued_frames),
									static_cast<unsigned long long>(status.peak_queued_frames),
									static_cast<unsigned long long>(status.max_callback_wait_ns));
								reported = status.overflow_frames;
							}
						}
						for (const auto &id : needs_finalization) {
							if (finalized_recordings.count(id) || spool.pending(id) ||
								(outstanding && outstanding->chunk.recording_id == id) ||
								std::any_of(unspooled.begin(), unspooled.end(),
									[&id](const auto &chunk) { return chunk.recording_id == id; })) continue;
								obs_data_t *body = obs_data_create();
								obs_data_set_string(body, "installId", pairing.install_id.c_str());
								obs_data_set_string(body, "connectionId", connection_id_.c_str());
								obs_data_set_string(body, "connectionEpoch", epoch_.c_str());
								std::string path = "/api/obs-livelink/v3/recordings/" + id + "/finalize";
								Reply finished = request(pairing, L"POST", path.c_str(), obs_data_get_json(body));
								obs_data_release(body);
								// An HTTP error is a completed server decision (including an
								// unavailable archiver). The journal keeps PCM for explicit Retry;
								// only transport failure should keep automatic retry active.
								if (finished.status == 200 || finished.status >= 400) {
									finalized_recordings.insert(id);
									if (id == active_recording_id) {
										capture_.set_recording("", 0, false, 0);
										active_recording_id.clear();
										ended_recording_ns = 0;
									}
								}
						}
						std::string event_json;
						{
							std::lock_guard lock(mutex_);
							if (!events_.empty()) event_json = events_.front();
						}
						if (!event_json.empty()) {
							obs_data_t *event = obs_data_create_from_json(event_json.c_str());
							if (event) {
								obs_data_set_string(event, "installId", pairing.install_id.c_str());
								obs_data_set_string(event, "connectionId", connection_id_.c_str());
								obs_data_set_string(event, "connectionEpoch", epoch_.c_str());
								Reply sent = request(pairing, L"POST", "/api/obs-livelink/v3/lifecycle", obs_data_get_json(event));
								if (sent.status == 200) {
									std::lock_guard lock(mutex_);
									if (!events_.empty()) events_.pop_front();
								}
								obs_data_release(event);
							}
						}
						std::string route = "/api/obs-livelink/v3/connections/" + connection_id_ +
							"/commands?installId=" + pairing.install_id + "&epoch=" + epoch_ +
							"&after=" + std::to_string(command_cursor) +
							(outstanding ? "&waitSeconds=0" : "&waitSeconds=0.1");
						Reply commands = request(pairing, L"GET", route.c_str());
						if (commands.status == 200) {
							obs_data_t *result = obs_data_create_from_json(commands.body.c_str());
							if (result) {
								command_cursor = obs_data_get_int(result, "commandRevision");
								obs_data_array_t *items = obs_data_get_array(result, "commands");
								if (items) {
									for (size_t i = 0; i < obs_data_array_count(items); ++i) {
										obs_data_t *item = obs_data_array_item(items, i);
										std::string id = field(item, "commandId");
										std::string ack;
										{
											std::lock_guard lock(mutex_);
											auto found = acknowledged_.find(id);
											if (found != acknowledged_.end()) ack = found->second;
											else if (queued_ids_.insert(id).second) queued_commands_.emplace_back(obs_data_get_json(item));
										}
										if (!ack.empty()) {
											obs_data_t *applied = obs_data_create_from_json(ack.c_str());
											obs_data_set_string(applied, "installId", pairing.install_id.c_str());
											obs_data_set_string(applied, "connectionId", connection_id_.c_str());
											obs_data_set_string(applied, "connectionEpoch", epoch_.c_str());
											request(pairing, L"POST", "/api/obs-livelink/v3/commands/ack", obs_data_get_json(applied));
											obs_data_release(applied);
										} else if (window_) PostMessageW(window_, COMMAND_READY, 0, 0);
										obs_data_release(item);
									}
									obs_data_array_release(items);
								}
								obs_data_release(result);
							}
						} else if (commands.status == 409) {
							connection_id_.clear();
							epoch_.clear();
							std::lock_guard lock(mutex_);
							current_epoch_.clear();
							queued_commands_.clear();
							queued_ids_.clear();
						}
					}
				} else {
					connection_id_.clear();
					epoch_.clear();
					{
						std::lock_guard lock(mutex_);
						current_epoch_.clear();
						queued_commands_.clear();
						queued_ids_.clear();
					}
					publish(reply.status == 401 ? L"Pairing rejected" : L"Disconnected", L"No active project");
				}
			}
			for (int tick = 0; active_ && !outstanding && tick < 2 && !open_requested_; ++tick)
				std::this_thread::sleep_for(std::chrono::milliseconds(50));
		}
		// OBS can close while HTTP is unavailable. Persist every captured tail
		// chunk before the callback/queue is detached by Dialog::stop().
		while (drain(true)) {}
	}
};

Dialog dialog;
}

void livelink_start() { dialog.start(); }
void livelink_stop() { dialog.stop(); }
void livelink_scene_collection_changing() { dialog.scene_collection_changing(); }
void livelink_scene_collection_changed() { dialog.scene_collection_changed(); }
void livelink_recording_state(bool active, bool paused) { dialog.recording_state(active, paused); }
void livelink_recording_event(const char *kind) { dialog.recording_event(kind); }
