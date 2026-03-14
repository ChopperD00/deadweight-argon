/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Fragment Mono', 'Geist Mono', 'monospace'],
      },
      colors: {
        surface: { 0: '#0a0a0a', 1: '#111113', 2: '#18181b', 3: '#1e1e22' },
        accent: { DEFAULT: '#7c6af7', dim: 'rgba(124,106,247,0.12)' },
        success: { DEFAULT: '#4ade80', dim: 'rgba(74,222,128,0.12)' },
        warn: { DEFAULT: '#f59e0b', dim: 'rgba(245,158,11,0.12)' },
        err: { DEFAULT: '#ef4444', dim: 'rgba(239,68,68,0.12)' },
      },
    },
  },
  plugins: [],
};
