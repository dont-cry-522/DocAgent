"""
EmbeddingProvider — 统一 Embedding 模型管理

设计原则：
  - 抽象基类定义接口（embed_query / embed_documents / dimension）
  - BGEProvider 是当前唯一实现，日后可添加 OpenAIProvider 等
  - 通过 registry 字典实现模型切换，不硬编码模型名
  - 单例懒加载：模型只加载一次，全局复用
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
from sentence_transformers import SentenceTransformer
from src.config import settings


# ── 抽象基类 ─────────────────────────────────────


class EmbeddingProvider(ABC):
    """Embedding 模型抽象接口

    所有 Embedding 实现必须提供：
        embed_query(str)     → list[float]   单条文本向量化
        embed_documents(list) → list[list]   批量文本向量化
        dimension            → int            向量维度
    """

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        ...

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        ...


# ── BGE 实现 ─────────────────────────────────────


class BGEProvider(EmbeddingProvider):
    """BGE 系列中文 Embedding 模型（基于 sentence-transformers）

    默认模型: BAAI/bge-small-zh-v1.5
      - 维度: 512
      - 大小: ~100MB
      - 特点: 中文优化，体积小，适合本地部署
    """

    def __init__(
        self,
        model_name: str | None = None,
    ):
        self._model_name = model_name or settings.embedding_model_name
        self._model: SentenceTransformer | None = None

    def _load_model(self) -> SentenceTransformer:
        """懒加载模型，首次使用时从 HuggingFace 下载，并做一次预热推理"""
        if self._model is None:
            print(f"[load] Embedding 模型: {self._model_name} ...")
            self._model = SentenceTransformer(self._model_name)
            self._model.encode("预热", normalize_embeddings=True)
            print("   [OK] 模型加载完成")
        return self._model

    def embed_query(self, text: str) -> list[float]:
        model = self._load_model()
        embedding = model.encode(
            text,
            normalize_embeddings=True,
        )
        return embedding.tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = self._load_model()
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=True,
        )
        return embeddings.tolist()

    @property
    def dimension(self) -> int:
        return self._load_model().get_embedding_dimension()


# ── 模型注册表 ───────────────────────────────────

# 在此添加新模型即可切换，不修改业务代码
PROVIDER_REGISTRY: dict[str, type[EmbeddingProvider]] = {
    "bge": BGEProvider,
    # "openai": OpenAIProvider,     # 未来扩展
    # "cohere": CohereProvider,     # 未来扩展
}


def get_provider(name: str = "bge", **kwargs) -> EmbeddingProvider:
    """工厂方法，按名称获取 EmbeddingProvider 实例"""
    if name not in PROVIDER_REGISTRY:
        raise ValueError(f"未知 Embedding 模型: {name}，可选: {list(PROVIDER_REGISTRY)}")
    return PROVIDER_REGISTRY[name](**kwargs)
