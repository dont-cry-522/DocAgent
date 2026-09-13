> 本文件是设计方案，包含尚未实现的功能和数据结构；不是完成清单。2026-09-13 当前状态见 README.md 与 SESSION.md。

# DocAgent: Enterprise Knowledge Agent

## 产品设计文档 v1.0

---

## 1. 产品定位

**一句话：把你的本地文档变成可对话的知识库——像 ChatGPT 那样提问，像 Perplexity 那样引用来源，像 NotebookLM 那样只基于你的资料回答。**

目标用户：
- 开发者 — 技术文档、API 手册、源码笔记的快速检索和问答
- 学生 — 课程笔记、论文 PDF、教材的语义搜索和学习辅助
- 企业 — 内部知识库、SOP 文档、项目文档的统一入口，无需联网

与竞品的差异化：

| | DocAgent | NotebookLM | Perplexity | ChatGPT Projects |
|---|---|---|---|---|
| 部署方式 | 本地 / 自托管 | 云端 | 云端 | 云端 |
| 数据隐私 | 完全本地，不上传 | 上传 Google | 上传 | 上传 |
| LLM | 可替换（DeepSeek / OpenAI 兼容） | Gemini | 自有 | GPT-4 |
| 开源 | 是 | 否 | 否 | 否 |
| 多格式 | Markdown / PDF / Word / TXT | PDF / Web / Paste | Web / PDF | 文件上传 |
| 定价 | 免费（仅 API 费用） | 免费 | $20/月 | $20/月 |

---

## 2. 用户使用流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        首次使用                                  │
│                                                                 │
│  打开浏览器 → 上传文档（拖拽 / 选择文件）                          │
│       │                                                         │
│       ▼                                                         │
│  系统自动：解析 → 分块 → 向量化 → 建索引                           │
│       │                                                         │
│       ▼                                                         │
│  索引就绪 → 进入对话界面 → 开始提问                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        日常使用                                  │
│                                                                 │
│  打开浏览器 → 知识库已就绪                                        │
│       │                                                         │
│       ▼                                                         │
│  输入问题 "MCP 协议的工具调用流程是什么"                            │
│       │                                                         │
│       ▼                                                         │
│  Agent 判断：需要搜索                                              │
│       │                                                         │
│       ▼                                                         │
│  QueryRewriter 改写为: "MCP Model Context Protocol 工具调用流程"    │
│       │                                                         │
│       ▼                                                         │
│  Hybrid Search (Vector + BM25) → Top 20                         │
│       │                                                         │
│       ▼                                                         │
│  Reranker 精排 → Top 5                                           │
│       │                                                         │
│       ▼                                                         │
│  LLM 生成回答（带内联引用 [1][2][3]）                              │
│       │                                                         │
│       ▼                                                         │
│  用户看到：回答 + 可展开的引用来源卡片                              │
│       │                                                         │
│       ▼                                                         │
│  追问："第二步具体怎么实现"（Agent 从 Memory 获取上文）              │
│       │                                                         │
│       ▼                                                         │
│  循环...                                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        管理文档                                  │
│                                                                 │
│  打开文档管理 → 查看已上传列表 → 删除 / 重新上传 / 查看索引状态      │
│  支持增量：上传新文档 → 自动追加到索引，无需重建全部                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 页面设计

### 3.1 信息架构

```
/ (首页)
├── /chat           对话主界面（默认首页）
│   ├── 左侧：对话列表 + 新建对话按钮
│   ├── 中间：对话区（消息流 + 输入框）
│   └── 右侧 / 下方：来源引用面板
│
├── /documents      文档管理
│   ├── 上传区域（拖拽）
│   ├── 文档列表（名称、大小、索引状态、时间）
│   └── 索引统计（总块数、总字数、最后更新时间）
│
└── /settings       设置
    ├── LLM 配置（API Key、Base URL、Model）
    ├── Embedding 模型选择
    ├── 检索参数（Top-K、Rerank 开关）
    └── 系统状态（索引大小、内存占用）
```

### 3.2 页面设计要点

**对话主界面 (`/chat`)**

参考布局（类似 ChatGPT + Perplexity 的融合）：

```
┌──────────┬──────────────────────────┬─────────────┐
│          │                          │             │
│ 对话列表  │     消息流               │  来源引用    │
│          │                          │             │
│ + 新建   │  User: MCP是什么         │  [1] 语雀    │
│          │                         │    MCP定义... │
│ ──────── │  Agent: MCP 全称是...   │              │
│ 对话1    │  [1][2]                 │  [2] MCP知识  │
│ 对话2    │                         │    工具调用.. │
│ 对话3    │                         │              │
│          │  ─────────────────────  │              │
│          │  [输入框          ] 发送 │              │
│          │                         │              │
└──────────┴──────────────────────────┴─────────────┘
```

**移动端适配**：来源引用面板变为可折叠的底部抽屉。

**文档管理页面 (`/documents`)**

