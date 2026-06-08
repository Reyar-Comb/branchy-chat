<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '~/stores/chat'

const chat = useChatStore()
const { mode } = storeToRefs(chat)

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === '.') {
    event.preventDefault()
    chat.toggleMode()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <GraphPanel v-if="mode === 'graph'" />
    <ChatPanel v-else />
  </div>
</template>
