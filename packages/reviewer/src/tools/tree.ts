import { chat, findFiles } from '@goobits/sherpa-core'

import { ASK_SYSTEM } from '../prompts.js'

export interface TreeArgs {
  pattern?: string
  depth?: number
  summary?: boolean
  stats?: boolean
}

type TreeNode = {
  children: Map<string, TreeNode>
}

function createNode(): TreeNode {
  return { children: new Map() }
}

function buildTree(paths: string[], depth: number): string {
  const root = createNode()

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    let node = root
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, createNode())
      }
      node = node.children.get(part) as TreeNode
    }
  }

  if (depth <= 0) {
    return '.'
  }

  const lines = ['.']
  lines.push(...renderTree(root, '', depth, 0))
  return lines.join('\n')
}

function renderTree(node: TreeNode, prefix: string, depth: number, level: number): string[] {
  const entries = Array.from(node.children.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const lines: string[] = []

  for (let i = 0; i < entries.length; i += 1) {
    const [name, child] = entries[i]
    const isLast = i === entries.length - 1
    const connector = isLast ? '`-- ' : '|-- '
    const nextPrefix = prefix + (isLast ? '    ' : '|   ')

    lines.push(`${prefix}${connector}${name}`)

    if (child.children.size > 0) {
      if (level + 1 < depth) {
        lines.push(...renderTree(child, nextPrefix, depth, level + 1))
      } else {
        lines.push(`${nextPrefix}\`-- ...`)
      }
    }
  }

  return lines
}

function formatStats(paths: string[]): string {
  const counts = new Map<string, number>()

  for (const filePath of paths) {
    const base = filePath.split('/').pop() || ''
    const dotIndex = base.lastIndexOf('.')
    const ext = dotIndex > 0 ? base.slice(dotIndex) : '(none)'
    counts.set(ext, (counts.get(ext) || 0) + 1)
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted.map(([ext, count]) => `${ext}: ${count}`).join('\n')
}

export async function tree(args: TreeArgs): Promise<string> {
  const pattern = args.pattern || '**/*'
  const depth = Number.isFinite(args.depth) ? (args.depth as number) : 3
  const summary = Boolean(args.summary)
  const stats = Boolean(args.stats)

  const files = await findFiles(pattern)

  if (files.length === 0) {
    return 'No files found.'
  }

  const treeOutput = buildTree(files, depth)
  const statsOutput = stats ? formatStats(files) : ''

  let output = treeOutput

  if (stats && statsOutput) {
    output += `\n\nStats:\n${statsOutput}`
  }

  if (summary) {
    const summaryPrompt = `Summarize this repository structure for a non-technical reader.

Tree:
${treeOutput}

Stats:
${statsOutput || 'n/a'}`
    const summaryText = await chat(summaryPrompt, { system: ASK_SYSTEM })
    output += `\n\nSummary:\n${summaryText}`
  }

  return output
}

export const treeTool = {
  name: 'tree',
  description: 'Show a gitignore-aware repository tree (optional summary or stats)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Optional glob pattern (e.g., "**/*.js")'
      },
      depth: {
        type: 'number',
        description: 'Tree depth (default: 3)'
      },
      summary: {
        type: 'boolean',
        description: 'Include a layman summary (uses LLM)'
      },
      stats: {
        type: 'boolean',
        description: 'Include file extension counts'
      }
    },
    required: []
  }
}
