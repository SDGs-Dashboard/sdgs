// Tailwind theme for Rwanda SDG dashboard colors, typography, and card shadows.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        rwBlue: '#00A1DE',
        rwGreen: '#00A651',
        rwYellow: '#FAD201',
        rwNavy: '#00457C',
        rwSlate: '#5C6B76'
      },
      boxShadow: {
        soft: '0 6px 24px rgba(20, 34, 48, 0.08)',
        card: '0 10px 30px rgba(2, 44, 74, 0.09)'
      },
      borderRadius: {
        card: '1rem'
      },
      fontFamily: {
        sans: ['"Public Sans"', '"Source Sans 3"', '"Segoe UI"', 'sans-serif'],
        heading: ['"Merriweather Sans"', '"Public Sans"', 'sans-serif']
      }
    }
  },
  plugins: []
};
