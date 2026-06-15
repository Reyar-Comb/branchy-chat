<script setup lang="ts">
import { GitBranch, Network, Send, Settings, Square } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'

const chat = useChatStore()
const {
  activePath,
  activeNode,
  draft,
  settings,
  isGenerating,
  errorMessage,
  hasConfiguredApiKey,
} = storeToRefs(chat)

const isComposing = ref(false)
const lastCompositionEndAt = ref(0)
const draftInputRef = ref<HTMLTextAreaElement | null>(null)
const shouldFollowOutput = ref(true)
const BOTTOM_THRESHOLD = 96

function resizeDraftInput() {
  const input = draftInputRef.value
  if (!input) return

  const maxHeight = Math.floor(window.innerHeight * 0.5)
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function handleTextareaKeydown(event: KeyboardEvent) {
  const isIMEEnter =
    isComposing.value ||
    event.isComposing ||
    event.keyCode === 229 ||
    Date.now() - lastCompositionEndAt.value < 80

  if (event.key !== 'Enter' || event.shiftKey || isIMEEnter) return

  event.preventDefault()
  chat.sendDraft()
}

function handleDraftWheel(event: WheelEvent) {
  const input = event.currentTarget as HTMLTextAreaElement
  const canScroll = input.scrollHeight > input.clientHeight + 1

  event.stopPropagation()

  if (!canScroll) {
    event.preventDefault()
    return
  }

  const atTop = input.scrollTop <= 0
  const atBottom = input.scrollTop + input.clientHeight >= input.scrollHeight - 1

  if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
    event.preventDefault()
  }
}

function isNearPageBottom() {
  const documentElement = document.documentElement

  return window.scrollY + window.innerHeight >= documentElement.scrollHeight - BOTTOM_THRESHOLD
}

function handlePageScroll() {
  shouldFollowOutput.value = isNearPageBottom()
}

function handleSubmit() {
  if (isGenerating.value) {
    chat.stopGenerating()
    return
  }

  chat.sendDraft()
}

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  lastCompositionEndAt.value = Date.now()
  window.setTimeout(() => {
    isComposing.value = false
  }, 0)
}

async function scrollToBottom(options: { force?: boolean } = {}) {
  if (!options.force && !shouldFollowOutput.value) return

  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto',
      })
      resolve()
    })
  })
}

async function focusDraftInput() {
  await nextTick()
  draftInputRef.value?.focus({ preventScroll: true })
}

onMounted(async () => {
  await chat.loadProviderDefaults()
  resizeDraftInput()
  window.addEventListener('resize', resizeDraftInput)
  window.addEventListener('scroll', handlePageScroll, { passive: true })
  await scrollToBottom({ force: true })
  await focusDraftInput()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeDraftInput)
  window.removeEventListener('scroll', handlePageScroll)
})

watch(
  () => draft.value,
  async () => {
    await nextTick()
    resizeDraftInput()
  },
  { flush: 'post' },
)

watch(
  () => activeNode.value?.id,
  () => {
    shouldFollowOutput.value = true
    scrollToBottom({ force: true })
  },
  { flush: 'post' },
)

watch(
  () => activePath.value.at(-1)?.assistantText,
  () => {
    scrollToBottom()
  },
  { flush: 'post' },
)

watch(
  () => [isGenerating.value, errorMessage.value] as const,
  () => {
    scrollToBottom()
  },
  { flush: 'post' },
)
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="flex items-center gap-2">
        <GitBranch class="accent-text size-5" />
        <h1 class="text-base font-semibold">Branchy Chat</h1>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="icon-button inline-flex size-9 items-center justify-center"
          title="设置"
          type="button"
        >
          <Settings class="size-4" />
        </button>
        <button
          class="primary-button inline-flex items-center gap-2 px-3 py-2 text-sm"
          type="button"
          @click="chat.setMode('graph')"
        >
          <Network class="size-4" />
          图模式
        </button>
      </div>
    </header>

    <section class="mx-auto flex w-full max-w-4xl flex-col px-4 py-6">
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <p class="muted-text text-xs font-medium uppercase tracking-wide">
            当前主线
          </p>
          <h2 class="mt-1 text-xl font-semibold">
            {{ activeNode?.userText || '新对话' }}
          </h2>
        </div>
        <div class="panel muted-text rounded-md px-3 py-2 text-xs">
          {{ settings.model || '未设置模型' }}
        </div>
      </div>

      <div class="panel mb-4 grid gap-2 rounded-lg p-3 md:grid-cols-[1.5fr_1.2fr_1fr]">
        <input
          v-model="settings.baseURL"
          class="field rounded-md px-3 py-2 text-sm outline-none"
          placeholder="Base URL，例如 https://api.openai.com/v1"
          type="url"
        />
        <input
          v-model="settings.apiKey"
          class="field rounded-md px-3 py-2 text-sm outline-none"
          :placeholder="hasConfiguredApiKey ? 'API Key（config.toml 已配置，可留空）' : 'API Key'"
          type="password"
        />
        <input
          v-model="settings.model"
          class="field rounded-md px-3 py-2 text-sm outline-none"
          placeholder="模型名"
          type="text"
        />
      </div>

      <p
        v-if="errorMessage"
        class="error-panel mb-4 rounded-md px-3 py-2 text-sm"
      >
        {{ errorMessage }}
      </p>

      <div class="space-y-4">
        <ChatMessageCard
          v-for="node in activePath"
          :key="node.id"
          :node="node"
          :streaming="isGenerating && node.id === activeNode?.id"
          @focus-graph="chat.openGraphAtNode"
        />
      </div>

      <form
        class="sticky bottom-0 mt-6 flex gap-2 border-t py-4"
        style="border-color: var(--color-border); background: var(--color-bg)"
        @submit.prevent="handleSubmit"
      >
        <textarea
          ref="draftInputRef"
          v-model="draft"
          class="field draft-input min-h-12 flex-1 resize-none rounded-md px-3 py-3 text-sm outline-none"
          placeholder="继续当前主线..."
          rows="2"
          @compositionend="handleCompositionEnd"
          @compositionstart="handleCompositionStart"
          @keydown="handleTextareaKeydown"
          @wheel="handleDraftWheel"
        />
        <button
          class="primary-button inline-flex size-12 shrink-0 items-center justify-center"
          :title="isGenerating ? '停止' : '发送'"
          type="submit"
        >
          <Square
            v-if="isGenerating"
            class="size-5"
          />
          <Send
            v-else
            class="size-5"
          />
        </button>
      </form>
    </section>
  </main>
</template>
