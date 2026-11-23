import preset, { content } from 'frappe-ui/tailwind'

export default {
  presets: [preset],
  content: [...content, './index.html', './src/**/*.{vue,js,ts}', '../../packages/core-ui/src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        // Figma: sidebar #ECF5FE, header #F6FAFF, brand logo orange/purple
        // light values are the Figma ones; dark values in src/styles/index.css
        dms: { accent: 'var(--dms-accent)', accentsoft: 'var(--dms-accent-soft)', sidebar: 'var(--dms-sidebar)', header: 'var(--dms-header)', page: 'var(--dms-page)', field: 'var(--dms-field)', wasent: 'var(--dms-wasent)', brand: '#E2553A', brand2: '#7B5190' },
      },
    },
  },
}