```
┌──────────────────────────────────────────────┐
│  📄 知识库文档                                 │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  拖拽文件到此处上传                      │    │
│  │  支持 Markdown / PDF / Word / TXT     │    │
│  │                         [选择文件]     │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  已上传文档 (3)           总块数: 156         │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 📑 个人知识库.md          24块  2天前  │    │
│  │ 📑 语雀.md               56块  2天前  │    │
│  │ 📑 Python异步编程.pdf    76块  1天前  │    │
│  │                              [删除]   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [重建全部索引]                               │
└──────────────────────────────────────────────┘
```

---

## 4. 前后端架构

### 4.1 总体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器                                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              前端 SPA (Vanilla JS)                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐     │    │
│  │  │ Chat     │ │ Documents│ │ Settings           │     │    │
│  │  │ View     │ │ View     │ │ View               │     │    │
│  │  └────┬─────┘ └────┬─────┘ └───────┬───────────┘     │    │
│  │       │             │               │                  │    │
│  │  ┌────┴─────────────┴───────────────┴───────────┐     │    │
│  │  │              API Client (fetch)               │     │    │
│  │  └──────────────────────┬───────────────────────┘     │    │
│  └─────────────────────────┼─────────────────────────────┘    │
└────────────────────────────┼──────────────────────────────────┘
                             │ HTTP REST
┌────────────────────────────┼──────────────────────────────────┐
│                         FastAPI Server                         │
│  ┌─────────────────────────┴──────────────────────────┐       │
│  │                  API Routes                         │       │
│  │  /api/chat  /api/documents  /api/upload  /api/settings │   │
│  └──┬──────────┬──────────────┬──────────────┬────────┘       │
│     │          │              │              │                 │
│  ┌──┴──┐  ┌───┴────┐  ┌─────┴──────┐  ┌───┴──────┐          │
│  │Agent│  │Document│  │File Parser │  │ Settings │          │
│  │Orch │  │Manager │  │  Pipeline  │  │ Manager  │          │
│  └──┬──┘  └───┬────┘  └─────┬──────┘  └──────────┘          │
│     │         │              │                                 │
│  ┌──┴─────────┴──────────────┴────────────────────┐          │
│  │              现有 RAG 管道                       │          │
│  │  Embedding → FAISS → BM25 → Reranker → LLM     │          │
│  └───────────────────────────────────────────────┘          │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │              SQLite                           │           │
│  │  conversations  │  documents  │  chunks       │           │
│  └──────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 关键架构决策

**为什么选择 FastAPI 替换 stdlib HTTP server：**
- Phase 6 已规划 FastAPI — 现在是最好的时机
- 自动 OpenAPI 文档（/docs），降低 API 对接成本
- 异步支持，文件上传不阻塞对话
- 更成熟的中间件生态（CORS、静态文件、错误处理）
- 仍保持 Python 技术栈统一

**为什么前端保持 Vanilla JS（不用 React/Vue）：**
- 零构建步骤，`pip install` 后直接 `python start.py` 即可运行
- 本项目只有 3-4 个页面，SPA 框架的收益不大
- 降低贡献门槛，懂 HTML/JS 就能改前端
- 保持 Repo 体积小（无 node_modules）

**为什么引入 SQLite：**
- 对话需要持久化（刷新不丢失历史）
- 文档元数据需要管理（名称、哈希、索引状态）
- 零配置、零依赖（Python 标准库内置）
- 未来可无缝升级到 PostgreSQL

**模块分层原则（延续现有设计）：**
- Agent 层不感知 HTTP
- Tool 层不感知数据库
- Parser 层不感知索引
- 每一层只依赖下一层抽象，不依赖上层

---

## 5. API 设计

### 5.1 RESTful API

```
Base URL: http://localhost:8000/api

聊天
  POST   /chat/send             发送消息（非流式，MVP）
  POST   /chat/stream            发送消息（流式 SSE，V2）
  GET    /conversations           获取对话列表
  POST   /conversations           创建新对话
  DELETE /conversations/{id}      删除对话
  GET    /conversations/{id}      获取对话详情（含消息历史）

文档
  POST   /documents/upload        上传文档（multipart/form-data）
  GET    /documents               获取文档列表
  DELETE /documents/{id}          删除文档及其索引
  GET    /documents/{id}/chunks   获取文档的分块列表
  POST   /index/rebuild           重建全部索引

系统
  GET    /settings                获取当前配置
  PUT    /settings                更新配置
  GET    /health                  健康检查
  GET    /stats                   系统状态（内存、索引大小、文档数）
```

### 5.2 核心 API 细节

**POST /api/chat/send**

