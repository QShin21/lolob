// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <endpointvolume.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propvarutil.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <algorithm>
#include <sstream>

namespace riftcast {
template<class T> struct Com {
  T *p = nullptr;
  ~Com() { if (p) p->Release(); }
  T **out() { if (p) p->Release(); p = nullptr; return &p; }
  T *operator->() const { return p; }
  operator bool() const { return p != nullptr; }
};
struct ComScope {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  ~ComScope() { if (SUCCEEDED(hr)) CoUninitialize(); }
};
inline void check(HRESULT hr, const char *step) {
  if (FAILED(hr)) { std::ostringstream s; s << step << " (0x" << std::hex << unsigned(hr) << ")"; throw std::runtime_error(s.str()); }
}
inline std::string utf8(const std::wstring &s) {
  if (s.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), int(s.size()), nullptr, 0, nullptr, nullptr);
  std::string r(size_t(n), '\0'); WideCharToMultiByte(CP_UTF8, 0, s.data(), int(s.size()), r.data(), n, nullptr, nullptr); return r;
}
inline std::wstring wide(const std::string &s) {
  if (s.empty()) return {};
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), int(s.size()), nullptr, 0);
  if (!n) throw std::runtime_error("Invalid UTF-8 endpoint id");
  std::wstring r(size_t(n), L'\0'); MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), int(s.size()), r.data(), n); return r;
}
inline std::string prop(IPropertyStore *store, const PROPERTYKEY &key) {
  PROPVARIANT v; PropVariantInit(&v);
  std::string r; if (SUCCEEDED(store->GetValue(key, &v)) && v.vt == VT_LPWSTR && v.pwszVal) r = utf8(v.pwszVal);
  PropVariantClear(&v); return r;
}
struct Endpoint { std::string id, name, interfaceName; bool capture = false, cable = false; };
struct Devices { std::vector<Endpoint> endpoints; std::string defaultRender, defaultCapture; std::vector<std::string> defaults; bool cablePresent = false; };
inline Devices devices() {
  ComScope scope; Com<IMMDeviceEnumerator> enumerator;
  check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void **)enumerator.out()), "Enumerate audio devices");
  Devices result;
  HKEY service = nullptr;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Services\\VBAudioVACMME", 0, KEY_READ, &service) == ERROR_SUCCESS) { result.cablePresent = true; RegCloseKey(service); }
  for (auto flow : {eRender, eCapture}) {
    for (auto role : {eConsole, eMultimedia, eCommunications}) {
      Com<IMMDevice> d; LPWSTR id = nullptr; std::string value;
      if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(flow, role, d.out())) && SUCCEEDED(d->GetId(&id))) { value = utf8(id); CoTaskMemFree(id); }
      result.defaults.push_back(value);
    }
    Com<IMMDevice> defaultDevice;
    // OBS WASAPI uses eConsole for desktop audio and eCommunications for mic.
    if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(flow, flow == eCapture ? eCommunications : eConsole, defaultDevice.out()))) {
      LPWSTR id = nullptr; if (SUCCEEDED(defaultDevice->GetId(&id))) { (flow == eRender ? result.defaultRender : result.defaultCapture) = utf8(id); CoTaskMemFree(id); }
    }
    Com<IMMDeviceCollection> collection;
    check(enumerator->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, collection.out()), "List active audio endpoints");
    UINT count = 0; check(collection->GetCount(&count), "Count audio endpoints");
    for (UINT i = 0; i < count; ++i) {
      Com<IMMDevice> d; if (FAILED(collection->Item(i, d.out()))) continue;
      LPWSTR id = nullptr; if (FAILED(d->GetId(&id))) continue;
      Endpoint ep; ep.id = utf8(id); CoTaskMemFree(id); ep.capture = flow == eCapture;
      Com<IPropertyStore> props;
      if (SUCCEEDED(d->OpenPropertyStore(STGM_READ, props.out()))) {
        ep.name = prop(props.p, PKEY_Device_FriendlyName); ep.interfaceName = prop(props.p, PKEY_DeviceInterface_FriendlyName);
      }
      // The base cable is redistributable; A+B / C+D have different product names.
      ep.cable = ep.interfaceName == "VB-Audio Virtual Cable" || ep.name.find("(VB-Audio Virtual Cable)") != std::string::npos;
      result.endpoints.push_back(ep);
    }
  }
  return result;
}
inline std::string quote(const std::string &s) {
  std::string r = "\""; for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += char(c); } else if (c < 32) { const char *hex = "0123456789abcdef"; r += "\\u00"; r += hex[c >> 4]; r += hex[c & 15]; } else r += char(c); } return r + "\"";
}
inline std::string devicesJson(const Devices &d) {
  std::string r = "{\"cablePresent\":" + std::string(d.cablePresent ? "true" : "false") + ",\"defaults\":[";
  for (size_t i = 0; i < d.defaults.size(); ++i) { if (i) r += ","; r += quote(d.defaults[i]); }
  r += "],\"defaultRender\":" + quote(d.defaultRender) + ",\"defaultCapture\":" + quote(d.defaultCapture) + ",\"endpoints\":[";
  bool first = true; for (const auto &ep : d.endpoints) { if (!first) r += ","; first = false; r += "{\"id\":" + quote(ep.id) + ",\"name\":" + quote(ep.name) + ",\"interfaceName\":" + quote(ep.interfaceName) + ",\"capture\":" + (ep.capture ? "true" : "false") + ",\"cable\":" + (ep.cable ? "true" : "false") + "}"; } return r + "]}";
}
}
