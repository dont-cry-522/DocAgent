# DocAgent 使用手册

## 模型配置

复制 `.env.example` 为 `.env`。为兼容旧配置，字段仍使用 `DEEPSEEK_` 前缀；它们也可用于方舟。真实密钥只保存在本地，不提交仓库。

### 火山方舟 Responses（2026-09-13 已验证）

```dotenv
DEEPSEEK_API_KEY=your_ark_api_key_here
DEEPSEEK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DEEPSEEK_MODEL=doubao-seed-evolving
DEEPSEEK_API_MODE=responses
```

此模式请求 `/api/v3/responses`，将回答文本和流式事件适配为项目统一格式。`DEEPSEEK_CHAT_PATH` 仅用于 chat 模式。模型须在密钥所属账号开通；展示名称、密钥资源 ID 与模型 ID 不应混用。

Responses 模式当前没有转发 `temperature`，输出预算使用 `max_output_tokens`。长回答及查询改写预算仍需结合实际任务验证。

### DeepSeek Chat Completions

```dotenv
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_MODE=chat
DEEPSEEK_CHAT_PATH=v1/chat/completions
```

## 本地检索模型

默认 `EMBEDDING_MODEL_NAME=BAAI/bge-small-zh-v1.5`。下载失败时，可下载完整模型文件到本地并设置：

```dotenv
EMBEDDING_MODEL_NAME=C:/models/bge-small-zh-v1.5
```

目录必须包含权重、tokenizer、模型配置和 sentence-transformers 模块配置；仅创建空目录无法启动。当前代码已读取这个配置。

精排可选。当前开关由 `os.getenv` 读取，**仅填写在 .env 中不会生效**，启动前设置进程环境：

```powershell
# Windows PowerShell
$env:DISABLE_RERANKER='1'
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

```bash
# macOS/Linux
DISABLE_RERANKER=1 python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

启用精排时移除进程中的该变量或设为 `0`，并准备对应重排序模型。2026-09-13 的本地验证禁用了精排。

## 启动与检查

安装、构建步骤见 [README](README.md)。推荐直接启动 `api.main:app`；旧 `start.py` 仍检查已有索引，Windows 脚本的虚拟环境路径也可能与本机不同。

- 构建前端后访问 `http://127.0.0.1:8000`。
- 开发模式另运行 `npm --prefix web run dev`，访问终端显示的地址。
- `/api/health` 应返回 `status=ok`、`ready=true`。
- 页面右上角连接状态可点击重新检查。
- 模型 Key 有效不代表后端已启动：BGE 加载失败也会使整个后端退出。

## 使用与限制

上传 → 等待索引 → 提问 → 展开引用。支持文本 PDF；扫描件没有 OCR，Word 表格等复杂结构尚未完整处理。

对话文本存入 SQLite，模型上下文使用最近 20 条消息，不是 20 轮对话。历史引用详情暂未恢复，多轮检索及文档增删改存在已知问题，见 [当前状态](SESSION.md)。

本地文件位于 `uploads/`，索引位于 `output/`，数据库位于 `data/docagent.db`。远程模型会接收问题、历史上下文及检索片段。

## 验证

```bash
python -m unittest discover -v
npm --prefix web run build
```

2026-09-13：前端构建通过；现有两项时间格式测试一项通过、一项失败，尚无完整核心业务回归与检索质量评估。不要将连接测试当作端到端功能验收。
