/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        neon: {
          cyan: '#00f5ff',
          pink: '#ff00e5',
          purple: '#b300ff',
          green: '#00ff88',
          blue: '#0088ff',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
        'neon-pulse-fast': 'neonPulse 1s ease-in-out infinite',
        'neon-flicker': 'neonFlicker 3s linear infinite',
        'glow-float': 'glowFloat 4s ease-in-out infinite',
        'neon-border-pulse': 'neonBorderPulse 2s ease-in-out infinite',
      },
      keyframes: {
        neonPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.5), 0 0 10px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.3)' },
          '50%': { boxShadow: '0 0 10px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.8), 0 0 20px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.5), 0 0 40px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.2)' },
        },
        neonBorderPulse: {
          '0%, 100%': { borderColor: 'rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.3)', boxShadow: '0 0 5px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.2), inset 0 0 5px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.05)' },
          '50%': { borderColor: 'rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.7)', boxShadow: '0 0 12px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.5), inset 0 0 10px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.1)' },
        },
        neonFlicker: {
          '0%, 100%': { opacity: '1' },
          '41%': { opacity: '1' },
          '42%': { opacity: '0.8' },
          '43%': { opacity: '1' },
          '45%': { opacity: '0.9' },
          '46%': { opacity: '1' },
        },
        glowFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
