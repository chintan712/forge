export type AgentKind = 'claude' | 'openai' | 'gemini' | 'ollama'

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'error'
  | 'stopped'

export interface CredentialStatus {
  agent_kind: AgentKind
  has_key: boolean
  updated_at: string | null
}

export interface Session {
  id: string
  agent_kind: AgentKind
  model: string
  folder_path: string
  title: string
  status: SessionStatus
  created_at: string
  updated_at: string
  last_active_at: string
}

export interface SessionCreate {
  agent_kind: AgentKind
  model: string
  folder_path: string
  title?: string
}

export type ModelsByAgent = Record<AgentKind, string[]>

export interface ModelDetail {
  id: string
  context_window: number | null
  max_output_tokens: number | null
  /** 'static' = hardcoded in backend; 'api' = fetched live from vendor. */
  source: 'static' | 'api' | null
}

export type ModelsDetails = Record<AgentKind, ModelDetail[]>

export interface FolderValidateResponse {
  exists: boolean
  is_dir: boolean
  resolved_path: string | null
}

export interface FolderEntry {
  name: string
  is_dir: boolean
}

export interface FolderListResponse {
  path: string
  parent: string | null
  entries: FolderEntry[]
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    let detail = body
    try {
      const j = JSON.parse(body)
      if (j && typeof j.detail === 'string') detail = j.detail
    } catch {
      /* keep raw body */
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  credentials: {
    list: () => fetch('/api/credentials').then((r) => handle<CredentialStatus[]>(r)),
    set: (agent: AgentKind, api_key: string) =>
      fetch(`/api/credentials/${agent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key }),
      }).then((r) => handle<CredentialStatus>(r)),
    remove: (agent: AgentKind) =>
      fetch(`/api/credentials/${agent}`, { method: 'DELETE' }).then((r) =>
        handle<void>(r),
      ),
  },
  sessions: {
    list: () => fetch('/api/sessions').then((r) => handle<Session[]>(r)),
    get: (id: string) => fetch(`/api/sessions/${id}`).then((r) => handle<Session>(r)),
    create: (body: SessionCreate) =>
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => handle<Session>(r)),
    update: (id: string, body: { model?: string }) =>
      fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => handle<Session>(r)),
    remove: (id: string) =>
      fetch(`/api/sessions/${id}`, { method: 'DELETE' }).then((r) => handle<void>(r)),
    messages: (id: string) =>
      fetch(`/api/sessions/${id}/messages`).then((r) =>
        handle<Array<Record<string, unknown> & { seq: number }>>(r),
      ),
    /** Most recent ``input_tokens`` per session (sessions without a
     *  usage event yet are omitted). */
    usage: () =>
      fetch('/api/sessions/usage').then((r) =>
        handle<Record<string, number>>(r),
      ),
  },
  folders: {
    validate: (path: string) =>
      fetch('/api/folders/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }).then((r) => handle<FolderValidateResponse>(r)),
    list: (path?: string, includeFiles = false) => {
      const params = new URLSearchParams()
      if (path) params.set('path', path)
      if (includeFiles) params.set('include_files', 'true')
      const qs = params.toString()
      return fetch(
        `/api/folders/list${qs ? `?${qs}` : ''}`,
      ).then((r) => handle<FolderListResponse>(r))
    },
  },
  models: {
    list: () => fetch('/api/models').then((r) => handle<ModelsByAgent>(r)),
    details: () =>
      fetch('/api/models/details').then((r) => handle<ModelsDetails>(r)),
  },
}

// ─── Formatting helpers ─────────────────────────────────────────────
/** Format a token count as a compact short label: 128000 → "128k",
 *  1000000 → "1M", 1048576 → "1M" (rounded). */
export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return v % 1 === 0 ? `${v}M` : `${v.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (n >= 1_000) {
    const v = Math.round(n / 1_000)
    return `${v}k`
  }
  return String(n)
}
