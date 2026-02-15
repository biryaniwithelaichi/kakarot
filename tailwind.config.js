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
        // Warm Noir palette
        onyx: '#0C0C0C',
        graphite: '#2A2A2A',
        cream: '#F0EBE3',

        primary: {
          50: '#FAF8F5',
          100: '#F0EBE3',
          200: '#DDD5C8',
          300: '#C4B9A8',
          400: '#9C9690',
          500: '#C17F3E',
          600: '#A96D35',
          700: '#2A2A2A',
          800: '#161616',
          900: '#0C0C0C',
        },
        accent: {
          light: '#D4923F',
          DEFAULT: '#C17F3E',
          dark: '#A96D35',
          soft: 'rgba(193,127,62,0.12)',
          glow: 'rgba(193,127,62,0.25)',
        },
        text: {
          primary: '#F0EBE3',
          secondary: '#9C9690',
          muted: '#5C5750',
          inverse: '#0C0C0C',
        },
        surface: {
          light: '#F0EBE3',
          dark: '#0C0C0C',
          elevated: {
            light: '#F0EBE3',
            dark: '#161616',
          },
          card: '#161616',
          input: '#1E1E1E',
        },
        border: {
          light: '#3A3A3A',
          dark: '#2A2A2A',
          subtle: '#1E1E1E',
        },
        status: {
          success: '#4ADE80',
          error: '#F87171',
          warning: '#FBBF24',
          info: '#60A5FA',
        },
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
        'soft': '0 2px 8px -2px rgba(0,0,0,0.15)',
        'soft-card': '0 20px 50px -25px rgba(0,0,0,0.5)',
        'elevated': '0 4px 16px -4px rgba(0,0,0,0.25)',
        'overlay': '0 8px 32px -8px rgba(0,0,0,0.4)',
        'copper-glow': '0 0 30px rgba(193,127,62,0.15)',
        'copper-soft': '0 4px 20px rgba(193,127,62,0.1)',
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
            boxShadow: '0 10px 50px rgba(193,127,62,0.15)',
            borderColor: 'rgba(193,127,62,0.2)',
          },
          '50%': {
            boxShadow: '0 10px 60px rgba(193,127,62,0.25)',
            borderColor: 'rgba(193,127,62,0.4)',
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
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
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
