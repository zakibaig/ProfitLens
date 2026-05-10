import { useState, useEffect, useRef } from 'react'
import { api, fmt } from './utils/api'
import { FilterBar } from './components/FilterBar'
import { TrendChart, MarginTrendChart } from './components/TrendChart'
import { GroupedBarChart, MarginBarChart } from './components/BarCharts'
import { ProjectTable, ServiceLineView, OpportunityRollupView, DrilldownReport, ResourceCountMonthly, TcvRevenueQuarterly } from './components/DrillTables'
import { UploadPanel } from './components/UploadPanel'
import { AgentPanel } from './components/AgentPanel'
import { BarChart2, Upload, RefreshCw, Sparkles } from 'lucide-react'
import { PortfolioSummary } from './components/PortfolioSummary'
import './index.css'

// ── Serialize active filters for API query string ─────────────────────────────
// Arrays  → comma-joined string  e.g. ['A','B'] → 'A,B'
// null    → omitted
// strings → passed as-is
function toQS(active) {
  const out = {}
  for (const [k, v] of Object.entries(active)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) { if (v.length > 0) out[k] = v.join(',') }
    else if (v !== '') out[k] = v
  }
  return out
}


function formatDuration(ms) {
  const n = Math.max(0, Math.round((Number(ms || 0)) / 1000))
  if (n < 60) return `${n}s`
  const m = Math.floor(n / 60)
  const sec = n % 60
  return `${m}m ${String(sec).padStart(2,'0')}s`
}
function sheetLabel(sheet) {
  if (!sheet) return 'Waiting…'
  const parts = []
  if (sheet.name) parts.push(sheet.name)
  if (sheet.status) parts.push(sheet.status)
  const rows = sheet.records ?? sheet.approxRows
  if (rows != null && rows !== '') parts.push(`${Number(rows || 0).toLocaleString()} rows`)
  if (sheet.budgetRows != null || sheet.actualRows != null) parts.push(`${Number(sheet.budgetRows || 0).toLocaleString()} budget / ${Number(sheet.actualRows || 0).toLocaleString()} actual`)
  return parts.join(' · ') || 'Waiting…'
}

const EMPTY = {
  project: null, project_group: null, opp_name: null,
  band: null, service_line: null, sl_group: null, location: null,
  period_from: null, period_to: null,
  quarter_from: null, quarter_to: null,
  years: null, quarters: null,
  end_year: null, closed_year: null,
  project_status: null,
  rag: null,
}

