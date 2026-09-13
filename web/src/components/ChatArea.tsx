import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Message, SearchResultItem, TokenUsage, StreamStatus } from '../types'
import { getConversation } from '../api'
import CitationPanel from './CitationPanel'

const API_BASE = '/api'

const EXAMPLE_QUESTIONS = [
  '帮我总结文档中的核心观点',
  '对比资料中的不同方案与适用场景',
  '从文档中找出具体步骤和注意事项',
]

interface ChatAreaProps {
  conversationId: string
}

export default function ChatArea({ conversationId }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [streamingText, setStreamingText] = useState('')
  const [activeCitations, setActiveCitations] = useState<SearchResultItem[]>([])
  const [rerank] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [citationW, setCitationW] = useState(320)
  const [convId, setConvId] = useState(conversationId)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 切换对话时加载历史
  useEffect(() => {
    setConvId(conversationId)
    if (conversationId) {
      getConversation(conversationId)
        .then((detail) => {
          const history: Message[] = detail.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
          }))
          setMessages(history)
          setActiveCitations([])
        })
        .catch((err) => {
          console.error('Load history failed:', err)
          setMessages([])
        })
    } else {
      setMessages([])
      setActiveCitations([])
    }
  }, [conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleCitationDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = citationW
    const onMove = (ev: MouseEvent) => setCitationW(Math.max(240, Math.min(440, startWidth - (ev.clientX - startX))))
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleSend = useCallback(async (text?: string) => {
    const q = (text || input).trim()
    if (!q || ['thinking', 'searching', 'generating'].includes(status)) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStatus('thinking')
    setStreamingText('')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    let fullText = ''
    let finalCitations: SearchResultItem[] = []
    let finalRewritten = ''
    let finalMs = 0
    let finalUsage: TokenUsage | null = null
    const assistantId = (Date.now() + 1).toString()

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, rerank, conversation_id: convId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            switch (event.type) {
              case 'thinking':
                if (event.content.includes('检索')) setStatus('searching')
                break
              case 'token':
                fullText += event.content
                setStreamingText(fullText)
                setStatus('generating')
                break
              case 'done':
                if (event.conversation_id && !convId) {
                  setConvId(event.conversation_id)
                }
                finalCitations = event.citations || []
                finalRewritten = event.rewritten_query || ''
                finalMs = event.retrieval_ms || 0
                finalUsage = event.usage || null
                break
              case 'error':
                setStatus('error')
                setStreamingText(event.message || '请求失败')
                return
            }
          } catch { /* skip */ }
        }
      }

      setActiveCitations(finalCitations)

      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: fullText,
        citations: finalCitations,
        rewrittenQuery: finalRewritten,
        retrievalMs: finalMs,
        usage: finalUsage || undefined,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingText('')
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setStreamingText(err instanceof Error ? err.message : '请求失败')
    }
  }, [input, status, rerank, convId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const renderMarkdown = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-neutral-600 underline decoration-neutral-300 hover:decoration-neutral-600 transition-colors">
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return <code className="bg-neutral-50 text-neutral-700 px-1.5 py-0.5 rounded text-[0.8125rem] font-mono" {...props}>{children}</code>
          }
          return <code className={className} {...props}>{children}</code>
        },
      }}
    >
      {text}
    </ReactMarkdown>
  )

  const isBusy = ['thinking', 'searching', 'generating'].includes(status)

  return (
    <div className="chat-layout flex-1 flex min-h-0 min-w-0">
      <div className={`chat-main flex-1 flex flex-col min-w-0 ${messages.length === 0 && status === "idle" ? "empty-chat" : ""}`}>
        <div className="chat-toolbar"><span>新对话</span><button className="source-toggle" aria-expanded={showSources} onClick={() => setShowSources(!showSources)}>引用来源 <span>{activeCitations.length}</span></button></div>
        {messages.length === 0 && status === 'idle' ? (
          <div className="welcome-area flex-1 flex items-center justify-center px-8">
            <div className="welcome-content text-center w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
                从文档中找答案
              </h2>
              <p className="text-gray-500 text-sm mb-8">
                输入问题，或先在左侧上传需要查阅的资料。
              </p>

              <div className="suggestion-grid">
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); textareaRef.current?.focus() }}
                    className="suggestion-card"
                  >
                    {["总结要点", "对比方案", "提取步骤"][i]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.role === 'user' ? 'bg-gray-900' : 'bg-neutral-100'
                  }`}>
                    {msg.role === 'user' ? (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {msg.role === 'assistant' && msg.rewrittenQuery && (
                      <div className="text-xs text-neutral-400 mb-1.5">
                        改写查询：{msg.rewrittenQuery}
                      </div>
                    )}
                    <div className={`text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-gray-800 font-medium'
                        : 'prose prose-sm max-w-none prose-pre:bg-[#1e293b] prose-pre:text-[#e2e8f0] prose-pre:rounded-xl prose-pre:shadow-sm prose-code:before:content-none prose-code:after:content-none text-gray-700'
                    }`}>
                      {msg.role === 'assistant'
                        ? renderMarkdown(msg.content)
                        : <p className="whitespace-pre-wrap">{msg.content}</p>
                      }
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-2 flex-wrap">
                        {msg.retrievalMs != null && (
                          <span>{(msg.retrievalMs / 1000).toFixed(1)}s</span>
                        )}
                        {msg.citations && msg.citations.length > 0 && (
                          <button
                            onClick={() => { setActiveCitations(msg.citations!); setShowSources(true) }}
                            className="text-neutral-500 hover:text-neutral-700 font-medium transition-colors cursor-pointer"
                          >
                            {msg.citations.length} 条引用
                          </button>
                        )}
                        {msg.usage && (
                          <span>{msg.usage.total_tokens}t</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isBusy && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                      <span className="text-sm text-gray-400">
                        {status === 'thinking' && '分析中'}
                        {status === 'searching' && '检索知识库'}
                        {status === 'generating' && '生成回答'}
                      </span>
                    </div>
                    {streamingText && (
                      <div className="prose prose-sm max-w-none prose-pre:bg-[#1e293b] prose-pre:text-[#e2e8f0] prose-pre:rounded-xl prose-pre:shadow-sm prose-code:before:content-none prose-code:after:content-none text-sm text-gray-700">
                        {renderMarkdown(streamingText)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {status === 'error' && streamingText && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-red-600">{streamingText}</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        <div className="composer-area px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="composer relative flex items-end gap-3 rounded-2xl px-5 py-3.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="向你的知识库提问…"
                aria-label="输入问题"
                disabled={isBusy}
                rows={1}
                className="flex-1 bg-transparent outline-none text-base text-gray-800 placeholder-gray-400 resize-none disabled:opacity-50 max-h-40"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="knowledge-badge">基于文档</span>
                <button
                  aria-label="发送问题"
                  onClick={() => handleSend()}
                  disabled={isBusy || !input.trim()}
                  className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isBusy ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
<p className="composer-hint">Enter 发送 · Shift + Enter 换行<span>回答供参考，请结合原文核实</span></p>
          </div>
        </div>
      </div>

      {showSources && <>
      <div
        className="citation-resizer w-1.5 bg-gray-200 hover:bg-neutral-400 active:bg-neutral-400 transition-colors shrink-0 cursor-col-resize relative"
        onMouseDown={handleCitationDrag}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>
      <div style={{ width: citationW, minWidth: 200, maxWidth: 500 }} className="citation-shell shrink-0">
        <button className="source-close" aria-label="收起引用来源" onClick={() => setShowSources(false)}>✕</button>
        <CitationPanel
          citations={activeCitations}
          onViewSource={(c) => setActiveCitations([c])}
        />
      </div>
      </>}
    </div>
  )
}
