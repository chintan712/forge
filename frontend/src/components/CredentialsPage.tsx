import { useEffect, useState } from 'react'
import { api, type AgentKind, type CredentialStatus } from '../api/rest'
import { COLORS } from '../theme'

const AGENTS: { kind: AgentKind; label: string; placeholder: string }[] = [
  { kind: 'claude', label: 'Claude', placeholder: 'sk-ant-...' },
  { kind: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { kind: 'gemini', label: 'Gemini', placeholder: 'AIza...' },
  { kind: 'ollama', label: 'Ollama (Cloud Model)', placeholder: 'sk-...' },
]

export default function CredentialsPage() {
  const [statuses, setStatuses] = useState<CredentialStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () =>
    api.credentials.list().then(setStatuses).catch((e) => setError(e.message))

  useEffect(() => {
    refresh()
  }, [])

  return (
    <section style={{ padding: '32px 40px 0 40px', maxWidth: 720, width: '100%' }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>Settings</h2>
      <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 24 }}>
        API keys are stored locally in <code style={inlineCode}>~/.forge/app.db</code>. They never leave your machine.
      </p>

      {error && <p style={{ color: COLORS.red }}>Error: {error}</p>}
      {!statuses && !error && <p style={{ color: COLORS.textMuted }}>Loading…</p>}

      {statuses &&
        AGENTS.map((agent) => {
          const status = statuses.find((s) => s.agent_kind === agent.kind) ?? {
            agent_kind: agent.kind,
            has_key: false,
            updated_at: null,
          }
          return (
            <CredentialRow
              key={agent.kind}
              agent={agent}
              status={status}
              onChanged={refresh}
            />
          )
        })}
    </section>
  )
}

function CredentialRow({
  agent,
  status,
  onChanged,
}: {
  agent: { kind: AgentKind; label: string; placeholder: string }
  status: CredentialStatus
  onChanged: () => void
}) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const save = async () => {
    setRowError(null)
    setSaving(true)
    try {
      await api.credentials.set(agent.kind, input)
      setInput('')
      onChanged()
    } catch (e) {
      setRowError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setRowError(null)
    setSaving(true)
    try {
      await api.credentials.remove(agent.kind)
      onChanged()
    } catch (e) {
      setRowError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 16,
        margin: '12px 0',
        background: COLORS.bgCard,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <strong style={{ fontSize: 15 }}>{agent.label}</strong>
        <span
          style={{
            fontSize: 12,
            color: status.has_key ? COLORS.green : COLORS.textDim,
          }}
        >
          {status.has_key
            ? `Saved · updated ${new Date(status.updated_at!).toLocaleString()}`
            : 'Not configured'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          type="password"
          placeholder={status.has_key ? 'Paste new key to replace' : agent.placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={saving}
          style={{ flex: 1 }}
        />
        <button onClick={save} disabled={saving || !input.trim()}>
          Save
        </button>
        {status.has_key && (
          <button
            onClick={remove}
            disabled={saving}
            style={{ color: COLORS.red, borderColor: 'rgba(239,68,68,0.3)' }}
          >
            Remove
          </button>
        )}
      </div>
      {rowError && (
        <p style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{rowError}</p>
      )}
    </div>
  )
}

const inlineCode: React.CSSProperties = {
  background: COLORS.codeBg,
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 12,
}
