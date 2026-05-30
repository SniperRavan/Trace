/** @type {import('tailwindcss').Config} */
export default {
  // Only scan files inside /src — keeps Tailwind fast and
  // avoids accidentally purging styles from node_modules.
  content: [
    './src/**/*.{ts,tsx,html}',
  ],

  // We always want dark mode. 'class' strategy lets us toggle
  // it programmatically (add/remove 'dark' on the shadow root).
  darkMode: 'class',

  theme: {
    extend: {
      // Trace design tokens
      colors: {
        surface: {
          base:    '#0d0f14',
          raised:  '#141720',
          overlay: '#1a1d24',
        },
        border: {
          subtle: 'rgba(255,255,255,0.06)',
          muted:  'rgba(255,255,255,0.10)',
          strong: 'rgba(255,255,255,0.18)',
        },
        text: {
          primary:   'rgba(255,255,255,0.85)',
          secondary: 'rgba(255,255,255,0.50)',
          muted:     'rgba(255,255,255,0.25)',
          ghost:     'rgba(255,255,255,0.15)',
        },
        // Provider brand colors
        provider: {
          chatgpt:    '#10b981',
          claude:     '#f59e0b',
          gemini:     '#818cf8',
          grok:       '#9ca3af',
          perplexity: '#06b6d4',
          deepseek:   '#3b82f6',
          meta:       '#1877f2',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      borderRadius: {
        'xl2': '16px',
        'xl3': '20px',
      },

      animation: {
        'pulse-slow':   'pulse 2.5s ease-in-out infinite',
        'breathe':      'breathe 2s ease-in-out infinite',
        'slide-up':     'slideUp 0.2s ease-out',
        'slide-down':   'slideDown 0.2s ease-out',
        'fade-in':      'fadeIn 0.15s ease-out',
      },

      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        slideUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },

  plugins: [],
}
