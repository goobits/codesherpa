#!/usr/bin/env node
/**
 * Guard daemon - persistent server for fast hook responses
 *
 * Keeps bash-parser and rules loaded in memory.
 * Communicates via Unix socket for sub-5ms response times.
 */

import { loadConfig } from '@goobits/sherpa-core'
import { existsSync, unlinkSync } from 'fs'
import { createServer, type Socket } from 'net'

import { offloadOutput } from './commands/post.js'
import { checkBashCommand } from './commands/pre.js'
import { DEFAULT_CONFIG, type GuardConfig } from './types.js'

// Load config
const config = loadConfig<GuardConfig>('config.json', DEFAULT_CONFIG)
const socketPath = config.socketPath

interface DaemonRequest {
	type: 'pre' | 'post';
	data: unknown;
}

interface PreRequest {
	command: string;
}

interface PostRequest {
	stdout: string;
	stderr: string;
	exit_code: number;
}

/**
 * Handle a client connection
 */
function handleConnection(socket: Socket): void {
	let buffer = ''

	socket.on('data', chunk => {
		buffer += chunk.toString()

		// Limit buffer size to prevent DoS
		if (buffer.length > 10 * 1024 * 1024) {
			socket.write(JSON.stringify({ error: 'Request too large' }))
			socket.end()
			return
		}

		// Try to parse complete JSON
		try {
			const request: DaemonRequest = JSON.parse(buffer)
			buffer = ''

			let response: unknown

			if (request.type === 'pre') {
				const { command } = request.data as PreRequest
				const result = checkBashCommand(command)
				response = result
			} else if (request.type === 'post') {
				const { stdout, stderr, exit_code } = request.data as PostRequest
				const stdoutResult = offloadOutput(stdout, exit_code, config)
				const stderrResult = offloadOutput(stderr, exit_code, config)
				response = {
					stdout: stdoutResult.result,
					stderr: stderrResult.result,
					modified: stdoutResult.modified || stderrResult.modified
				}
			} else {
				response = { error: 'Unknown request type' }
			}

			socket.write(JSON.stringify(response))
			socket.end()
		} catch(err) {
			// Check if it's a syntax error (invalid JSON) vs incomplete JSON
			if (err instanceof SyntaxError && !err.message.includes('end of JSON')) {
				// Invalid JSON structure - reset buffer and report error
				buffer = ''
				socket.write(JSON.stringify({ error: 'Invalid JSON' }))
				socket.end()
			}
			// Otherwise incomplete JSON, wait for more data
		}
	})

	socket.on('error', err => {
		console.error('Socket error:', err.message)
	})
}

/**
 * Cleanup socket file on exit
 */
function cleanup(): void {
	try {
		if (existsSync(socketPath)) {
			unlinkSync(socketPath)
		}
	} catch {
		// Ignore cleanup errors
	}
	process.exit(0)
}

/**
 * Start the daemon
 */
function main(): void {
	// Remove stale socket file
	if (existsSync(socketPath)) {
		unlinkSync(socketPath)
	}

	const server = createServer(handleConnection)

	// Handle shutdown signals
	process.on('SIGTERM', cleanup)
	process.on('SIGINT', cleanup)
	process.on('SIGHUP', cleanup)

	// Handle uncaught errors
	process.on('uncaughtException', err => {
		console.error('Uncaught exception:', err)
		cleanup()
	})

	server.listen(socketPath, () => {
		console.error(`Guard daemon listening on ${ socketPath }`)
	})

	server.on('error', err => {
		console.error('Server error:', err)
		cleanup()
	})
}

main()
