/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#070A0F',
          secondary: '#0B0F16',
          tertiary: '#111722',
        },
        surface: {
          primary: '#10151D',
          secondary: '#151B24',
          elevated: '#1A212C',
        },
        brand: {
          primary: '#7C5CFF',
          hover: '#8B70FF',
          active: '#6847E8',
          soft: 'rgba(124, 92, 255, 0.12)',
        },
        semantic: {
          success: '#32D583',
          warning: '#F5B942',
          error: '#FF5C67',
          info: '#4EA1FF',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.06)',
          default: 'rgba(255, 255, 255, 0.10)',
          strong: 'rgba(255, 255, 255, 0.16)',
        },
        text: {
          primary: '#F7F8FA',
          secondary: '#A7AFBD',
          tertiary: '#737C8C',
          disabled: '#4F5663',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '20px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
};
