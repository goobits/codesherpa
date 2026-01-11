import { chat, findFiles, getDiff, readFilesWithLimit, type Provider } from '@goobits/sherpa-core'
import { statSync } from 'fs'

import {
  ASK_SYSTEM,
  ARCHITECTURE_SYSTEM,
  CODE_REVIEW_SYSTEM,
  DIFF_REVIEW_SYSTEM,
  FOCUS_INSTRUCTIONS
} from '../prompts.js'

export interface ReviewArgs {
  mode?: 'files' | 'diff' | 'ask'
  paths?: string
  question?: string
  focus?: 'general' | 'security' | 'performance' | 'architecture' | 'style'
  base?: string
  path?: string
  prompt?: string
  system?: string | null
  provider?: Provider | null
  dryRun?: boolean
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0
  }

  return Math.ceil(text.length / 4)
}

function formatDryRunSummary(options: {
  mode: 'files' | 'diff' | 'ask'
  system: string
  prompt: string
  fileCount?: number
  truncated?: number
}): string {
  const combined = `${options.system}\n\n${options.prompt}`
  const lines = [
    'Dry run only (no model call).',
    `Mode: ${options.mode}`,
    `System chars: ${options.system.length}`,
    `Prompt chars: ${options.prompt.length}`,
    `Estimated tokens: ${estimateTokens(combined)}`
  ]

  if (typeof options.fileCount === 'number') {
    lines.push(`Files: ${options.fileCount}`)
  }

  if (options.truncated && options.truncated > 0) {
    lines.push(`Truncated files: ${options.truncated}`)
  }

  return lines.join('\n')
}

export async function review(args: ReviewArgs): Promise<string> {
  const {
    mode = 'files',
    paths,
    question,
    focus = 'general',
    base = 'HEAD~1',
    path,
    prompt: askPrompt,
    system: askSystem,
    provider,
    dryRun = false
  } = args

  if (mode === 'ask') {
    if (!askPrompt) {
      return 'Missing required "prompt" for ask mode.'
    }

    const systemPrompt = askSystem || ASK_SYSTEM

    if (dryRun) {
      return formatDryRunSummary({
        mode,
        system: systemPrompt,
        prompt: askPrompt
      })
    }

    return chat(askPrompt, { system: systemPrompt, provider: provider || undefined })
  }

  if (mode === 'diff') {
    try {
      const diff = await getDiff(base, path)

      if (!diff.trim()) {
        return 'No changes found.'
      }

      const diffPrompt = `Review this diff:\n\n\`\`\`diff\n${diff}\n\`\`\``

      if (dryRun) {
        return formatDryRunSummary({
          mode,
          system: DIFF_REVIEW_SYSTEM,
          prompt: diffPrompt
        })
      }

      return chat(diffPrompt, { system: DIFF_REVIEW_SYSTEM })
    } catch (error) {
      return `Git error: ${(error as Error).message}`
    }
  }

  if (!paths) {
    return 'Missing required "paths" for files mode.'
  }

  const pathList = paths.split(',').map((p) => p.trim())
  const filesToReview: string[] = []

  for (const p of pathList) {
    if (p.includes('*') || p.includes('?')) {
      const matched = await findFiles(p)
      filesToReview.push(...matched)
      continue
    }

    try {
      const stat = statSync(p)
      if (stat.isFile()) {
        filesToReview.push(p)
      } else if (stat.isDirectory()) {
        const pattern = `${p}/**/*`
        const matched = await findFiles(pattern, { codeOnly: true })
        filesToReview.push(...matched)
      }
    } catch {
      return `Path not found: ${p}`
    }
  }

  if (filesToReview.length === 0) {
    return 'No code files found to review.'
  }

  const { files, truncated } = readFilesWithLimit(filesToReview)

  let formattedContent = files.join('\n')
  if (truncated > 0) {
    formattedContent += `\n\n... truncated (${truncated} more files)`
  }

  // Build prompt
  const focusText = FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.general
  const instruction = question ? `${focusText}\n\nSpecific question: ${question}` : focusText

  const promptText = `${instruction}

Review the following ${files.length} file(s). For each issue, cite the specific \`filename:line_number\`.

${formattedContent}`

  const systemPrompt = focus === 'architecture' ? ARCHITECTURE_SYSTEM : CODE_REVIEW_SYSTEM

  if (dryRun) {
    return formatDryRunSummary({
      mode,
      system: systemPrompt,
      prompt: promptText,
      fileCount: files.length,
      truncated
    })
  }

  return chat(promptText, { system: systemPrompt })
}

export const reviewTool = {
  name: 'review',
  description: 'Review code files, diffs, or prompts with Cerebras',
  inputSchema: {
    type: 'object' as const,
    properties: {
      mode: {
        type: 'string',
        enum: ['files', 'diff', 'ask'],
        description: 'Review mode (default: files)'
      },
      paths: {
        type: 'string',
        description:
          'File paths, directory, or glob pattern (e.g., "**/*.py"). Comma-separated for multiple.'
      },
      question: {
        type: 'string',
        description: 'Optional specific question to ask'
      },
      focus: {
        type: 'string',
        enum: ['general', 'security', 'performance', 'architecture', 'style'],
        description: 'Review focus (default: general)'
      },
      base: {
        type: 'string',
        description: 'Diff base commit/branch (default: HEAD~1)'
      },
      path: {
        type: 'string',
        description: 'Optional path filter for diff mode'
      },
      prompt: {
        type: 'string',
        description: 'Prompt text for ask mode'
      },
      system: {
        type: 'string',
        description: 'Optional system prompt override for ask mode'
      },
      provider: {
        type: 'string',
        enum: ['cerebras', 'groq', 'openai'],
        description: 'Provider override for ask mode'
      },
      dryRun: {
        type: 'boolean',
        description: 'Return token estimate only (no model call)'
      }
    },
    required: []
  }
}
