<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { Handle, Position, VueFlow, type Edge, type Node } from '@vue-flow/core'
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
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
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
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'bezier',
      animated: node.id === chat.activeNodeId,
      style: {
        stroke: node.id === chat.activeNodeId ? 'var(--graph-edge-active)' : 'var(--graph-edge)',
        strokeWidth: node.id === chat.activeNodeId ? 4 : 3,
      },
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

async function waitForFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function focusPendingNode(instance: {
  fitView: (options?: {
    nodes?: string[]
    padding?: number
    maxZoom?: number
    duration?: number
  }) => Promise<boolean>
}) {
  const nodeId = chat.pendingGraphFocusNodeId
  if (!nodeId) return

  await nextTick()
  await waitForFrame()
  await instance.fitView({ padding: 0.18, duration: 0 })

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const didFocus = await instance.fitView({
      nodes: [nodeId],
      padding: 0.65,
      maxZoom: 1.25,
      duration: attempt === 0 ? 0 : 220,
    })

    if (didFocus) break
    await waitForFrame()
  }

  chat.consumePendingGraphFocusNodeId()
}
</script>

<template>
  <main class="app-shell h-screen">
    <header class="app-header">
      <div class="flex items-center gap-2">
        <MessageSquare class="accent-text size-5" />
        <h1 class="text-base font-semibold">对话图</h1>
        <span class="muted-text text-sm">左键回到节点后继续说话会自动分支，右键删除节点及后续分支</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="primary-button inline-flex items-center gap-2 px-3 py-2 text-sm"
          type="button"
          @click="chat.setMode('chat')"
        >
          <PanelRightClose class="size-4" />
          聊天模式
        </button>
        <button
          class="secondary-button inline-flex items-center gap-2 px-3 py-2 text-sm"
          type="button"
          @click="chat.resetNodePositions"
        >
          <RotateCcw class="size-4" />
          重新布局
        </button>
      </div>
    </header>

    <VueFlow
      class="branchy-flow h-[calc(100vh-3.5rem)]"
      :nodes="flowNodes"
      :edges="flowEdges"
      fit-view-on-init
      @node-click="handleNodeClick"
      @node-context-menu="handleNodeContextMenu" 
      @node-drag-stop="handleNodeDragStop"
      @pane-ready="focusPendingNode"
    >
      <template #node-chatNode="{ data }">
        <div
          class="graph-node relative p-3"
          :class="data.active ? 'graph-node-active' : ''"
        >
          <Handle
            id="left"
            type="target"
            :position="Position.Left"
            class="opacity-0"
          />
          <Handle
            id="right"
            type="source"
            :position="Position.Right"
            class="opacity-0"
          />
          <p class="line-clamp-2 text-sm font-medium leading-5">{{ data.title }}</p>
          <p class="muted-text mt-2 line-clamp-2 text-xs leading-5">
            {{ data.answer }}
          </p>
        </div>
      </template>
    </VueFlow>
  </main>
</template>
