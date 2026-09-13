> 当前状态以 README / SESSION 为准：模型客户端已支持方舟 Responses；规划器仍是规则实现。下文的 DeepSeek 标注为历史默认，当前 UI 已移除精排开关。部分组件仍依赖具体实现，工具上下文有 search_knowledge 专用分支，不能理解为完全解耦。

# ARCHITECTURE.md — DocAgent 架构文档

## 概述

DocAgent 采用分层架构，自底向上分为 6 层。每层只依赖下一层的抽象接口，不依赖上层实现。

## 架构全景

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6:  Browser (React 19)                                     │
│          Sidebar / ChatArea / CitationPanel / DocumentsPage      │
│          依赖 → FastAPI REST + SSE                               │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5:  API (FastAPI)                                          │
│          POST /api/chat | /api/documents | /api/conversations    │
│          依赖 → Agent Runtime + Storage + DocumentManager        │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4:  Agent Runtime                                          │
│          Agent → Planner → Tool → Memory                        │
│          依赖 → ToolManager + LLM + PromptBuilder                │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3:  Tool & Retriever                                       │
│          SearchKnowledgeTool → Retriever → Reranker              │
│          依赖 → Embedding + FAISS + BM25 + Cross-encoder         │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2:  RAG Pipeline                                           │
│          QueryRewriter | Embedding(BGE) | FAISS | BM25 | Reranker│
│          依赖 → 本地模型 + 远程 API                              │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1:  Storage & Infrastructure                               │
│          SQLite (SQLAlchemy) | FAISS Index | Web Static          │
└─────────────────────────────────────────────────────────────────┘
```

## Layer 1: Storage & Infrastructure

### 职责
- 数据持久化（对话历史、文档元数据、FAISS 向量）

### 设计原则

| 原则 | 实现 |
|------|------|
| 对话存储 | SQLite — 零配置，Python 标准库内置，无缝迁 PostgreSQL |
| 向量存储 | FAISS IndexIDMap(IndexFlatIP) — 支持增量增删，纯 CPU |
| 文档存储 | 原始文件 → `uploads/`；元数据 → SQLite `documents` 表 |
| 模型缓存 | HuggingFace 本地缓存，首次下载后离线可用 |
| 向后兼容 | 自动检测旧版 IndexFlatIP → 迁移为 IndexIDMap |
| 数据库迁移 | `init_db()` 自动对比 ORM 模型 → ALTER TABLE 新增列 |

### 核心类

```
storage/
├── database.py   → get_session() / init_db() — 引擎单例 + 自动迁移
├── models.py     → Conversation / Message / DocumentRecord — ORM
└── repository.py → ConversationRepository / MessageRepository / DocumentRepository
```

## Layer 2: RAG Pipeline

### 流程

```
用户问题
   │
   ▼
QueryRewriter (LLM 查询改写)
   │  "MCP 是什么" → "MCP Model Context Protocol 定义 原理 架构"
   ▼
┌──────────────┬──────────────┐
│ 向量检索      │ 关键词检索    │
│ Embedding(BGE)│ jieba 分词   │
│ FAISS Top 20  │ BM25 Top 20  │
└──────┬───────┴──────┬───────┘
       │              │
       └──────┬───────┘
              ▼
       RRF 融合 (k=60)
              │
              ▼
       BGE Reranker (Cross-encoder 精排)
       Top 20 → Top 5
              │
              ▼
       PromptBuilder → LLM
```

### 核心类

```
src/
├── embedding/provider.py    → EmbeddingProvider(ABC) → BGEProvider
├── vectorstore/faiss_store.py → FAISSVectorStore (IndexIDMap)
├── retriever/retriever.py   → Retriever (Hybrid + RRF)
├── retriever/bm25.py        → BM25Retriever (jieba + rank-bm25)
├── reranker/reranker.py     → BGEReranker (Cross-encoder)
├── ingestion/chunker.py     → DocumentChunker (语义分块 + 上下文增强)
├── prompt/builder.py        → PromptBuilder (可配置模板)
├── parsers/                 → 多格式文档解析 (md/pdf/docx/txt/html)
└── llm/deepseek.py          → DeepSeekLLM (API 客户端)
```

## Layer 3: Tool & Retriever

### 职责
- 封装检索能力为标准 Tool 接口
- Agent 不直接调用 Retriever，通过 Tool 间接使用

### Tool 抽象

```python
class Tool(ABC):
    name: str
    description: str
    parameters: dict
    execute(**kwargs) → ToolResult
    format_result(ToolResult) → str

