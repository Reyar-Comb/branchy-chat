# Branchy Chat Roadmap

Branchy Chat 是一个分支式 AI 对话工具。核心目标是让用户在保持主线话题连续的同时，可以随时把细节问题、旁支探索、不同回复方向拆成可见的对话分支，再从任意节点继续。

## Current State

已经完成的基础能力：

- Nuxt 4 + Vue 3 + Pinia + Vue Flow 项目骨架。
- 普通聊天模式和节点图模式切换。
- 对话历史以树形节点保存，每个节点包含用户消息和助手回复。
- 左键节点：切回聊天模式，并从该节点继续对话。
- 从历史节点继续发送时，会自然生成新分支。
- 右键节点：确认后删除该节点及其所有后代节点。
- 根节点支持 `includeInContext: false`，不会被拼进模型上下文。
- 请求失败时回滚新节点，避免错误占位内容污染历史。
- 流式响应。
- Enter 发送、Shift + Enter 换行，并处理中文输入法组合输入。
- 聊天模式自动滚动到底部，切回聊天时聚焦输入框。
- 顶栏 sticky。
- Vue Flow 节点图支持拖动节点、保存节点位置、重新布局。
- 节点布局使用分支 lane：单分支横向排列，新分支向侧边展开。
- 节点连线使用左右 handle，并加粗显示。
- 深色模式和黑白/现代蓝主题基础样式。
- 后端通过 OpenAI-compatible API 调用模型。
- 本地 `config.toml` 配置 AI 接口，包含 `url`、`key`、`model`。
- `config.toml` 已加入 git ignore，仓库只保留 `config.example.toml`。
- 服务启动时加载 provider config，前端可以留空 API key 使用服务端配置。

## Near-Term Iterations

### 1. Chat Rendering

目标：让 AI 回复更接近真实产品体验。

要做：

- 支持 Markdown 渲染。
- 支持代码块高亮。
- 支持 LaTeX 数学公式渲染。
- 控制 Markdown 样式，让它和当前聊天卡片、深色模式一致。
- 保留纯文本换行体验，避免样式过重。

建议技术：

- Markdown：`markdown-it` 或 `remark/rehype`。
- 代码高亮：`shiki`。
- LaTeX：`katex`。

难度：中等。

风险点：

- 流式输出过程中 Markdown 可能是不完整语法，需要渲染器能容忍半截内容。
- 数学公式和代码块样式容易撑破移动端布局。

### 2. Graph View Polish

目标：节点图更像一个真正可用的分支编辑器。

要做：

- 继续优化节点自动布局。
- 单主线保持横向排列。
- 新分支固定到主线侧边 lane，不按每一列居中导致重合或跳动。
- 保留用户手动拖动的位置，不被自动布局覆盖。
- 增加节点选中态、当前主线高亮、分支路径高亮。
- 优化边线样式，当前倾向使用贝塞尔曲线，但要保持左右直接连接。
- 节点内容过长时做截断和 hover/详情预览。

建议技术：

- 继续使用 Vue Flow。
- 先手写轻量树布局，不急着引入 Dagre/ELK。
- 当分支很多、布局复杂后，再考虑 `elkjs`。

难度：中等偏高。

风险点：

- 自动布局和手动拖动位置之间容易互相打架。
- 大量节点下需要控制性能和视野定位。

### 3. Node Operations

目标：让分支管理能力更完整。

要做：

- 右键菜单从简单确认删除升级成菜单。
- 菜单项包括：删除分支、从此处继续、复制节点内容、复制该路径上下文。
- 支持把某个节点路径 merge 到另一条分支。
- merge 时明确上下文拼接规则，避免用户不知道模型到底看到了什么。
- 删除前可以展示会删除多少个后代节点。

难度：中等。

风险点：

- merge 对缓存不友好，因为上下文可能变成非树形组合。
- merge 的 UI 需要避免误操作。

### 4. Persistence

目标：刷新页面后保留会话和节点图。

要做：

- 保存多个会话。
- 新建对话、切换对话、重命名对话、删除对话。
- 保存节点、边、当前节点、手动拖动位置、provider 设置。
- 支持导出/导入单个会话 JSON。

个人作品阶段建议：

- 第一版用 `localStorage` 或 IndexedDB。
- 后续再上 SQLite/Prisma。

难度：中等。

风险点：

- 流式响应中断时的保存状态要处理好。
- 数据结构需要可迁移，避免以后改字段时旧数据全坏。

