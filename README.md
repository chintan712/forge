# Forge

Self-hosted local web UI that lets you drive Claude, OpenAI, or Gemini coding agents from a browser. Every session is scoped to a local folder on your disk. The agent can read/write files, run bash commands, search the web, spawn subagents, and ask you clarifying questions — all shown live in the conversation.

Runs as a native Python process on your machine, keeping your data and source code strictly local.

## 🚀 Features

- **Multi-Model Support** — Use top-tier AI models including Claude (Opus, Sonnet, Haiku), OpenAI (GPT-4o, GPT-4), Google Gemini, as well as **local and cloud open-source models via Ollama**. Easily switch models mid-session.
- **17 Automated Local Tools** — Gives the AI superpowers to read/write/edit code, run Bash commands, manage TODO lists, search the web, and execute autonomous subagents.
- **Live Transparent Execution** — Every tool call is rendered inline with its input/output in the UI. 
- **Context Management** — Live token-usage meter and a one-click summarization feature to prevent exceeding the model's context window on long sessions.
- **Persistent State** — Backed by SQLite. Conversations persist across restarts, allowing you to seamlessly pick up where you left off.
- **Drag & Drop Attachments** — Easily drag or paste images directly into the prompt box.

## 🛠️ Tech Stack

- **Backend:** Python 3.10+, FastAPI, WebSockets, SQLite
- **AI Integration:** Direct integrations with `anthropic`, `openai`, `google-genai`, and `ollama` Python SDKs for both local and cloud LLMs.
- **Frontend:** React 18, Vite, TypeScript
- **UI/UX:** Dark-mode driven interface with markdown rendering (`react-markdown`, syntax highlighting via `rehype-highlight`)

## 💻 Getting Started (Development)

Two terminals — frontend and backend run separately during development so you get frontend Hot Module Replacement (HMR) and backend autoreload.

**Prerequisites:** Python ≥ 3.10, Node.js ≥ 18

**1. Backend Setup**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 47822
```

**2. Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:47821` to view the interface. Add your API keys via the **Settings** sidebar to start a new session.
