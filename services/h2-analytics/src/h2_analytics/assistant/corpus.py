from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from h2_analytics.vocabulary import knowledge_base

# 知识语料条目检索（B-P1-1）：解析 knowledge-base.md 的结构化条目，
# 供答案引用溯源（IF-7 语料结构交付）与 LLM 渲染请求按题检索注入。
# 纪律：语料只作口径参考；答案数值仍只来自当前 run 对象（红线 §7-6）。

_ENTRY_ID = re.compile(r"^### ([A-Za-z0-9_.:-]+)[ \t]*$", re.MULTILINE)
_ENTRY_TEXT = re.compile(r"^- \*\*正文\*\*：(.+)$", re.MULTILINE)
_ENTRY_SOURCE_TYPE = re.compile(r"^- \*\*sourceType\*\*: ([a-z_]+)$", re.MULTILINE)
_ENTRY_SOURCE_ID = re.compile(r"^- \*\*sourceId\*\*: (.+)$", re.MULTILINE)

_ALLOWED_SOURCE_TYPES = frozenset(
    {
        "official_knowledge",
        "data_dictionary",
        "requirement_doc",
        "control_constraint",
        "equipment_master",
        "efficiency_curve",
    }
)
_DYNAMIC_SOURCE_PREFIX = "run:"

# 验收下限：语料 ≥60 条且 100% 出处（sourceType 合法 + sourceId 非空）。
_MIN_ENTRY_COUNT = 60

# 渲染请求注入预算（token 预算，B-P1-1 验收）：源文本截断 8000 字框架不动，
# 语料注入按题检索且双重截断（每条正文 + 注入总量），不得击穿整体预算。
MAX_ENTRY_TEXT_CHARS = 600
MAX_INJECTION_CHARS = 2400


class KnowledgeCorpusError(RuntimeError):
    """语料文件损坏或答案引用不可溯源（配置层错误，fail-fast）。"""


@lru_cache(maxsize=1)
def knowledge_entries() -> tuple[dict[str, Any], ...]:
    """解析全部语料条目；逐条断言正文/出处字段完整且 sourceType 合法。"""
    blocks = _ENTRY_ID.split(knowledge_base())
    entries: list[dict[str, Any]] = []
    for index in range(1, len(blocks) - 1, 2):
        entry_id, body = blocks[index], blocks[index + 1]
        text_match = _ENTRY_TEXT.search(body)
        type_match = _ENTRY_SOURCE_TYPE.search(body)
        id_match = _ENTRY_SOURCE_ID.search(body)
        if not (text_match and type_match and id_match):
            raise KnowledgeCorpusError(
                f"知识语料条目 {entry_id} 缺少正文/sourceType/sourceId 字段。"
            )
        source_type = type_match.group(1)
        if source_type not in _ALLOWED_SOURCE_TYPES:
            raise KnowledgeCorpusError(
                f"知识语料条目 {entry_id} 的 sourceType 非法：{source_type}。"
            )
        entries.append(
            {
                "id": entry_id,
                "text": text_match.group(1).strip(),
                "sourceType": source_type,
                "sourceId": id_match.group(1).strip(),
            }
        )
    if len(entries) < _MIN_ENTRY_COUNT:
        raise KnowledgeCorpusError(
            f"知识语料条目数 {len(entries)} 低于验收下限 {_MIN_ENTRY_COUNT}。"
        )
    if len({entry["id"] for entry in entries}) != len(entries):
        raise KnowledgeCorpusError("知识语料条目 ID 重复。")
    return tuple(entries)


@lru_cache(maxsize=1)
def _entry_map() -> dict[str, dict[str, Any]]:
    return {entry["id"]: entry for entry in knowledge_entries()}


def entry_by_id(entry_id: str) -> dict[str, Any] | None:
    """按 ID 取单条语料；不存在返回 None。"""
    return _entry_map().get(entry_id)


def is_dynamic_source(source_id: str) -> bool:
    """run:{id}:summary 为运行时动态引用（当前 run 摘要），不落静态语料。"""
    return source_id.startswith(_DYNAMIC_SOURCE_PREFIX)


def entries_for_citations(
    citations: list[dict[str, Any]] | tuple[dict[str, Any], ...],
) -> tuple[dict[str, Any], ...]:
    """按答案引用检索静态知识条目（保序去重）。

    引用一致性断言（B-P1-1 验收）：citations 中 sourceType=knowledge_base
    且非 run: 动态前缀的 sourceId 必须命中语料条目，否则抛错。
    """
    collected: dict[str, dict[str, Any]] = {}
    for citation in citations:
        if citation.get("sourceType") != "knowledge_base":
            continue
        source_id = citation.get("sourceId", "")
        if is_dynamic_source(source_id):
            continue
        entry = _entry_map().get(source_id)
        if entry is None:
            raise KnowledgeCorpusError(f"知识引用不可溯源：{source_id}。")
        collected.setdefault(source_id, entry)
    return tuple(collected.values())


def rendering_injection_entries(
    citations: list[dict[str, Any]] | tuple[dict[str, Any], ...],
) -> tuple[dict[str, Any], ...]:
    """LLM 渲染请求注入条目：按题检索 + 每条截断 + 总量预算（token 预算）。"""
    budget = MAX_INJECTION_CHARS
    injected: list[dict[str, Any]] = []
    for entry in entries_for_citations(citations):
        text = entry["text"][:MAX_ENTRY_TEXT_CHARS]
        # 首条始终注入（保证按题检索非空）；其后按剩余预算收条。
        if injected and len(text) > budget:
            break
        budget -= len(text)
        injected.append(
            {
                "id": entry["id"],
                "text": text,
                "sourceId": entry["sourceId"],
            }
        )
    return tuple(injected)