class ToolManager:
    register(tool) / get(name) / has(name) / list_metadata()
```

### SearchKnowledgeTool

```
SearchKnowledgeTool
├── _retriever     → Retriever
├── _reranker      → BGEReranker | None
└── _query_rewriter → QueryRewriter | None

execute(query, top_k):
  1. query_rewriter.rewrite(query) → 改写查询
  2. retriever.retrieve(query, top_k=20) → 召回
  3. reranker.rerank(query, candidates, top_k=5) → 精排
  4. 返回 ToolResult(data=results, metadata={recall, rewritten_query})
```

## Layer 4: Agent Runtime

### 职责
- 编排 Planner → Tool → LLM 的完整决策-执行-生成循环

### 核心组件

```
Agent (编排核心)
├── Memory(ABC)
│   ├── ConversationMemory          ← 纯内存滑动窗口
│   └── PersistentConversationMemory ← 滑动窗口 + SQLite 持久化
├── Planner(ABC)
│   └── RuleBasedPlanner             ← 正则匹配决策
│                                     (可升级 LLMPlanner)
├── ToolManager
│   └── SearchKnowledgeTool
├── PromptBuilder
└── DeepSeekLLM
```

### 执行流程

```
Agent.run(query)
  │
  ├─ 1. Memory.add("user", query)           ← 持久化到 SQLite
  │
  ├─ 2. 创建 AgentState (trace_id + 计数器)
  │
  ├─ 3. Planner 决策循环 (最多 max_iterations 次)
  │      ├─ Planner.decide(query, history, tool_metadata)
  │      ├─ respond → 跳出循环
  │      └─ call_tool → Tool.execute() → Observation → Memory.add("tool")
  │
  ├─ 4. _build_prompt(history + observations + query)
  │      └─ PromptBuilder._format_context() — [参考 N] 结构化格式
  │
  ├─ 5. LLM.chat(system, user) 或 LLM.chat_stream()
  │
  ├─ 6. Memory.add("assistant", answer)     ← 持久化到 SQLite
  │
  └─ 7. 返回 answer + trace 信息
```

### 为什么 Tool / Planner / Memory 都要抽象

| 抽象 | 原因 |
|------|------|
| Tool(ABC) | Agent 不直接调 Retriever/SQL/HTTP，加工具只需注册，Agent 一行不动 |
| Planner(ABC) | 决策策略 V1(V2(V3 变 3 次，Agent 编排不变；LLMPlanner 替换只改一行 |
| Memory(ABC) | 短期(持久化(摘要(向量记忆 逐步升级，Agent 不绑定具体实现 |

### Planner 只看 ToolMetadata 不看 Tool

- `ToolMetadata` 只有 `name / description / parameters`（描述）
- `Tool` 多一个 `execute()`（执行能力）
- Planner 物理上无法调用工具 — ISP（接口隔离原则）

## Layer 5: API

### 端点分类

```
Conversations:
  POST   /api/conversations        → 创建对话
  GET    /api/conversations        → 对话列表
  GET    /api/conversations/{id}   → 对话详情（含历史消息）
  DELETE /api/conversations/{id}   → 删除对话

Chat:
  POST   /api/chat                 → Agent 查询 (非流式)
  POST   /api/chat/stream          → Agent 查询 (SSE 流式)

Documents:
  POST   /api/documents/upload     → 上传文档
  GET    /api/documents            → 文档列表
  DELETE /api/documents/{id}       → 删除文档
  POST   /api/index/rebuild        → 重建全部索引

System:
  GET    /api/stats                → 系统统计
  GET    /api/health               → 健康检查
```

## Layer 6: Browser

### 组件树

```
App
├── Sidebar
│   ├── 新对话按钮
│   ├── 对话/文档 标签切换
│   ├── 对话列表 (点击切换, hover 删除)
│   └── 知识库文档列表
├── ChatArea
│   ├── 消息流 (Markdown + 代码高亮)
│   ├── SSE 流式渲染
│   ├── 输入框 + Rerank 开关
│   └── 引用按钮 → activeCitations
└── CitationPanel (可拖拽宽度)
    └── 来源卡片 (展开查看完整内容 + 分数)
```

## 依赖方向 (DIP)

```
Browser → FastAPI → Agent → Tool(ABC) → Retriever → FAISS/BGE
                ↘        ↘                        ↗
              SQLite   Memory(ABC)        QueryRewriter
                         ↘              ↗
                    Persistent         LLM
```

所有依赖指向抽象（ABC），不指向具体实现。存储层单独往下依赖，不被上层反向依赖。
