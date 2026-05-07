// modified by agent: add ollama server url configuration section to settings UI
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Session } from './api/rest'
import Sidebar from './components/Sidebar'
import SessionView from './components/SessionView'
import CredentialsPage from './components/CredentialsPage'
import HomePage from './components/HomePage'
import NewSessionModal from './components/NewSessionModal'
import ConfirmModal from './components/ConfirmModal'
import { COLORS } from './theme'

export default function App() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [page, setPage] = useState<'sessions' | 'settings'>('sessions')
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ollamaUrl, setOllamaUrl] = useState('')
  const [ollamaSaving, setOllamaSaving] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await api.sessions.list()
      setSessions(list)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (page === 'settings') {
      fetch('/api/settings/ollama')
        .then((res) => res.json())
        .then((data) => {
          if (data.base_url) setOllamaUrl(data.base_url)
        })
        .catch(() => {})
    }
  }, [page])

  const saveOllama = async () => {
    setOllamaSaving(true)
    setOllamaStatus(null)
    try {
      const res = await fetch('/api/settings/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: ollamaUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOllamaStatus({ type: 'error', message: data.error || 'Failed to save' })
      } else {
        setOllamaStatus({ type: 'success', message: 'Saved' })
        setTimeout(() => setOllamaStatus(null), 2000)
      }
    } catch (e) {
      setOllamaStatus({ type: 'error', message: (e as Error).message || 'Failed to save' })
    } finally {
      setOllamaSaving(false)
    }
  }

  const onCreated = async (s: Session) => {
    setModalOpen(false)
    await refresh()
    setActiveId(s.id)
    setPage('sessions')
  }

  const requestDelete = (id: string) => {
    const target = sessions?.find((s) => s.id === id) ?? null
    if (target) setPendingDelete(target)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.sessions.remove(pendingDelete.id)
      await refresh()
      setPendingDelete(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const active = useMemo(
    () => sessions?.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: COLORS.bg, color: COLORS.text }}>
      <Sidebar
        sessions={sessions ?? []}
        activeId={activeId}
        page={page}
        onSelectSession={(id) => { setActiveId(id); setPage('sessions') }}
        onNewSession={() => setModalOpen(true)}
        onDeleteSession={requestDelete}
        onOpenSettings={() => setPage('settings')}
        onGoHome={() => { setActiveId(null); setPage('sessions') }}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {error && <div style={{ padding: 10, background: '#3a1010', color: '#fca5a5', fontSize: 13 }}>{error}</div>}
        {page === 'settings' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <CredentialsPage />
            <section style={{ padding: '0 40px 32px 40px', maxWidth: 720, width: '100%' }}>
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16, margin: '12px 0', background: COLORS.bgCard }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 15 }}>Ollama (Local Model)</strong>
                  {ollamaStatus?.type === 'success' && <span style={{ fontSize: 12, color: COLORS.green }}>{ollamaStatus.message}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input type="text" placeholder="http://localhost:11434" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} disabled={ollamaSaving} style={{ flex: 1 }} />
                  <button onClick={saveOllama} disabled={ollamaSaving || !ollamaUrl.trim()}>{ollamaSaving ? 'Saving…' : 'Save'}</button>
                </div>
                <p style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 8, marginBottom: 0 }}>Enter the URL of your running Ollama server. Default: http://localhost:11434</p>
                {ollamaStatus?.type === 'error' && <p style={{ color: COLORS.red, fontSize: 13, marginTop: 8, marginBottom: 0 }}>{ollamaStatus.message}</p>}
              </div>
            </section>
          </div>
        ) : active ? (
          <SessionView key={active.id} session={active} onSessionChanged={refresh} />
        ) : (
          <HomePage sessions={sessions ?? []} onSelectSession={(id) => setActiveId(id)} onNewSession={() => setModalOpen(true)} onOpenSettings={() => setPage('settings')} />
        )}
      </main>
      {modalOpen && <NewSessionModal onClose={() => setModalOpen(false)} onCreated={onCreated} />}
      {pendingDelete && <ConfirmModal title="Delete session?" message={`"${pendingDelete.title}" and its conversation history will be permanently removed.`} confirmLabel="Delete" destructive busy={deleting} onConfirm={confirmDelete} onCancel={() => (deleting ? null : setPendingDelete(null))} />}
    </div>
  )
}
