<script setup lang="ts">
import { GitBranch, Network, Send, Settings } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { nextTick, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'

const chat = useChatStore()
const { activePath, activeNode, draft, settings, isGenerating, errorMessage } = storeToRefs(chat)

const isComposing = ref(false)
const lastCompositionEndAt = ref(0)

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

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  lastCompositionEndAt.value = Date.now()
  window.setTimeout(() => {
    isComposing.value = false
  }, 0)
}

async function scrollToBottom() {
  await nextTick()
  requestAnimationFrame(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'auto',
    })
  })
}

watch(
  () => [
    activePath.value.length,
    activePath.value.at(-1)?.assistantText,
    isGenerating.value,
    errorMessage.value,
  ],
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
          placeholder="API Key"
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
        <article
          v-for="node in activePath"
          :key="node.id"
          class="chat-card"
        >
          <div class="chat-card-user px-4 py-3">
            <div class="muted-text mb-1 text-xs">{{ node.createdAt }}</div>
            <p class="whitespace-pre-wrap text-sm leading-6">{{ node.userText }}</p>
          </div>
          <div class="px-4 py-3">
            <p class="whitespace-pre-wrap text-sm leading-6">
              {{ node.assistantText }}
            </p>
          </div>
        </article>
      </div>

      <form
        class="sticky bottom-0 mt-6 flex gap-2 border-t py-4"
        style="border-color: var(--color-border); background: var(--color-bg)"
        @submit.prevent="chat.sendDraft"
      >
        <textarea
          v-model="draft"
          class="field min-h-12 flex-1 resize-none rounded-md px-3 py-3 text-sm outline-none"
          placeholder="继续当前主线..."
          rows="2"
          @compositionend="handleCompositionEnd"
          @compositionstart="handleCompositionStart"
          @keydown="handleTextareaKeydown"
        />
        <button
          :disabled="isGenerating"
          class="primary-button inline-flex size-12 shrink-0 items-center justify-center"
          :class="isGenerating ? 'cursor-not-allowed opacity-60' : ''"
          title="发送"
          type="submit"
        >
          <Send class="size-5" />
        </button>
      </form>
    </section>
  </main>
</template>
