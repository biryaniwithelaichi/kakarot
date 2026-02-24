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
        // Surfaces -- widened gaps for visible layer separation
        surface: '#090909',
        card: '#141414',
        input: '#1C1C1C',

        // Borders
        edge: '#282828',
        'edge-light': '#3A3A3A',
        'edge-subtle': '#1C1C1C',

        // Text
        cream: '#F0EBE3',
        muted: '#9C9690',
        dim: '#5C5750',

        // Accent
        accent: '#4ea8dd',
        'accent-hover': '#3d96cb',

        // Status
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
      },

      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)',
        'elevated': '0 1px 0 rgba(255,255,255,0.03) inset, 0 4px 16px -4px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)',
        'overlay': '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px -8px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        'input': 'inset 0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.02)',
      },

      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },

      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },

      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 1.5s linear infinite',
      },

      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
