import { useEffect, useMemo, useState } from 'react'
import {
  api,
  formatTokens,
  type AgentKind,
  type CredentialStatus,
  type ModelsByAgent,
  type ModelsDetails,
  type Session,
} from '../api/rest'
import Dropdown from './Dropdown'
import FolderBrowser from './FolderBrowser'
import { COLORS } from '../theme'

const AGENT_OPTIONS: { kind: AgentKind; label: string }[] = [
  { kind: 'claude', label: 'Claude' },
  { kind: 'openai', label: 'OpenAI' },
  { kind: 'gemini', label: 'Gemini' },
  { kind: 'ollama', label: 'Ollama' },
]

type Mode = 'form' | 'browse'

export default function NewSessionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (s: Session) => void
}) {
  const [mode, setMode] = useState<Mode>('form')
  const [creds, setCreds] = useState<CredentialStatus[] | null>(null)
  const [models, setModels] = useState<ModelsByAgent | null>(null)
  const [modelDetails, setModelDetails] = useState<ModelsDetails | null>(null)

  const [agent, setAgent] = useState<AgentKind | null>(null)
  const [model, setModel] = useState('')

  const [folder, setFolder] = useState('')
  const [title, setTitle] = useState('')
  const [folderInfo, setFolderInfo] = useState<string | null>(null)
  const [folderOk, setFolderOk] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([api.credentials.list(), api.models.list()])
      .then(([c, m]) => {
        setCreds(c)
        setModels(m)
        const firstConfigured = c.find((x) => x.has_key)?.agent_kind as
          | AgentKind
          | undefined
        const initialAgent = firstConfigured ?? 'claude'
        setAgent(initialAgent)
        setModel(m[initialAgent]?.[0] ?? '')
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  // Separate effect for details — it can be slow (Gemini live-fetches)
  // and we don't want to block credential/model list rendering on it.
  // Failures are silent: the dropdown just doesn't show context hints.
  useEffect(() => {
    let cancelled = false
    api.models
      .details()
      .then((d) => {
        if (!cancelled) setModelDetails(d)
      })
      .catch(() => {
        /* non-fatal */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const availableAgents = useMemo(() => {
    if (!creds) return []
    return AGENT_OPTIONS.filter((a) =>
      creds.find((c) => c.agent_kind === a.kind)?.has_key,
    )
  }, [creds])

  const onAgentChange = (k: AgentKind) => {
    setAgent(k)
    if (models && models[k]?.length) {
      setModel(models[k][0])
    } else {
      setModel('')
    }
  }

  const validateFolder = async () => {
    setError(null)
    setFolderInfo(null)
    setFolderOk(false)
    const trimmed = folder.trim()
    if (!trimmed) {
      setFolderInfo('Enter a folder path first.')
      return
    }
    setValidating(true)
    try {
      const info = await api.folders.validate(trimmed)
      if (info.exists && info.is_dir) {
        setFolderOk(true)
        setFolderInfo(`OK → ${info.resolved_path}`)
      } else if (info.exists) {
        setFolderInfo(`Not a directory: ${info.resolved_path}`)
      } else {
        setFolderInfo(`Does not exist: ${info.resolved_path ?? trimmed}`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setValidating(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agent || !model) {
      setError('Pick an agent and a model first.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const s = await api.sessions.create({
        agent_kind: agent,
        model,
        folder_path: folder.trim(),
        title: title.trim() || undefined,
      })
      onCreated(s)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'browse') {
    return (
      <div style={backdrop} onClick={onClose}>
        <div style={modal} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>Select folder</h3>
          <FolderBrowser
            onSelect={(path) => {
              setFolder(path)
              setMode('form')
              setFolderOk(true)
              setFolderInfo(`Selected: ${path}`)
            }}
            onCancel={() => setMode('form')}
          />
        </div>
      </div>
    )
  }

  const noProvidersConfigured = creds !== null && availableAgents.length === 0

  return (
    <div style={backdrop} onClick={onClose}>
      <form style={modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>New session</h3>

        {noProvidersConfigured && (
          <p
            style={{
              color: COLORS.amber,
              fontSize: 13,
              margin: '0 0 12px',
              background: 'rgba(217,119,6,0.08)',
              border: `1px solid rgba(217,119,6,0.3)`,
              padding: 10,
              borderRadius: 6,
            }}
          >
            No API keys saved yet. Go to Settings and add at least one key (Claude, OpenAI, Gemini) or configure your Ollama server.
          </p>
        )}

        <label style={labelStyle}>Provider</label>
        <Dropdown<AgentKind>
          value={(agent ?? 'claude') as AgentKind}
          onChange={onAgentChange}
          options={AGENT_OPTIONS.map((o) => {
            const has = !!creds?.find((c) => c.agent_kind === o.kind)?.has_key
            return {
              value: o.kind,
              label: o.label,
              disabled: !has,
              hint: has ? undefined : '— no API key',
            }
          })}
          disabled={!creds || noProvidersConfigured}
          aria-label="Provider"
        />

        <label style={labelStyle}>Model</label>
        <Dropdown
          value={model}
          onChange={setModel}
          options={
            agent
              ? (models?.[agent] ?? []).map((id) => {
                  const detail = modelDetails?.[agent]?.find(
                    (d) => d.id === id,
                  )
                  return {
                    value: id,
                    label: id,
                    hint: detail?.context_window
                      ? `${formatTokens(detail.context_window)} ctx`
                      : undefined,
                  }
                })
              : []
          }
          disabled={!agent || !models || noProvidersConfigured}
          placeholder={agent ? 'Pick a model' : 'Pick a provider first'}
          aria-label="Model"
        />

        <label style={labelStyle}>Folder path</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value)
              setFolderOk(false)
              setFolderInfo(null)
            }}
            placeholder="/Users/harsh/projects/api"
            style={{ flex: 1 }}
            required
          />
          <button type="button" onClick={() => setMode('browse')}>
            Browse…
          </button>
          <button
            type="button"
            onClick={validateFolder}
            disabled={validating || !folder.trim()}
          >
            {validating ? '…' : 'Validate'}
          </button>
        </div>
        {folderInfo && (
          <p
            style={{
              fontSize: 13,
              margin: '4px 0 0',
              color: folderOk ? COLORS.green : COLORS.red,
            }}
          >
            {folderInfo}
          </p>
        )}

        <label style={labelStyle}>Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Debug auth middleware"
          style={{ width: '100%' }}
        />

        {error && (
          <p style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
          }}
        >
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              validating ||
              !agent ||
              !model ||
              !folder.trim() ||
              noProvidersConfigured
            }
            style={{
              background: COLORS.blue,
              color: '#fff',
              border: 'none',
            }}
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
}

const modal: React.CSSProperties = {
  background: COLORS.bgSidebar,
  padding: 24,
  borderRadius: 10,
  width: 560,
  maxWidth: '92vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
  border: `1px solid ${COLORS.border}`,
  color: COLORS.text,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  margin: '14px 0 6px',
  color: COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
