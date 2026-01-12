import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')
const cliOut = join(distDir, 'cli.js')

const external = [
	'@modelcontextprotocol/sdk',
	'bash-parser',
	'glob',
	'ignore',
	'openai',
	'tiktoken'
]

await build({
	entryPoints: {
		cli: join(root, 'src', 'cli.ts'),
		index: join(root, 'src', 'index.ts'),
		'reviewer/index': join(root, '..', 'reviewer', 'src', 'index.ts')
	},
	bundle: true,
	splitting: true,
	platform: 'node',
	format: 'esm',
	target: 'es2022',
	sourcemap: true,
	outdir: distDir,
	external
})

const shebang = '#!/usr/bin/env node\n'
const cliContents = readFileSync(cliOut, 'utf-8')
if (!cliContents.startsWith(shebang)) {
	writeFileSync(cliOut, `${ shebang }${ cliContents }`)
}