## AI Capability Roadmap

### 5. DeepSeek Thinking Output

目标：如果 DeepSeek 或反代接口支持思维/推理字段，可以在 UI 中单独展示。

要做：

- 调研 DeepSeek 当前接口实际返回格式。
- 判断是否支持 reasoning content、thinking tokens 或类似字段。
- 后端流式解析时区分：
  - 普通回答内容。
  - 推理/思考内容。
  - 工具调用内容。
- 前端提供可折叠的“思考过程”区域。

注意：

- 不同 OpenAI-compatible 代理对推理字段支持不一致。
- 如果接口只返回最终答案，就不能强行伪造思维链。

难度：中等。

### 6. Search Toggle

目标：用户可以打开“智能搜索”，让模型在回答前使用外接搜索服务。

建议先做轻量版本：

- 前端增加搜索开关。
- 后端收到请求后，如果搜索开启：
  - 根据用户最新问题调用搜索服务。
  - 把搜索结果摘要拼进 system 或 user context。
  - 再调用模型生成答案。
- UI 显示引用来源或搜索结果摘要。

搜索服务可选：

- Tavily。
- SerpAPI。
- Exa。
- 自建搜索代理。
- 简单阶段也可以先用本地 mock。

难度：中等。

风险点：

- 搜索结果需要截断和去噪。
- 引用格式要稳定。
- 搜索会增加延迟和成本。

### 7. Agent Loop

目标：从单次 AI 回复升级为多步骤 agent 循环。

可能形态：

- 模型先决定是否需要搜索。
- 执行搜索工具。
- 模型阅读结果后继续决定是否还要搜索或直接回答。
- 最终输出答案。

当前架构影响：

- 不需要完全重构前端树形对话。
- 后端 `/api/chat` 需要从“一次模型调用”升级成“多步骤运行器”。
- 流式协议最好从纯文本升级为事件流，例如：
  - `message_delta`
  - `reasoning_delta`
  - `tool_call`
  - `tool_result`
  - `final`
  - `error`
- Pinia store 需要从单个 `assistantText` 扩展出更结构化的消息状态。

建议顺序：

1. 先保持单次请求，加入搜索 toggle。
2. 再把后端响应格式从纯文本改成事件流。
3. 最后实现多轮 agent loop。

难度：高。

风险点：

- Agent loop 很容易把状态、流式 UI、错误恢复一起复杂化。
- 如果太早做，会拖慢基础产品体验迭代。

## Architecture Direction

短期保持当前架构：

- Nuxt 负责前端和 server routes。
- Pinia 负责聊天树状态。
- Vue Flow 负责节点图。
- AI 请求集中在 `server/api/chat.post.ts`。
- Provider 配置集中在 `server/utils/provider-config.ts`。

中期可能演进：

- 把 AI 调用抽成 service，例如 `server/services/ai-client.ts`。
- 把搜索工具抽成 service，例如 `server/services/search.ts`。
- 把 agent loop 抽成 runner，例如 `server/services/agent-runner.ts`。
- 前端 store 从 `assistantText` 扩展成更细的 `messages` 或 `events`。

长期如果做成更完整产品：

- 数据持久化迁到 SQLite + Prisma。
- 支持多会话、多 provider、多模型配置。
- 支持会话导出、导入、分享。
- 支持云端部署时用环境变量或后台配置替代本地 `config.toml`。

## Suggested Implementation Order

推荐接下来的迭代顺序：

1. Markdown / LaTeX / 代码高亮。
2. 会话本地持久化。
3. 节点图选中态、主线高亮、节点详情预览。
4. 右键菜单增强。
5. 搜索 toggle 的单次请求版本。
6. DeepSeek reasoning 字段适配。
7. 后端事件流协议。
8. 多段 agent loop。
9. SQLite/Prisma 持久化。
10. 会话导出、导入、分享。

## Open Questions

- Markdown 渲染是否允许 HTML？默认建议禁用。
- LaTeX 只支持 `$...$` / `$$...$$`，还是同时支持 `\(...\)` / `\[...\]`？
- 搜索结果是否要作为可见引用展示，还是只作为隐藏上下文？
- merge 分支时，是复制上下文快照，还是保留引用关系？
- 本地个人作品是否需要账号系统？当前建议暂不做。
- provider 设置是全局配置，还是每个会话可以单独覆盖？

