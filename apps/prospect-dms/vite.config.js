import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import path from 'node:path'
import { loadEnv } from '../../services/lib/common.mjs'

// Prospect DMS. The proxy is the ONLY way out of this website: /api goes to its own back end, /bridge and /tp to
// the routes it is allowed. The service key is added here, on the server side; the browser never holds it.
const env = loadEnv()
const key = { 'x-api-key': env.P_API_KEY }
const target = (port) => `http://127.0.0.1:${port}`

export default defineConfig({
  plugins: [
    frappeui({ frappeProxy: false, jinjaBootData: false, buildConfig: false, lucideIcons: true }),
    vue(),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: Number(env.PDMS_PORT), strictPort: true, host: env.HOST, open: false,
    proxy: {
      '/api': { target: target(env.P_API_PORT), headers: key },
      '/bridge': { target: target(env.BRIDGE_PORT), headers: key, rewrite: (p) => p.replace(/^\/bridge/, '') },
      '/tp': { target: target(env.TP_SIM_PORT), headers: key },
      // Content Hub (documents + circulars, shared by every DMS): the key tells it which website and team is asking
      '/content': { target: target(env.CONTENT_PORT), headers: key },
    },
  },
  // DECISION-13 (default, confirm): what happens to an investor's personal data here after acceptance (remove | hide)
  define: { __INVESTOR_DATA_IN_PDMS__: JSON.stringify(env.INVESTOR_DATA_IN_PDMS === 'hide' ? 'hide' : 'remove') },
  preview: { port: 4175 },
})
