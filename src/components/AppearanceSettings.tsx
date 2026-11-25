import { Check, Moon, Sun } from 'lucide-react';
import { useUiTheme } from '../ui-theme';
import './appearance-settings.css';

const options = [
  { value: 'dark', title: '深色风格', description: '「墨」近黑画布与纸白文字，适合暗场导播。', Icon: Moon },
  { value: 'light', title: '浅色风格', description: '「素」冷灰画布与纸白面板，适合明亮环境。', Icon: Sun },
] as const;

/** A miniature of the studio page drawn with one theme's own tokens: rail, top bar, the two tally-framed
 *  monitors, scene bank, dock and the deck with TAKE. */
function ThemeMiniature({ value }: { value: 'dark' | 'light' }) {
  return <span className={`theme-option-preview theme-preview-${value}`} aria-hidden="true">
    <span className="theme-mini-rail"><i /><b /><b /><b /><b /></span>
    <span className="theme-mini-body">
      <span className="theme-mini-top"><b /><i /><em /></span>
      <span className="theme-mini-page">
        <span className="theme-mini-vision">
          <span className="theme-mini-monitors"><i data-bus="pgm" /><i data-bus="pvw" /></span>
          <span className="theme-mini-bank"><b /><span><i /><i data-bus="pvw" /><i /><i data-bus="pgm" /><i /><i /><i /><i /></span></span>
        </span>
        <span className="theme-mini-dock"><b /><span><i /><i /><i /></span><em /></span>
      </span>
      <span className="theme-mini-deck"><i /><b /><em /></span>
    </span>
  </span>;
}

export function AppearanceSettings() {
  const { theme, persistent, setTheme } = useUiTheme();
  return <section className="panel appearance-panel">
    <div className="panel-head"><div><h2>系统外观</h2><p className="muted" id="theme-description">选择工作台的界面风格，切换后立即生效。</p></div></div>
    <fieldset className="theme-options" aria-describedby="theme-description theme-scope">
      <legend className="sr-only">界面风格</legend>
      {options.map(({ value, title, description, Icon }) => <label className={`theme-option ${theme === value ? 'selected' : ''}`} key={value}>
        <input type="radio" name="ui-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
        <ThemeMiniature value={value} />
        <span className="theme-option-copy"><strong><Icon size={16} />{title}{theme === value && <Check size={16} />}</strong><small>{description}</small></span>
      </label>)}
    </fieldset>
    <p className="muted" id="theme-scope">偏好保存在当前浏览器或桌面客户端，下次打开自动沿用。节目输出与场景包装保持各自的播出配色。</p>
    <p className={persistent ? 'theme-save-status' : 'theme-save-status warning'} role="status">{persistent ? `当前使用${theme === 'light' ? '浅色' : '深色'}风格 · 自动保存` : '当前风格已应用。浏览器存储不可用，重新打开后需再次选择。'}</p>
  </section>;
}
