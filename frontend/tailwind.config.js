const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './index.html'
  ],
  theme: {
  	container: {
  		center: 'true',
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},

  	extend: {
  		screens: {
  			xs: '320px'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'"Segoe UI"',
  				'Roboto',
  				'"Helvetica Neue"',
  				'Arial',
  				'"Noto Sans"',
  				'sans-serif',
  				'"Apple Color Emoji"',
  				'"Segoe UI Emoji"',
  			],
  			mono: [
  				'"JetBrains Mono"',
  				'ui-monospace',
  				'"Fira Code"',
  				'"SF Mono"',
  				'Menlo',
  				'Consolas',
  				'monospace',
  			],
  		},
  		zIndex: {
  			base: '0',
  			raised: '10',
  			dropdown: '20',
  			sticky: '30',
  			overlay: '40',
  			modal: '50',
  			sheet: '60',
  			toast: '70',
  		},
  		colors: {
  			gray: colors.neutral,
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			// Arch IDE semantic tokens (alpha-value pattern enables opacity modifiers
  			// like bg-brand/10, bg-surface-2/60, etc.).
  			brand: {
  				DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
  				hover: 'hsl(var(--brand-hover) / <alpha-value>)',
  				foreground: 'hsl(var(--brand-foreground) / <alpha-value>)',
  			},
  			'surface-0': 'hsl(var(--surface-0) / <alpha-value>)',
  			'surface-1': 'hsl(var(--surface-1) / <alpha-value>)',
  			'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
  			'surface-3': 'hsl(var(--surface-3) / <alpha-value>)',
  			success: {
  				DEFAULT: 'hsl(var(--success) / <alpha-value>)',
  				foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
  				foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
  			},
  			danger: {
  				DEFAULT: 'hsl(var(--danger) / <alpha-value>)',
  				foreground: 'hsl(var(--danger-foreground) / <alpha-value>)',
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info) / <alpha-value>)',
  				foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}