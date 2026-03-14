'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontChoice = 'default' | 'system' | 'mono' | 'dyslexic';
export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface DisplaySettings {
  theme: ThemeMode;
  font: FontChoice;
  fontSize: FontScale;
  reducedMotion: boolean;
  highContrast: boolean;
}

const DEFAULTS: DisplaySettings = {
  theme: 'dark',
  font: 'default',
  fontSize: 'md',
  reducedMotion: false,
  highContrast: false,
};

const STORAGE_KEY = 'argon-display-settings';

const FONT_STACKS: Record<FontChoice, string> = {
  default: "'Geist', system-ui, sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'Fragment Mono', 'SF Mono', 'Fira Code', monospace",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', 'Trebuchet MS', sans-serif",
};

const FONT_SCALES: Record<FontScale, string> = {
  sm: '0.875',
  md: '1',
  lg: '1.125',
  xl: '1.25',
};

interface ThemeContextValue {
  settings: DisplaySettings;
  update: (partial: Partial<DisplaySettings>) => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  settings: DEFAULTS,
  update: () => {},
  reset: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const resolved = resolveTheme(settings.theme);

    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
    root.style.setProperty('--font-ui', FONT_STACKS[settings.font]);
    root.style.setProperty('--font-scale', FONT_SCALES[settings.fontSize]);
    root.style.fontSize = `${parseFloat(FONT_SCALES[settings.fontSize]) * 16}px`;

    if (settings.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    if (settings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    root.style.colorScheme = resolved;

    return () => {
      root.style.removeProperty('--font-ui');
      root.style.removeProperty('--font-scale');
    };
  }, [settings, mounted]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(mq.matches ? 'dark' : 'light');
      root.style.colorScheme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  const update = (partial: Partial<DisplaySettings>) =>
    setSettings(prev => ({ ...prev, ...partial }));

  const reset = () => setSettings(DEFAULTS);

  return (
    <ThemeContext.Provider value={{ settings, update, reset }}>
      {children}
    </ThemeContext.Provider>
  );
}