export default function App() {
  const [ready,      setReady]      = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [filterOpts, setFilterOpts] = useState(null)
  const [active,     setActive]     = useState(EMPTY)
  const [gran,       setGran]       = useState('month')
  const [summary,    setSummary]    = useState(null)
  const [projData,   setProjData]   = useState([])
  const [trend,      setTrend]      = useState([])
  const [bandData,   setBandData]   = useState([])
  const [slData,     setSlData]     = useState([])
  const [locData,    setLocData]    = useState([])
  const [serviceLineView, setServiceLineView] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [tab,        setTab]        = useState('overview')
  const [dashboardMode, setDashboardMode] = useState('fixed')
  const [agentOpen,  setAgentOpen]  = useState(false)
  const [healthThresholds, setHealthThresholds] = useState({ off: 25, risk: 35 })
  const seq = useRef(0)

  // ── Load all dashboard data for given filters ──────────────────────────────
  async function load(filters, granularity, thresholds = healthThresholds) {
    const id = ++seq.current
    setLoading(true)
    const p  = {
      ...toQS(filters),
      health_off_track_lt: thresholds.off,
      health_at_risk_lt: thresholds.risk,
    }
    const tp = granularity === 'quarter' ? { ...p, granularity: 'quarter' } : p
    try {
      const [s, proj, tr, bd, sl, loc, slv] = await Promise.all([
        api.summary(p),
        api.byProject(p),
        api.trend(tp),
        api.byBand(p),
        api.byServiceLine(p),
        api.byLocation(p),
        api.serviceLineView(p),
      ])
      if (id !== seq.current) return
      setSummary(s); setProjData(Array.isArray(proj) ? proj : []); setTrend(tr)
      setBandData(bd); setSlData(sl); setLocData(loc); setServiceLineView(Array.isArray(slv) ? slv : [])
    } catch (e) { console.error('load error', e) }
    if (id === seq.current) setLoading(false)
  }

  const [startupMsg,  setStartupMsg]  = useState('Connecting…')
  const [startupPct,  setStartupPct]  = useState(0)
  const [startupMeta, setStartupMeta] = useState({ sheet1:null, sheet2:null, elapsedMs:0, etaMs:0, recordsLoaded:0, fileSizeMb:0 })
  const [startupDone, setStartupDone] = useState(false)
  const startupRef = useRef(null)

  useEffect(() => {
    let attempts = 0
    startupRef.current = setInterval(async () => {
      attempts++
      try {
        const [s, ps] = await Promise.all([
          fetch('/api/status').then(r=>r.json()).catch(()=>null),
          fetch('/api/parse-status').then(r=>r.json()).catch(()=>null),
        ])

        const merged   = s?.merged_rows || 0
        const progress = ps?.progress   || ''
        const loading  = ps?.loading    ?? true
        const elapsedMs = ps?.elapsedMs ?? (ps?.startedAt ? Date.now() - ps.startedAt : 0)
        const etaMs = ps?.etaMs ?? 0
        const pctFromServer = Number(ps?.pct)
        if (Number.isFinite(pctFromServer) && pctFromServer > 0) setStartupPct(Math.min(99, Math.max(0, Math.round(pctFromServer))))
        else if (merged > 0) setStartupPct(90)

        setStartupMeta({
          sheet1: ps?.sheet1 || null,
          sheet2: ps?.sheet2 || null,
          elapsedMs,
          etaMs,
          recordsLoaded: ps?.recordsLoaded || merged || 0,
          fileSizeMb: ps?.fileSizeMb || 0,
        })
        setStartupMsg(progress || (merged > 0 ? `${merged.toLocaleString()} rows loaded` : 'Starting…'))

        if (merged > 0 && loading === false) {
          clearInterval(startupRef.current)
          setStartupPct(100)
          setStartupMeta(prev => ({...prev, etaMs:0, recordsLoaded:merged, sheet1:{...(prev.sheet1||{}), status:'Done'}, sheet2:{...(prev.sheet2||{}), status:(prev.sheet2&&prev.sheet2.status)||'Available separately'}}))
          setStartupMsg(`✓ ${s.projects?.length || ''} projects · ${merged.toLocaleString()} rows`)
          setStartupDone(true)
          setTimeout(() => {
            setReady(true)
            api.filters().then(setFilterOpts)
            load(EMPTY, 'month')
          }, 600)
        } else if (!loading && merged === 0 && attempts > 3) {
          // Server ready but no data - show upload screen
          clearInterval(startupRef.current)
          setStartupDone(true)
          setTimeout(() => setReady(false), 400)
        }
      } catch(e) { /* retry */ }
    }, 800)
    return () => clearInterval(startupRef.current)
  }, [])

  // ── Filter change — build next state then immediately load ─────────────────
  function changeFilter(key, val) {
    setActive(prev => {
      const next = { ...prev, [key]: val }
      setTimeout(() => load(next, gran), 0)
      return next
    })
  }

  function changeFilters(patch, nextGran = gran) {
    setActive(prev => {
      const next = { ...prev, ...patch }
      setTimeout(() => load(next, nextGran), 0)
      return next
    })
  }

  function changeGran(g) {
    setGran(g)
    setActive(prev => {
      const next = { ...prev, period_from: null, period_to: null, quarter_from: null, quarter_to: null, years: null, quarters: null }
      setTimeout(() => load(next, g), 0)
      return next
    })
  }

  function resetFilters() {
    setActive(EMPTY)
    setTimeout(() => load(EMPTY, gran), 0)
  }

  function onUpload() {
    setShowUpload(false); setReady(true)
    api.filters().then(setFilterOpts)
    load(EMPTY, gran)
  }

  // ── Startup loading screen ────────────────────────────────────────────────
  if (!startupDone) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'#f8fafc',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:560,display:'flex',flexDirection:'column',gap:'1rem',
        background:'white',border:'1px solid #e2e8f0',borderRadius:14,
        padding:'2rem 2rem 1.75rem',boxShadow:'0 8px 32px rgba(0,0,0,.08)'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,
            background:'linear-gradient(135deg,#0891b2,#3b82f6)',
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/>
            </svg>
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontWeight:800,fontSize:'1rem',color:'#1e293b'}}>ProfitLensV#</div>
              {startupPct < 100 && <div style={{width:14,height:14,border:'2px solid #cbd5e1',borderTopColor:'#0891b2',borderRadius:'50%',animation:'plSpin .8s linear infinite'}}/>}
            </div>
            <div style={{fontSize:'0.72rem',color:'#64748b',marginTop:1}}>
              {startupPct === 100 ? 'Ready!' : 'Loading your data…'}
            </div>
            <style>{`@keyframes plSpin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:'0.75rem',color:'#475569',fontWeight:600,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:340}}>{startupMsg}</span>
            <span style={{fontSize:'0.75rem',fontWeight:800,color:'#0891b2',flexShrink:0,marginLeft:8}}>{startupPct}%</span>
          </div>
          <div style={{height:8,background:'#f1f5f9',borderRadius:999,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:999,
              transition:'width .4s ease',width:`${startupPct}%`,
              background:startupPct===100?'linear-gradient(90deg,#059669,#10b981)':'linear-gradient(90deg,#0891b2,#3b82f6)',
              boxShadow:startupPct===100?'0 0 8px rgba(5,150,105,.4)':'0 0 8px rgba(8,145,178,.3)',
            }}/>
          </div>
        </div>

        {/* Sheet status + ETA */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div style={{border:'1px solid #e2e8f0',borderRadius:10,padding:'9px 10px',background:'#f8fafc'}}>
            <div style={{fontSize:'0.62rem',fontWeight:900,color:'#0891b2',textTransform:'uppercase',letterSpacing:'.06em'}}>Sheet 1 · Fixed dashboard</div>
            <div title={sheetLabel(startupMeta.sheet1)} style={{fontSize:'0.72rem',fontWeight:800,color:'#1e293b',marginTop:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sheetLabel(startupMeta.sheet1)}</div>
          </div>
          <div style={{border:'1px solid #e2e8f0',borderRadius:10,padding:'9px 10px',background:'#f8fafc'}}>
            <div style={{fontSize:'0.62rem',fontWeight:900,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'.06em'}}>Sheet 2 · All Types</div>
            <div title={sheetLabel(startupMeta.sheet2)} style={{fontSize:'0.72rem',fontWeight:800,color:'#1e293b',marginTop:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sheetLabel(startupMeta.sheet2)}</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {[
            ['Records', Number(startupMeta.recordsLoaded || 0).toLocaleString()],
            ['Elapsed', formatDuration(startupMeta.elapsedMs)],
            ['Est. remaining', startupPct >= 100 ? '0s' : formatDuration(startupMeta.etaMs)],
          ].map(([l,v]) => <div key={l} style={{border:'1px solid #e2e8f0',borderRadius:9,padding:'7px 9px',background:'white'}}>
            <div style={{fontSize:'0.58rem',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>{l}</div>
            <div style={{fontSize:'0.82rem',fontWeight:900,color:'#0f172a',marginTop:2}}>{v}</div>
          </div>)}
        </div>

        {/* Stage steps */}
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {[
            {label:'Opening workbook',        done:startupPct>=24},
            {label:'Loading Sheet 1',        done:startupPct>=55},
            {label:'Sheet 2 detected',       done:startupMeta.sheet2?.status && startupMeta.sheet2.status !== 'Pending' && startupMeta.sheet2.status !== 'Waiting for workbook open'},
            {label:'Processing actuals',     done:startupPct>=75},
            {label:'Building dashboard',     done:startupPct>=90},
          ].map(({label,done})=>(
            <div key={label} style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:14,height:14,borderRadius:'50%',flexShrink:0,
                display:'flex',alignItems:'center',justifyContent:'center',
                background:done?'#059669':'#e2e8f0',transition:'background .3s'}}>
                {done && <svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
              </div>
              <span style={{fontSize:'0.71rem',color:done?'#059669':'#94a3b8',fontWeight:done?600:400,transition:'color .3s'}}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{fontSize:'0.65rem',color:'#94a3b8',borderTop:'1px solid #f1f5f9',paddingTop:'0.75rem'}}>
          First refresh opens the Fixed Projects workbook, loads Sheet 1, and writes a compact cache. All Projects uses its own workbook and cache.
        </div>
      </div>
    </div>
  )

  // ── Upload splash ──────────────────────────────────────────────────────────
  if (!ready || showUpload) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem',
      gap: '1.5rem', background: '#f0f4f8' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
          <BarChart2 size={28} style={{ color: '#0891b2' }}/>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>ProfitLensV#</h1>
        </div>
        <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>Upload your Budget_Cost.xlsx to get started</p>
        {ready && <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setShowUpload(false)}>← Back</button>}
      </div>
      <UploadPanel onSuccess={onUpload}/>
    </div>
  )

  // ── 9 KPI bar items — exact formulas as specified ──────────────────────────
  const kpis = summary ? [
    // 1. TCV
    { label: 'TCV',
      val: fmt.k(summary.Total_TCV), priority: true },
    // 2. Planned Budget
    { label: 'Planned Budget',
      val: fmt.k(summary.Budgeted_Cost), priority: true },
    // 3. Planned PM% = (TCV - Planned Budget) / TCV × 100
    { label: 'Planned PM%',
      val: summary.Budget_Margin_Pct != null ? `${summary.Budget_Margin_Pct.toFixed(1)}%` : '—',
      priority: true },
    // 4. Cost to Date = Total Burdened Cost
    { label: 'Cost to Date',
      val: fmt.k(summary.Burdened_Cost),
      sub: summary.Cost_Variance_Pct != null
        ? `${summary.Burdened_Cost <= summary.Budgeted_Cost ? '▼' : '▲'} ${Math.abs(summary.Cost_Variance_Pct).toFixed(1)}% vs plan`
        : null,
      neg: summary.Burdened_Cost > summary.Budgeted_Cost, priority: true },
    // 5. Revenue to Date = Cost to Date / Planned Budget × TCV
    { label: 'Revenue to Date',
      val: fmt.k(summary.Revenue_Accrued),
      sub: summary.Total_TCV ? `${(summary.Revenue_Accrued/summary.Total_TCV*100).toFixed(1)}% of TCV` : null,
      priority: true },
    // 6. Current PM% = (Rev to Date - Cost to Date) / Rev to Date × 100
    { label: 'Current PM%',
      val: summary.Actual_Margin_Pct != null ? `${summary.Actual_Margin_Pct.toFixed(1)}%` : '—',
      sub: summary.Budget_Margin_Pct != null && summary.Actual_Margin_Pct != null
        ? `${summary.Actual_Margin_Pct >= summary.Budget_Margin_Pct ? '+' : ''}${(summary.Actual_Margin_Pct - summary.Budget_Margin_Pct).toFixed(1)}pp vs plan`
        : null,
      neg: summary.Actual_Margin_Pct != null && summary.Actual_Margin_Pct < 0,
      pos: summary.Actual_Margin_Pct != null && summary.Actual_Margin_Pct >= 15,
      priority: true },
    // 7. Revenue Remaining = TCV - Revenue to Date
    { label: 'Rev Remaining',
      val: fmt.k(summary.Remaining_Revenue),
      sub: summary.Total_TCV ? `${(summary.Remaining_Revenue/summary.Total_TCV*100).toFixed(1)}% of TCV` : null },
    // 8. Cost Remaining = Planned Budget - Cost to Date
    { label: 'Cost Remaining',
      val: fmt.k(summary.Remaining_Cost) },
    // 9. Projected PM% = (Rev Remaining - Cost Remaining) / Rev Remaining × 100
    { label: 'Projected PM%',
      val: summary.Projected_PM_Pct != null ? `${summary.Projected_PM_Pct.toFixed(1)}%` : '—',
      neg: summary.Projected_PM_Pct != null && summary.Projected_PM_Pct < 0,
      pos: summary.Projected_PM_Pct != null && summary.Projected_PM_Pct >= 15 },
  ] : []

  const tabs = [
    { id: 'overview',    label: 'By Project' },
    { id: 'opportunity', label: 'By Opportunity' },
    { id: 'drilldown', label: 'Drill Down' },
    { id: 'serviceLine', label: 'Service Line View' },
    { id: 'resources', label: 'Resources' },
    { id: 'portfolio',   label: 'Portfolio' },
    { id: 'trend',       label: 'Trends' },
    { id: 'breakdown',   label: 'Breakdown' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f4f8', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ flexShrink: 0, background: 'white', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'stretch', height: 46 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 1rem',
          borderRight: '1px solid #f1f5f9', flexShrink: 0 }}>
          <BarChart2 size={17} style={{ color: '#0891b2' }}/>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', whiteSpace: 'nowrap' }}>ProfitLensV#</span>
          <div style={{ display:'flex', gap:4, marginLeft:8 }}>
            <button onClick={() => setDashboardMode('fixed')} style={{ border:'1px solid #bae6fd', background:dashboardMode==='fixed'?'#0891b2':'white', color:dashboardMode==='fixed'?'white':'#0369a1', borderRadius:6, padding:'3px 8px', fontSize:'0.66rem', fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Fixed</button>
            <button onClick={() => setDashboardMode('allTypes')} style={{ border:'1px solid #c7d2fe', background:dashboardMode==='allTypes'?'#4f46e5':'white', color:dashboardMode==='allTypes'?'white':'#4338ca', borderRadius:6, padding:'3px 8px', fontSize:'0.66rem', fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>All types</button>
          </div>
          {loading && dashboardMode==='fixed' && <RefreshCw size={11} style={{ color: '#94a3b8', animation: 'spin 1s linear infinite' }}/>}
        </div>

        {/* KPI strip */}
        {dashboardMode === 'fixed' && <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>
          {kpis.map((k, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '0 0.8rem',
              borderRight: '1px solid #f1f5f9',
              borderLeft: i === 6 ? '2px solid #cbd5e1' : 'none',
              flexShrink: 0, minWidth: 88,
              background: k.priority ? '#f0f9ff' : 'white',
            }}>
              <div style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8',
                letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{k.label}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2,
                color: k.neg ? '#dc2626' : k.pos ? '#059669' : '#1e293b' }}>{k.val}</div>
              {k.sub && <div style={{ fontSize: '0.58rem', whiteSpace: 'nowrap',
                color: k.neg ? '#dc2626' : k.pos ? '#059669' : '#64748b' }}>{k.sub}</div>}
            </div>
          ))}
        </div>}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0 0.75rem',
          borderLeft: '1px solid #f1f5f9', flexShrink: 0 }}>
          <button onClick={() => setShowUpload(true)}
            style={{ background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif" }}>
            <Upload size={11}/> Upload
          </button>
          <button onClick={() => setAgentOpen(o => !o)}
            style={{ background: agentOpen ? 'linear-gradient(135deg,#0891b2,#3b82f6)' : 'white',
              border: agentOpen ? 'none' : '1px solid #e2e8f0',
              color: agentOpen ? 'white' : '#1e293b',
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: agentOpen ? '0 2px 8px rgba(8,145,178,.3)' : 'none' }}>
            <Sparkles size={11}/> AI Agent
          </button>
        </div>
      </header>

      {/* ── Filter bar ── */}
      {dashboardMode === 'fixed' && <div style={{ flexShrink: 0, background: 'white', borderBottom: '1px solid #e2e8f0', zIndex: 50 }}>
        <FilterBar
          filters={filterOpts} active={active}
          onChange={changeFilter} onBulkChange={changeFilters} onReset={resetFilters}
          granularity={gran} onGranularity={changeGran}
          healthThresholds={healthThresholds}
          onHealthThresholdsChange={(next) => { setHealthThresholds(next); setTimeout(() => load(active, gran, next), 0) }}
        />
      </div>}

      {/* ── Period KPI bar — only visible when period filter is active ── */}
      {dashboardMode === 'fixed' && summary?.Has_Period_Filter && (
        <div style={{ flexShrink: 0, background: '#fefce8', borderBottom: '1px solid #fde68a',
          display: 'flex', alignItems: 'stretch', padding: '0 0.85rem', gap: 0, overflowX: 'auto' }}>
          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: '0.75rem',
            borderRight: '1px solid #fde68a', flexShrink: 0 }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#92400e',
              letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Period View
            </span>
          </div>
          {[
            { label: 'Revenue per Period',
              val:  fmt.k(summary.Period_Revenue),
              sub:  summary.Total_TCV && summary.Period_Revenue != null
                      ? `${(summary.Period_Revenue / summary.Total_TCV * 100).toFixed(1)}% of TCV`
                      : null },
            { label: 'Cost per Period',
              val:  fmt.k(summary.Period_Cost),
              sub:  summary.Period_Plan_Cost != null
                      ? `Plan: ${fmt.k(summary.Period_Plan_Cost)}`
                      : null,
              neg:  summary.Period_Cost > summary.Period_Plan_Cost },
            { label: 'PM% per Period',
              val:  summary.Period_PM_Pct != null ? `${summary.Period_PM_Pct.toFixed(1)}%` : '—',
              sub:  summary.Period_Revenue != null && summary.Period_Cost != null
                      ? `Rev ${fmt.k(summary.Period_Revenue)} − Cost ${fmt.k(summary.Period_Cost)}`
                      : null,
              neg:  summary.Period_PM_Pct != null && summary.Period_PM_Pct < 0,
              pos:  summary.Period_PM_Pct != null && summary.Period_PM_Pct >= 15 },
          ].map((k, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '4px 0.75rem', borderRight: '1px solid #fde68a', flexShrink: 0, minWidth: 120 }}>
              <div style={{ fontSize: '0.56rem', fontWeight: 700, color: '#92400e',
                letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{k.label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2,
                color: k.neg ? '#dc2626' : k.pos ? '#059669' : '#78350f' }}>{k.val}</div>
              {k.sub && <div style={{ fontSize: '0.58rem', color: k.neg ? '#dc2626' : '#92400e',
                whiteSpace: 'nowrap' }}>{k.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab bar ── */}
      {dashboardMode === 'fixed' && <div style={{ flexShrink: 0, display: 'flex', background: 'white',
        borderBottom: '1px solid #e2e8f0', paddingLeft: '0.75rem' }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ fontSize: '0.74rem', padding: '6px 14px' }}>
            {t.label}
          </button>
        ))}
      </div>}

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div style={{ flex: 1, overflowY: 'auto', padding: dashboardMode === 'allTypes' ? '0' : '0.65rem 0.85rem',
          display: 'flex', flexDirection: 'column', gap: dashboardMode === 'allTypes' ? 0 : '0.65rem' }}>

          {dashboardMode === 'allTypes' && (
            <div className="fade-in" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <TcvRevenueQuarterly />
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'portfolio' && (
            <div className="fade-in">
              <PortfolioSummary/>
            </div>
          )}


          {dashboardMode === 'fixed' && tab === 'resources' && (
            <div className="card fade-in" style={{ padding: '0.75rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ResourceCountMonthly filters={active} />
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'overview' && (
            <div className="card fade-in" style={{ padding: '0.75rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem', flexShrink: 0 }}>
                Project Profitability
              </div>
              <ProjectTable data={projData} summary={summary} activeFilters={active} onReload={()=>load(active, gran)}/>
            </div>
          )}


          {dashboardMode === 'fixed' && tab === 'opportunity' && (
            <div className="card fade-in" style={{ padding: '0.75rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <OpportunityRollupView filters={active} />
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'drilldown' && (
            <div className="card fade-in" style={{ padding: '0.75rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <DrilldownReport projects={projData} />
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'serviceLine' && (
            <div className="card fade-in" style={{ padding: '0.75rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ServiceLineView rows={serviceLineView} />
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'trend' && (
            <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                  <span style={{ color: '#0891b2' }}>●</span> Cost — Planned vs Actual
                </div>
                <TrendChart data={trend} mode="cost"/>
              </div>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                  <span style={{ color: '#f59e0b' }}>●</span> Hours — Planned vs Actual
                </div>
                <TrendChart data={trend} mode="hours"/>
              </div>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                  <span style={{ color: '#8b5cf6' }}>●</span> PM% Trend
                </div>
                <MarginTrendChart data={trend}/>
              </div>
            </div>
          )}

          {dashboardMode === 'fixed' && tab === 'breakdown' && (
            <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>Cost by Band</div>
                <GroupedBarChart data={bandData} xKey="Band"/>
              </div>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>Cost by Service Line</div>
                <GroupedBarChart data={slData} xKey="Service_Line"/>
              </div>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>Cost by Location</div>
                <GroupedBarChart data={locData} xKey="Location"/>
              </div>
              <div className="card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, marginBottom: '0.4rem' }}>Hours by Band</div>
                <MarginBarChart data={bandData} xKey="Band"/>
              </div>
            </div>
          )}



        </div>

        {agentOpen && (
          <div style={{ width: 370, flexShrink: 0, borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
            <AgentPanel isOpen={agentOpen} onClose={() => setAgentOpen(false)} inline={true}/>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
