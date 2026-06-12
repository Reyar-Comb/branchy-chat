import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ProviderConfig = {
  baseURL: string
  apiKey: string
  model: string
}

const CONFIG_PATH = resolve(process.cwd(), 'config.toml')

function stripInlineComment(line: string) {
  let inQuote = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const previous = line[index - 1]

    if (char === '"' && previous !== '\\') {
      inQuote = !inQuote
    }

    if (char === '#' && !inQuote) {
      return line.slice(0, index)
    }
  }

  return line
}

function parseScalar(value: string) {
  const trimmed = value.trim()

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }

  return trimmed
}

function parseSimpleToml(source: string) {
  const result: Record<string, string> = {}

  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim()
    if (!line || line.startsWith('[')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1)
    if (!key) continue

    result[key] = parseScalar(value)
  }

  return result
}

function loadProviderConfig(): ProviderConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      baseURL: '',
      apiKey: '',
      model: '',
    }
  }

  const config = parseSimpleToml(readFileSync(CONFIG_PATH, 'utf-8'))

  return {
    baseURL: config.url ?? config.baseURL ?? '',
    apiKey: config.key ?? config.apiKey ?? '',
    model: config.model ?? '',
  }
}

const providerConfig = loadProviderConfig()

export function getProviderConfig() {
  return providerConfig
}
