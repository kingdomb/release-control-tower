/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: { xs: '450px' },
      colors: {
        ink: { DEFAULT: '#18222F', soft: '#46525F', faint: '#6B7682' },
        console: '#F6F8FB',
        rule: '#D3DAE3',
        approach: { DEFAULT: '#1D5BB8', tint: '#E3ECF9' },
        alert: { DEFAULT: '#B4122B', tint: '#FBE7EA' },
        amber: { DEFAULT: '#B9770E', tint: '#FBF1DF' },
        go: { DEFAULT: '#256B42', tint: '#E4F2EA' },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        cond: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
