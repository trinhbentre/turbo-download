import type { Config } from 'tailwindcss'
import { webToolsPreset } from '@web-tools/ui/tailwind-preset'

export default {
  presets: [webToolsPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@web-tools/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config
