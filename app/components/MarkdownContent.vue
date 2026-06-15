<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdown } from '~/utils/markdown'

const props = withDefaults(
  defineProps<{
    content: string
    streaming?: boolean
  }>(),
  {
    streaming: false,
  },
)

const html = ref('')
let frameId: number | null = null

function updateHtml() {
  html.value = renderMarkdown(props.content, {
    streaming: props.streaming,
    enableMath: false,
  })
}

function scheduleUpdate() {
  if (!props.streaming) {
    updateHtml()
    return
  }

  if (frameId !== null) return

  frameId = requestAnimationFrame(() => {
    frameId = null
    updateHtml()
  })
}

watch(
  () => [props.content, props.streaming] as const,
  () => {
    scheduleUpdate()
  },
  { immediate: true },
)

watch(
  () => props.streaming,
  async (streaming) => {
    if (streaming) return

    await nextTick()
    updateHtml()
  },
)

onBeforeUnmount(() => {
  if (frameId !== null) {
    cancelAnimationFrame(frameId)
  }
})
</script>

<template>
  <!-- markdown-it escapes raw HTML because html:false is configured in app/utils/markdown.ts. -->
  <div
    class="markdown-body text-sm leading-6"
    v-html="html"
  />
</template>
