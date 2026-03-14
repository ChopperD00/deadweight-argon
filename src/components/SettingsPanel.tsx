'use client';
import { useTheme, ThemeMode, FontChoice, FontScale } from './ThemeProvider';

const THEMES: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'dark', label: 'Dark', icon: '◑' },
  { id: 'light', label: 'Light', icon: '○' },
  { id: 'system', label: 'System', icon: '◐' },
];

const FONTS: { id: FontChoice; label: string; preview: string; desc: string }[] = [
  { id: 'default', label: 'Geist', preview: 'Aa', desc: 'Default — clean, modern sans' },
  { id: 'system', label: 'System', preview: 'Aa', desc: 'OS native — fastest load' },
  { id: 'mono', label: 'Mono', preview: 'Aa', desc: 'Fragment Mono — technical feel' },
  { id: 'dyslexic', label: 'Accessible', preview: 'Aa', desc: 'OpenDyslexic — high legibility' },
];

const SIZES: { id: FontScale; label: string; sample: string }[] = [
  { id: 'sm', label: 'Small', sample: 'A' },
  { id: 'md', label: 'Default', sample: 'A' },
  { id: 'lg', label: 'Large', sample: 'A' },
  { id: 'xl', label: 'XL', sample: 'A' },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.2em] text-white/25 mb-3">
      {children}
    </div>
  );
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full p-4 bg-surface-1 border border-white/[0.06] rounded-xl transition-all hover:border-white/[0.08]"
    >
      <div className="text-left">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="text-[11px] text-white/25 mt-0.5">{description}</div>
      </div>
      <div className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/10'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

export default function SettingsPanel() {
  const { settings, update, reset } = useTheme();

  return (
    <div className="max-w-2xl animate-in space-y-8">
      {/* Theme */}
      <div>
        <SectionLabel>APPEARANCE</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => {
            const active = settings.theme === t.id;
            return (
              <button key={t.id} onClick={() => update({ theme: t.id })}
                className={`p-3 rounded-lg border transition-all text-center ${
                  active ? 'border-accent/40 bg-accent/[0.06]' : 'border-white/[0.04] hover:border-white/[0.08] bg-surface-2'
                }`}>
                <div className={`text-lg mb-1 ${active ? 'text-accent' : 'text-white/20'}`}>{t.icon}</div>
                <div className={`text-xs font-medium ${active ? 'text-white/80' : 'text-white/30'}`}>{t.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Font */}
      <div>
        <SectionLabel>FONT</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FONTS.map(f => {
            const active = settings.font === f.id;
            const family = f.id === 'default' ? "'Geist', sans-serif"
              : f.id === 'system' ? 'system-ui, sans-serif'
              : f.id === 'mono' ? "'Fragment Mono', monospace"
              : "'Comic Sans MS', sans-serif";
            return (
              <button key={f.id} onClick={() => update({ font: f.id })}
                className={`text-left p-3 rounded-lg border transition-all ${
                  active ? 'border-accent/40 bg-accent/[0.06]' : 'border-white/[0.04] hover:border-white/[0.08] bg-surface-2'
                }`}>
                <div className={`text-xl mb-2 ${active ? 'text-white/90' : 'text-white/20'}`} style={{ fontFamily: family }}>{f.preview}</div>
                <div className={`text-xs font-medium ${active ? 'text-white/80' : 'text-white/30'}`}>{f.label}</div>
                <div className="font-mono text-[10px] text-white/15 mt-0.5">{f.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Size */}
      <div>
        <SectionLabel>TEXT SIZE</SectionLabel>
        <div className="flex gap-2">
          {SIZES.map(s => {
            const active = settings.fontSize === s.id;
            const scale = s.id === 'sm' ? 14 : s.id === 'md' ? 16 : s.id === 'lg' ? 18 : 20;
            return (
              <button key={s.id} onClick={() => update({ fontSize: s.id })}
                className={`flex-1 flex flex-col items-center py-3 rounded-lg border transition-all ${
                  active ? 'border-accent/40 bg-accent/[0.06]' : 'border-white/[0.04] hover:border-white/[0.08] bg-surface-2'
                }`}>
                <span className={`font-medium mb-1 ${active ? 'text-white/90' : 'text-white/20'}`} style={{ fontSize: `${scale}px` }}>{s.sample}</span>
                <span className={`font-mono text-[9px] ${active ? 'text-white/50' : 'text-white/15'}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accessibility */}
      <div>
        <SectionLabel>ACCESSIBILITY</SectionLabel>
        <div className="space-y-2">
          <Toggle label="Reduced motion" description="Disable animations and transitions"
            checked={settings.reducedMotion} onChange={reducedMotion => update({ reducedMotion })} />
          <Toggle label="High contrast" description="Increase text contrast and border visibility"
            checked={settings.highContrast} onChange={highContrast => update({ highContrast })} />
        </div>
      </div>

      {/* Preview */}
      <div>
        <SectionLabel>PREVIEW</SectionLabel>
        <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-6 space-y-3">
          <div className="text-lg font-semibold" style={{ fontFamily: 'var(--font-ui)' }}>
            The quick brown fox jumps over the lazy dog
          </div>
          <div className="text-sm text-white/50" style={{ fontFamily: 'var(--font-ui)' }}>
            Body text at your selected size. This is how descriptions, prompts, and interface copy will appear across Arg0n.
          </div>
          <div className="font-mono text-[10px] text-white/25 tracking-wider">
            MONO LABEL · 10PX · TRACKING 0.2EM
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="flex justify-end">
        <button onClick={reset}
          className="font-mono text-[10px] tracking-[0.12em] text-white/25 hover:text-white/50 transition px-4 py-2 rounded-lg border border-white/[0.04] hover:border-white/[0.08]">
          RESET TO DEFAULTS
        </button>
      </div>
    </div>
  );
}
