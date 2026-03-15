/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        surface: '#FAFAFA',
        card: '#FFFFFF',
        border: '#E5E5E5',
        'text-primary': '#1A1A1A',
        'text-secondary': '#888888',
        accent: {
          green: '#22C55E',
          blue: '#3B82F6',
          amber: '#F59E0B',
          purple: '#8B5CF6',
          red: '#EF4444',
        },
      },
      borderRadius: {
        card: '24px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
};
