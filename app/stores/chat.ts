import { defineStore } from 'pinia'

export type ViewMode = 'chat' | 'graph'
export type ThemeMode = 'system' | 'light' | 'dark'
export type ProviderMode = 'server' | 'custom'

export type ChatNodeStatus = 'complete' | 'streaming' | 'stopped'

export type ChatNode = {
  id: string
  parentId: string | null
  userText: string
  assistantText: string
  createdAt: string
  status?: ChatNodeStatus
  position?: {
    x: number
    y: number
  }
  includeInContext?: boolean
}

type ProviderSettings = {
  baseURL: string
  apiKey: string
  model: string
}

type ProviderConfigResponse = {
  baseURL: string
  model: string
  hasApiKey: boolean
}

const THEME_STORAGE_KEY = 'branchy-chat-theme'
const PROVIDER_MODE_STORAGE_KEY = 'branchy-chat-provider-mode'
let activeAbortController: AbortController | null = null

function applyDocumentTheme(themeMode: ThemeMode) {
  if (typeof document === 'undefined') return

  if (themeMode === 'system') {
    document.documentElement.removeAttribute('data-theme')
    return
  }

  document.documentElement.dataset.theme = themeMode
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
  )
}

const seedNodes: ChatNode[] = [
  {
    id: 'root',
    parentId: null,
    userText: '欢迎来到Branchy Chat',
    assistantText: '这是一个基于类git的分支式AI聊天工具。利用Control + . 切换到节点图模式来查看更多！\n输入base URL和API key开始你的对话！',
    createdAt: '20:30',
    includeInContext: false,
  }
]

function createNodeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `node-${crypto.randomUUID()}`
  }

  return `node-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    mode: 'chat' as ViewMode,
    activeNodeId: 'root',
    draft: '',
    isGenerating: false,
    errorMessage: '',
    hasConfiguredApiKey: false,
    pendingGraphFocusNodeId: null as string | null,
    themeMode: 'system' as ThemeMode,
    providerMode: 'server' as ProviderMode,
    settings: {
      baseURL: '',
      apiKey: '',
      model: '',
    } satisfies ProviderSettings,
    nodes: seedNodes,
  }),
  getters: {
    activeNode(state) {
      return state.nodes.find((node) => node.id === state.activeNodeId) ?? null
    },
    activePath(state) {
      const byId = new Map(state.nodes.map((node) => [node.id, node]))
      const path: ChatNode[] = []
      let cursor = byId.get(state.activeNodeId)

      while (cursor) {
        path.unshift(cursor)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }

      return path
    },
  },
  actions: {
    toggleMode() {
      this.mode = this.mode === 'chat' ? 'graph' : 'chat'
    },
    setMode(mode: ViewMode) {
      this.mode = mode
    },
    openGraphAtNode(nodeId: string) {
      this.activeNodeId = nodeId
      this.pendingGraphFocusNodeId = nodeId
      this.mode = 'graph'
    },
    consumePendingGraphFocusNodeId() {
      const nodeId = this.pendingGraphFocusNodeId
      this.pendingGraphFocusNodeId = null
      return nodeId
    },
    selectNode(nodeId: string) {
      this.activeNodeId = nodeId
      this.mode = 'chat'
    },
    deleteNodeWithDescendants(nodeId: string) {
      const target = this.nodes.find((node) => node.id === nodeId)
      if (!target || target.parentId === null || this.isGenerating) return

      const idsToDelete = new Set<string>([nodeId])
      let changed = true

      while (changed) {
        changed = false
        for (const node of this.nodes) {
          if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
            idsToDelete.add(node.id)
            changed = true
          }
        }
      }

      this.nodes = this.nodes.filter((node) => !idsToDelete.has(node.id))

      if (idsToDelete.has(this.activeNodeId)) {
        this.activeNodeId = target.parentId
      }
    },
    updateNodePosition(nodeId: string, position: { x: number; y: number }) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (!node) return

      node.position = position
    },
    resetNodePositions() {
      for (const node of this.nodes) {
        delete node.position
      }
    },
    loadUiPreferences() {
      if (typeof localStorage === 'undefined') {
        applyDocumentTheme(this.themeMode)
        return
      }

      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') {
        this.themeMode = storedTheme
      }

      const storedProviderMode = localStorage.getItem(PROVIDER_MODE_STORAGE_KEY)
      if (storedProviderMode === 'server' || storedProviderMode === 'custom') {
        this.providerMode = storedProviderMode
      }

      applyDocumentTheme(this.themeMode)
    },
    setThemeMode(themeMode: ThemeMode) {
      this.themeMode = themeMode
      applyDocumentTheme(themeMode)

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, themeMode)
      }
    },
    setProviderMode(providerMode: ProviderMode) {
      this.providerMode = providerMode

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PROVIDER_MODE_STORAGE_KEY, providerMode)
      }
    },
    async loadProviderDefaults() {
      const config = await $fetch<ProviderConfigResponse>('/api/config')

      if (!this.settings.baseURL) {
        this.settings.baseURL = config.baseURL
      }

      if (!this.settings.model) {
        this.settings.model = config.model
      }

      this.hasConfiguredApiKey = config.hasApiKey
    },
    stopGenerating() {
      activeAbortController?.abort()
    },
    async sendDraft() {
      const text = this.draft.trim()
      if (!text || this.isGenerating) return

      this.draft = ''
      await this.sendMessage(text, this.activeNodeId, {
        restoreDraftOnError: true,
      })
    },
    async sendMessage(
      text: string,
      parentId: string,
      options: {
        restoreDraftOnError?: boolean
      } = {},
    ) {
      const previousActiveNodeId = this.activeNodeId
      const id = createNodeId()
      this.nodes.push({
        id,
        parentId,
        userText: text,
        assistantText: '',
        createdAt: new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
        status: 'streaming',
      })
      this.activeNodeId = id
      this.errorMessage = ''
      this.isGenerating = true
      activeAbortController = new AbortController()

      try {
        const messages = this.activePath
          .filter((node) => node.includeInContext !== false)
          .flatMap((node) => {
            const items = [{ role: 'user' as const, content: node.userText }]

            if (node.assistantText.trim()) {
              items.push({ role: 'assistant' as const, content: node.assistantText })
            }

            return items
          })

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            settings: this.providerMode === 'custom' ? this.settings : {},
            messages,
          }),
          signal: activeAbortController.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(await response.text())
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          if (chunk.includes('<!DOCTYPE html>') || chunk.includes('<html')) {
            throw new Error(
              '收到 HTML 页面而不是模型文本。请检查 baseURL 是否填成了网页地址或 Nuxt dev server 地址。',
            )
          }

          const node = this.nodes.find((item) => item.id === id)
          if (node) node.assistantText += chunk
        }

        const node = this.nodes.find((item) => item.id === id)
        if (node) node.status = 'complete'
      } catch (error) {
        if (isAbortError(error)) {
          const node = this.nodes.find((item) => item.id === id)
          if (node) node.status = 'stopped'
          return
        }

        const node = this.nodes.find((item) => item.id === id)
        if (node) {
          node.assistantText = '请求失败，请检查 baseURL、API key 和 model 设置。'
        }
        this.errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.nodes = this.nodes.filter((item) => item.id !== id)
        if (this.activeNodeId === id) {
          this.activeNodeId = previousActiveNodeId
        }
        if (options.restoreDraftOnError && !this.draft.trim()) {
          this.draft = text
        }
      } finally {
        this.isGenerating = false
        activeAbortController = null
      }
    },
  },
})