```json
// Request
{
  "conversation_id": "conv_abc123",
  "message": "MCP 的工具调用流程是什么",
  "rerank": true
}

// Response
{
  "conversation_id": "conv_abc123",
  "message_id": "msg_xyz789",
  "answer": "MCP 的工具调用流程分为以下几步：\n\n1. ...\n\n2. ...",
  "citations": [
    {
      "index": 1,
      "document_title": "语雀 - MCP 知识点",
      "chunk_content": "MCP 定义：Model Context Protocol...",
      "score": 0.9234,
      "heading": "MCP 工具调用流程"
    },
    {
      "index": 2,
      "document_title": "语雀 - MCP 知识点",
      "chunk_content": "工具调用流程：1. Agent 发起 tool-call...",
      "score": 0.8812,
      "heading": "工具调用流程详解"
    }
  ],
  "rewritten_query": "MCP Model Context Protocol 工具调用 流程 步骤",
  "elapsed_ms": 3245,
  "error": null
}
```

**POST /api/documents/upload**

```json
// Request: multipart/form-data, field "file"

// Response
{
  "document_id": "doc_abc123",
  "filename": "Python异步编程.pdf",
  "file_size": 245678,
  "format": "pdf",
  "chunk_count": 76,
  "indexed": true,
  "elapsed_ms": 4521
}
```

**GET /api/stats**

```json
{
  "document_count": 3,
  "total_chunks": 156,
  "total_size_bytes": 1048576,
  "index_size_bytes": 204800,
  "last_indexed_at": "2026-07-16T10:30:00Z",
  "embedding_model": "BAAI/bge-small-zh-v1.5",
  "reranker_model": "BAAI/bge-reranker-v2-m3",
  "llm_model": "deepseek-chat"
}
```

---

## 6. 数据流

### 6.1 完整数据流图

```
用户上传 PDF
     │
     ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ 文件接收     │───▶│ 格式识别      │───▶│ 内容提取     │
│ /upload     │    │ .md/.pdf/.docx│    │ 纯文本      │
└─────────────┘    └──────────────┘    └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ FAISS 写入  │◀───│ Embedding    │◀───│ Chunk 切分   │
│ (增量追加)  │    │ BGE 512d     │    │ + 上下文增强  │
└──────┬──────┘    └──────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌──────────────┐
│ BM25 更新   │    │ SQLite 写入   │
│ (增量追加)  │    │ document +   │
└─────────────┘    │ chunk 元数据  │
                   └──────────────┘


用户发送消息
     │
     ▼
┌──────────────┐
│ Agent.run()  │
│ query="MCP?" │
└──────┬───────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Memory 读取  │    │ Planner 判断  │    │ QueryRewriter│
│ 历史对话     │    │ 需要搜索     │    │ 改写查询     │
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────────────────────────┐
                    │     SearchKnowledgeTool          │
                    │                                  │
                    │  ┌─────────┐  ┌─────────┐       │
                    │  │ FAISS   │  │ BM25    │       │
                    │  │ Vector  │  │ Keyword │       │
                    │  └────┬────┘  └────┬────┘       │
                    │       │            │            │
                    │       └─────┬──────┘            │
                    │             ▼                   │
                    │       ┌──────────┐              │
                    │       │ RRF 融合 │              │
                    │       └────┬─────┘              │
                    │            ▼                    │
                    │       ┌──────────┐              │
                    │       │ Reranker │              │
                    │       │ Top 20   │              │
                    │       │  → Top 5 │              │
                    │       └────┬─────┘              │
                    └─────────────┼────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────┐
│              PromptBuilder                        │
│  system + history + observations + query         │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│              DeepSeekLLM                          │
│  生成回答 + 标记引用 [1][2]                        │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  响应组装                                          │
│  answer + citations[] → JSON → 前端               │
│  Memory 写入本次对话                               │
└──────────────────────────────────────────────────┘
```

### 6.2 状态管理（前端）

```
全局状态（存于内存，刷新丢失）：
  ┌─────────────────┐
  │ currentConvId    │  当前对话 ID
  │ conversations[]  │  对话列表
  │ documents[]      │  文档列表
  │ settings{}       │  系统配置
  │ isLoading        │  加载状态
  └─────────────────┘

持久化状态（后端 SQLite）：
  ┌─────────────────┐
  │ 对话历史          │  conversations + messages
  │ 文档元数据        │  documents + chunks 映射
  │ 系统配置          │  settings (可覆盖 .env)
  └─────────────────┘
```

---

## 7. 文件上传流程

```
用户操作                         后端处理
────────                        ────────

拖拽文件到上传区
     │
     ▼
前端校验：
  - 格式许可？（.md .pdf .docx .txt .html）
  - 大小限制？（< 50MB）
  - 同名覆盖确认？
     │
     ▼
POST /api/documents/upload
multipart/form-data
     │
     ▼
                    ┌──────────────────┐
                    │ 1. 保存到 uploads/ │
                    │    UUID 重命名    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ 2. 格式识别       │
                    │    MIME + 扩展名  │
                    └────────┬─────────┘
                             │
                    ┌────────┼──────────┐
                    ▼        ▼          ▼
                  .md      .pdf       .docx
                    │        │          │
                    ▼        ▼          ▼
              ┌──────────────────────────────┐
              │ 3. Parser 提取纯文本          │
              │    MarkdownParser             │
              │    PDFParser (PyMuPDF)        │
              │    DocxParser (python-docx)   │
              │    TextParser (built-in)      │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ 4. Chunk 切分     │
                    │    + 标题提取     │
                    │    + 上下文增强   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ 5. Embedding     │
                    │    BGE 512d      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ 6. 索引写入       │
                    │    FAISS 增量    │
                    │    BM25 增量     │
                    │    metadata.json │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ 7. DB 记录写入    │
                    │    documents 表   │
                    │    chunks 表      │
                    └────────┬─────────┘
                             │
                             ▼
                    返回响应（document_id, 
                    chunk_count, elapsed_ms）
```

