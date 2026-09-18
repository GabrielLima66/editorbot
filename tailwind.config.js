/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./bot_transform.html",
    "./js/**/*.js",
    "./content/**/*.js",
  ],
  theme: {
    extend: {
      spacing: {
        '4.5': '1.125rem',
      },
      colors: {
        primary: '#6d5efc',
        'surface-2': '#f6f5fb',
      },
    },
  },
  plugins: [],
}
