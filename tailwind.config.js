/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bb-blue': '#1a73e8',
        'bb-dark': '#1e1e2e',
        'bb-sidebar': '#252536',
        'bb-panel': '#2a2a3d',
        'bb-hover': '#35354a',
        'bb-border': '#3a3a50',
        'bb-text': '#e0e0e0',
        'bb-muted': '#a0a0b0',
        'bb-accent': '#4fc3f7',
      },
    },
  },
  plugins: [],
};
