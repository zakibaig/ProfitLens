import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, X, Minimize2, Maximize2, Sparkles, RefreshCw, ChevronRight } from 'lucide-react'

const SUGGESTIONS = [
  ['📊', 'Give me a portfolio summary'],
  ['⚠️', 'Which projects are at risk?'],
  ['📉', 'Show worst 5 projects'],
  ['📈', 'Show best performing projects'],
  ['📅', 'Show quarterly trend'],
  ['🔮', 'Forecast next 3 months'],
  ['📋', 'Generate a full report'],
  ['📍', 'Break down by location'],
  ['🔧', 'Break down by service line'],
  ['👥', 'Break down by band'],
  ['🚨', 'Which projects are over budget?'],
  ['💰', 'Largest projects by cost'],
]

function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .split('\n')
    .map(line => {
      line = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>')
      if (/^━+/.test(line)) return `<div style="border-top:1px solid #e2e8f0;margin:6px 0;opacity:.5"></div>`
      return line
    })
    .join('<br/>')
}

export function AgentPanel({ isOpen, onClose, inline=false }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: '👋 Hi! I\'m your **Profitability Agent**.\n\nI can answer questions about your portfolio in plain English — margins, trends, risks, project details and more.\n\nTry one of the suggestions below, or just ask naturally!',
      ts: Date.now()
    }
  ])
  const [input,     setInput]    = useState('')
  const [loading,   setLoading]  = useState(false)
  const [minimised, setMin]      = useState(false)
  const bottomRef  = useRef()
  const inputRef   = useRef()

  useEffect(() => {
    if (isOpen && !minimised) setTimeout(() => inputRef.current?.focus(), 120)
  }, [isOpen, minimised])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }])
    setLoading(true)
    try {
      const res  = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', text: data.reply || data.detail || 'No response', ts: Date.now() }])
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', text: '⚠️ Connection error. Is the server running?', ts: Date.now(), error: true }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const clear = () => setMessages([{ role: 'assistant', text: 'Chat cleared. What would you like to know?', ts: Date.now() }])

  if (!isOpen) return null

  return (
    <div style={{
      position: inline ? 'relative' : 'fixed',
      right: inline ? undefined : 0,
      top: inline ? undefined : 0,
      bottom: inline ? undefined : 0,
      zIndex: inline ? 1 : 200,
      width: inline ? '100%' : (minimised ? 52 : 420),
      height: inline ? '100%' : undefined,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      borderLeft: inline ? 'none' : '1px solid var(--border)',
      boxShadow: inline ? 'none' : '-4px 0 32px rgba(0,0,0,.1)',
      fontFamily: "'DM Sans',sans-serif",
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: minimised ? '12px 8px' : '12px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, #0891b2 0%, #3b82f6 100%)',
        flexShrink: 0,
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={16} color="white"/>
        </div>
        {!minimised && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'white' }}>Profitability Agent</div>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,.75)' }}>● Local · No data leaves your machine</div>
            </div>
            <button onClick={clear} title="Clear chat"
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', color: 'white',
                padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <RefreshCw size={13}/>
            </button>
          </>
        )}
        <button onClick={() => setMin(m => !m)}
          style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', color: 'white',
            padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          {minimised ? <Maximize2 size={14}/> : <Minimize2 size={14}/>}
        </button>
        <button onClick={onClose}
          style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', color: 'white',
            padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          <X size={14}/>
        </button>
      </div>

      {/* Minimised dots */}
      {minimised && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, gap: 8 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }}/>)}
        </div>
      )}

      {!minimised && <>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8,
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>

              <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: m.role === 'user' ? '#dbeafe' : 'linear-gradient(135deg,#0891b2,#3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {m.role === 'user'
                  ? <User size={13} style={{ color: '#1d4ed8' }}/>
                  : <Sparkles size={12} color="white"/>}
              </div>

              <div style={{
                maxWidth: '84%',
                background: m.role === 'user' ? '#eff6ff' : m.error ? '#fef2f2' : '#f8fafc',
                border: `1px solid ${m.role==='user'?'#bfdbfe':m.error?'#fecaca':'#e2e8f0'}`,
                borderRadius: m.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                padding: '9px 13px', fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text)',
              }}>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}/>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 5,
                  textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 26, height: 26, borderRadius: 6,
                background: 'linear-gradient(135deg,#0891b2,#3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={12} color="white"/>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: '4px 12px 12px 12px', padding: '10px 14px',
                display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#0891b2',
                    animation: 'bounce 1.2s infinite', animationDelay: `${i*0.2}s` }}/>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Suggestions — shown on first load */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)',
              letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>
              Try asking…
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.slice(0, 8).map(([emoji, s]) => (
                <button key={s} onClick={() => send(s)}
                  style={{ fontSize: '0.75rem', padding: '6px 10px', borderRadius: 7,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7,
                    transition: 'all .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0891b2'; e.currentTarget.style.background = '#f0f9ff' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)' }}
                >
                  <span style={{ fontSize: '0.85rem' }}>{emoji}</span>
                  <span style={{ flex: 1 }}>{s}</span>
                  <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
          background: 'var(--surface)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about margins, trends, risks…"
            rows={1}
            style={{ flex: 1, resize: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 11px', fontSize: '0.78rem',
              fontFamily: "'DM Sans',sans-serif", background: '#f8fafc',
              color: 'var(--text)', outline: 'none', lineHeight: 1.45,
              maxHeight: 100, overflowY: 'auto', transition: 'border-color .15s' }}
            onFocus={e => e.target.style.borderColor = '#0891b2'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            style={{ width: 36, height: 36, borderRadius: 8, border: 'none', flexShrink: 0,
              background: input.trim() && !loading ? 'linear-gradient(135deg,#0891b2,#3b82f6)' : '#e2e8f0',
              color: 'white', cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .15s', boxShadow: input.trim() ? '0 2px 8px rgba(8,145,178,.3)' : 'none' }}>
            <Send size={14}/>
          </button>
        </div>

        <style>{`
          @keyframes bounce {
            0%,80%,100%{transform:translateY(0)}
            40%{transform:translateY(-5px)}
          }
        `}</style>
      </>}
    </div>
  )
}
