> 历史设计记录：示例效果不等于系统评估结论；关于零改动扩展、最优候选数和性能的描述需要通过当前代码及评估核实。当前实现与已知问题见 SESSION.md。

# 设计决策与优化记录

本文档记录 DocAgent 项目中所有关键设计决策的"为什么"，以及各阶段优化的前后对比。

**问题索引：**
- [Q1](#q1为什么-retriever-要独立成一个模块)：为什么 Retriever 要独立成一个模块？
- [Q2](#q2为什么-promptbuilder-要单独封装)：为什么 PromptBuilder 要单独封装？
- [Q3](#q3为什么-llm-不直接查-faiss)：为什么 LLM 不直接查 FAISS？
- [Q4](#q4rag-真正增强的是-prompt-还是-llm)：RAG 真正增强的是 Prompt 还是 LLM？
- [Q5](#q5为什么-context-不参与-embedding)：为什么 Context 不参与 Embedding？
- [Q6](#q6为什么-context-放到-promptbuilder-再用)：为什么 Context 放到 PromptBuilder 再用？
- [Q7](#q7为什么同样的查询每次检索延迟不一样)：为什么同样的查询每次检索延迟不一样？
- [Q8](#q8为什么-tool-要抽象)：为什么 Tool 要抽象？
- [Q9](#q9为什么-agent-不直接调用-retriever)：为什么 Agent 不直接调用 Retriever？
- [Q10](#q10为什么-planner-要独立)：为什么 Planner 要独立？
- [Q11](#q11为什么-planner-只看-toolmetadata-不看-tool)：为什么 Planner 只看 ToolMetadata 不看 Tool？
- [Q12](#q12为什么-memory-要有抽象接口)：为什么 Memory 要有抽象接口？
- [Q13](#q13为什么-observation-不在-plannertool-里)：为什么 Observation 不在 Planner/Tool 里？
- [Phase 4.1](#phase-41chunk-上下文增强)：Chunk 上下文增强优化记录
- [Phase 4.2](#phase-42hybrid-searchbm25--向量--rrf)：Hybrid Search 优化记录（含 3 个设计问答）
- [Phase 4.3](#phase-43两阶段检索recall--reranking)：两阶段检索优化记录（含 3 个设计问答）
- [Phase 4.4](#phase-44query-rewriting--llm-查询改写)：Query Rewriting 设计决策
- [Phase 4.5](#phase-45agent-runtime--从-rag-到-agent)：Agent Runtime 设计决策（含 6 个设计问答）

---

## 一、架构设计决策

### Q1：为什么 Retriever 要独立成一个模块？

**答案：单一职责原则。**

Retriever 封装了"检索"这一完整工作单元：

```
用户问题 → Embedding → FAISS 搜索 → 返回排序结果
```

它是一个有明确边界的子系统。独立后的收益：

- **可替换**：从 FAISS 换到 Milvus/Pinecone，只改这一个模块，其他代码无感知
- **可测试**：检索命中率、召回率可独立评估，不依赖 LLM
- **接口纯净**：上层只看到 `retrieve(query, top_k) → list[SearchResult]`

反例：如果把检索逻辑写在 chat.py 里，每换一次向量库就要重写整个聊天脚本。

---

### Q2：为什么 PromptBuilder 要单独封装？

**答案：Prompt 模板是变动最频繁的部分，应该与业务逻辑解耦。**

Prompt 的迭代频率远高于其他模块。产品迭代中你会反复：

- 调整措辞（"请根据参考资料回答" vs "请结合以下知识回答"）
- 增加 few-shot 示例
- 尝试 CoT（Chain of Thought）策略
- 按场景切换不同模板

独立后的收益：

- 改模板不影响检索、LLM 调用代码
- 可以维护多套模板（简洁版 / 详细版 / 引用版），按场景切换
- 方便做 A/B 测试，对比不同 Prompt 的回答质量

反例：如果把 Prompt 拼写死在 chat.py 里，每次调 Prompt 都要改业务逻辑代码。

---

### Q3：为什么 LLM 不直接查 FAISS？

**答案：违反单一职责会产生强耦合，让两个模块都难以维护。**

LLM 模块的职责是：调用远程 API，生成文本。它不应该知道什么是 FAISS。

如果把 FAISS 查询写在 DeepSeekLLM 里：

```
DeepSeekLLM ─── 耦合 ─── FAISS
     ↓                        ↓
 调用 API              向量检索
```

后果：

- 换 LLM（DeepSeek → OpenAI）时，FAISS 代码也受影响
- 换向量库（FAISS → Milvus）时，LLM 模块也要改
- 一个模块承担了两种无关职责——既是 HTTP 客户端，又是检索引擎

正确做法是在外部编排：

```
chat.py:
  results = retriever.retrieve(question)    ← 检索
  prompt = prompt_builder.build(question, results)  ← 拼装
  answer = llm.chat(prompt)                 ← 生成
```

各模块各司其职，互不感知。

---

### Q4：RAG 真正增强的是 Prompt 还是 LLM？

**答案：增强的是 Prompt，不是 LLM。**

LLM 的模型权重从头到尾没有变化。RAG 的本质是：

```
用户问题 + 检索到的外部知识 → 注入 Prompt → LLM 基于上下文生成
```

这叫做 **Prompt Augmentation**（提示增强），不是模型增强。

对比：

| | 增强了什么 | LLM 权重是否变化 |
|---|---|---|
| RAG | Prompt 的内容 | 否 |
| Fine-tuning | 模型的参数 | 是 |
| Prompt Engineering | Prompt 的结构 | 否 |

---

### Q5：为什么 Context 不参与 Embedding？

**答案：避免结构信息污染语义信号。**

Embedding 应该捕捉"这个 Chunk 说了什么"，而不是"这个 Chunk 坐在哪"。

如果把标题、前后文也 Embedding：

- 同一 `## asyncio 基础` 章节下的所有 Chunk，因为都包含相同的标题文本，会被向量认为"相似"
- 搜索"协程实现"时，整个章节的 Chunk 都会被拉到前列，而不只是真正讨论协程的那一个
- 检索被结构信息污染——变成了"找同一章节"，而不是"找相关内容"

正确做法：

```
Embedding 只看 chunk_content           ← 纯语义信号
Context 字段存入 metadata              ← 不做向量化
PromptBuilder 用 context 丰富 LLM 输入  ← 事后补充
```

---

### Q6：为什么 Context 放到 PromptBuilder 再用？

**答案：Context 是用来读懂结果的，不是用来找结果的。**

检索已经找到了相关的 Chunk。此时 LLM 需要理解这个 Chunk——但 Chunk 的正文往往是零碎的。

**真实案例：**

检索到的 Chunk 内容是：
> "它通过这种方式实现，避免了不必要的上下文切换..."

没有 context 时，LLM 看到的是一个无主语的片段。有了 context：

```
章节: 协程实现原理
文档: Python 异步编程指南
前文: await 挂起当前协程，将控制权交还给事件循环
相关内容: 它通过这种方式实现，避免了不必要的上下文切换...
```

LLM 瞬间知道：这段话的"它"指协程，"这种方式"指 `await`，"避免的"是线程切换开销。

---

## 二、优化对比记录

### Phase 4.1：Chunk 上下文增强

**改动范围**：Chunk 模型、DocumentChunker、build_index.py、SearchResult、PromptBuilder

**优化前 Prompt 格式：**

```
[参考 1] 来源: 语雀 (语雀.md)
相关内容: 公司项目 MCP 知识点 1. MCP 定义 ● 全称：Model Context Protocol...

[参考 2] 来源: 语雀 (语雀.md)
相关内容: 5. LLM 生成自然语言回复 ○ 结合工具结果生成最终回复...
```

每条参考只有来源 + 内容，LLM 不知道这段话在原文档中处于什么位置、前后文是什么。

**优化后 Prompt 格式：**

```
[参考 1]
文档: 语雀
路径: 语雀.md
后文: 5. LLM 生成自然语言回复 ○ 结合工具结果生成最终回复...
相关内容: 公司项目 MCP 知识点 1. MCP 定义 ● 全称：Model Context Protocol...

[参考 2]
文档: 语雀
路径: 语雀.md
前文: message 喂回 LLM。5. LLM 生成自然语言回复...
后文: ● 错误降级 ○ MCP 调用失败时，返回"查询失败"的 tool message...
相关内容: 5. LLM 生成自然语言回复 ○ 结合工具结果生成最终回复...
```

每条参考包含：章节（如有）、文档标题、路径、前文片段、后文片段、正文。

**具体改善示例：**

查询 `MCP 的工具调用流程是什么`：

- 优化前：参考 2 只有一段工具调用流程的描述，LLM 不知道这是流程的哪一步
- 优化后：参考 2 带上了前文（第 4 步）和后文（Server 生命周期/错误降级），LLM 能完整理解这是"完整流程"的第 5 步

查询 `FastAPI 怎么做请求验证`：

- 优化前：参考 1 是 FastAPI 框架总览，参考 2 是请求验证的代码——但 LLM 不知道参考 2 在文档结构中的位置
- 优化后：参考 2 标注了章节 `快速入门`、文档 `FastAPI框架`、前文（代码示例），LLM 能定位这是入门章节中的请求验证示例

**收益总结：**

| 维度 | 改善 |
|------|------|
| 可读性 | Chunk 从孤立的文本片段变为有上下文的完整段落 |
| 回答质量 | LLM 能理解 Chunk 在原文中的位置和前后关联 |
| 引用准确性 | 有文档标题和路径，LLM 可准确引用来源 |
| 零成本 | 不增加 Embedding 计算量，不改变检索行为 |

### Phase 4.2：Hybrid Search（BM25 + 向量 + RRF）

**改动范围**：新增 `src/retriever/bm25.py`，重写 `src/retriever/retriever.py`，更新 `src/api/server.py`、`scripts/chat.py`、前端

**新增依赖**：`rank-bm25`、`jieba`

**检索流程：**

```
用户问题
  ├─→ jieba 分词 → BM25Okapi 检索 → (metadata, bm25_score) 列表
  └─→ BGE Embedding → FAISS 检索 → (metadata, vector_score) 列表
                                    ↓
                            RRF 融合（只关心排名）
                                    ↓
                         按 fusion_score 排序 → Top-K
```

**优化前（纯向量检索）：**

查询 `FastAPI 请求验证`（Top 5）：
```
[1] FastAPI框架  score=0.6454  ← 正确
[2] 语雀          score=0.5709  ← 语雀"错误降级"段落被向量误匹配
[3] FastAPI框架  score=0.5445  ← 正确
[4] 语雀          score=0.5296  ← 无关
[5] 语雀          score=0.5179  ← 无关
```
5 个结果中 3 个不相关。向量把"请求验证"语义扩散到了语雀文档中关于"验证"、"校验"的段落。

**优化后（Hybrid + RRF）（Top 3）：**

```
[1] FastAPI框架  RRF=0.0328  Vec=0.6454  BM25=7.3547  ← 最高 BM25，精确命中
[2] FastAPI框架  RRF=0.0320  Vec=0.5445  BM25=3.7413  ← 关键词匹配
[3] 语雀          RRF=0.0310  Vec=0.5065  BM25=0.8868  ← BM25 极低，被 RRF 压到末尾
```
BM25 对"请求验证"这个精确词组给了 7.35 的高分，而对语雀的无关段落只有 0.88。RRF 将 BM25 低分的 Chunk 排到后面。

**查询 `为什么自研比 LangChain 更有价值`：**
- 优化前：第 3 名包含了"LangChain"关键词最多的段落，但向量分最低
- 优化后：该段落 BM25=6.29（最高关键词匹配），RRF 从第 3 提升到第 2
- BM25 对专有名词"LangChain"天然高权重，纠正了向量对"框架"、"价值"等泛词的漂移

**收益总结：**

| 维度 | 改善 |
|------|------|
| 精确匹配 | 专有名词、错误码、代码片段不再被语义漂移淹没 |
| 抗噪能力 | 无关 Chunk 的 BM25 分数极低，被 RRF 自动降权 |
| 稳定性 | RRF 不依赖分数归一化，无超参，不同查询表现一致 |
| 可调试 | 三列分数（Vec / BM25 / RRF）可视化，可分析两路各自贡献 |

**设计决策：**

为什么企业不只使用向量检索？
- 向量擅长语义（"动物"匹配"猫"），但盲于精确（"ERR_502" ≠ "ERROR"）
- 冷启动术语（新产品名、函数名）没有好的 Embedding
- BM25 擅长精确匹配专有词，不懂同义词
- 两者互补：向量保召回（recall），BM25 保精确（precision）

BM25 对哪些场景更有优势？
- 专有名词/冷启动词：产品名、函数名不依赖训练数据
- 数字和标识符：版本号、ID、配置项，向量无法有效区分
- 代码搜索：代码语法精确匹配比语义更可靠
- 中文词组：jieba 分词后，"协程实现"在 BM25 中权重很高，不会漂移到"线程实现"

为什么 RRF 比简单加权更稳定？
- 向量分 [0, 1]（有界）、BM25 分 [0, ∞)（无界），无法直接相加
- 归一化方法（min-max / z-score）对边缘值敏感，换数据集就得重调
- RRF 只看排名位置，不看分数绝对值，天然可比
- k=60 经验常数稳定有效，无需调参

### Phase 4.5：Agent Runtime — 从 RAG 到 Agent

**改动范围**：新增 `src/agent/` 包（`tool.py`、`memory.py`、`planner.py`、`agent.py`），已有模块零修改。

**设计决策：**
- [Q8：为什么 Tool 要抽象？](#q8为什么-tool-要抽象)
- [Q9：为什么 Agent 不直接调用 Retriever？](#q9为什么-agent-不直接调用-retriever)
- [Q10：为什么 Planner 要独立？](#q10为什么-planner-要独立)
- [Q11：为什么 Planner 只看 ToolMetadata 不看 Tool？](#q11为什么-planner-只看-toolmetadata-不看-tool)
- [Q12：为什么 Memory 要有抽象接口？](#q12为什么-memory-要有抽象接口)
- [Q13：为什么 Observation 不在 Planner/Tool 里？](#q13为什么-observation-不在-plannertool-里)

### Phase 4.3：两阶段检索（Recall + Reranking）

**改动范围**：新增 `src/reranker/reranker.py`，更新 `src/api/server.py`、`scripts/chat.py`、前端

**新增依赖**：无（`sentence-transformers` 自带的 `CrossEncoder`）

**检索流程：**

```
用户问题
  ↓
Hybrid Search (Recall Top 20)
  ↓
BGE Reranker (Cross-encoder 精排 → Top 5)
  ↓
PromptBuilder → LLM
```

**收益总结：**

| 维度 | 改善 |
|------|------|
| 精度 | Cross-encoder 联合编码 query+doc，能理解否定、转述、细微意图 |
| 效率 | 只对 Top 20 做重排，兼顾速度和精度 |
| 可观测 | Recall 和 Rerank 两阶段结果同时展示，可对比分析 |
| 解耦 | Retriever 不改，Reranker 独立，换模型只改一个文件 |

**设计决策：**

为什么企业一般采用 Recall + Ranking 两阶段？
- Bi-encoder（Embedding）快但粗：query 和 doc **独立编码**，点积只能捕捉表层相似
- Cross-encoder（Reranker）慢但精：query 和 doc **联合编码**，全注意力理解复杂交互
- 两阶段分工：Recall 从海量文档中筛 20 个候选（快），Ranking 精确排 20 → 5（精）
- 类似 Google 搜索：倒排索引快速召回 → 复杂模型精细排序

为什么 Embedding 模型不能替代 Reranker？
- Bi-encoder 独立编码的先天局限：无法理解"这个 API **不支持**异步" vs "这个 API 支持异步"的差异
- 点积丢失了 token 级别的交互信息，只能看到全局语义相似度
- Cross-encoder 把 query+doc 一起送入注意力层，捕捉否定词、限定词等关键信号

为什么 Reranker 只处理 Top 20？
- 成本：Cross-encoder 推理 O(n × d²) 每对，rerank 20 对 ≈ 1 次 Embedding
- 边际递减：Recall 第 21 名以后几乎全是噪音，重排无收益
- 工业标准：k=20 是 Wikipedia 检索、企业 RAG 管线的经验最优值

### Phase 4.4：Query Rewriting — LLM 查询改写

**改动范围**：新增 `src/agent/query_rewriter.py`，修改 `src/agent/tool.py`（SearchKnowledgeTool 新增可选 query_rewriter 参数）、`src/api/server.py`（注入 QueryRewriter）、前端（显示改写后的查询）

**检索流程变化：**

```
优化前：
  用户问题 → SearchKnowledgeTool → Retriever.retrieve(原始查询)

优化后：
  用户问题 → SearchKnowledgeTool → QueryRewriter.rewrite(原始查询)
                                       ↓
                                  改写查询 → Retriever.retrieve(改写查询)
```

**设计决策：**

为什么改写查询而不是直接搜索原始问题？
- 用户输入是口语化的："那个 MCP 是怎么搞的，和 REST 有啥不一样"
- 搜索引擎需要关键词："MCP Model Context Protocol 定义 原理 REST 区别 对比"
- LLM 擅长提取核心概念、展开缩写、补充同义词
- Embedding 模型对口语化长句的语义编码不如关键词精准

为什么 QueryRewriter 是独立模块而不是 Tool 内部逻辑？
- SRP：查询改写是独立的 NLP 任务，和搜索执行是两个不同的关注点
- 可替换：未来可升级为 Multi-Query Rewriter（生成多条查询并行搜索）
- 可复用：多个 Tool 可能都需要查询改写（如 SQL 工具→改写为表名/字段名）
- 可独立评估：改写质量可单独用 RAGAS 评估，不依赖搜索链路

为什么注入到 SearchKnowledgeTool 而不是 Agent 层？
- Agent 不知道"怎么搜"——这是 Tool 的内部优化
- 把改写放到 Tool 里，Agent 代码一行不变
- 符合项目"Agent 不直接调 Retriever"的设计原则——Agent 连改写都不需要知道

为什么降级策略是返回原始查询？
- LLM 可能返回空、过短、异常——此时比返回空字符串更安全的是保留原始查询
- 用户期待的是回答，不是"改写失败"的错误信息——静默降级用户体验更好
- 改写失败时搜索结果略差于改写成功，但远好于搜索失败

**收益总结：**

| 维度 | 改善 |
|------|------|
| 命中率 | 关键词查询比口语问题在 BM25 中的词频匹配更精准 |
| 召回率 | 展开缩写和同义词让向量检索覆盖更多相关 Chunk |
| 零改动 | Agent / Planner / Memory 不需任何修改 |
| 降级安全 | LLM 改写失败自动回退原始查询，不影响可用性 |
| 可观测 | 改写后的查询显示在前端，用户可验证改写质量 |

---

## 二、设计决策 — Agent 层

### Q8：为什么 Tool 要抽象？

**答案：和"Retriever 为什么独立"同一个道理——让上层面对统一契约。**

Agent 不直接调 Retriever、不直接调 HTTP、不直接调 eval。它只看到：

```python
tool = tool_manager.get(plan.tool_name)
result = tool.execute(**plan.tool_params)
```

如果没有 Tool 抽象，每加一个新工具（Calculator / SQL / GitHub / WebSearch），Agent 内部就要加一段 if/elif 分支处理。5 个工具 → Agent 200 行，10 个工具 → Agent 400 行。

有了 Tool 抽象后，加工具只做两件事：
1. 创建类继承 `Tool`，实现 `execute()`
2. `tool_manager.register(tool)` 一行注册

Agent 代码永不变。

### Q9：为什么 Agent 不直接调用 Retriever？

**答案：和你 DESIGN.md Q3 中"LLM 为什么不直接查 FAISS"是同一个原则——编排层不应该知道基础设施。**

```
# 错误做法
Agent.run() → self.retriever.retrieve(query)  # Agent 耦合 Retriever

# 正确做法
Agent.run() → tool.execute(query)              # Agent 只知道 Tool
                └── SearchKnowledgeTool
                      └── self._retriever.retrieve(query)  # Tool 耦合 Retriever
```

后果对比：
- 换向量库 FAISS → Milvus：只改 `SearchKnowledgeTool`，Agent 不变
- 加预处理步骤（query → 改写 → 再搜 → 融合）：只改 `SearchKnowledgeTool`，Agent 不变
- 换搜索策略（向量 → Hybrid → 多层 Rerank）：只改 `SearchKnowledgeTool`，Agent 不变

Agent 的职责是编排流程（"谁先谁后"），不是搜索知识（"怎么搜"）。

### Q10：为什么 Planner 要独立？

**答案：决策和执行的迭代频率完全不同。**

| 维度 | Planner（决策） | Agent（执行） |
|------|----------------|--------------|
| 变化频率 | 规则 → LLM Planner → 多步推理 → 层次规划 | 编排循环稳定后几乎不变 |
| 测试方式 | 纯逻辑：query → Plan（无副作用） | 集成测试：需要 Memory + Tool + LLM |
| 失败模式 | 决策错误（该搜没搜） | 执行异常（Tool 挂了） |

合在一起时：

```python
Agent.run():
    if "什么" in query:          # ← Planner 逻辑混在 Agent 里
        result = tool.execute()  # ← 执行逻辑
    elif len(query) > 5:
        ...
```

升级 LLM Planner 要重写 Agent。独立后只换一行：

```python
# V1
agent = Agent(planner=RuleBasedPlanner(), ...)

# V2 — 只换 Planner
agent = Agent(planner=LLMPlanner(llm), ...)
```

### Q11：为什么 Planner 只看 ToolMetadata 不看 Tool？

**答案：ISP（接口隔离原则）——物理杜绝 Planner 意外调用工具。**

`Planner.decide()` 的签名是：

```python
def decide(self, query, history, available_tools: list[ToolMetadata]) -> Plan
```

`ToolMetadata` 只有 `name` / `description` / `parameters`，没有 `execute()`。Planner 永远无法触发工具执行。

`ToolManager` 返回 `list_metadata()` 给 Planner，返回 `get(name)` 给 Agent——两条通道，权限分离。

### Q12：为什么 Memory 要有抽象接口？

**答案：DIP（依赖倒置）——Agent 不依赖任何一种具体的记忆实现。**

```python
class Agent:
    def __init__(self, memory: Memory, ...):  # ← 依赖 Memory(ABC)
        self.memory = memory
```

当前 `ConversationMemory` 是滑动窗口。未来替换：
- `SummaryMemory` → 超窗口消息自动 LLM 摘要压缩
- `VectorMemory` → 长期重要事实存成向量，按需召回
- `IsolatedMemory` → 多用户 Session 隔离

所有替换只改注入那一行，Agent 代码不变。

### Q13：为什么 Observation 不在 Planner/Tool 里？

**答案：Observation 是 Agent 运行时概念，Planner 和 Tool 不应该知道它的存在。**

```
Tool 只知道: 输入(kwargs) → 输出(ToolResult)
Planner 只知道: 状态(query, history, tools) → 决策(Plan)
Agent 知道: Tool.execute() 的 ToolResult → 包装为 Observation → 写 Memory → 注入 Prompt
```

Observation 绑定了 Tool 输出 + 时间戳 + trace_id + 格式化文本，这是 Agent 编排层的需求。Tool 不关心 trace_id，Planner 不关心工具执行耗时——把它们塞进 Tool 或 Planner 违反 SRP。

---

## 三、性能与运行原理

### Q7：为什么同样的查询每次检索延迟不一样？

**答案：CPU 推理的非确定性。**

检索延迟由三个本地操作组成：BGE 模型推理 + FAISS 搜索 + BM25 分词。理论上同样的输入应该同样的耗时，但实际上：

| 因素 | 说明 |
|------|------|
| **CPU 频率波动** | macOS 会根据温度、负载动态调频，同样的浮点计算在不同频率下耗时不同 |
| **其他进程争抢** | Spotlight、Time Machine、浏览器等后台任务抢占 CPU 时间片 |
| **Python GC** | 垃圾回收触发时机不确定，偶尔暂停所有线程 |
| **缓存冷热** | 首次查询后 CPU 缓存预热，但 L3 缓存随时可能被其他进程刷掉 |

这是本机 CPU 推理的正常现象。要稳定延迟需要 GPU 推理或独占推理服务器。在千级 Chunk 的规模下，波动通常在几十毫秒内，不影响使用。

---

## 三、架构演进路线

```
Phase 1-3 (已完成): 基础 RAG 管道
  knowledge/ → Chunk → Embedding → FAISS → Search

Phase 4.1 (已完成): Chunk 上下文增强
  标题解析 + 前后文摘要 + 完整路径 → Prompt 更丰富

Phase 4.2 (已完成): Hybrid Search
  BM25 + 向量 → RRF 融合 → 专有名词/精确匹配

Phase 4.3 (已完成): Reranking
  Cross-Encoder 重排 Top 20 → 回答更精准

Phase 4.4 (已完成): Query Rewriting
  LLM 改写用户查询 → 关键词优化 → 检索命中率提升

Phase 4.5 (已完成): Agent Runtime
  Tool 抽象 + Memory + Planner + Agent 编排
  RAG 封装为 Tool，支持多工具扩展

Phase 5 (待定): 质量闭环
  RAGAS 评估 + Token 管理 + Prompt 版本管理

Phase 6 (待定): 服务化
   FastAPI + 流式输出 + 可观测性

---

## 四、v2.1 设计决策（2026-07-17）

### Q14：为什么选择 SQLite 而不是 JSON 文件？

**答案：数据完整性、查询能力、升级路径。**

JSON 文件方案的核心问题：
- 写一半崩溃 → 文件损坏，全部数据丢失
- 查最近 N 条 → 必须全量加载到内存
- 100 个对话 → 100 个 JSON 文件，文件系统爆炸

SQLite 方案的优势：
- **事务（ACID）**：写操作要么全成功要么全回滚，断电不丢数据
- **查询**：SELECT + WHERE + ORDER BY + LIMIT，不加载不必要的数据
- **零配置**：Python 标准库内置 sqlite3，无额外依赖
- **升级**：表结构不变直接换 PostgreSQL（SQLAlchemy 透明切换）

### Q15：为什么 FAISS 要从 IndexFlatIP 迁移到 IndexIDMap？

**答案：IndexFlatIP 不支持按 ID 删除向量。**

删除一个文档的 Chunk 时：
- `IndexFlatIP`：只能重建整个索引，N 个文档需 N 次 Embedding
- `IndexIDMap(IndexFlatIP)`：`remove_ids()` 直接移除指定 ID

迁移代价：`add()` → `add_with_ids(vectors, ids)`，`search()` 不变（IndexIDMap 透明代理）。

向后兼容：`load()` 时自动检测旧版 IndexFlatIP → 提取向量 → 重建为 IndexIDMap。

### Q16：为什么上传文档要做 hash 去重？

**答案：避免重复索引相同内容。**

用户可能反复上传同一份文档。没有 hash 去重时：
- 每次上传 → 解析 → 切片 → Embedding → 追加入 FAISS
- 同一份文档 3 次上传 = 3 倍的重复 Chunk
- 检索时重复内容堆满 Top-K，挤掉其他有效结果

hash 去重策略：
- 上传时计算 SHA256(原始文件字节)
- 同名文档 → 比较 hash → 相同则直接返回已有记录，跳过索引
- hash 不同 → 先 `remove_ids(旧文档 Chunk)` → 再 `add_with_ids(新 Chunk)`

### Q17：为什么 Citation 要把 PromptBuilder._format_context 接入 Agent？

**答案：让 LLM 看到结构化上下文才能输出准确定位引用。**

旧的 `_format_observations` 直接 dump Tool 的文本输出：
```
[search_knowledge] 找到 5 条相关文档:
  1. 语雀 [Score: 0.623]
     MCP 全称 Model Context Protocol...
```

LLM 看到的是扁平文本，不知道哪条对应哪个引用号。

新的 `_format_context_from_observations` → `PromptBuilder._format_context`：
```
[参考 1]
章节: MCP 核心概念
文档: 语雀
路径: 语雀.md
相关内容: MCP 全称 Model Context Protocol...
```

LLM 看到 `[参考 1]` 就知道引用 `[1]`，API 返回的 citations 按相同索引对应。

### Q18：为什么要做数据库自动迁移？

**答案：ORM 新增字段时不需要手动 ALTER TABLE。**

SQLAlchemy 的 `create_all` 只创建新表，不修改已存在的表。加新列时老数据库报错。

自动迁移策略：
- `init_db()` 完成后调用 `_migrate_missing_columns()`
- 遍历所有 ORM 模型 → 对比表已有列 → 缺的列自动 `ALTER TABLE ADD COLUMN`
- 只加列、不删列、不改类型（安全迁移）
```
