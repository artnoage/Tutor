/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html","./src/**/*.{html,js,ts,jsx,tsx}",],
  theme: {
    extend: {
      colors: {
        midnight: {
          background: '#0F1A2A',  // Deep blue background
          currentLine: '#1E3A5F', // Slightly lighter blue for highlights
          foreground: '#E6F2FF',  // Light blue-white for text
          comment: '#4A6FA5',     // Muted blue for less emphasis
          cyan: '#39C5BB',        // Bright teal
          green: '#5CDB95',       // Sea green
          orange: '#FFA07A',      // Light coral
          pink: '#FF8AD8',        // Soft pink
          purple: '#9B72FF',      // Soft purple
          red: '#FF6B6B',         // Coral red
          yellow: '#FFD93D'       // Bright yellow
        }
      }
    }
  },
  plugins: [],
}