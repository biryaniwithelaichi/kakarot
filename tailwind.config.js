/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html',
    './src/renderer/callout.html',
  ],
  theme: {
    extend: {
      colors: {
        onyx: '#0C0C0C',
        graphite: '#1A1A1A',
        studio: '#F9FAFB',
        'studio-card': '#FFFFFF',

        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        accent: {
          light: '#38BDF8',
          dark: '#7C3AED',
        },
        text: {
          primary: '#1F2937',
          secondary: '#6B7280',
          muted: '#9CA3AF',
          inverse: '#FFFFFF',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#0C0C0C',
          elevated: {
            light: '#F9FAFB',
            dark: '#1A1A1A',
          },
          card: '#161616',
          input: '#1E1E1E',
        },
        border: {
          light: '#E5E7EB',
          dark: '#1A1A1A',
          subtle: '#1E1E1E',
        },
        status: {
          success: '#10B981',
          error: '#EF4444',
          warning: '#F59E0B',
          info: '#3B82F6',
        },

        'emerald-mist': '#10B981',
        'slate-ink': '#1F2937',
        'sky-glow': '#38BDF8',
      },

      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },

      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.375rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
      },

      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0,0,0,0.1)',
        'soft-card': '0 20px 50px -25px rgba(0,0,0,0.35)',
        'elevated': '0 4px 16px -4px rgba(0,0,0,0.15)',
        'overlay': '0 8px 32px -8px rgba(0,0,0,0.25)',
        'inner-light': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },

      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },

      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-sine': 'cubic-bezier(0.37, 0, 0.63, 1)',
      },

      keyframes: {
        'bubble-in': {
          '0%': { opacity: 0, transform: 'translateY(8px) scale(0.99)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-border': {
          '0%, 100%': {
            boxShadow: '0 10px 50px rgba(124,58,237,0.25)',
            borderColor: 'rgba(124,58,237,0.3)',
          },
          '50%': {
            boxShadow: '0 10px 60px rgba(124,58,237,0.35)',
            borderColor: 'rgba(124,58,237,0.5)',
          },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: 0.4 },
          '50%': { opacity: 1 },
        },
      },

      animation: {
        'bubble-in': 'bubble-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },

      fontFamily: {
        sans: ['Inter', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
