/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        primary: {
          50: '#eef2fd', 100: '#dde6fa', 200: '#bccdf5', 300: '#94aeee', 400: '#6a8ae8',
          500: '#4169E1', 600: '#3556c4', 700: '#2b45a0', 800: '#24387f', 900: '#1d2d63',
        },
        navy: { 900: '#0b1437', 800: '#14204a', 700: '#1f2d5c' },
        canvas: '#f5f6fa',
        line: '#e6e8f0',
        ink: { DEFAULT: '#0b1437', soft: '#5b6580', faint: '#8a93aa' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 64, 0.04), 0 1px 1px rgba(16, 24, 64, 0.03)',
        pop: '0 12px 32px -8px rgba(16, 24, 64, 0.18), 0 2px 6px rgba(16, 24, 64, 0.06)',
      },
      borderRadius: { xl: '0.875rem' },
    },
  },
  plugins: [],
};
