import React, { useEffect, useState } from 'react'

type ChatMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string }
const MIRAI_STORAGE_KEY = 'miraiChatState'

type TabKey = 'overlay' | 'transcript' | 'controls' | 'mirai'

export default function App() {
    const [activeTab, setActiveTab] = useState<TabKey>('overlay')
    const [now, setNow] = useState(new Date().toLocaleTimeString())
    useEffect(() => {
        const id = setInterval(() => {
            setNow(new Date().toLocaleTimeString())
        }, 1000)
        return () => clearInterval(id)
    }, [])

    const [isHealthOpen, setIsHealthOpen] = useState(false)
    const [healthLoading, setHealthLoading] = useState(false)
    const [healthError, setHealthError] = useState<string | null>(null)
    const [healthData, setHealthData] = useState<unknown>(null)

    // Mirai chat state is lifted to persist across tab switches
    const [miraiConversationId, setMiraiConversationId] = useState<number | null>(null)
    const [miraiMessages, setMiraiMessages] = useState<ChatMessage[]>([])
    const [miraiConversationTitle, setMiraiConversationTitle] = useState<string | null>(null)

    // History dropdown state
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [historyItems, setHistoryItems] = useState<Array<{ id: number; title: string | null; message_count: number; updated_at: string }>>([])
    const historyRef = React.useRef<HTMLDivElement | null>(null)

    // On fresh load, start with no conversation selected. We still persist changes below.

    // Persist Mirai state on change
    useEffect(() => {
        try {
            localStorage.setItem(MIRAI_STORAGE_KEY, JSON.stringify({ conversationId: miraiConversationId, messages: miraiMessages, title: miraiConversationTitle }))
        } catch { }
    }, [miraiConversationId, miraiMessages, miraiConversationTitle])

    async function openHistory() {
        const nextOpen = !isHistoryOpen
        setIsHistoryOpen(nextOpen)
        if (!nextOpen) return
        setHistoryLoading(true)
        setHistoryError(null)
        try {
            const res = await fetch('/api/chat/conversations', { credentials: 'include' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            // Expecting list of { id, title, created_at, updated_at, message_count }
            setHistoryItems(Array.isArray(json) ? json.map((it: any) => ({ id: it.id, title: it.title ?? null, message_count: it.message_count ?? 0, updated_at: it.updated_at })) : [])
        } catch (err: any) {
            setHistoryError(err?.message || 'Failed to load conversations')
        } finally {
            setHistoryLoading(false)
        }
    }

    async function selectConversation(id: number) {
        try {
            const res = await fetch(`/api/chat/conversations/${id}`, { credentials: 'include' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const msgs = Array.isArray(data?.messages) ? data.messages : []
            const mapped: ChatMessage[] = msgs.map((m: any) => ({ id: crypto.randomUUID(), role: m.role, content: m.content }))
            setMiraiConversationId(data.id)
            setMiraiMessages(mapped)
            setMiraiConversationTitle(data.title || `Conversation #${data.id}`)
            setIsHistoryOpen(false)
            // Scroll Mirai view to bottom next paint
            requestAnimationFrame(() => {
                const el = document.querySelector('.chat__messages')
                el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            })
        } catch (err: any) {
            setHistoryError(err?.message || 'Failed to load conversation')
        }
    }

    // Close history on outside click
    useEffect(() => {
        if (!isHistoryOpen) return
        function onDocClick(e: MouseEvent) {
            if (!historyRef.current) return
            if (!historyRef.current.contains(e.target as Node)) {
                setIsHistoryOpen(false)
            }
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [isHistoryOpen])

    async function openHealthModal() {
        setIsHealthOpen(true)
        await fetchHealth()
    }

    async function fetchHealth() {
        try {
            setHealthLoading(true)
            setHealthError(null)
            setHealthData(null)
            const res = await fetch('/api/health', { credentials: 'include' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            setHealthData(json)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch health'
            setHealthError(message)
        } finally {
            setHealthLoading(false)
        }
    }

    return (
        <div className="app-root">
            <div className="titlebar" data-tauri-drag-region>
                <div className="titlebar__left" data-tauri-drag-region>
                    <div className="titlebar__brand" data-tauri-drag-region>
                        <span className="brand-dot" />
                        <span className="brand">Meeter</span>
                        <button className="icon-btn no-drag" aria-label="Server health" title="Server health" onClick={openHealthModal}>
                            <span className="icon-btn__glyph">i</span>
                        </button>
                    </div>
                </div>
                <div className="titlebar__center" data-tauri-drag-region>
                    <span className="subtitle">Realtime Knowledge Overlay</span>
                </div>
                <div className="titlebar__right">
                    <button className="win-btn" aria-label="minimize" data-action="minimize">_</button>
                    <button className="win-btn" aria-label="maximize" data-action="maximize">▢</button>
                    <button className="win-btn win-btn--danger" aria-label="close" data-action="close">×</button>
                </div>
            </div>

            <main className="shell">
                <aside className="panel panel--glass controls">
                    <h2 className="panel__title">Session</h2>
                    <div className="control-group">
                        <label className="switch">
                            <input type="checkbox" />
                            <span className="slider" />
                            <span className="label">Capture Audio</span>
                        </label>
                    </div>
                    <div className="control-group">
                        <label className="switch">
                            <input type="checkbox" />
                            <span className="slider" />
                            <span className="label">Screen Context</span>
                        </label>
                    </div>
                    <div className="control-group">
                        <label className="switch">
                            <input type="checkbox" defaultChecked />
                            <span className="slider" />
                            <span className="label">Overlay</span>
                        </label>
                    </div>

                    <div className="divider" />
                    <button className="btn btn--primary">Start Session</button>
                    <button className="btn">Save Snapshot</button>

                    <div className="meta">
                        <span className="dot dot--live" />
                        <span>{now}</span>
                    </div>
                </aside>

                <section className="content">
                    <div className="tabs" role="tablist" aria-label="Views">
                        <button
                            className={`tab ${activeTab === 'overlay' ? 'is-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'overlay'}
                            onClick={() => setActiveTab('overlay')}
                        >
                            Overlay
                        </button>
                        <button
                            className={`tab ${activeTab === 'transcript' ? 'is-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'transcript'}
                            onClick={() => setActiveTab('transcript')}
                        >
                            Transcript
                        </button>
                        <button
                            className={`tab ${activeTab === 'controls' ? 'is-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'controls'}
                            onClick={() => setActiveTab('controls')}
                        >
                            Controls
                        </button>
                        <button
                            className={`tab ${activeTab === 'mirai' ? 'is-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'mirai'}
                            onClick={() => setActiveTab('mirai')}
                        >
                            Mirai
                        </button>
                    </div>

                    <div className="views">
                        {activeTab === 'overlay' && (
                            <div className="cards">
                                <Card
                                    title="Define: Vector Index"
                                    body="A data structure that enables fast approximate nearest neighbor search over embeddings."
                                    sources={[{ name: 'KB: RAG Primer', url: '#' }]}
                                    tone="info"
                                />
                                <Card
                                    title="Next Step: Confirm owners"
                                    body="Assign action items for rollout; verify product and infra owners."
                                    sources={[{ name: 'Meeting Notes', url: '#' }]}
                                    tone="action"
                                />
                                <Card
                                    title="Related: MiniCPM‑V 4.5"
                                    body="Low‑FPS visual tagging model for on‑screen entities and intents."
                                    sources={[{ name: 'Model Spec', url: '#' }]}
                                    tone="neutral"
                                />
                            </div>
                        )}

                        {activeTab === 'transcript' && (
                            <div className="transcript panel--glass">
                                <TranscriptRow who="You" text="Let’s align on the latency budget for the RAG path." />
                                <TranscriptRow who="Alex" text="We should keep it under 700 ms P95 for short prompts." />
                                <TranscriptRow who="You" text="Okay, and diarization stays local for privacy by default." />
                            </div>
                        )}

                        {activeTab === 'controls' && (
                            <div className="control-deck panel--glass">
                                <div className="grid">
                                    <QuickControl label="Always on top" />
                                    <QuickControl label="Compact mode" />
                                    <QuickControl label="Dark mode" defaultChecked />
                                    <QuickControl label="Reduce motion" />
                                </div>
                                <div className="hint">These are stubs; we’ll wire them to `/api` later.</div>
                            </div>
                        )}

                        {activeTab === 'mirai' && (
                            <div className="mirai panel--glass">
                                <div className="chat__header" ref={historyRef}>
                                    <div className="chat__title">
                                        {miraiConversationTitle || (miraiConversationId ? `Conversation #${miraiConversationId}` : 'New Conversation')}
                                    </div>
                                    <div className="chat__header-actions">
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => { setMiraiConversationId(null); setMiraiMessages([]); setMiraiConversationTitle(null) }}
                                            title="Start a new conversation"
                                        >
                                            <span className="icon-btn__glyph" aria-hidden>➕</span>
                                            <span>New</span>
                                        </button>
                                        <button type="button" className="btn chat__history-btn" onClick={openHistory} aria-haspopup="menu" aria-expanded={isHistoryOpen}>
                                            <span className="icon-btn__glyph" aria-hidden>🕘</span>
                                            <span>History</span>
                                        </button>
                                        {isHistoryOpen && (
                                            <div className="history-menu" role="menu">
                                                {historyLoading && <div className="history-item history-item--muted">Loading…</div>}
                                                {historyError && <div className="history-item history-item--error">{historyError}</div>}
                                                {!historyLoading && !historyError && historyItems.length === 0 && (
                                                    <div className="history-item history-item--muted">No conversations yet</div>
                                                )}
                                                {!historyLoading && !historyError && historyItems.map((it) => (
                                                    <button key={it.id} type="button" className="history-item" role="menuitem" onClick={() => selectConversation(it.id)}>
                                                        <span className="history-item__title">{it.title || `Conversation #${it.id}`}</span>
                                                        <span className="history-item__meta">{it.message_count} msgs</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <MiraiChat
                                    messages={miraiMessages}
                                    setMessages={setMiraiMessages}
                                    conversationId={miraiConversationId}
                                    setConversationId={setMiraiConversationId}
                                    setConversationTitle={setMiraiConversationTitle}
                                />
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <div className="backdrop" />
            {isHealthOpen && (
                <div className="modal" role="dialog" aria-modal="true" aria-labelledby="health-title">
                    <div className="modal__backdrop" onClick={() => setIsHealthOpen(false)} />
                    <div className="modal__dialog panel panel--glass">
                        <div className="modal__header">
                            <h3 id="health-title" className="modal__title">Server health</h3>
                            <div className="modal__actions">
                                <button className="btn" onClick={fetchHealth} disabled={healthLoading}>
                                    {healthLoading ? 'Checking…' : 'Refresh'}
                                </button>
                                <button className="icon-btn" aria-label="Close" onClick={() => setIsHealthOpen(false)}>
                                    <span className="icon-btn__glyph">×</span>
                                </button>
                            </div>
                        </div>
                        <div className="modal__body">
                            {healthError && (
                                <div className="alert alert--error">Error: {healthError}</div>
                            )}
                            {!healthError && (
                                <div className="health-grid">
                                    <div className="health-row">
                                        <span className="health-label">Status</span>
                                        <span className="health-value">
                                            <span className={`status-dot ${isStatusOk(healthData) ? 'status-dot--ok' : 'status-dot--bad'}`} />
                                            {isStatusOk(healthData) ? 'OK' : 'Unavailable'}
                                        </span>
                                    </div>
                                    <div className="health-row">
                                        <span className="health-label">Raw</span>
                                        <pre className="health-pre">{formatJson(healthData)}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Card({ title, body, sources, tone }: { title: string; body: string; sources: { name: string; url: string }[]; tone?: 'info' | 'action' | 'neutral' }) {
    return (
        <article className={`card card--${tone || 'neutral'} panel--glass`}>
            <div className="card__header">
                <h3>{title}</h3>
                <div className="chips">
                    {tone === 'info' && <span className="chip">Info</span>}
                    {tone === 'action' && <span className="chip chip--action">Action</span>}
                </div>
            </div>
            <p className="card__body">{body}</p>
            <div className="card__footer">
                {sources.map((s, i) => (
                    <a key={i} href={s.url} className="source">{s.name}</a>
                ))}
            </div>
        </article>
    )
}

function TranscriptRow({ who, text }: { who: string; text: string }) {
    return (
        <div className="row">
            <span className="who">{who}</span>
            <span className="text">{text}</span>
        </div>
    )
}

function QuickControl({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
    return (
        <label className="switch switch--lg">
            <input type="checkbox" defaultChecked={defaultChecked} />
            <span className="slider" />
            <span className="label">{label}</span>
        </label>
    )
}

function isStatusOk(data: unknown): boolean {
    try {
        if (data && typeof data === 'object' && 'status' in data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status = (data as any).status
            return String(status).toLowerCase() === 'ok'
        }
        return false
    } catch {
        return false
    }
}

function formatJson(data: unknown): string {
    try {
        return JSON.stringify(data ?? {}, null, 2)
    } catch {
        return String(data)
    }
}

// ChatMessage type declared at top of file

function MiraiChat({
    messages,
    setMessages,
    conversationId,
    setConversationId,
    setConversationTitle,
}: {
    messages: ChatMessage[]
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
    conversationId: number | null
    setConversationId: React.Dispatch<React.SetStateAction<number | null>>
    setConversationTitle: React.Dispatch<React.SetStateAction<string | null>>
}) {
    const [input, setInput] = React.useState('')
    const [isSending, setIsSending] = React.useState(false)
    const controllerRef = React.useRef<AbortController | null>(null)
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
    const maxHeightRef = React.useRef<number>(0)
    const minHeightRef = React.useRef<number>(0)

    async function sendMessage(e?: React.FormEvent) {
        e?.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || isSending) return
        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
        const nextHistory = [...messages, userMsg]
        setMessages(nextHistory)
        setInput('')
        setIsSending(true)

        const aborter = new AbortController()
        controllerRef.current = aborter
        try {
            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    // Use 0 to request a new conversation; server returns the id
                    conversation_id: conversationId ?? 0,
                    // Only send the newly entered user message; backend loads full history
                    messages: [{ role: 'user', content: trimmed }],
                }),
                signal: aborter.signal,
            })
            if (!res.ok || !res.body) {
                throw new Error(`HTTP ${res.status}`)
            }

            // Capture conversation id from response header if present
            const headerConvId = res.headers.get('X-Conversation-Id')
            if (headerConvId) {
                const parsed = Number(headerConvId)
                if (!Number.isNaN(parsed) && parsed > 0) {
                    setConversationId(parsed)
                }
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' }
            setMessages(prev => [...prev, assistant])

            // Handle OpenAI-style SSE stream: lines beginning with "data: {json}"
            let buffer = ''
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split(/\n/)
                buffer = lines.pop() || ''
                for (const line of lines) {
                    const trimmedLine = line.trim()
                    if (!trimmedLine.startsWith('data:')) continue
                    const data = trimmedLine.slice(5).trim()
                    if (data === '[DONE]') {
                        buffer = ''
                        break
                    }
                    try {
                        const json = JSON.parse(data)
                        // Capture conversation id from initial meta event if provided
                        const metaConvId = json?.meta?.conversation_id
                        if (typeof metaConvId === 'number' && metaConvId > 0) {
                            setConversationId(prev => (prev && prev > 0 ? prev : metaConvId))
                        }
                        // Surface upstream/provider error payloads
                        if (json && json.error && (json.error.message || json.message)) {
                            const msg = (json.error.message || json.message || 'Upstream provider error') as string
                            setMessages(prev => [
                                ...prev,
                                { id: crypto.randomUUID(), role: 'assistant', content: `Provider error: ${msg}` },
                            ])
                            continue
                        }
                        const delta = json.choices?.[0]?.delta?.content || ''
                        const messageContent = json.choices?.[0]?.message?.content || ''
                        const piece = delta || messageContent || ''
                        if (piece) {
                            assistant = { ...assistant, content: assistant.content + piece }
                            setMessages(prev => prev.map(m => (m.id === assistant.id ? assistant : m)))
                        }
                    } catch { }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return // Gracefully handle cancellation
            }
            const errorMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err?.message || err}` }
            setMessages(prev => [...prev, errorMsg])
        } finally {
            setIsSending(false)
            controllerRef.current = null
            // After stream completes or fails, try to refresh the title if we have an id
            try {
                const id = (typeof conversationId === 'number' && conversationId > 0) ? conversationId : null
                if (id) {
                    const r = await fetch(`/api/chat/conversations/${id}`, { credentials: 'include' })
                    if (r.ok) {
                        const d = await r.json()
                        if (d && typeof d.title === 'string' && d.title.trim()) {
                            setConversationTitle(d.title)
                        }
                    }
                }
            } catch { }
        }
    }

    function stopStream() {
        controllerRef.current?.abort()
    }

    function autosize() {
        const el = textareaRef.current
        if (!el) return
        // Initialize min/max heights once based on computed line-height + paddings
        if (!maxHeightRef.current || !minHeightRef.current) {
            const cs = getComputedStyle(el)
            const lh = parseFloat(cs.lineHeight) || 20
            const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
            minHeightRef.current = Math.round(lh * 3 + pad)
            maxHeightRef.current = Math.round(lh * 7 + pad)
        }
        el.style.height = 'auto'
        const next = Math.min(maxHeightRef.current, Math.max(minHeightRef.current, el.scrollHeight))
        el.style.height = `${next}px`
        el.style.overflowY = el.scrollHeight > maxHeightRef.current ? 'auto' : 'hidden'
    }

    React.useEffect(() => {
        autosize()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    React.useEffect(() => {
        autosize()
    }, [input])

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    return (
        <div className="chat">
            <div className="chat__messages">
                {messages.length === 0 && (
                    <div className="chat__empty">Ask anything. Backend is now connected.</div>
                )}
                {messages.map(m => (
                    <div key={m.id} className={`chat__bubble chat__bubble--${m.role}`}>
                        <div className="chat__role">{m.role}</div>
                        <div className="chat__content">{m.content}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form className="chat__composer" onSubmit={sendMessage}>
                <textarea
                    ref={textareaRef}
                    className="chat__textarea"
                    placeholder="Message Mirai..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onInput={autosize}
                    onKeyDown={(e) => {
                        if (!isSending && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            sendMessage()
                        }
                    }}
                    rows={3}
                />
                <button type="button" className="btn btn--icon chat__mic" aria-label="Record audio">🎤</button>
                <div className="chat__actions">
                    {isSending ? (
                        <button type="button" className="btn" onClick={stopStream}>Stop</button>
                    ) : (
                        <button type="submit" className="btn btn--primary" disabled={!input.trim()}>Send</button>
                    )}
                </div>
            </form>
        </div>
    )
}
