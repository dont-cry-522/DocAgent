import { useState } from 'react'
import type { SearchResultItem } from '../types'

interface CitationPanelProps {
  citations: SearchResultItem[]
  onViewSource?: (citation: SearchResultItem) => void
}

export default function CitationPanel({ citations }: CitationPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  if (citations.length === 0) {
    return (
      <aside className="w-full bg-gray-50/50 border-l border-gray-100 flex flex-col h-full shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-400">来源</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-gray-400 text-center leading-relaxed">
            答案的依据，会在这里呈现<br /><span className="text-xs">提问后可展开引用，查看原文片段</span>
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-full bg-gray-50/50 border-l border-gray-100 flex flex-col h-full shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">
          引用来源 ({citations.length})
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {citations.map((c, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-all hover:border-gray-300"
          >
            <button
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="w-full text-left p-3 hover:bg-gray-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-neutral-100 text-neutral-700 text-sm font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate leading-snug">
                    {c.doc_title || c.title}
                  </p>
                  {c.heading && (
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{c.heading}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm text-neutral-500 font-mono font-medium">
                      {(c.rerank_score || c.score).toFixed(3)}
                    </span>
                    <span className="text-sm text-gray-400">
                      {expandedIdx === i ? '收起' : '展开'} ▾
                    </span>
                  </div>
                </div>
              </div>
            </button>
            {expandedIdx === i && (
              <div className="px-3.5 pb-3 border-t border-gray-100">
                <p className="text-sm text-gray-600 mt-2.5 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                  {c.content}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
