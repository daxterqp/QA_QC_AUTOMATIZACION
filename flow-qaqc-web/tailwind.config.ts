import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa S-CUA
        navy:      '#0e213d',
        primary:   '#394e7d',
        secondary: '#668abc',
        light:     '#bbcee7',
        surface:   '#f3f5f6',
        border:    '#d4dde8',
        divider:   '#e8edf4',
        // Semánticos
        success:   '#2e7d5e',
        danger:    '#c0392b',
        warning:   '#c47d15',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:   '0 2px 8px rgba(14,33,61,0.08)',
        subtle: '0 1px 4px rgba(14,33,61,0.04)',
        modal:  '0 8px 32px rgba(14,33,61,0.18)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      animation: {
        'fade-up': 'fadeSlideUp 0.8s ease-out forwards',
        'spin-slow': 'spinSlow 20s linear infinite',
        'float-drift': 'floatDrift 15s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'sweep-right': 'sweepRight 2s ease-out forwards',
        'grid-reveal': 'gridReveal 1.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}

export default config
