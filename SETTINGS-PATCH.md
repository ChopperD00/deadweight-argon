# Settings Tab — Manual Patch for page.tsx

The ThemeProvider, SettingsPanel, globals.css, and layout.tsx are ready.
Apply these changes to `src/app/page.tsx` to wire up the settings tab:

## 1. Update Tab type (line ~7)

```diff
- type Tab = 'video' | 'image' | 'audio' | 'workflows' | 'guide';
+ type Tab = 'video' | 'image' | 'audio' | 'workflows' | 'guide' | 'settings';
```

## 2. Add import (top of file)

```diff
+ import SettingsPanel from '../components/SettingsPanel';
```

## 3. Add settings button to tab bar (~line 180)

In the tab bar `(['video', 'image', 'audio', 'workflows', 'guide'] as Tab[])`,
add `'settings'`:

```diff
- {(['video', 'image', 'audio', 'workflows', 'guide'] as Tab[]).map(t => (
+ {(['video', 'image', 'audio', 'workflows', 'guide', 'settings'] as Tab[]).map(t => (
```

And update the label ternary:

```diff
- {t === 'video' ? '◆ Video' : t === 'image' ? '◇ Image' : t === 'audio' ? '♫ Audio' : t === 'workflows' ? '⬡ Workflows' : '? Guide'}
+ {t === 'video' ? '◆ Video' : t === 'image' ? '◇ Image' : t === 'audio' ? '♫ Audio' : t === 'workflows' ? '⬡ Workflows' : t === 'guide' ? '? Guide' : '⚙ Settings'}
```

## 4. Add settings panel render (~line 280, after guide)

```diff
  {tab === 'guide' && <GuidePanel />}
  {tab === 'workflows' && <WorkflowsPanel />}
+ {tab === 'settings' && <SettingsPanel />}
```

## What it does

- **Appearance**: Dark / Light / System theme toggle
- **Font**: Geist (default), System, Mono, OpenDyslexic (accessibility)
- **Text Size**: Small / Default / Large / XL
- **Accessibility**: Reduced motion toggle, High contrast toggle
- **Preview**: Live preview of selected settings
- **Persistence**: All settings saved to localStorage as `argon-display-settings`

All changes are CSS-variable driven via ThemeProvider. No Tailwind config changes required.
