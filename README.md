# DocAgent — 文档问答与 Agent 编排实践

上传 Markdown、PDF、Word、TXT 或 HTML，检索相关资料并生成带来源的回答。

当前是 **RAG 文档问答应用 + 规则驱动的 Agent 编排骨架**。LLM 用于查询改写和回答生成，尚未实现 LLM 自主规划或多工具决策。

## 已实现

- React + TypeScript 页面：黑白灰布局、移动端导航、可折叠引用面板、连接状态与文档加载错误提示。
- 文档解析、递归字符切片及标题/前后文补充。
- BGE 向量化、FAISS + BM25 混合检索、RRF 融合、可选 Cross-encoder 重排序。
- 查询改写、普通回答和 SSE 流式回答。
- SQLite 会话及文档元数据存储。
- Tool / Planner / Memory 分层，当前仅有 `search_knowledge` 工具与 `RuleBasedPlanner`。
- DeepSeek Chat Completions 与火山方舟 Responses 接口配置。

## 数据流与隐私边界

原始文件、索引及会话数据库保存在本地。**使用远程模型时，问题、对话上下文以及检索到的文档片段会发送给配置的模型服务商**，并非全离线运行。

```text
上传 → 解析 → 切片 → BGE → FAISS / BM25
提问 → 规则规划 → 查询改写 → 混合检索 → 可选重排序
     → 拼接上下文 → 远程模型 → 流式回答与引用
```

## 本地运行

Python 3.11+ 和 Node.js/npm。以下命令在项目根目录执行：

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# 复制 .env.example 为 .env，填写模型配置
npm --prefix web install
npm --prefix web run build
```

运行后端（绕过仍要求预先存在索引的旧启动器）：

```bash
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

打开 http://127.0.0.1:8000 。开发时另开终端运行 `npm --prefix web run dev`，前端 5173 端口会将 `/api` 转发至 8000。

首次启动需要下载 BGE 模型，也可以通过 `EMBEDDING_MODEL_NAME` 指向完整的本地 sentence-transformers 模型目录。精排开关需要设置在进程环境中，详见 [使用手册](GUIDE.md)。

## 2026-09-13 验证状态

- 前端构建及桌面/手机布局检查通过。
- `doubao-seed-evolving` Responses 普通与流式调用通过。
- BGE 从本地目录加载成功；后端与前端代理的健康检查、文档列表接口返回 200。
- 以上不等于完整业务回归通过：现有 2 项自动测试中 1 项失败。

## 已知问题与下一步

1. 多轮对话可能因历史检索记录而跳过本轮检索。
2. 同名同内容重复上传的去重分支报错。
3. 删除后的空元数据可能导致 BM25 重建及重启失败；同名更新缺少失败回滚。
4. 历史引用详情尚未完整持久化恢复。
5. `retrieval_ms` 当前包含生成耗时，不能作为独立检索延迟。
6. 旧启动脚本、Docker 前端构建及依赖复现仍需整理。

优先修复核心流程并建立评估集，再实现模型自主选择工具、补充检索和明确停止条件。详细范围见 [当前状态](SESSION.md)。

## 代码与文档

| 路径 | 职责 |
|---|---|
| `api/` | FastAPI 与文档生命周期 |
| `src/agent/` | 编排、规则规划、工具、会话窗口、查询改写 |
| `src/parsers/`、`src/ingestion/` | 解析与切片 |
| `src/embedding/`、`src/retriever/`、`src/vectorstore/`、`src/reranker/` | 检索链路 |
| `src/llm/` | 模型接口适配 |
| `storage/` | SQLite 数据模型与访问 |
| `web/` | React 前端 |
| `scripts/` | CLI；部分保留旧版入口 |

[使用手册](GUIDE.md) · [架构](ARCHITECTURE.md) · [接口](API.md) · [更新日志](CHANGELOG.md) · [部署说明](DEPLOY.md)

`DESIGN.md` 与 `PRODUCT_DESIGN.md` 包含历史设计讨论和路线规划，其中的示例效果与计划功能不代表当前版本已完成或经过系统评估。
