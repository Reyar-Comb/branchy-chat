import MarkdownIt from 'markdown-it'
import { katex } from '@mdit/plugin-katex'

export type MarkdownRenderOptions = {
  enableMath?: boolean
  streaming?: boolean
}

let baseRenderer: MarkdownIt | null = null
let mathRenderer: MarkdownIt | null = null

function createBaseRenderer() {
  const renderer = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  })

  renderer.validateLink = (url) => /^(https?:|mailto:|#|\/(?!\/))/i.test(url)

  const defaultLinkOpen =
    renderer.renderer.rules.link_open ??
    ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))

  renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const href = token.attrGet('href') ?? ''

    if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noreferrer')
    }

    return defaultLinkOpen(tokens, index, options, env, self)
  }

  return renderer
}

function createMathRenderer() {
  const renderer = createBaseRenderer()

  renderer.use(katex, {
    delimiters: 'all',
    mathFence: true,
    throwOnError: false,
    trust: false,
    logger: (errorCode) => (errorCode === 'newLineInDisplayMode' ? 'ignore' : 'warn'),
  })

  return renderer
}

export function createMarkdownRenderer(options: MarkdownRenderOptions = {}) {
  if (options.enableMath) {
    mathRenderer ??= createMathRenderer()
    return mathRenderer
  }

  baseRenderer ??= createBaseRenderer()
  return baseRenderer
}

function hasUnclosedFence(content: string) {
  const fenceMatches = content.match(/(^|\n)```/g)
  return Boolean(fenceMatches && fenceMatches.length % 2 === 1)
}

function hasOddDelimiterCount(content: string, delimiter: string) {
  return content.split(delimiter).length % 2 === 0
}

function countDelimiter(content: string, delimiter: string) {
  return content.split(delimiter).length - 1
}

export function normalizeStreamingMarkdown(content: string, options: MarkdownRenderOptions = {}) {
  if (!options.streaming) return content

  let normalized = content

  if (hasUnclosedFence(normalized)) {
    normalized += '\n```'
  }

  if (options.enableMath) {
    if (hasOddDelimiterCount(normalized, '$$')) {
      normalized += '\n$$'
    }

    if (countDelimiter(normalized, '\\[') > countDelimiter(normalized, '\\]')) {
      normalized += '\n\\]'
    }

    if (countDelimiter(normalized, '\\(') > countDelimiter(normalized, '\\)')) {
      normalized += '\\)'
    }
  }

  return normalized
}

export function renderMarkdown(content: string, options: MarkdownRenderOptions = {}) {
  const renderer = createMarkdownRenderer(options)
  return renderer.render(normalizeStreamingMarkdown(content, options))
}
