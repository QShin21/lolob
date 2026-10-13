import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { VirtualCameraDriverStatus } from '../shared/obs-output';

const runFile = promisify(execFile);
const clsid = '{A3FCE0F5-3493-419F-958A-ABA1250EC20B}';
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const encode = (script: string) => Buffer.from(script, 'utf16le').toString('base64');
type PowerShellRunner = (script: string, timeout: number) => Promise<{ stdout: string }>;
const executePowerShell: PowerShellRunner = (script, timeout) => runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)], { windowsHide: true, timeout, maxBuffer: 16384 });

/** Reuse a valid OBS registration. Register bundled modules only after an explicit install action. */
export class VirtualCameraDriver {
  private cached?: { at: number; value: VirtualCameraDriverStatus };
  private pending?: Promise<VirtualCameraDriverStatus>;
  constructor(private runtimeRoot: () => string, private execute: PowerShellRunner = executePowerShell) {}
  private modules() {
    return [32, 64].map(bits => path.join(this.runtimeRoot(), 'data', 'obs-plugins', 'win-dshow', 'obs-virtualcam-module' + bits + '.dll'));
  }
  async status(refresh = false): Promise<VirtualCameraDriverStatus> {
    if (!refresh && this.cached && Date.now() - this.cached.at < 30000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.inspect();
    try { const value = await this.pending; this.cached = { at: Date.now(), value }; return value; }
    finally { this.pending = undefined; }
  }
  private async inspect(): Promise<VirtualCameraDriverStatus> {
    if (process.platform !== 'win32') return { available: false, installed: false, error: '虚拟摄像头需要 Windows x64' };
    let available = false;
    try { await Promise.all(this.modules().map(file => access(file))); available = true; } catch { /* Incomplete runtime stays unavailable. */ }
    try {
      const registries = ['', 'WOW6432Node\\'].map(branch => 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\' + branch + 'CLSID\\' + clsid + '\\InprocServer32');
      const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $installed=$true; foreach($p in @(" + registries.map(quote).join(',') + ")){ if(!(Test-Path -LiteralPath $p)){$installed=$false;continue}; $dll=(Get-Item -LiteralPath $p).GetValue(''); if(!($dll -is [string]) -or !(Test-Path -LiteralPath $dll -PathType Leaf)){$installed=$false} }; @{installed=$installed}|ConvertTo-Json -Compress";
      const { stdout } = await this.execute(script, 8000);
      return { available, installed: JSON.parse(stdout.trim()).installed === true };
    } catch { return { available, installed: false, error: '虚拟摄像头注册状态读取失败，请刷新后重试' }; }
  }
  async install(): Promise<VirtualCameraDriverStatus> {
    const before = await this.status(true);
    if (before.installed) return before;
    if (before.error) throw new Error(before.error);
    if (!before.available) throw new Error('安装包中的虚拟摄像头组件缺失，请重新安装完整 Release');
    const [module32, module64] = this.modules();
    // Fixed owned runtime paths are encoded before crossing the UAC boundary.
    // Each bitness retains an existing valid registration, including a separate OBS installation.
    const registration = (bits: number, dll: string) => {
      const branch = bits === 32 ? 'WOW6432Node\\' : '';
      const registry = 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\' + branch + 'CLSID\\' + clsid + '\\InprocServer32';
      const executable = bits === 32 ? '$env:windir+"\\SysWOW64\\regsvr32.exe"' : '$env:windir+"\\System32\\regsvr32.exe"';
      return '$p=' + quote(registry) + '; $old=if(Test-Path -LiteralPath $p){(Get-Item -LiteralPath $p).GetValue(\'\')}else{\'\'}; if(!$old -or !(Test-Path -LiteralPath $old -PathType Leaf)){ & (' + executable + ') /i /s ' + quote(dll) + '; if($LASTEXITCODE -ne 0){exit 1}};';
    };
    const elevated = "$ErrorActionPreference='Stop'; try {" + registration(32, module32) + registration(64, module64) + '} catch {exit 1}; exit 0';
    const wrapper = "$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ($env:windir+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand'," + quote(encode(elevated)) + ') -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode';
    try { await this.execute(wrapper, 120000); }
    catch { this.cached = undefined; throw new Error('虚拟摄像头安装未完成。请接受 Windows 管理员授权后重试，随后重新打开直播伴侣'); }
    this.cached = undefined;
    const after = await this.status(true);
    if (!after.installed) throw new Error(after.error || '虚拟摄像头尚未注册成功，请重新安装完整 Release 后重试');
    return after;
  }
}
