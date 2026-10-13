// SPDX-License-Identifier: GPL-2.0-or-later
// Built against the exact OBS source shipped with RiftCast. The raw callback
// receives audio track 1 after scene activation, filters, gain, mute and sync.
#include <initguid.h>
#include "audio-endpoints.hpp"
#include <obs.h>
#include <obs-websocket-api.h>
#include <atomic>
#include <mutex>
#include <thread>
#include <deque>
#include <cmath>
#include <cstring>
#include <chrono>

using namespace riftcast;
namespace {
struct CableVolume {
  Com<IAudioEndpointVolume> volume;
  float previous = 1; BOOL muted = FALSE; bool owned = false;
  explicit CableVolume(IMMDevice *device) {
    check(device->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, (void **)volume.out()), "Open cable volume");
    check(volume->GetMasterVolumeLevelScalar(&previous), "Read cable volume");
    check(volume->GetMute(&muted), "Read cable mute");
    check(volume->SetMasterVolumeLevelScalar(1, nullptr), "Set cable unity gain");
    const HRESULT hr = volume->SetMute(FALSE, nullptr);
    if (FAILED(hr)) { volume->SetMasterVolumeLevelScalar(previous, nullptr); check(hr, "Unmute cable"); } owned = true;
  }
  ~CableVolume() { if (owned) { volume->SetMasterVolumeLevelScalar(previous, nullptr); volume->SetMute(muted, nullptr); } }
};
struct Bridge {
  std::mutex operation, buffer;
  std::deque<float> queue;
  std::thread worker;
  std::atomic<bool> running{false}, ready{false}, stopRequested{false};
  std::atomic<uint64_t> received{0}, rendered{0}, dropped{0}, underruns{0}, signalAt{0};
  std::atomic<float> peak{0};
  std::string deviceId, captureId, error;
  audio_t *audio = nullptr;