错误处理：
- 文件格式不支持 → 400 + 支持的格式列表
- 文件过大 → 413 + 最大限制
- 解析失败 → 200 + indexed: false + error_message（不阻塞系统）
- PDF 为扫描件（无文本） → warning，提示需要 OCR（V2 特性）

---

## 8. 文档解析流程

### 8.1 Parser 抽象

```python
# parsers/base.py
class DocumentParser(ABC):
    supported_formats: list[str]           # ["md", "pdf", ...]
    
    @abstractmethod
    def parse(self, file_path: Path) -> ParsedDocument:
        ...

@dataclass
class ParsedDocument:
    title: str                             # 文档标题
    content: str                           # 纯文本内容
    metadata: dict                         # 格式元数据
    sections: list[Section]                # 章节结构（选填）

@dataclass
class Section:
    heading: str
    level: int                             # 1=h1, 2=h2...
    content: str
    children: list[Section]
```

### 8.2 各格式解析策略

| 格式 | Parser | 依赖 | 策略 |
|------|--------|------|------|
| `.md` | MarkdownParser | `markdown` (已有) | 保留标题层级 → section 结构；代码块保留 |
| `.pdf` | PDFParser | `PyMuPDF` (新增) | 按页提取 → 合并 → 按段落/标题规则分块 |
| `.docx` | DocxParser | `python-docx` (新增) | 按段落提取 + 样式识别标题 |
| `.txt` | TextParser | 无 | 按空行分段 |
| `.html` | HTMLParser | `beautifulsoup4` (可选) | 提取 body text，去除 script/style |

### 8.3 通用后处理（所有 Parser 共用）

```
原始文本
  │
  ▼
空格规范化（合并多余空行、去除不可见字符）
  │
  ▼
标题识别（PDF/TXT 无原生标题，用启发式规则：
  - 短行（<80字）
  - 以数字/序号开头
  - 上一行为空行
  → 标记为候选标题）
  │
  ▼
→ Chunk 切分 → 上下文增强 → Embedding → 索引
```

---

## 9. 索引构建流程

### 9.1 增量索引（单文档上传）

```
新文档上传
  │
  ▼
ParsedDocument
  │
  ▼
Chunk 切分 (RecursiveCharacterTextSplitter)
  │   chunk_size=512, overlap=64
  ▼
Chunk 上下文增强
  │   标题、前文、后文、文档标题、路径
  ▼
┌─────────────┬──────────────┐
│ Embedding   │ BM25 分词     │
│ BGE 512d    │ jieba 分词    │
│              │ tokenize     │
└──────┬──────┴──────┬───────┘
       │             │
       ▼             ▼
┌──────────────┐ ┌──────────────┐
│ FAISS 追加   │ │ BM25 追加    │
│ add_with_ids │ │ corpus 扩展  │
└──────┬───────┘ └──────┬───────┘
       │                │
       └───────┬────────┘
               ▼
       ┌──────────────┐
       │ metadata.json │
       │ 追加 chunk    │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ SQLite 写入   │
       │ documents 表  │
       │ chunks 表     │
       └──────────────┘
```

### 9.2 全量重建（用户手动触发）

```
触发条件：用户点击"重建全部索引" 或 元数据不一致
  │
  ▼
清空现有索引（FAISS reset + BM25 reset + metadata.json 重置）
  │
  ▼
遍历 uploads/ 目录所有文件
  │
  ▼
逐个重新解析 → Chunk → Embedding → 写入索引
  │
  ▼
更新 SQLite 元数据
```

### 9.3 索引存储结构

```
output/
├── index.faiss           # FAISS IndexFlatIP 二进制
├── vectors.npy            # （未来：可选的向量缓存）
├── metadata.json          # 所有 chunk 元数据（JSON 数组）
│   [{
│     "chunk_id": "doc1_chunk_000",
│     "document_id": "doc_abc123",
│     "title": "...",
│     "chunk_content": "...",
│     "context_heading": "...",
│     "context_doc_title": "...",
│     ...
│   }]
└── bm25_index.pkl         # （未来：BM25 持久化缓存）
```

---

## 10. Agent 调用流程

### 10.1 对话请求完整时序

