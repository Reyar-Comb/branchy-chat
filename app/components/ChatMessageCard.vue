<script setup lang="ts">
import { Check, Copy, Network } from 'lucide-vue-next'
import { onBeforeUnmount, ref } from 'vue'
import type { ChatNode } from '~/stores/chat'

const props = defineProps<{
  node: ChatNode
  streaming?: boolean
}>()

const emit = defineEmits<{
  focusGraph: [nodeId: string]
}>()

const copied = ref(false)
let copiedTimer: number | null = null

function getCopyText() {
  return [`用户：\n${props.node.userText}`, `助手：\n${props.node.assistantText}`].join('\n\n')
}

async function copyNode() {
  await navigator.clipboard.writeText(getCopyText())
  copied.value = true

  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer)
  }

  copiedTimer = window.setTimeout(() => {
    copied.value = false
    copiedTimer = null
  }, 1200)
}

onBeforeUnmount(() => {
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer)
  }
})
</script>

<template>
  <article class="chat-card group relative">
    <div class="chat-card-actions">
      <button
        class="icon-button inline-flex size-8 items-center justify-center"
        :title="copied ? '已复制' : '复制'"
        type="button"
        @click="copyNode"
      >
        <Check
          v-if="copied"
          class="size-4"
        />
        <Copy
          v-else
          class="size-4"
        />
      </button>
      <button
        class="icon-button inline-flex size-8 items-center justify-center"
        title="在图模式中定位"
        type="button"
        @click="emit('focusGraph', node.id)"
      >
        <Network class="size-4" />
      </button>
    </div>

    <div class="chat-card-user px-4 py-3">
      <div class="muted-text mb-1 text-xs">{{ node.createdAt }}</div>
      <p class="whitespace-pre-wrap text-sm leading-6">{{ node.userText }}</p>
    </div>
    <div class="px-4 py-3">
      <MarkdownContent
        :content="node.assistantText"
        :streaming="streaming"
      />
      <p
        v-if="node.status === 'stopped'"
        class="stopped-badge mt-3 inline-flex items-center rounded px-2 py-1 text-xs font-medium"
      >
        输出已停止
      </p>
    </div>
  </article>
</template>
