> 2026-09-13：HTTP/SSE 对外契约保持不变，内部增加方舟 Responses 适配。rerank 请求字段当前未参与运行时开关；retrieval_ms 实际包含模型生成时间；会话详情尚不返回完整引用快照。

# API.md — DocAgent REST API 文档

Base URL: `http://127.0.0.1:8000/api`

---

## Chat

### POST /api/chat

发送消息，返回 Agent 回答（非流式）。

**Request:**
```json
{
  "question": "什么是MCP",
  "conversation_id": "",       // 空则自动创建
  "rerank": true
}
```

**Response:**
```json
{
  "question": "什么是MCP",
  "answer": "MCP 全称 Model Context Protocol...",
  "conversation_id": "abc123def456",
  "rewritten_query": "MCP Model Context Protocol 定义 原理",
  "citations": [
    {
      "title": "语雀",
      "path": "语雀.md",
      "score": 0.6234,
      "bm25_score": 7.35,
      "fusion_score": 0.0328,
      "rerank_score": 0.8912,
      "content": "MCP 定义：Model Context Protocol...",
      "heading": "MCP 工具调用流程",
      "doc_title": "语雀"
    }
  ],
  "retrieval_ms": 3245.1,
  "error": null
}
```

### POST /api/chat/stream

发送消息，SSE 流式返回（逐 token）。

**Request:** 同 `/api/chat`

**SSE Events:**
```
data: {"type":"thinking","content":"正在分析问题..."}
data: {"type":"thinking","content":"正在检索知识库..."}
data: {"type":"token","content":"M"}
data: {"type":"token","content":"C"}
data: {"type":"token","content":"P"}
...
data: {"type":"done","conversation_id":"abc","answer":"...","citations":[...],"retrieval_ms":3200,"usage":{...}}
```

---

## Conversations

### POST /api/conversations

创建新对话。

**Response:**
```json
{
  "id": "abc123def456",
  "title": "新对话",
  "message_count": 0,
  "updated_at": "2026-07-17T10:30:00Z"
}
```

### GET /api/conversations

获取对话列表。

**Response:**
```json
[
  {
    "id": "abc123",
    "title": "MCP是什么",
    "message_count": 4,
    "updated_at": "2026-07-17T10:35:00Z"
  }
]
```

### GET /api/conversations/{id}

获取对话详情（含历史消息）。

**Response:**
```json
{
  "id": "abc123",
  "title": "MCP是什么",
  "messages": [
    {
      "id": "msg001",
      "role": "user",
      "content": "什么是MCP",
      "created_at": "2026-07-17T10:30:00Z"
    },
    {
      "id": "msg002",
      "role": "assistant",
      "content": "MCP 全称 Model Context Protocol... [1][2]",
      "created_at": "2026-07-17T10:30:05Z"
    }
  ],
  "updated_at": "2026-07-17T10:35:00Z"
}
```

### DELETE /api/conversations/{id}

删除对话及所有消息。

**Response:**
```json
{
  "message": "已删除",
  "id": "abc123"
}
```

---

## Documents

### POST /api/documents/upload

上传文档（multipart/form-data）。

**Request:** `file` 字段，支持 `.md .pdf .docx .txt .html .htm`

**Response:**
```json
{
  "document": {
    "id": "doc001",
    "filename": "doc001_doc.pdf",
    "original_name": "产品手册.pdf",
    "format": "pdf",
    "file_size": 245678,
    "chunk_count": 15,
    "status": "ready",
    "error": "",
    "created_at": "2026-07-17 10:30:00"
  },
  "message": "已索引 15 个 Chunk"
}
```

**错误响应 (400):**
```json
{
  "detail": "不支持的文件格式: .xxx，当前支持: docx, htm, html, markdown, md, pdf, txt"
}
```

### GET /api/documents

获取文档列表。

**Response:**
```json
{
  "documents": [
    {
      "id": "doc001",
      "filename": "doc001_doc.pdf",
      "original_name": "产品手册.pdf",
      "format": "pdf",
      "file_size": 245678,
      "chunk_count": 15,
      "status": "ready",
      "error": "",
      "created_at": "2026-07-17 10:30:00"
    }
  ]
}
```

### DELETE /api/documents/{id}

删除文档及索引中的相关向量。

**Response:**
```json
{
  "message": "已删除",
  "id": "doc001"
}
```

### POST /api/index/rebuild

从 `uploads/` 目录全量重建索引。

**Response:**
```json
{
  "document_count": 3,
  "chunk_count": 56,
  "message": "重建完成: 3 篇文档, 56 个 Chunk"
}
```

---

## System

### GET /api/stats

系统统计。

**Response:**
```json
{
  "document_count": 3,
  "chunk_count": 56,
  "total_size": 1048576,
  "index_size_bytes": 0
}
```

### GET /api/health

健康检查。

**Response:**
```json
{
  "status": "ok",
  "ready": true
}
```