```
  User                 Frontend             FastAPI              Agent Runtime
  ────                 ────────             ───────              ─────────────
    │                      │                    │                     │
    │  输入问题             │                    │                     │
    │─────────────────────▶│                    │                     │
    │                      │                    │                     │
    │                      │  POST /api/chat    │                     │
    │                      │───────────────────▶│                     │
    │                      │                    │                     │
    │                      │                    │  加载对话历史        │
    │                      │                    │──▶ SQLite           │
    │                      │                    │◀── messages[]       │
    │                      │                    │                     │
    │                      │                    │  Agent.run(query)   │
    │                      │                    │────────────────────▶│
    │                      │                    │                     │
    │                      │                    │        ┌──────────┐ │
    │                      │                    │        │ Memory   │ │
    │                      │                    │        │ .add()   │ │
    │                      │                    │        └──────────┘ │
    │                      │                    │                     │
    │                      │                    │        ┌──────────┐ │
    │                      │                    │        │ Planner  │ │
    │                      │                    │        │ .decide()│ │
    │                      │                    │        └────┬─────┘ │
    │                      │                    │             │       │
    │                      │                    │        Plan: call   │
    │                      │                    │        search_      │
    │                      │                    │        knowledge    │
    │                      │                    │             │       │
    │                      │                    │        ┌────┴─────┐ │
    │                      │                    │        │ Tool     │ │
    │                      │                    │        │ .execute │ │
    │                      │                    │        └────┬─────┘ │
    │                      │                    │             │       │
    │                      │                    │       Observation  │
    │                      │                    │             │       │
    │                      │                    │        ┌────┴─────┐ │
    │                      │                    │        │ Prompt   │ │
    │                      │                    │        │ Builder  │ │
    │                      │                    │        └────┬─────┘ │
    │                      │                    │             │       │
    │                      │                    │        ┌────┴─────┐ │
    │                      │                    │        │ LLM      │ │
    │                      │                    │        │ .chat()  │ │
    │                      │                    │        └────┬─────┘ │
    │                      │                    │             │       │
    │                      │                    │        answer      │
    │                      │                    │◀────────────────────│
    │                      │                    │                     │
    │                      │                    │  保存消息到 SQLite  │
    │                      │                    │──▶ SQLite           │
    │                      │                    │                     │
    │                      │    JSON response   │                     │
    │                      │◀───────────────────│                     │
    │                      │                    │                     │
    │  渲染回答 + 引用      │                    │                     │
    │◀─────────────────────│                    │                     │
    │                      │                    │                     │
```

### 10.2 Agent 内部异常处理

```
Agent.run() 异常分级：

1. Planner 返回未知 tool
   → AgentState.error = "Tool not found"
   → 直接 respond（跳过调用工具），LLM 自由回答
   
2. Tool.execute() 抛异常
   → ToolResult.from_error(...)
   → Observation 标记失败
   → LLM 收到失败提示，告知用户"搜索暂不可用"

3. LLM.chat() 抛异常
   → AgentState.status = "ERROR"
   → 返回降级回答："抱歉，服务暂时不可用"
   → 前端显示错误提示

4. 超时保护
   → AgentState.max_iterations = 5（防止 Planner 死循环）
   → LLM 调用 timeout = 60s
```

---

## 11. 引用来源展示方案

### 11.1 设计目标

- **可信任**：每个回答的每句话都有据可查
- **可追溯**：点击引用即可看到原始文档片段
- **不干扰**：引用标记不打断阅读流

### 11.2 LLM 输出格式

要求 LLM 在回答中使用 `[1]` `[2]` 标记引用来源：

```
System Prompt 中追加：

"回答时请使用 [数字] 格式标注引用来源。
例如：MCP 是一个开放协议 [1]，它定义了 AI 与工具的交互标准 [2]。
每个数字对应一条参考资料，按相关性排序。"
```

### 11.3 前端展示方案（参考 Perplexity）

```
┌─────────────────────────────────────────────┐
│ 回答                                        │
│                                             │
│ MCP 全称 Model Context Protocol，            │
│ 是一个开放协议 [1]，它定义了 AI 模型与        │
│ 外部工具的标准化交互方式 [1][2]。             │
│                                             │
│ MCP 的核心组件包括：                          │
│ - Host：发起工具调用的 AI 应用 [1]            │
│ - Client：维护与 Server 的连接 [2]           │
│ - Server：提供工具实现的进程 [1]              │
│                                             │
│ ────────────────────────────────────        │
│ 📚 引用来源                                   │
│                                             │
│ [1] 语雀 - MCP 核心概念          分数 0.92   │
│     "MCP 定义：Model Context Protocol        │
│      是一个开放协议，定义了 AI 模型..."        │
│     ▸ 展开详情                               │
│                                             │
│ [2] 语雀 - 工具调用流程           分数 0.88   │
│     "工具调用流程：1. Host 发起请求            │
│      2. Client 封装为 tool-call..."          │
│     ▸ 展开详情                               │
└─────────────────────────────────────────────┘
```

### 11.4 引用数据结构

```typescript
interface Citation {
  index: number;           // [1] [2]
  document_title: string;  // 文档标题
  chunk_content: string;   // 完整引用片段（前150字预览）
  full_content: string;    // 完整 chunk 内容（展开后显示）
  score: number;           // 相似度分数
  heading: string;         // 所在章节标题
  path: string;            // 文档路径
}
```

