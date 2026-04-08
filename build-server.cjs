/**
 * esbuild script to bundle the standalone web server.
 * Bundles all TypeScript source into a single CJS file,
 * with native Node.js deps marked as external.
 */
const esbuild = require('esbuild')
const path = require('path')

esbuild.build({
  entryPoints: [path.resolve(__dirname, 'web/server/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.resolve(__dirname, 'dist/server/index.js'),
  external: [
    'better-sqlite3',
    'express',
    'cors',
    'ws',
    'fast-xml-parser'
  ],
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared')
  },
  sourcemap: false,
  minify: false
}).then(() => {
  console.log('✓ Server bundled → dist/server/index.js')
}).catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
