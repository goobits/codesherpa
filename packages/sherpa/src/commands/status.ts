/**
 * sherpa status - Show LLM provider status and rate limits
 */

import { checkProviderStatus, getAvailableProviders } from '@goobits/sherpa-core'

export async function runStatus(): Promise<void> {
	console.log('Checking LLM providers...\n')

	const available = getAvailableProviders()

	if (available.length === 0) {
		console.log('No providers configured.')
		console.log('Set CEREBRAS_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY')
		return
	}

	console.log(`Configured: ${ available.join(', ') }\n`)

	const statuses = await checkProviderStatus()

	for (const status of statuses) {
		const icon = status.available ? '✓' : '✗'
		console.log(`${ icon } ${ status.provider.toUpperCase() }`)

		if (status.error) {
			console.log(`  Error: ${ status.error }`)
			continue
		}

		if (status.limits) {
			const l = status.limits

			// Show requests
			if (l.requestsPerMinute && l.requestsRemainingMinute) {
				const pct = Math.round((l.requestsRemainingMinute / l.requestsPerMinute) * 100)
				console.log(`  Requests/min: ${ l.requestsRemainingMinute.toLocaleString() }/${ l.requestsPerMinute.toLocaleString() } (${ pct }%)`)
			}
			if (l.requestsRemainingDay) {
				const limit = l.requestsPerDay || 14400 // Cerebras free tier default
				const used = limit - l.requestsRemainingDay
				console.log(`  Requests/day: ${ l.requestsRemainingDay.toLocaleString() } remaining (${ used.toLocaleString() } used)`)
			}

			// Show tokens
			if (l.tokensPerMinute && l.tokensRemainingMinute) {
				const pct = Math.round((l.tokensRemainingMinute / l.tokensPerMinute) * 100)
				console.log(`  Tokens/min: ${ l.tokensRemainingMinute.toLocaleString() }/${ l.tokensPerMinute.toLocaleString() } (${ pct }%)`)
			}
			if (l.tokensRemainingDay) {
				const limit = l.tokensPerDay || 1000000 // Cerebras free tier default
				const used = limit - l.tokensRemainingDay
				console.log(`  Tokens/day: ${ l.tokensRemainingDay.toLocaleString() } remaining (${ used.toLocaleString() } used)`)
			}
		}
		console.log('')
	}
}
