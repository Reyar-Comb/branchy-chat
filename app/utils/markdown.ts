import MarkdownIt from 'markdown-it'

export type MarkdownRenderOptions = {
  enableMath?: boolean
  streaming?: boolean
}

let baseRenderer: MarkdownIt | null = null

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

export function createMarkdownRenderer(options: MarkdownRenderOptions = {}) {
  if (options.enableMath) {
    // TODO: Add markdown-it math plugin here, likely markdown-it-katex.
    // Keep this as a factory so chat components do not need to change when
    // LaTeX rendering is introduced.
  }

  baseRenderer ??= createBaseRenderer()
  return baseRenderer
}

function hasUnclosedFence(content: string) {
  const fenceMatches = content.match(/(^|\n)```/g)
  return Boolean(fenceMatches && fenceMatches.length % 2 === 1)
}

export function normalizeStreamingMarkdown(content: string, options: MarkdownRenderOptions = {}) {
  if (!options.streaming) return content

  let normalized = content

  if (hasUnclosedFence(normalized)) {
    normalized += '\n```'
  }

  // TODO: When LaTeX rendering is enabled, normalize unfinished inline/block
  // math delimiters here so streaming output does not throw or jump heavily.

  return normalized
}

export function renderMarkdown(content: string, options: MarkdownRenderOptions = {}) {
  const renderer = createMarkdownRenderer(options)
  return renderer.render(normalizeStreamingMarkdown(content, options))
}
