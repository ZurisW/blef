/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        poker: {
          green: '#1b4d3e',
          darkgreen: '#113327',
          felt: '#1e5a44',
          border: '#d4af37', // Gold accent
        }
      },
      animation: {
        'card-deal': 'cardDeal 0.5s ease-out forwards',
        'card-flip': 'cardFlip 0.6s ease-in-out forwards',
        'pulse-glow': 'pulseGlow 2s infinite',
        'slide-in': 'slideIn 0.3s ease-out forwards',
      },
      keyframes: {
        cardDeal: {
          '0%': { transform: 'translateY(-100px) rotate(-10deg) scale(0.5)', opacity: '0' },
          '100%': { transform: 'translateY(0) rotate(0) scale(1)', opacity: '1' }
        },
        cardFlip: {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' }
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(212, 175, 55, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(212, 175, 55, 0.8)' }
        },
        slideIn: {
          '0%': { transform: 'translateX(30px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
}
