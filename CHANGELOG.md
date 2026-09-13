# CHANGELOG.md — DocAgent 版本演进

## 2026-09-13 — 本地运行修复与界面调整

- 恢复黑白灰页面，简化欢迎布局，完善移动端、引用折叠和加载错误状态。
- 支持可配置模型与请求路径，新增方舟 Responses 普通/流式适配。
- Embedding Provider 读取配置的本地模型路径，恢复后端启动。
- 普通/流式模型调用、前后端健康检查通过；精排未启用。
- README、配置说明及当前状态更新，纠正全离线和完成度表述。
- 审阅发现的多轮检索、去重、删除及引用恢复问题尚未修复。现有测试 2 项中 1 项失败。


## v2.1 — 2026-07-17

### 新增
- **多格式文档上传** — 支持 .pdf .docx .txt .html 解析（PyMuPDF / python-docx / BeautifulSoup）
- **SQLite 持久化** — Conversation / Message / Document 三层 ORM + Repository
- **多会话系统** — 对话创建/列表/详情/删除 API + 前端侧栏对话列表
- **PersistentConversationMemory** — 滑动窗口 + SQLite 自动持久化
- **增量索引** — IndexIDMap + SHA256 hash 去重，单文档修改不重建全部索引
- **RAG Citation** — LLM [1][2] 行内引用 + PromptBuilder 结构化上下文 [参考 N]
- **数据库自动迁移** — `init_db()` 自动检测新增列 → ALTER TABLE
- **HuggingFace 镜像** — 默认 hf-mirror.com，国内免墙

### 修复
- Agent 构造函数 `or` fallback 因 `__len__` 返回 0 导致持久化 memory 被替换
- 多轮对话发送第二句时 status 卡在 `done` 无法发送
- 旧 DB 新增 `content_hash` 列导致查询失败

### 变更
- FAISS 从 IndexFlatIP 升级为 IndexIDMap(IndexFlatIP)，支持 `remove_ids`
- DocumentManager 从 JSON 文件改为 SQLite，启动时自动迁移旧数据
- Agent `_build_prompt` 改用 PromptBuilder 格式化搜索上下文

---

## v2.0 — 2026-07-16

### 核心
- **Web 重构** — 从 stdlib HTTP server + Vanilla JS 升级为 FastAPI + React + TypeScript + Vite + TailwindCSS
- **SSE 流式输出** — `/api/chat/stream` 逐 token 实时渲染
- **Markdown 渲染** — react-markdown + rehype-highlight 代码高亮
- **文档管理** — 上传/列表/删除/重建索引 API + 前端页面
- **Docker 部署** — Dockerfile + .dockerignore + DEPLOY.md
- **项目改名** — yuque-agent → DocAgent

---

## v1.x — Phase 1~4

### Phase 1-3
- Markdown → Document → Chunk → Embedding(BGE) → FAISS IndexFlatIP → Search
- Retriever + PromptBuilder + DeepSeekLLM
- Web 前端（Vanilla JS）+ 一键启动

### Phase 4
- 4.1: Chunk 上下文增强（标题/前后文/路径）
- 4.2: Hybrid Search（BM25 + jieba + RRF 融合）
- 4.3: Cross-Encoder Reranking（Recall → Rerank 两阶段）
- 4.4: Query Rewriting（LLM 查询改写）
- 4.5: Agent Runtime（Tool / Memory / Planner / Agent 编排）
