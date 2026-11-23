// p-api: the Prospect DMS back end and its own JSON database (data/pdms-db.json).
// Accepts only the Prospect DMS key. Never calls i-api; cross-system traffic goes through the bridge.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from '../lib/common.mjs'
import { startStateServer } from '../lib/state-server.mjs'

const env = loadEnv()
startStateServer({
  name: 'p-api', port: env.P_API_PORT, host: env.HOST, key: env.P_API_KEY,
  dataDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'), dbFile: 'pdms-db.json',
})
