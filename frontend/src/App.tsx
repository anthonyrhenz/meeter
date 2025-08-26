import React, { useMemo, useState } from 'react'

type TabKey = 'overlay' | 'transcript' | 'controls'

export default function App() {
    const [activeTab, setActiveTab] = useState<TabKey>('overlay')
    const now = useMemo(() => new Date().toLocaleTimeString(), [])

    return (
        <div className="app-root">
            <div className="titlebar" data-tauri-drag-region>
                <div className="titlebar__left" data-tauri-drag-region>
                    <div className="titlebar__brand" data-tauri-drag-region>
                        <span className="brand-dot" />
                        <span className="brand">Meeter</span>
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
                    </div>
                </section>
            </main>

            <div className="backdrop" />
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
