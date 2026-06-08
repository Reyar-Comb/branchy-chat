<script setup lang="ts">
import { computed } from 'vue'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import { MessageSquare, PanelRightClose, RotateCcw } from 'lucide-vue-next'
import { useChatStore, type ChatNode } from '~/stores/chat'

const chat = useChatStore()
const X_GAP = 320
const Y_GAP = 180

type LayoutInfo = {
  depth: number
  lane: number
}

const flowNodes = computed<Node[]>(() => {
  const treeLayout = buildTreeLayout(chat.nodes)

  return chat.nodes.map((chatNode) => {
    const layout = treeLayout.get(chatNode.id) ?? { depth: 0, lane: 0 }
    const position = chatNode.position ?? {
      x: layout.depth * X_GAP,
      y: layout.lane * Y_GAP,
    }

    return {
      id: chatNode.id,
      type: 'chatNode',
      position,
      data: {
        title: chatNode.userText,
        answer: chatNode.assistantText,
        active: chatNode.id === chat.activeNodeId,
      },
    }
  })
})

const flowEdges = computed<Edge[]>(() =>
  chat.nodes
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `${node.parentId}-${node.id}`,
      source: node.parentId!,
      target: node.id,
      animated: node.id === chat.activeNodeId,
    })),
)

function buildTreeLayout(nodes: ChatNode[]) {
  const layout = new Map<string, LayoutInfo>()
  const childrenByParent = new Map<string | null, ChatNode[]>()
  let nextLane = 1

  for (const node of nodes) {
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }

  function visit(node: ChatNode, depth: number, lane: number) {
    layout.set(node.id, { depth, lane })

    const children = childrenByParent.get(node.id) ?? []
    children.forEach((child, index) => {
      const childLane = index === 0 ? lane : nextLane++
      visit(child, depth + 1, childLane)
    })
  }

  const roots = childrenByParent.get(null) ?? []
  roots.forEach((root, index) => {
    const rootLane = index === 0 ? 0 : nextLane++
    visit(root, 0, rootLane)
  })

  return layout
}

function handleNodeClick(event: { node: Node }) {
  chat.selectNode(event.node.id)
}

function handleNodeDragStop(event: { node: Node }) {
  chat.updateNodePosition(event.node.id, {
    x: event.node.position.x,
    y: event.node.position.y,
  })
}

function handleNodeContextMenu(event: { event: MouseEvent; node: Node }) {
  event.event.preventDefault()

  const nodeId = event.node.id
  const node = chat.nodes.find((item) => item.id === nodeId)
  if (!node || node.parentId === null) return

  const confirmed = window.confirm('删除这个节点以及它后面的所有分支？')
  if (!confirmed) return

  chat.deleteNodeWithDescendants(nodeId)
}
</script>

<template>
  <main class="h-screen bg-[#f6f3ed] text-[#202124]">
    <header
      class="flex h-14 items-center justify-between border-b border-[#d8d1c5] bg-[#fbfaf7] px-4"
    >
      <div class="flex items-center gap-2">
        <MessageSquare class="size-5 text-[#3c6e71]" />
        <h1 class="text-base font-semibold">对话图</h1>
        <span class="text-sm text-[#6b6f72]">左键回到节点后继续说话会自动分支，右键删除节点及后续分支</span>
      </div>

      <button
        class="inline-flex items-center gap-2 rounded-md bg-[#2f5d62] px-3 py-2 text-sm font-medium text-white hover:bg-[#244b50]"
        type="button"
        @click="chat.setMode('chat')"
      >
        <PanelRightClose class="size-4" />
        聊天模式
      </button>
      <button
        class="inline-flex items-center gap-2 rounded-md border border-[#d8d1c5] bg-white px-3 py-2 text-sm font-medium text-[#3c4043] hover:bg-[#eef6f4]"
        type="button"
        @click="chat.resetNodePositions"
      >
        <RotateCcw class="size-4" />
        重新布局
      </button>
    </header>

    <VueFlow
      class="h-[calc(100vh-3.5rem)]"
      :nodes="flowNodes"
      :edges="flowEdges"
      fit-view-on-init
      @node-click="handleNodeClick"
      @node-context-menu="handleNodeContextMenu" 
      @node-drag-stop="handleNodeDragStop"
    >
      <template #node-chatNode="{ data }">
        <div
          class="w-60 rounded-md border bg-white p-3 shadow-sm"
          :class="data.active ? 'border-[#2f5d62] ring-2 ring-[#2f5d62]/20' : 'border-[#d8d1c5]'"
        >
          <p class="line-clamp-2 text-sm font-medium leading-5">{{ data.title }}</p>
          <p class="mt-2 line-clamp-2 text-xs leading-5 text-[#6b6f72]">
            {{ data.answer }}
          </p>
        </div>
      </template>
    </VueFlow>
  </main>
</template>
