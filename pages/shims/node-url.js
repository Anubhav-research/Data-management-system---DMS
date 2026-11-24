export { fileURLToPath, pathToFileURL } from './node-misc.js'
export default { fileURLToPath: (u) => decodeURIComponent(new URL(String(u)).pathname) }
