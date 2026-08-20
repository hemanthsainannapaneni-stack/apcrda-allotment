/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f6fb', 100: '#e2ecf7', 200: '#c5d8ee', 300: '#98bade',
          400: '#6497ca', 500: '#4079b2', 600: '#2f5f95', 700: '#284d79',
          800: '#254265', 900: '#0f2d52', 950: '#0a1e38',
        },
        ink: {
          50: '#f7f8fa', 100: '#eef1f5', 200: '#dde2ea', 300: '#c2cad7',
          400: '#8f9bad', 500: '#6b7789', 600: '#525d6d', 700: '#414a58',
          800: '#2c333d', 900: '#1b2029',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 45, 82, .06), 0 1px 3px rgba(15, 45, 82, .05)',
        pop: '0 10px 30px rgba(15, 45, 82, .14)',
      },
    },
  },
  plugins: [],
};