### 11.5 引用解析逻辑（后端）

```
LLM 返回文本： "MCP 是一个开放协议 [1]，它定义了..."

后端解析：
  1. 正则提取所有 [数字] 标记
  2. 去重排序 → [1, 2, 3]
  3. 从 Observation.results 中按索引取出对应 SearchResult
  4. 构造 citations[] 数组
  5. 如果 LLM 引用了不存在的数字（幻觉），忽略该标记
```

---

## 12. 项目目录结构

```
DocAgent/
│
├── agent/                          # Agent Runtime（从 src/agent/ 迁出）
│   ├── __init__.py
│   ├── agent.py                    # Agent 编排核心
│   ├── memory.py                   # ConversationMemory
│   ├── planner.py                  # RuleBasedPlanner
│   ├── tool.py                     # Tool 抽象 + ToolManager + SearchKnowledgeTool
│   └── query_rewriter.py           # QueryRewriter
│
├── core/                           # RAG 核心管道（从 src/ 迁出并重组）
│   ├── __init__.py
│   ├── config.py                   # Settings (pydantic-settings)
│   ├── embedding/
│   │   ├── __init__.py
│   │   └── provider.py             # EmbeddingProvider + BGEProvider
│   ├── ingestion/
│   │   ├── __init__.py
│   │   └── chunker.py              # RecursiveCharacterTextSplitter chunker
│   ├── llm/
│   │   ├── __init__.py
│   │   └── deepseek.py             # DeepSeekLLM
│   ├── prompt/
│   │   ├── __init__.py
│   │   └── builder.py              # PromptBuilder
│   ├── reranker/
│   │   ├── __init__.py
│   │   └── reranker.py             # BGEReranker (Cross-encoder)
│   ├── retriever/
│   │   ├── __init__.py
│   │   ├── retriever.py            # Retriever + Hybrid Search + RRF
│   │   └── bm25.py                 # BM25Retriever
│   └── vectorstore/
│       ├── __init__.py
│       └── faiss_store.py          # FAISSVectorStore
│
├── parsers/                        # 文档解析器（新增）
│   ├── __init__.py
│   ├── base.py                     # DocumentParser(ABC) + ParsedDocument
│   ├── markdown_parser.py          # .md 解析
│   ├── pdf_parser.py               # .pdf 解析（PyMuPDF）
│   ├── docx_parser.py              # .docx 解析（python-docx）
│   ├── text_parser.py              # .txt 解析
│   └── html_parser.py              # .html 解析（V2）
│
├── api/                            # FastAPI 服务层（新增，替代 src/api/）
│   ├── __init__.py
│   ├── main.py                     # FastAPI app 入口
│   ├── dependencies.py             # 依赖注入（get_agent, get_db...）
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── chat.py                 # /api/chat/* 路由
│   │   ├── documents.py            # /api/documents/* 路由
│   │   └── system.py               # /api/settings, /api/stats
│   └── schemas/
│       ├── __init__.py
│       ├── chat.py                 # ChatRequest, ChatResponse, Citation
│       └── document.py             # DocumentResponse, UploadResponse
│
├── storage/                        # 持久化层（新增）
│   ├── __init__.py
│   ├── database.py                 # SQLite 连接管理 + 建表
│   └── models.py                   # Conversation, Message, Document 模型
│
├── web/                            # 前端静态文件（从 src/api/static/ 迁出）
│   ├── index.html                  # SPA 入口
│   ├── css/
│   │   └── app.css                 # 全局样式
│   ├── js/
│   │   ├── app.js                  # 路由 + 状态管理
│   │   ├── chat.js                 # 对话页面逻辑
│   │   ├── documents.js            # 文档管理页面逻辑
│   │   ├── settings.js             # 设置页面逻辑
│   │   └── api.js                  # API 客户端封装
│   └── assets/
│       └── logo.svg
│
├── scripts/                        # CLI 工具脚本（保留）
│   ├── build_chunks.py
│   ├── build_index.py
│   ├── fetch_all.py
│   ├── import_markdown.py
│   └── search.py
│
├── knowledge/                      # 本地 Markdown 知识库（保留）
│   └── ...
│
├── uploads/                        # 用户上传文件存储（新增）
│   └── .gitkeep
│
├── output/                         # 索引构建产物（保留）
│   ├── index.faiss
│   ├── metadata.json
│   └── .gitkeep
│
├── data/                           # SQLite 数据库 + 持久化数据（新增用途）
│   └── .gitkeep
│
├── tests/                          # 测试（保留 + 扩展）
│   ├── __init__.py
│   ├── test_import_markdown.py
│   ├── test_parsers.py             # 新增
│   ├── test_api.py                 # 新增
│   └── test_agent.py               # 新增
│
├── .env.example                    # 配置模板
├── .gitignore
├── requirements.txt                # 依赖清单
├── start.py                        # 一键启动（替代 scripts/start.py + start.bat）
├── DESIGN.md                       # 设计决策文档
├── GUIDE.md                        # 用户手册
├── SESSION.md                      # 开发进度
├── PRODUCT_DESIGN.md               # 本文档
└── README.md                       # GitHub 首页
```

