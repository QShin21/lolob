import { execFile } from 'node:child_process';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import type { AudioDevices, AudioEndpoint } from '../shared/obs-output';

const runFile = promisify(execFile);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const encode = (script: string) => Buffer.from(script, 'utf16le').toString('base64');
const archiveHash = 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb';
type Runner = (file: string, args: string[], timeout: number) => Promise<{ stdout: string }>;
const execute: Runner = (file, args, timeout) => runFile(file, args, { windowsHide: true, timeout, maxBuffer: 65536, encoding: 'utf8' });
export type AudioDriverStatus = { available: boolean; installed: boolean; devices: AudioDevices; render?: AudioEndpoint; capture?: AudioEndpoint; needsRestart?: boolean; error?: string };
const empty: AudioDevices = { defaultRender: '', defaultCapture: '', endpoints: [] };

/** Fixed bundled installer, active Windows endpoints, no default-device writes. */
export class VirtualAudioDriver {
  private cached?: { at: number; value: AudioDriverStatus };
  private pending?: Promise<AudioDriverStatus>;
  private installedThisSession = false;
  constructor(private root: string, private dataDir: string, private run: Runner = execute) {}
  async status(refresh = false): Promise<AudioDriverStatus> {
    if (!refresh && this.cached && Date.now() - this.cached.at < 15000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.inspect();
    try { const value = await this.pending; this.cached = { at: Date.now(), value }; return value; } finally { this.pending = undefined; }
  }
  private async inspect(): Promise<AudioDriverStatus> {
    let available = false;
    const archive = this.archive();
    try { await access(archive); available = true; } catch {}
    try {
      const { stdout } = await this.run(path.join(this.root, 'scripts/bin/audio-device-tool.exe'), ['list'], 6000);
      const devices = JSON.parse(stdout.trim()) as AudioDevices;
      if (!devices || !Array.isArray(devices.endpoints) || devices.endpoints.some(ep => typeof ep.id !== 'string' || typeof ep.name !== 'string' || typeof ep.cable !== 'boolean' || typeof ep.capture !== 'boolean')) throw new Error();
      const renders = devices.endpoints.filter(ep => ep.cable && !ep.capture && !/\b16ch\b/i.test(ep.name)), captures = devices.endpoints.filter(ep => ep.cable && ep.capture);
      if (renders.length > 1 || captures.length > 1) return { available, installed: false, devices, error: '检测到多组基础版 VB-CABLE 设备，请保留一组可用设备后刷新' };
      const render = renders[0], capture = captures[0], installed = !!render && !!capture;
      if (!this.installedThisSession) this.installedThisSession = devices.cablePresent === true || existsSync(path.join(this.dataDir, 'audio-driver', 'Pack45', 'installed.json'));
      return { available, installed, devices, render, capture, needsRestart: this.installedThisSession && !installed,
        ...(!installed && this.installedThisSession ? { error: '驱动已运行安装。请重启 Windows 并重新打开 OB 与直播伴侣；远程桌面需允许本机音频设备' } : {}) };
    } catch { return { available, installed: false, devices: empty, error: 'Windows 音频设备读取失败，请刷新后重试' }; }
  }
  private archive() {
    if (process.env.RIFTCAST_VBCABLE_ARCHIVE) return path.resolve(process.env.RIFTCAST_VBCABLE_ARCHIVE);
    const bundled = path.join(this.root, '..', 'vbcable', 'VBCABLE_Driver_Pack45.zip');
    return existsSync(bundled) ? bundled : path.join(this.root, 'runtime', 'vbcable', 'VBCABLE_Driver_Pack45.zip');
  }
  async install(): Promise<AudioDriverStatus> {
    const before = await this.status(true); if (before.installed) return before;
    if (before.error && !before.needsRestart) throw new Error(before.error);
    if (before.needsRestart) return before; // Never repeatedly install an inactive driver.
    const archive = this.archive();
    const contents = await readFile(archive).catch(() => { throw new Error('随包的 VB-CABLE 安装文件缺失，请重新安装完整 Release'); });
    if (createHash('sha256').update(contents).digest('hex') !== archiveHash) throw new Error('VB-CABLE 安装文件校验失败，已停止安装');
    const staging = path.join(this.dataDir, 'audio-driver', 'Pack45'); await mkdir(staging, { recursive: true });
    const setup = path.join(staging, 'VBCABLE_Setup_x64.exe');
    const prepare = "$ErrorActionPreference='Stop'; Import-Module ($env:windir+'\\System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'); Expand-Archive -LiteralPath " + quote(archive) + ' -DestinationPath ' + quote(staging) + " -Force; $s=Get-AuthenticodeSignature -LiteralPath " + quote(setup) + "; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'BUREL VINCENT'){throw 'Invalid official installer signature'}";
    try { await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(prepare)], 15000); }
    catch { throw new Error('VB-CABLE 解压或官方数字签名校验失败，请重新安装完整 Release'); }
    // The unmodified official installer accepts -i (install) and -h (hidden).
    // Windows remains responsible for driver publisher and UAC prompts.
    const script = "$ErrorActionPreference='Stop'; $p=Start-Process -FilePath " + quote(setup) + " -ArgumentList @('-i','-h') -Verb RunAs -WindowStyle Hidden -Wait -PassThru; if($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010){exit 1}";
    try { await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)], 120000); }
    catch { this.cached = undefined; throw new Error('虚拟音频驱动安装未完成，请接受 Windows 管理员授权后重试'); }
    this.installedThisSession = true;
    await writeFile(path.join(staging, 'installed.json'), JSON.stringify({ installedAt: new Date().toISOString(), archiveSha256: archiveHash }));
    this.cached = undefined;
    const defaults = before.devices.defaults;
    if (defaults?.length === 6 && defaults.every(value => typeof value === 'string')) {
      try { await this.run(path.join(this.root, 'scripts/bin/audio-device-tool.exe'), ['restore-defaults', ...defaults], 6000); }
      catch { throw new Error('驱动已安装，原默认音频设备尚未恢复。请在 Windows 声音设置切回原扬声器和麦克风，再刷新设备'); }
    }
    return this.status(true);
  }
}
