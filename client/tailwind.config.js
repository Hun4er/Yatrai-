/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Direct Graphite & Amber Tokens
        graphite: {
          bg: '#0B0D10',
          surface: '#12151A',
          raised: '#181C22',
          input: '#15191F',
          line: '#303640',
          strong: '#3A414C',
        },
        amber: {
          accent: '#E8B04A',
          hover: '#F2BE62',
          on: '#0B0D10',
        },
        ink: {
          primary: '#F0F1F3',
          secondary: '#A7AFBA',
          muted: '#7E8794',
        },

        // Backward-compatible semantic tokens mapped to Graphite & Amber palette
        background: {
          primary: '#0B0D10',
          secondary: '#12151A',
          tertiary: '#181C22',
        },
        surface: {
          primary: '#12151A',
          secondary: '#181C22',
          elevated: '#181C22',
        },
        brand: {
          primary: '#E8B04A',
          hover: '#F2BE62',
          active: '#E8B04A',
          soft: 'rgba(232, 176, 74, 0.12)',
        },
        semantic: {
          success: '#4CC38A',
          warning: '#E07B39',
          error: '#E5484D',
          info: '#4EA1FF',
        },
        border: {
          subtle: '#303640',
          default: '#303640',
          strong: '#3A414C',
        },
        text: {
          primary: '#F0F1F3',
          secondary: '#A7AFBA',
          tertiary: '#7E8794',
          muted: '#7E8794',
          disabled: '#7E8794',
        },
      },
      fontFamily: {
        serif: [
          '"Playfair Display"',
          'Newsreader',
          'Georgia',
          'serif',
        ],
        sans: [
          'Geist',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'Geist Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      letterSpacing: {
        tightest: '-0.02em',
      },
      borderRadius: {
        card: '12px',
        control: '10px',
        xl: '10px',
        '2xl': '12px',
      },
    },
  },
  plugins: [],
};