### 12.1 目录迁移说明

| 旧路径 | 新路径 | 原因 |
|--------|--------|------|
| `src/agent/` | `agent/` | Agent 是顶层概念，不应藏在 src 下 |
| `src/embedding/`, `src/llm/`, `src/retriever/`... | `core/` | 统一为 RAG 核心管道 |
| `src/api/` | `api/` | FastAPI 替换 stdlib HTTP，名字更清晰 |
| `src/api/static/` | `web/` | 前端独立成一级目录 |
| `scripts/start.py` | `start.py` | 入口脚本放到根目录，方便 `python start.py` |
| 无 | `parsers/` | 新增模块 |
| 无 | `storage/` | 新增模块 |
| 无 | `uploads/` | 新增目录 |

---

## 13. 每个页面的功能清单

### 13.1 对话页 (`/chat`)

**核心功能（MVP）：**
- [x] 消息列表（用户消息 + AI 回答），滚动到底部
- [x] 输入框 + 发送按钮（Enter 发送）
- [x] AI 回答中内联引用标记 `[1][2]`，可点击
- [x] 引用来源面板：显示每个引用的文档名、分数、片段预览
- [x] 引用卡片可展开查看完整 chunk 内容
- [x] 对话列表（左侧栏）：显示所有历史对话
- [x] 新建对话按钮
- [x] 切换对话（点击对话项）
- [x] 删除对话（右键或 X 按钮）
- [x] 对话自动命名（取第一条用户消息的前 30 字）
- [x] 搜索状态显示（"正在检索..." / "正在改写查询..."）
- [x] 耗时显示（检索耗时、LLM 耗时）
- [x] Rerank 开关（和现有一样）
- [x] 错误提示（网络错误、超时等）

**增强功能（V2）：**
- [ ] 流式输出（SSE，逐 token 显示）
- [ ] 停止生成按钮
- [ ] 重新生成回答
- [ ] 消息复制按钮
- [ ] 分享对话（生成只读链接）
- [ ] 导出对话为 Markdown

### 13.2 文档管理页 (`/documents`)

**核心功能（MVP）：**
- [x] 文件上传（拖拽 + 点击选择）
- [x] 上传进度条（解析 + 索引进度）
- [x] 支持格式提示（Markdown / PDF / Word / TXT）
- [x] 文档列表（表格：文件名、格式、分块数、大小、上传时间、状态）
- [x] 删除文档（确认对话框 + 同步删除索引）
- [x] 索引统计卡片（总文档数、总块数、总大小、最后更新时间）
- [x] 重建全部索引按钮（确认对话框）
- [x] 空状态（未上传任何文档时的引导提示）

**增强功能（V2）：**
- [ ] 批量上传（多选文件）
- [ ] 文档预览（点击查看解析后的纯文本）
- [ ] 文档搜索（快速定位特定文档）
- [ ] 索引状态详情（每个文档的分块清单）

### 13.3 设置页 (`/settings`)

**核心功能（MVP）：**
- [x] LLM 配置：
  - API Key（密码输入框 + 显示/隐藏切换）
  - Base URL（默认 https://api.deepseek.com）
  - Model（默认 deepseek-chat，可输入自定义）
- [x] Embedding 配置：
  - 模型名称（默认 BAAI/bge-small-zh-v1.5）
- [x] 检索配置：
  - Top-K 结果数（默认 5，范围 1-20）
  - Rerank 默认开关
- [x] 保存按钮（写入 .env）
- [x] 系统状态卡片（内存占用、索引大小、运行时间）

**增强功能（V2）：**
- [ ] OpenAI 兼容 API 预设（一键切换 DeepSeek / OpenAI / 本地模型）
- [ ] 连接测试按钮（验证 API Key 有效性）
- [ ] Embedding 模型预热状态
- [ ] 数据导出 / 导入

---

## 14. MVP 功能范围

### 14.1 MVP 必须实现

**基础设施：**
1. FastAPI 替换 stdlib HTTP server
2. SQLite 持久化（conversations + messages + documents）
3. 新目录结构迁移（不破坏现有功能）
4. 前端 SPA 路由（hash-based：`/#/chat`, `/#/documents`, `/#/settings`）

**文档系统：**
5. 文件上传 API（POST /api/documents/upload）
6. Markdown 解析（复用现有 `import_markdown.py`）
7. PDF 解析（新增 `PyMuPDF`）
8. 增量索引（单文档上传后自动追加到 FAISS + BM25）
9. 文档删除（同步删除索引中的对应 chunks）
10. 文档列表 API（GET /api/documents）

**对话系统：**
11. 多轮对话持久化（刷新页面不丢失历史）
12. 对话列表 + 新建/切换/删除对话
13. Agent Runtime 集成（已有的完整流程）
14. 引用来源解析 + 前端展示
15. 改写查询展示

