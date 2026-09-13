import { useState, useEffect, useCallback, useRef } from 'react'
import type { DocumentItem, StatsResponse } from '../types'
import { listDocuments, uploadDocument, deleteDocument, rebuildIndex, getStats } from '../api'

const ALLOWED_EXTS = ['md', 'markdown', 'txt', 'pdf', 'docx', 'html', 'htm']

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const [docs, st] = await Promise.all([listDocuments(), getStats()])
      setDocuments(docs)
      setStats(st)
    } catch {
      setLoadFailed(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleUpload = async (file: File) => {
    if (uploading) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`不支持的文件格式: .${ext}，支持: ${ALLOWED_EXTS.map(e => '.' + e).join(', ')}`)
      return
    }
    setError('')
    setUploading(true)
    try {
      await uploadDocument(file)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`确定删除 "${doc.original_name}"？\n此操作将同时移除索引。`)) return
    try {
      await deleteDocument(doc.id)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleRebuild = async () => {
    if (!confirm('确定重建全部索引？')) return
    setRebuilding(true)
    setError('')
    try {
      await rebuildIndex()
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重建失败')
    } finally {
      setRebuilding(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="documents-page flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="documents-heading"><div><h2>文档资料库</h2><p>管理用于问答的文档，支持上传、查看和删除。</p></div></div>

        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-gray-800">{stats.document_count}</p>
              <p className="text-sm text-gray-500 mt-1">文档总数</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-gray-800">{stats.chunk_count}</p>
              <p className="text-sm text-gray-500 mt-1">知识片段</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-gray-800">{formatSize(stats.total_size)}</p>
              <p className="text-sm text-gray-500 mt-1">总大小</p>
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={uploading ? -1 : 0}
          aria-label="上传文档"
          aria-disabled={uploading}
          onKeyDown={(e) => { if (!uploading && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click() } }}
          onClick={() => { if (!uploading) fileInputRef.current?.click() }}
          className={`upload-zone border-2 border-dashed rounded-xl p-10 text-center mb-8 transition-colors cursor-pointer ${
            dragOver ? 'border-gray-900 bg-gray-100' : 'border-gray-300 hover:border-gray-400 bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            disabled={uploading}
            accept=".md,.txt,.pdf,.docx,.html,.htm"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-gray-500">正在解析并构建索引...</p>
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600 font-medium">拖拽文件到此处上传</p>
              <p className="text-xs text-gray-400 mt-1">或点击选择文件 · 支持 Markdown / PDF / Word / TXT / HTML</p>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
            <button onClick={() => setError('')} className="ml-3 underline cursor-pointer">关闭</button>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            已上传文档 ({documents.length})
          </h3>
          <button
            onClick={handleRebuild}
            disabled={rebuilding || loading || loadFailed || documents.length === 0}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {rebuilding ? '重建中...' : '重建全部索引'}
          </button>
        </div>

        {loading ? <div className="document-state" role="status">正在读取文档…</div> : loadFailed ? <div className="document-state"><strong>暂时无法读取资料库</strong><p>请确认本地服务已启动，然后重新加载。</p><button className="source-toggle" onClick={loadData}>重新加载</button></div> : documents.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-gray-400 text-sm">还没有资料，上传第一份文档开始探索</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">文件名</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">格式</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">大小</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">知识片段</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">上传时间</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-gray-800 truncate max-w-[260px]" title={doc.original_name}>
                          {doc.original_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                        {doc.format}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-neutral-50 text-neutral-700 font-medium">
                        {doc.chunk_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{doc.created_at}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(doc)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
