import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, X, RefreshCw } from 'lucide-react'

const STAGES = [
  { key: 'select',   label: 'File Selected',        pct: 0   },
  { key: 'upload',   label: 'Uploading to server',  pct: 15  },
  { key: 'reading',  label: 'Opening workbook / reading Sheet 1', pct: 30  },
  { key: 'parsing',  label: 'Parsing Sheet 1 rows',  pct: 50  },
  { key: 'actuals',  label: 'Processing actuals',   pct: 65  },
  { key: 'merging',  label: 'Merging & computing',  pct: 80  },
  { key: 'building', label: 'Building dashboard',   pct: 92  },
  { key: 'done',     label: 'Ready!',               pct: 100 },
]

export function UploadPanel({ onSuccess }) {
  const [file,     setFile]     = useState(null)
  const [stage,    setStage]    = useState('select')
  const [pct,      setPct]      = useState(0)
  const [msg,      setMsg]      = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [animPct,  setAnimPct]  = useState(0)  // smooth animation target
  const fileRef = useRef()
  const pollRef = useRef()

  // Animate progress bar smoothly
  useEffect(() => {
    if (animPct < pct) {
      const t = setTimeout(() => setAnimPct(p => Math.min(p + 1, pct)), 18)
      return () => clearTimeout(t)
    }
  }, [animPct, pct])

  const goStage = (key) => {
    const s = STAGES.find(s => s.key === key)
    if (s) { setStage(s.key); setPct(s.pct); setMsg(s.label) }
  }

  const upload = async () => {
    if (!file) { setError('Please select a Fixed Projects or All Projects Excel file'); return }
    setLoading(true); setError(null); setAnimPct(0)

    try {
      goStage('upload')

      // Use XMLHttpRequest to track upload progress
      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const fd  = new FormData()
        fd.append('combined_file', file)

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const uploadPct = Math.round((e.loaded / e.total) * 100)
            // Map upload progress to 15–30% of total
            const mapped = 15 + Math.round(uploadPct * 0.15)
            setPct(mapped)
            setMsg(`Uploading… ${uploadPct}%`)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText || '{}')) }
            catch { resolve({}) }
          }
          else reject(new Error(`Server error ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))

        xhr.open('POST', '/api/upload')
        xhr.send(fd)
      })

      if (uploadResult?.dashboard === 'allProjects') {
        goStage('done')
        setMsg(uploadResult.detail || '✓ All Projects workbook loaded')
        setTimeout(() => {
          setLoading(false)
          onSuccess(uploadResult)
        }, 800)
        return
      }

      goStage('reading')

      // Poll /api/parse-status and /api/status for background worker progress
      let attempts = 0
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          attempts++
          try {
            const [ps, st] = await Promise.all([
              fetch('/api/parse-status').then(r => r.json()).catch(() => null),
              fetch('/api/status').then(r => r.json()).catch(() => null),
            ])

            const progress = ps?.progress || ''
            const merged   = st?.merged_rows || 0
            const projects = st?.projects || []

            // Map worker progress messages to stages
            if (progress.includes('Reading Excel') || progress.includes('Loading from cache')) {
              goStage('reading')
            } else if (progress.includes('Converting') || progress.includes('Cached CSV')) {
              goStage('parsing')
            } else if (progress.includes('Processing') || progress.includes('budget')) {
              goStage('actuals')
            } else if (merged > 0 && ps?.loading !== false) {
              goStage('merging')
            }

            // Show server message as subtitle
            if (progress) setMsg(progress)

            // Done when loading finished (worker completed)
            if (ps?.loading === false && attempts > 2) {
              clearInterval(pollRef.current)
              if (merged === 0) {
                // Worker finished but no rows — likely category/column mismatch
                const errMsg = ps?.progress?.includes('WARNING') ? ps.progress :
                  `No data rows found. Check that the selected workbook matches the dashboard type. Last status: ${ps?.progress || 'unknown'}`
                reject(new Error(errMsg))
              } else {
                goStage('building')
                setTimeout(() => {
                  goStage('done')
                  setMsg(`✓ ${projects.length} projects · ${merged.toLocaleString()} rows loaded`)
                  setTimeout(() => {
                    setLoading(false)
                    onSuccess(st)
                  }, 800)
                }, 600)
                resolve()
              }
            } else if (attempts > 180) {  // 3 min timeout
              clearInterval(pollRef.current)
              reject(new Error('Processing timed out — please try again'))
            }
          } catch(e) {
            // ignore transient poll errors
          }
        }, 1000)
      })

    } catch(e) {
      clearInterval(pollRef.current)
      setError(e.message)
      setStage('select')
      setPct(0)
      setAnimPct(0)
      setLoading(false)
    }
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  const stageIdx  = STAGES.findIndex(s => s.key === stage)
  const isDone    = stage === 'done'
  const isLoading = loading && !isDone

  return (
    <div style={{maxWidth:520,margin:'0 auto',display:'flex',flexDirection:'column',gap:'1rem'}}>

      {/* Drop zone — hidden while loading */}
      {!isLoading && !isDone && (
        <div
          style={{
            border:`2px dashed ${file?'#0891b2':'#e2e8f0'}`,
            borderRadius:12,padding:'2rem 1.5rem',textAlign:'center',cursor:'pointer',
            background:file?'#f0f9ff':'#f8fafc',transition:'all .2s',
          }}
          onClick={()=>fileRef.current.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f)}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={e=>{if(e.target.files[0])setFile(e.target.files[0])}}/>
          {file ? (
            <>
              <CheckCircle size={28} style={{color:'#059669',margin:'0 auto 8px',display:'block'}}/>
              <p style={{margin:0,fontSize:'0.88rem',color:'#059669',fontWeight:700}}>{file.name}</p>
              <p style={{margin:'4px 0 0',fontSize:'0.72rem',color:'#64748b'}}>
                {(file.size/1024/1024).toFixed(1)} MB — click to change
              </p>
            </>
          ) : (
            <>
              <FileSpreadsheet size={32} style={{color:'#94a3b8',margin:'0 auto 10px',display:'block'}}/>
              <p style={{margin:0,fontSize:'0.9rem',fontWeight:700,color:'#1e293b'}}>Upload Fixed or All Projects Excel</p>
              <p style={{margin:'6px 0 0',fontSize:'0.75rem',color:'#64748b'}}>
                Click or drag & drop Fixed Projects or All Projects workbook
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Progress panel — shown while loading ── */}
      {(isLoading || isDone) && (
        <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,
          padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1.25rem',
          boxShadow:'0 4px 24px rgba(0,0,0,.06)'}}>

          {/* File name */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <FileSpreadsheet size={20} style={{color:'#0891b2',flexShrink:0}}/>
            <div>
              <div style={{fontWeight:700,fontSize:'0.84rem',color:'#1e293b'}}>{file?.name}</div>
              <div style={{fontSize:'0.7rem',color:'#64748b'}}>{file?(file.size/1024/1024).toFixed(1)+' MB':''}</div>
            </div>
          </div>

          {/* Big progress bar */}
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#1e293b'}}>{msg}</span>
              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#0891b2'}}>{animPct}%</span>
            </div>
            <div style={{height:10,background:'#f1f5f9',borderRadius:999,overflow:'hidden'}}>
              <div style={{
                height:'100%',
                width:`${animPct}%`,
                borderRadius:999,
                transition:'width .08s linear',
                background: isDone
                  ? 'linear-gradient(90deg,#059669,#10b981)'
                  : 'linear-gradient(90deg,#0891b2,#3b82f6)',
                boxShadow: isDone ? '0 0 8px rgba(5,150,105,.4)' : '0 0 8px rgba(8,145,178,.3)',
              }}/>
            </div>
          </div>

          {/* Stage steps */}
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {STAGES.filter(s=>s.key!=='select'&&s.key!=='done').map((s,i) => {
              const si = STAGES.findIndex(x=>x.key===s.key)
              const done  = si < stageIdx || isDone
              const active = si === stageIdx && !isDone
              return (
                <div key={s.key} style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{
                    width:16,height:16,borderRadius:'50%',flexShrink:0,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background: done||isDone ? '#059669' : active ? '#0891b2' : '#e2e8f0',
                    transition:'background .3s',
                  }}>
                    {done||isDone
                      ? <svg width="9" height="7" viewBox="0 0 9 7"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      : active
                        ? <div style={{width:5,height:5,borderRadius:'50%',background:'white',animation:'pulse 1s ease-in-out infinite'}}/>
                        : null}
                  </div>
                  <span style={{
                    fontSize:'0.72rem',
                    color: done||isDone ? '#059669' : active ? '#0891b2' : '#94a3b8',
                    fontWeight: active ? 700 : 400,
                    transition:'color .3s',
                  }}>{s.label}</span>
                  {active && <RefreshCw size={10} style={{color:'#0891b2',animation:'spin 1s linear infinite'}}/>}
                </div>
              )
            })}
          </div>

          {isDone && (
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,
              padding:'10px 14px',fontSize:'0.8rem',color:'#15803d',fontWeight:600,
              display:'flex',alignItems:'center',gap:8}}>
              <CheckCircle size={16}/>
              {msg}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,
          padding:'10px 14px',display:'flex',gap:8,alignItems:'flex-start'}}>
          <AlertCircle size={16} style={{color:'#dc2626',flexShrink:0,marginTop:1}}/>
          <div style={{flex:1}}>
            <p style={{margin:0,fontSize:'0.82rem',color:'#b91c1c',fontWeight:600}}>Upload failed</p>
            <p style={{margin:'2px 0 0',fontSize:'0.78rem',color:'#dc2626'}}>{error}</p>
          </div>
          <button onClick={()=>setError(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',padding:0}}><X size={14}/></button>
        </div>
      )}

      {/* Upload button — only shown when not loading */}
      {!isLoading && !isDone && (
        <button onClick={upload} disabled={!file}
          style={{width:'100%',padding:'11px',fontSize:'0.88rem',
            background: file ? 'linear-gradient(135deg,#0891b2,#3b82f6)' : '#e2e8f0',
            color: file ? 'white' : '#94a3b8',
            border:'none',borderRadius:8,cursor:file?'pointer':'not-allowed',
            fontFamily:"'DM Sans',sans-serif",fontWeight:700,
            display:'flex',alignItems:'center',justifyContent:'center',gap:7,
            transition:'all .2s'}}>
          <Upload size={15}/> Upload & Process
        </button>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  )
}
