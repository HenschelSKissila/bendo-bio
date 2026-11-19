/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef7ee',100:'#d6ecd5',200:'#acd8aa',300:'#7cc078',400:'#52a54d',500:'#3a8a36',600:'#2d6e2b',700:'#1f5130',800:'#173d24',900:'#0f2818' },
        cream: '#f7f8f3',
        tomato: '#d64531',
        carrot: '#e8892b',
      },
      fontFamily: { display: ['"Pacifico"', 'cursive'], sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
