// SPDX-License-Identifier: GPL-2.0-or-later
#include <initguid.h>
#include "audio-endpoints.hpp"
#include <iostream>
#include <fstream>
#include <filesystem>
#include <chrono>
#include <thread>
#include <cmath>
#include <cstring>

using namespace riftcast;
// Windows' endpoint-policy COM interface is used solely to restore defaults
// changed by the official installer. It never makes the cable a default device.
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
// The capture command is used by release acceptance tests. It records only the
// explicitly named virtual cable, never the default microphone.
int wmain(int argc, wchar_t **argv) {
  try {
    if (argc == 2 && std::wstring(argv[1]) == L"list") { std::cout << devicesJson(devices()) << "\n"; return 0; }
    if (argc == 8 && std::wstring(argv[1]) == L"restore-defaults") {
      ComScope scope; auto inventory = devices(); Com<PolicyConfig> policy;
      check(CoCreateInstance(policyClass, nullptr, CLSCTX_ALL, policyInterface, (void **)policy.out()), "Open endpoint policy");
      int changed = 0;
      for (size_t i = 0; i < 6; ++i) {
        const auto previous = utf8(argv[i + 2]); if (previous.empty()) continue;
        auto found = std::find_if(inventory.endpoints.begin(), inventory.endpoints.end(), [&](const Endpoint &ep) { return ep.id == previous && ep.capture == (i >= 3) && !ep.cable; });
        if (found == inventory.endpoints.end()) continue; // Old device was removed.
        auto now = std::find_if(inventory.endpoints.begin(), inventory.endpoints.end(), [&](const Endpoint &ep) { return ep.id == inventory.defaults[i] && ep.cable; });
        if (now != inventory.endpoints.end()) { check(policy->SetDefaultEndpoint(argv[i + 2], ERole(i % 3)), "Restore original default endpoint"); changed++; }
      }
      std::cout << "{\"restoredDefaults\":" << changed << "}\n"; return 0;
    }
    if (argc != 5 || std::wstring(argv[1]) != L"capture") throw std::runtime_error("Expected list or capture <cable-id> <seconds> <float32-file>");
    auto id = utf8(argv[2]); auto inventory = devices();
    if (!std::any_of(inventory.endpoints.begin(), inventory.endpoints.end(), [&](const Endpoint &ep) { return ep.id == id && ep.capture && ep.cable; })) throw std::runtime_error("Capture is restricted to the VB-CABLE recording endpoint");
    double seconds = std::stod(argv[3]); if (!std::isfinite(seconds) || seconds < .1 || seconds > 60) throw std::runtime_error("Capture duration must be 0.1 to 60 seconds");
    ComScope scope; Com<IMMDeviceEnumerator> en; Com<IMMDevice> dev; Com<IAudioClient> client; Com<IAudioCaptureClient> capture;
    check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void **)en.out()), "Create enumerator");
    check(en->GetDevice(argv[2], dev.out()), "Get cable"); check(dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void **)client.out()), "Activate capture");
    WAVEFORMATEX fmt = {}; fmt.wFormatTag = WAVE_FORMAT_IEEE_FLOAT; fmt.nChannels = 2; fmt.nSamplesPerSec = 48000; fmt.wBitsPerSample = 32; fmt.nBlockAlign = 8; fmt.nAvgBytesPerSec = 384000;
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, 1000000, 0, &fmt, nullptr), "Initialize cable capture");
    check(client->GetService(__uuidof(IAudioCaptureClient), (void **)capture.out()), "Get capture service");
    std::ofstream output(std::filesystem::path(argv[4]), std::ios::binary); if (!output) throw std::runtime_error("Cannot write capture file");
    check(client->Start(), "Start cable capture");
    uint64_t samples = 0; auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(int(seconds * 1000));
    while (std::chrono::steady_clock::now() < end) {
      UINT32 n = 0; check(capture->GetNextPacketSize(&n), "Poll cable capture");
      while (n) {
        BYTE *data = nullptr; UINT32 frames = 0; DWORD flags = 0;
        check(capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr), "Read cable");
        if (flags & AUDCLNT_BUFFERFLAGS_SILENT) { std::vector<float> zeros(size_t(frames) * 2); output.write((char *)zeros.data(), std::streamsize(frames) * 8); }
        else output.write((char *)data, std::streamsize(frames) * 8);
        samples += frames; check(capture->ReleaseBuffer(frames), "Release capture buffer"); check(capture->GetNextPacketSize(&n), "Poll cable capture");
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    client->Stop(); output.close(); std::cout << "{\"sampleRate\":48000,\"channels\":2,\"frames\":" << samples << "}\n"; return 0;
  } catch (const std::exception &e) { std::cerr << e.what() << "\n"; return 1; }
}