**前端页面：**
16. 对话主界面（3 栏布局）
17. 文档管理页面
18. 设置页面

**部署：**
19. 一键启动脚本（`python start.py`）
20. README 更新（截图 + 快速开始 + 功能列表）

### 14.2 MVP 不包含（留给 V2）

- 流式输出（SSE）
- Word (.docx) 解析
- HTML 解析
- 用户认证
- 多知识库
- 分享功能
- 对话导出
- OCR（扫描件 PDF）

### 14.3 MVP 预估工作量

| 模块 | 预估天数 | 依赖 |
|------|----------|------|
| 目录重构 + 导入修复 | 0.5 天 | 无 |
| FastAPI 替换 + API routes | 1 天 | 目录重构 |
| SQLite 持久化层 | 0.5 天 | 无 |
| 文件上传 + Markdown 解析 | 0.5 天 | API |
| PDF 解析 | 0.5 天 | Parser 基类 |
| 增量索引 | 0.5 天 | Parser |
| 对话管理 API | 0.5 天 | SQLite |
| 前端：对话页 | 1 天 | API |
| 前端：文档管理页 | 0.5 天 | API |
| 前端：设置页 | 0.5 天 | API |
| 引用解析 + 前端展示 | 0.5 天 | 对话页 |
| 测试 + 文档 + 美化 | 1 天 | 全部 |
| **合计** | **~7 天** | |

---

## 15. V2 / V3 Roadmap

### V2 — "流畅体验"（MVP + 4 周）

```
目标：交互体验接近 ChatGPT / Perplexity

├── 流式输出 (SSE)
│   逐 token 渲染，停止生成按钮
│
├── 更多文档格式
│   Word (.docx) 解析
│   HTML 解析
│   代码文件（.py, .js, .ts...）解析
│
├── 对话增强
│   重新生成回答
│   消息编辑（修改上一条消息重新回答）
│   复制回答按钮
│   导出对话为 Markdown
│
├── LLM Planner（Phase 7）
│   替换 RuleBasedPlanner
│   LLM 自主决定：搜知识库 / 直接回答 / 多步推理
│   支持 "先搜A，如果没结果再搜B" 的策略
│
├── 多 Tool 扩展（Phase 8）
│   Calculator Tool（数学计算）
│   WebSearch Tool（需要时联网搜索）
│   代码执行 Tool（Python sandbox）
│
├── 前端体验
│   Markdown 渲染（代码高亮、表格、列表）
│   暗色模式
│   移动端适配
│
└── 部署
     Docker 镜像
     docker-compose 一键部署
```

### V3 — "企业就绪"（V2 + 8 周）

```
目标：可满足小团队/企业内部署

├── 多用户 + 认证
│   用户注册/登录
│   会话管理
│   API Key 权限控制
│
├── 多知识库
│   创建/管理多个独立知识库
│   知识库级别的索引隔离
│   跨知识库搜索
│
├── 知识库管理
│   文档标签/分类
│   批量操作
│   索引调度（定时重建）
│
├── 评估体系（Phase 5）
│   RAGAS 评估集成
│   答案质量评分
│   检索命中率监控
│   Token 用量仪表板
│
├── 可观测性
│   请求日志
│   性能面板（P50/P95/P99 延迟）
│   错误追踪
│
├── 高级检索
│   多查询融合（Multi-Query Retrieval）
│   自查询检索（Self-Querying）
│   父文档检索（Parent Document Retriever）
│
└── 集成
     Webhook 通知
     Slack / 钉钉 集成
     语雀 / Notion 同步（回到初心）
```

---

## 附录 A：新增 Python 依赖

```
# MVP 新增（在现有 requirements.txt 基础上）
fastapi>=0.115.0          # Web 框架
uvicorn[standard]>=0.34.0 # ASGI 服务器
python-multipart>=0.0.20  # 文件上传支持
PyMuPDF>=1.25.0           # PDF 解析
python-docx>=1.1.0        # Word 解析

# V2 新增
sse-starlette>=2.0.0      # SSE 流式输出
beautifulsoup4>=4.12.0    # HTML 解析

# V3 新增
python-jose[cryptography]>=3.3.0  # JWT 认证
passlib[bcrypt]>=1.7.0            # 密码哈希
ragas>=0.2.0                      # RAG 评估
```

## 附录 B：SQLite 数据库 Schema

```sql
-- 对话表
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    citations JSON,              -- assistant 消息的引用数据
    metadata JSON,               -- 改写查询、耗时等
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 文档表
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    format TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','indexing','ready','error')),
    error_message TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引映射表（document ↔ chunk_id）
CREATE TABLE document_chunks (
    document_id TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    PRIMARY KEY (document_id, chunk_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

## 附录 C：前端路由设计

```
/#/chat                    → 对话页（默认）
/#/chat/{conversation_id}  → 特定对话
/#/documents               → 文档管理页
/#/settings                → 设置页
```

使用 hash-based 路由（`window.location.hash`），无需服务器端配置。