  static void receive(void *param, size_t, audio_data *data) {
    auto &b = *(Bridge *)param; if (!b.running || !data || !data->data[0]) return;
    auto *samples = (const float *)data->data[0]; float peak = 0;
    std::lock_guard<std::mutex> lock(b.buffer);
    for (size_t i = 0; i < size_t(data->frames) * 2; ++i) {
      float value = std::isfinite(samples[i]) ? std::clamp(samples[i], -1.f, 1.f) : 0.f;
      peak = std::max(peak, std::abs(value)); b.queue.push_back(value);
    }
    // Bound latency after a suspended audio device; discard whole stereo frames.
    constexpr size_t maximum = 48000 * 2 / 4;
    if (b.queue.size() > maximum) { size_t remove = (b.queue.size() - maximum + 1) & ~size_t(1); b.dropped += remove / 2; while (remove--) b.queue.pop_front(); }
    b.peak = peak; b.received += data->frames; if (peak > .001f) b.signalAt = GetTickCount64();
  }
  void render() {
    ComScope scope; Com<IMMDeviceEnumerator> en; Com<IMMDevice> dev; Com<IAudioClient> client; Com<IAudioRenderClient> render;
    HANDLE event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    try {
      if (!event) throw std::runtime_error("Create render event failed");
      check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void **)en.out()), "Create render enumerator");
      auto id = wide(deviceId); check(en->GetDevice(id.c_str(), dev.out()), "Open VB-CABLE render endpoint");
      Com<IMMDevice> recording; auto recordId = wide(captureId);
      check(en->GetDevice(recordId.c_str(), recording.out()), "Open VB-CABLE capture endpoint");
      CableVolume playbackVolume(dev.p), recordingVolume(recording.p);
      check(dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void **)client.out()), "Activate VB-CABLE render");
      WAVEFORMATEX fmt = {}; fmt.wFormatTag = WAVE_FORMAT_IEEE_FLOAT; fmt.nChannels = 2; fmt.nSamplesPerSec = 48000; fmt.wBitsPerSample = 32; fmt.nBlockAlign = 8; fmt.nAvgBytesPerSec = 384000;
      check(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, 300000, 0, &fmt, nullptr), "Initialize VB-CABLE render");
      check(client->SetEventHandle(event), "Set render event");
      check(client->GetService(__uuidof(IAudioRenderClient), (void **)render.out()), "Get render service");
      UINT32 capacity = 0; check(client->GetBufferSize(&capacity), "Get render capacity");
      // Preload one hardware buffer and retain two OBS audio blocks before
      // starting the clock. This avoids startup gaps from the first large write.
      bool primed = false;
      for (int i = 0; i < 500 && !stopRequested; ++i) {
        { std::lock_guard<std::mutex> lock(buffer); if (queue.size() >= size_t(capacity) * 2 + 4096) { primed = true; break; } }
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
      }
      if (stopRequested) { CloseHandle(event); return; }
      if (!primed) throw std::runtime_error("OBS program audio callback timed out");
      BYTE *initial = nullptr; check(render->GetBuffer(capacity, &initial), "Prime render buffer");
      { std::lock_guard<std::mutex> lock(buffer); for (size_t i = 0; i < size_t(capacity) * 2; ++i) { ((float *)initial)[i] = queue.front(); queue.pop_front(); } }
      check(render->ReleaseBuffer(capacity, 0), "Release initial render buffer"); rendered += capacity;
      check(client->Start(), "Start VB-CABLE render"); ready = true;
      while (!stopRequested) {
        if (WaitForSingleObject(event, 100) == WAIT_FAILED) throw std::runtime_error("Render event failed");
        UINT32 padding = 0; check(client->GetCurrentPadding(&padding), "Get render padding");
        if (padding > capacity) throw std::runtime_error("Invalid render padding");
        UINT32 available = capacity - padding; if (!available) continue;
        BYTE *out = nullptr; check(render->GetBuffer(available, &out), "Get render buffer");
        size_t count = size_t(available) * 2, copied = 0;
        { std::lock_guard<std::mutex> lock(buffer);
          if (primed) { copied = std::min(count, queue.size()); copied &= ~size_t(1); for (size_t i = 0; i < copied; ++i) { ((float *)out)[i] = queue.front(); queue.pop_front(); } }
        }
        if (copied < count) { std::memset(out + copied * sizeof(float), 0, (count - copied) * sizeof(float)); if (primed && !stopRequested) underruns++; }
        check(render->ReleaseBuffer(available, copied ? 0 : AUDCLNT_BUFFERFLAGS_SILENT), "Release render buffer"); rendered += copied / 2;
      }
      client->Stop();
    } catch (const std::exception &e) {
      { std::lock_guard<std::mutex> lock(buffer); error = e.what(); }
      running = false; ready = false;
    }
    if (event) CloseHandle(event);
  }
  void stop() {
    running = false;
    if (audio) { audio_output_disconnect(audio, 0, receive, this); audio = nullptr; }
    stopRequested = true; if (worker.joinable()) worker.join(); ready = false;
    std::lock_guard<std::mutex> lock(buffer); queue.clear(); peak = 0;
  }
  bool start(const std::string &renderId, const std::string &recordId) {
    stop(); auto inventory = devices();
    auto has = [&](const std::string &id, bool capture) { return std::any_of(inventory.endpoints.begin(), inventory.endpoints.end(), [&](const Endpoint &ep) { return ep.id == id && ep.capture == capture && ep.cable; }); };
    if (!has(renderId, false) || !has(recordId, true)) throw std::runtime_error("VB-CABLE endpoint pair is unavailable");
    deviceId = renderId; captureId = recordId; error.clear(); received = rendered = dropped = underruns = signalAt = 0; peak = 0;
    audio = obs_get_audio(); if (!audio) throw std::runtime_error("OBS program audio is not initialized");
    audio_convert_info conversion = {}; conversion.samples_per_sec = 48000; conversion.format = AUDIO_FORMAT_FLOAT; conversion.speakers = SPEAKERS_STEREO; conversion.allow_clipping = false;
    running = true; stopRequested = false;
    if (!audio_output_connect(audio, 0, &conversion, receive, this)) { audio = nullptr; running = false; throw std::runtime_error("Connect OBS program audio failed"); }
    worker = std::thread([this] { render(); });
    for (int i = 0; i < 200 && running && !ready; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    if (!ready) { stop(); return false; } return true;
  }
  void status(obs_data_t *out) {
    obs_data_set_int(out, "protocol", 1); obs_data_set_bool(out, "available", true);
    obs_data_set_bool(out, "active", running && ready); obs_data_set_int(out, "sampleRate", 48000); obs_data_set_int(out, "channels", 2);
    obs_data_set_int(out, "track", 1); obs_data_set_int(out, "receivedFrames", received); obs_data_set_int(out, "renderedFrames", rendered);
    obs_data_set_int(out, "droppedFrames", dropped); obs_data_set_int(out, "underruns", underruns);
    float p = peak; obs_data_set_double(out, "peakDb", p > 0 ? 20 * std::log10(p) : -96);
    obs_data_set_int(out, "signalAgeMs", signalAt ? GetTickCount64() - signalAt.load() : -1);
    obs_data_set_string(out, "renderId", deviceId.c_str()); obs_data_set_string(out, "captureId", captureId.c_str());
    std::lock_guard<std::mutex> lock(buffer); obs_data_set_string(out, "error", error.c_str()); obs_data_set_int(out, "queuedFrames", queue.size() / 2);
  }
} bridge;
obs_websocket_vendor vendor = nullptr;
void request(obs_data_t *in, obs_data_t *out, void *context) {
  std::lock_guard<std::mutex> operation(bridge.operation);
  try {
    auto action = (intptr_t)context;
    if (action == 1) bridge.start(obs_data_get_string(in, "renderId"), obs_data_get_string(in, "captureId"));
    else if (action == 2) bridge.stop();
  } catch (const std::exception &e) { bridge.stop(); std::lock_guard<std::mutex> lock(bridge.buffer); bridge.error = e.what(); }
  bridge.status(out);
}
}
extern "C" __declspec(dllexport) int riftcast_audio_load() {
  if (vendor) return 1;
  vendor = obs_websocket_register_vendor("riftcast-audio");
  if (!vendor) return 0;
  return obs_websocket_vendor_register_request(vendor, "status", request, (void *)0) &&
    obs_websocket_vendor_register_request(vendor, "start", request, (void *)1) &&
    obs_websocket_vendor_register_request(vendor, "stop", request, (void *)2);
}
extern "C" __declspec(dllexport) void riftcast_audio_unload() {
  std::lock_guard<std::mutex> operation(bridge.operation); bridge.stop();
  if (vendor) { for (const char *name : {"status", "start", "stop"}) obs_websocket_vendor_unregister_request(vendor, name); vendor = nullptr; }
}
