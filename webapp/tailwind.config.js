/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'app-bg': '#F5F5F7',
        'card-dark': '#1C1C1E',
        'lime': '#D4F14D',
        'lavender': '#D4CFED',
        'light-blue': '#D8E5EF',
        'light-pink': '#F4D8D8',
        'light-yellow': '#F4ECD8',
        'bright-lime': '#E5F14D',
        'green-income': '#00D68F',
        'red-expense': '#FF6B6B',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 30px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
}
