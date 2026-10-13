-- SPDX-License-Identifier: GPL-2.0-or-later
-- Loads one hash-verified, application-owned library. OBS keeps its bundled
-- plugin allowlist; no user/global third-party plugins need to be enabled.
local obs = obslua
local ffi = require("ffi")
ffi.cdef[[
  int riftcast_audio_load(void);
  void riftcast_audio_unload(void);
  void *LoadLibraryW(const uint16_t *path);
  unsigned long GetLastError(void);
]]
local bridge
-- LuaJIT's ffi.load uses the ANSI Windows loader. Open the fixed owned DLL
-- through UTF-16 first, then resolve its ASCII module name. Chinese paths and
-- supplementary Unicode characters remain valid.
local function utf16(value)
  local out = ffi.new("uint16_t[?]", #value + 1)
  local i, n = 1, 0
  while i <= #value do
    local first = value:byte(i)
    local cp, count = first, 1
    if first >= 240 then cp, count = first - 240, 4
    elseif first >= 224 then cp, count = first - 224, 3
    elseif first >= 192 then cp, count = first - 192, 2 end
    for j = 1, count - 1 do cp = cp * 64 + value:byte(i + j) - 128 end
    if cp >= 65536 then cp = cp - 65536; out[n] = 55296 + math.floor(cp / 1024); n = n + 1; out[n] = 56320 + cp % 1024
    else out[n] = cp end
    n, i = n + 1, i + count
  end
  return out
end
local function initialize()
  if bridge and bridge.riftcast_audio_load() ~= 0 then obs.timer_remove(initialize) end
end
function script_description()
  return "RiftCast Program audio track 1 to VB-CABLE (48 kHz stereo)."
end
function script_load(settings)
  local file = obs.obs_data_get_string(settings, "library")
  if file == "" then return end
  if ffi.C.LoadLibraryW(utf16(file)) == nil then error("RiftCast audio library load failed: " .. tonumber(ffi.C.GetLastError())) end
  bridge = ffi.load("riftcast-audio-bridge.dll")
  initialize()
  obs.timer_add(initialize, 500)
end
function script_unload()
  obs.timer_remove(initialize)
  if bridge then bridge.riftcast_audio_unload() end
end
