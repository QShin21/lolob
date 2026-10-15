// SPDX-License-Identifier: GPL-2.0-or-later
// Isolated acceptance helper. Never link or copy into a RiftCast release.
#include <initguid.h>
#include "audio-endpoints.hpp"
#include <iostream>
#include <cctype>
using namespace riftcast;

struct PolicyConfig : IUnknown {
  virtual HRESULT STDMETHODCALLTYPE GetMixFormat(PCWSTR, WAVEFORMATEX **) = 0;
  virtual HRESULT STDMETHODCALLTYPE GetDeviceFormat(PCWSTR, INT, WAVEFORMATEX **) = 0;
  virtual HRESULT STDMETHODCALLTYPE ResetDeviceFormat(PCWSTR) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetDeviceFormat(PCWSTR, WAVEFORMATEX *, WAVEFORMATEX *) = 0;
  virtual HRESULT STDMETHODCALLTYPE GetProcessingPeriod(PCWSTR, INT, INT64 *, INT64 *) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetProcessingPeriod(PCWSTR, INT64 *) = 0;
  virtual HRESULT STDMETHODCALLTYPE GetShareMode(PCWSTR, void *) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetShareMode(PCWSTR, void *) = 0;
  virtual HRESULT STDMETHODCALLTYPE GetPropertyValue(PCWSTR, const PROPERTYKEY &, PROPVARIANT *) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetPropertyValue(PCWSTR, const PROPERTYKEY &, PROPVARIANT *) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetDefaultEndpoint(PCWSTR, ERole) = 0;
  virtual HRESULT STDMETHODCALLTYPE SetEndpointVisibility(PCWSTR, INT) = 0;
};
static const GUID policyClass = {0x870af99c,0x171d,0x4f9e,{0xaf,0x0d,0xe6,0x3d,0xf4,0x0c,0x2b,0xc9}};
static const GUID policyInterface = {0xf8679f50,0x850a,0x41cf,{0x9c,0x72,0x43,0x0f,0x29,0x02,0x90,0xc8}};
bool allowedCapture(const Endpoint &ep) {
  std::string label = ep.name + " " + ep.interfaceName;
  std::transform(label.begin(), label.end(), label.begin(), [](unsigned char c) { return char(std::tolower(c)); });
  return ep.capture && (ep.cable || label.find("emeet") != std::string::npos);
}
int wmain(int argc, wchar_t **argv) {
  try {
    if (argc == 2 && std::wstring(argv[1]) == L"list") { std::cout << devicesJson(devices()) << "\n"; return 0; }
    if (argc != 5 || std::wstring(argv[1]) != L"set-capture-role") throw std::runtime_error("Expected list or set-capture-role <role0..2> <expected-current-id> <target-id>");
    const std::wstring roleText = argv[2];
    if (roleText != L"0" && roleText != L"1" && roleText != L"2") throw std::runtime_error("Capture role must be exactly 0, 1 or 2");
    const int role = int(roleText[0] - L'0');
    const auto previous = utf8(argv[3]), target = utf8(argv[4]);
    const auto before = devices();
    if (before.defaults.size() != 6 || before.defaults[size_t(role) + 3] != previous) throw std::runtime_error("Default capture changed since inspection; no write");
    const auto from = std::find_if(before.endpoints.begin(), before.endpoints.end(), [&](const Endpoint &ep) { return ep.id == previous && allowedCapture(ep); });
    const auto to = std::find_if(before.endpoints.begin(), before.endpoints.end(), [&](const Endpoint &ep) { return ep.id == target && allowedCapture(ep); });
    if (from == before.endpoints.end() || to == before.endpoints.end()) throw std::runtime_error("Only active EMEET/base-CABLE capture endpoints are allowed; render endpoints are forbidden");
    if (previous != target) {
      ComScope scope; Com<PolicyConfig> policy;
      check(CoCreateInstance(policyClass, nullptr, CLSCTX_ALL, policyInterface, (void **)policy.out()), "Open current-user endpoint policy");
      check(policy->SetDefaultEndpoint(argv[4], ERole(role)), "Set authorized capture role");
    }
    const auto after = devices();
    if (after.defaults.size() != 6 || after.defaults[size_t(role) + 3] != target) throw std::runtime_error("Capture role readback mismatch");
    for (size_t i = 0; i < 3; ++i) if (before.defaults[i] != after.defaults[i]) throw std::runtime_error("Render defaults changed; helper never writes render");
    std::cout << devicesJson(after) << "\n";
    return 0;
  } catch (const std::exception &error) { std::cerr << error.what() << "\n"; return 1; }
}
