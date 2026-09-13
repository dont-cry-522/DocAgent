import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import DocumentsPage from './components/DocumentsPage'

type Page = 'chat' | 'documents'

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [connection, setConnection] = useState<'checking' | 'ready' | 'offline'>('checking')
  const checkConnection = useCallback(async () => {
    setConnection('checking')
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
      const data = await response.json()
      setConnection(response.ok && data.ready ? 'ready' : 'offline')
    } catch { setConnection('offline') }
  }, [])
  useEffect(() => { void checkConnection() }, [checkConnection])
  const [page, setPage] = useState<Page>('chat')
  const [currentConvId, setCurrentConvId] = useState('')
  const [chatKey, setChatKey] = useState(0)
  const [convRefresh, setConvRefresh] = useState(0)

  const handleNewChat = () => {
    setMenuOpen(false)
    setPage('chat')
    setCurrentConvId('')
    setChatKey((k) => k + 1)
    setConvRefresh((k) => k + 1)
  }

  const handleSelectConversation = (id: string) => {
    setMenuOpen(false)
    setPage('chat')
    setCurrentConvId(id)
    setChatKey((k) => k + 1)
  }

  return (
    <div className={`workspace ${menuOpen ? "menu-open" : ""}`}>
      {menuOpen && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}
      <div className="sidebar-shell">
      <Sidebar
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        currentConvId={currentConvId}
        currentPage={page}
        onNavigate={(next) => { setPage(next); setMenuOpen(false) }}
        refreshKey={convRefresh}
      />
      </div>
      <main className="main-shell">
        <header className="workspace-header">
          <div className="header-title"><button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="打开导航">☰</button><span className="breadcrumb">我的工作空间</span><span className="breadcrumb-divider">/</span><strong>{page === "chat" ? "知识问答" : "文档资料库"}</strong></div>
          <button className={`connection-status ${connection}`} onClick={checkConnection} title="点击重新检查连接"><i />{connection === "ready" ? "服务已连接" : connection === "checking" ? "检查连接中" : "服务未连接 · 重试"}</button>
        </header>
        {connection === "offline" && <div className="connection-notice" role="status">本地服务尚未连接，暂时无法读取文档或生成回答。页面浏览仍可使用。</div>}
      {page === 'chat' ? (
        <ChatArea key={chatKey} conversationId={currentConvId} />
      ) : (
        <DocumentsPage />
      )}
      </main>
    </div>
  )
}
