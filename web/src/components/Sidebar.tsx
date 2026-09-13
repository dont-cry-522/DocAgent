import { useEffect, useState, useCallback } from 'react'
import { listDocuments, listConversations, deleteConversation } from '../api'
import type { DocumentItem, ConversationItem } from '../types'

type Page = 'chat' | 'documents'

interface SidebarProps {
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  currentConvId: string
  currentPage: Page
  onNavigate: (page: Page) => void
  refreshKey: number
}

export default function Sidebar({
  onNewChat, onSelectConversation, currentConvId, currentPage, onNavigate, refreshKey,
}: SidebarProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [conversations, setConversations] = useState<ConversationItem[]>([])

  const loadConversations = useCallback(async () => {
    try {
      const list = await listConversations()
      setConversations(list)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    listDocuments().then(setDocuments).catch(() => {})
    loadConversations()
  }, [loadConversations, refreshKey])

  useEffect(() => {
    if (currentPage === 'documents') {
      listDocuments().then(setDocuments).catch(() => {})
    } else {
      loadConversations()
    }
  }, [currentPage, loadConversations])

  const handleDeleteConv = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('确定删除此对话？')) return
    try {
      await deleteConversation(id)
      loadConversations()
      if (id === currentConvId) {
        onNewChat()
      }
    } catch { /* ignore */ }
  }

  const formatTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN')
  }

  return (
    <aside className="app-sidebar w-72 bg-gray-50/50 border-r border-gray-100 flex flex-col h-full shrink-0">
      <div className="brand"><div><strong>DocAgent</strong><small>文档问答</small></div></div>
      <div className="p-3 border-b border-gray-100 space-y-2">
        <button
          onClick={onNewChat}
          className="w-full py-2.5 px-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新对话
        </button>

        <div className="flex rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => onNavigate('chat')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              currentPage === 'chat' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            知识问答
          </button>
          <button
            onClick={() => onNavigate('documents')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              currentPage === 'documents' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            文档资料
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {currentPage === 'chat' && (
          <div>
            <p className="text-sm font-semibold text-gray-400 mb-2 px-1">
              最近会话
            </p>
            {conversations.length === 0 ? (
              <p className="text-sm text-gray-400 px-1 py-3">暂无会话</p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((conv) => (
                  <li
                    key={conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                    className={`group relative flex items-center justify-between px-2 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                      conv.id === currentConvId
                        ? 'bg-white shadow-sm text-gray-800'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="truncate">{conv.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatTime(conv.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConv(e, conv.id)}
                      className="shrink-0 w-5 h-5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all flex items-center justify-center cursor-pointer"
                      title="删除"
                    >
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-gray-400 mb-2 px-1">
            知识库
          </p>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 px-1 py-3">暂无文档</p>
          ) : (
            <ul className="space-y-0.5">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate">{doc.original_name}</span>
                  <span className="text-sm text-neutral-400 ml-auto shrink-0 font-medium">
                    {doc.chunk_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-gray-100">
        <p className="text-sm text-gray-400 text-center">
          本地工作空间
        </p>
      </div>
    </aside>
  )
}
