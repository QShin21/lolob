import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export type UiTheme = 'dark' | 'light';
const storageKey = 'riftcast-ui-theme';
const parseTheme = (value: string | null): UiTheme => value === 'light' ? 'light' : 'dark';
const isOutput = () => window.location.pathname.startsWith('/overlay');

type ThemePreference = { theme: UiTheme; persistent: boolean };
function readPreference(): ThemePreference {
  try { return { theme: parseTheme(localStorage.getItem(storageKey)), persistent: true }; }
  catch { return { theme: 'dark', persistent: false }; }
}

type ThemeContext = { theme: UiTheme; persistent: boolean; setTheme: (theme: UiTheme) => void };
const ThemeContext = createContext<ThemeContext | null>(null);

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [{ theme, persistent }, updatePreference] = useState<ThemePreference>(() => isOutput() ? { theme: 'dark', persistent: true } : readPreference());

  useLayoutEffect(() => {
    const applied = isOutput() ? 'dark' : theme;
    document.documentElement.dataset.uiTheme = applied;
    document.documentElement.style.colorScheme = applied;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', applied === 'light' ? '#f3f6fa' : '#0b1119');
  }, [theme]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (isOutput() || (event.key !== storageKey && event.key !== null)) return;
      try { if (event.storageArea !== localStorage) return; } catch { return; }
      updatePreference({ theme: parseTheme(event.newValue), persistent: true });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function setTheme(next: UiTheme) {
    try { localStorage.setItem(storageKey, next); updatePreference({ theme: next, persistent: true }); }
    catch { updatePreference({ theme: next, persistent: false }); }
  }

  return <ThemeContext.Provider value={{ theme, persistent, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useUiTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useUiTheme requires UiThemeProvider');
  return context;
}
