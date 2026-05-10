import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, ChevronDown } from 'lucide-react'

function MultiSelect({ label, options, selected, onChange, placeholder='All', width=120 }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const anchorRef = useRef()
  const dropRef = useRef()
  const sel = selected || []

  useEffect(() => {
    if (!open) return
    const h = e => {
      if (!anchorRef.current?.contains(e.target) && !dropRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 2, left: r.left })
    }
  }, [open])

  const toggle = val => {
    const next = sel.includes(val) ? sel.filter(v => v !== val) : [...sel, val]
    onChange(next.length ? next : null)
  }
  const clear = e => { e.stopPropagation(); onChange(null); setQuery('') }
  const display = o => typeof o === 'object' ? (o.label || o.id || '') : String(o)
  const valueOf = o => typeof o === 'object' ? (o.id || o.label || '') : String(o)
  const opts = query ? options.filter(o => display(o).toLowerCase().includes(query.toLowerCase())) : options
  const label1 = sel.length === 0 ? placeholder : sel.length === 1 ? sel[0] : `${sel.length} sel`

  return (
    <div style={{display:'flex',flexDirection:'column',gap:1,minWidth:0}}>
      <label style={{fontSize:'0.52rem',fontWeight:700,color:'#94a3b8',letterSpacing:'.06em',textTransform:'uppercase'}}>{label}</label>
      <div ref={anchorRef} onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:3,cursor:'pointer',height:24,background:'white',border:`1px solid ${open?'#0891b2':'#e2e8f0'}`,borderRadius:5,padding:'0 6px',width,boxShadow:open?'0 0 0 2px rgba(8,145,178,.1)':'none'}}>
        <span style={{flex:1,fontSize:'0.68rem',color:sel.length?'#1e293b':'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label1}</span>
        {sel.length>0 ? <button onMouseDown={e=>{e.stopPropagation();clear(e)}} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:0,display:'flex'}}><X size={9}/></button> : <ChevronDown size={9} style={{color:'#94a3b8',flexShrink:0}}/>}
      </div>
      {open && pos && createPortal(
        <div ref={dropRef} style={{position:'fixed',top:pos.top,left:pos.left,zIndex:9999,background:'white',border:'1px solid #e2e8f0',borderRadius:7,boxShadow:'0 6px 24px rgba(0,0,0,.15)',width:Math.max(width,220),maxHeight:260,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'4px 7px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:4}}>
            <Search size={10} style={{color:'#94a3b8'}}/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search…" autoFocus style={{border:'none',outline:'none',flex:1,fontSize:'0.7rem',fontFamily:"'DM Sans',sans-serif",color:'#1e293b',background:'transparent'}}/>
          </div>
          <div style={{overflowY:'auto',flex:1}}>
            {!opts.length && <div style={{padding:'7px 10px',fontSize:'0.7rem',color:'#94a3b8'}}>No matches</div>}
            {opts.map(o => {
              const val = valueOf(o)
              const chk = sel.includes(val)
              return <div key={val} onMouseDown={e=>{e.preventDefault();toggle(val)}} style={{padding:'5px 9px',cursor:'pointer',display:'flex',alignItems:'center',gap:7,background:chk?'#f0f9ff':'white'}}>
                <div style={{width:12,height:12,borderRadius:3,flexShrink:0,border:`2px solid ${chk?'#0891b2':'#d1d5db'}`,background:chk?'#0891b2':'white'}} />
                <span style={{fontSize:'0.7rem',fontWeight:chk?700:400,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{display(o)}</span>
              </div>
            })}
          </div>
          {sel.length>0 && <div style={{padding:'4px 9px',borderTop:'1px solid #f1f5f9'}}><button onMouseDown={e=>{e.preventDefault();onChange(null);setQuery('')}} style={{fontSize:'0.65rem',color:'#0891b2',background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Clear all</button></div>}
        </div>, document.body)}
    </div>
  )
}

function Sel({ label, value, options, onChange, width=80 }) {
  return <div style={{display:'flex',flexDirection:'column',gap:1,minWidth:0}}>
    <label style={{fontSize:'0.52rem',fontWeight:700,color:'#94a3b8',letterSpacing:'.06em',textTransform:'uppercase'}}>{label}</label>
    <select value={value||''} onChange={e=>onChange(e.target.value||null)} style={{fontSize:'0.68rem',padding:'2px 4px',height:24,width,border:'1px solid #e2e8f0',borderRadius:5,background:'white',color:'#1e293b',fontFamily:"'DM Sans',sans-serif",cursor:'pointer',outline:'none'}}>
      <option value=''>All</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
}

const Div = () => <div style={{width:1,background:'#f1f5f9',alignSelf:'stretch',margin:'0 2px'}}/>

export function FilterBar({ filters, active, onChange, onBulkChange, onReset, granularity, onGranularity, healthThresholds={off:25,risk:35}, onHealthThresholdsChange }) {
  if (!filters) return null
  const { projects=[], project_groups=[], opp_names=[], bands=[], service_lines=[], sl_groups=[], locations=[], periods=[], quarters=[], years=[], closed_years=[] } = filters
  const availableYears = years.length ? years : [...new Set(periods.map(p => String(p).slice(0,4)).filter(Boolean))].sort()
  const selectedYears = active.years ? (Array.isArray(active.years) ? active.years : String(active.years).split(',')) : []
  const selectedQuarters = active.quarters ? (Array.isArray(active.quarters) ? active.quarters : String(active.quarters).split(',')) : []
  const setYears = (arr) => { onGranularity?.('month'); onBulkChange?.({ years: arr && arr.length ? arr : null, period_from:null, period_to:null, quarter_from:null, quarter_to:null }, 'month') }
  const setQuarters = (arr) => { onGranularity?.('quarter'); onBulkChange?.({ quarters: arr && arr.length ? arr : null, quarter_from:null, quarter_to:null, period_from:null, period_to:null }, 'quarter') }
  const selProjects = active.project ? (Array.isArray(active.project) ? active.project : [active.project]) : []
  const selGroups = active.project_group ? (Array.isArray(active.project_group) ? active.project_group : [active.project_group]) : []
  const selOpps = active.opp_name ? (Array.isArray(active.opp_name) ? active.opp_name : [active.opp_name]) : []
  const selSL = active.service_line ? (Array.isArray(active.service_line) ? active.service_line : [active.service_line]) : []
  const selSLGroup = active.sl_group ? (Array.isArray(active.sl_group) ? active.sl_group : [active.sl_group]) : []
  const selLoc = active.location ? (Array.isArray(active.location) ? active.location : [active.location]) : []
  const selStatus = active.project_status ? (Array.isArray(active.project_status) ? active.project_status : [active.project_status]) : []
  const selHealth = active.rag ? (Array.isArray(active.rag) ? active.rag : [active.rag]) : []
  const selClosedYears = active.closed_year ? (Array.isArray(active.closed_year) ? active.closed_year : String(active.closed_year).split(',')) : []
  const setMulti = (key, arr) => onChange(key, arr && arr.length ? arr : null)
  const hasActive = Object.entries(active).some(([k,v]) => k !== 'rag' && v && (!Array.isArray(v) || v.length>0))

  return <div style={{padding:'5px 10px 4px'}}>
    <div style={{display:'flex',gap:'6px',alignItems:'flex-end',flexWrap:'wrap',overflow:'visible',minHeight:42}}>
      <MultiSelect label="Group" options={project_groups} selected={selGroups} onChange={arr=>setMulti('project_group',arr)} width={105}/>
      <MultiSelect label="Opp" options={opp_names} selected={selOpps} onChange={arr=>setMulti('opp_name',arr)} width={110}/>
      <MultiSelect label="Project" options={projects} selected={selProjects} onChange={arr=>setMulti('project',arr)} width={150}/>
      <Div/>
      <MultiSelect label="SL Group" options={sl_groups} selected={selSLGroup} onChange={arr=>setMulti('sl_group',arr)} width={94}/>
      <MultiSelect label="SL" options={service_lines} selected={selSL} onChange={arr=>setMulti('service_line',arr)} width={88}/>
      <MultiSelect label="Loc" options={locations} selected={selLoc} onChange={arr=>setMulti('location',arr)} width={90}/>
      <MultiSelect label="Status" options={['Active','Past Due','Closed']} selected={selStatus} onChange={arr=>setMulti('project_status',arr)} width={98}/>
      <MultiSelect label="Closed Yr" options={closed_years} selected={selClosedYears} onChange={arr=>setMulti('closed_year',arr)} width={86}/>
      <Div/>
      <MultiSelect label="Year" options={availableYears} selected={selectedYears} onChange={setYears} width={92}/>
      <MultiSelect label="Quarter" options={['1','2','3','4'].map(q=>({id:q,label:`Q${q}`}))} selected={selectedQuarters} onChange={setQuarters} width={94}/>
      <Div/>
      <div title={`Off Track: PM% below ${healthThresholds.off}%. At Risk: active projects only from ${healthThresholds.off}% to below ${healthThresholds.risk}%.`} style={{display:'flex',flexDirection:'column',gap:1,marginLeft:4,marginRight:6}}>
        <label style={{fontSize:'0.52rem',fontWeight:700,color:'#94a3b8',letterSpacing:'.06em',textTransform:'uppercase'}}>Threshold</label>
        <div style={{display:'flex',alignItems:'center',gap:5,height:24,border:'1px solid #e2e8f0',borderRadius:5,background:'white',padding:'0 6px',width:142}}>
          <span style={{fontSize:'0.52rem',fontWeight:800,color:'#b91c1c'}}>R&lt;</span>
          <input type="number" min="0" max="60" step="1" value={healthThresholds.off} onChange={e=>onHealthThresholdsChange?.({...healthThresholds, off: Math.min(Number(e.target.value||0), healthThresholds.risk-1)})} style={{width:27,border:'none',outline:'none',fontSize:'0.62rem',fontWeight:800,color:'#b91c1c',padding:0}}/>
          <span style={{fontSize:'0.52rem',fontWeight:800,color:'#b45309'}}>A&lt;</span>
          <input type="number" min="1" max="80" step="1" value={healthThresholds.risk} onChange={e=>onHealthThresholdsChange?.({...healthThresholds, risk: Math.max(Number(e.target.value||0), healthThresholds.off+1)})} style={{width:27,border:'none',outline:'none',fontSize:'0.62rem',fontWeight:800,color:'#b45309',padding:0}}/>
        </div>
      </div>
      <MultiSelect label="Health" options={[{id:'GREEN',label:'On Track'},{id:'AMBER',label:'At Risk'},{id:'RED',label:'Off Track'}]} selected={selHealth} onChange={arr=>setMulti('rag',arr)} width={96}/>
      {hasActive && <div style={{display:'flex',flexDirection:'column',gap:1}}><label style={{fontSize:'0.52rem',color:'transparent'}}>.</label><button onClick={onReset} style={{height:24,padding:'0 8px',borderRadius:5,border:'1px solid #e2e8f0',background:'white',cursor:'pointer',fontSize:'0.67rem',fontWeight:600,color:'#64748b',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}}><X size={9}/> Reset</button></div>}
    </div>
    {hasActive && <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:3}}>
      {selGroups.map(v => <Chip key={`g-${v}`} label={`Group: ${v}`} onRemove={()=>setMulti('project_group',selGroups.filter(x=>x!==v))}/>) }
      {selOpps.map(v => <Chip key={`o-${v}`} label={`Opp: ${v}`} onRemove={()=>setMulti('opp_name',selOpps.filter(x=>x!==v))}/>) }
      {selProjects.map(v => <Chip key={`p-${v}`} label={`P: ${v}`} onRemove={()=>setMulti('project',selProjects.filter(x=>x!==v))}/>) }
      {selSLGroup.map(v => <Chip key={`slg-${v}`} label={`SL Group: ${v}`} onRemove={()=>setMulti('sl_group',selSLGroup.filter(x=>x!==v))}/>) } {selSL.map(v => <Chip key={`sl-${v}`} label={`SL: ${v}`} onRemove={()=>setMulti('service_line',selSL.filter(x=>x!==v))}/>) } {selLoc.map(v => <Chip key={`l-${v}`} label={`Loc: ${v}`} onRemove={()=>setMulti('location',selLoc.filter(x=>x!==v))}/>) } {selStatus.map(v => <Chip key={`st-${v}`} label={`Status: ${v}`} onRemove={()=>setMulti('project_status',selStatus.filter(x=>x!==v))}/>) } {selClosedYears.map(v => <Chip key={`cy-${v}`} label={`Closed Yr: ${v}`} onRemove={()=>setMulti('closed_year',selClosedYears.filter(x=>x!==v))}/>) } {selectedYears.map(v => <Chip key={`yr-${v}`} label={`Year: ${v}`} onRemove={()=>setYears(selectedYears.filter(x=>x!==v))}/>) } {selectedQuarters.map(v => <Chip key={`q-${v}`} label={`Quarter: Q${v}`} onRemove={()=>setQuarters(selectedQuarters.filter(x=>x!==v))}/>) } 
    </div>}
  </div>
}

function Chip({ label, onRemove }) {
  return <span style={{display:'inline-flex',alignItems:'center',gap:3,background:'#dbeafe',color:'#1d4ed8',padding:'1px 5px',borderRadius:999,fontSize:'0.6rem',fontWeight:600}}>{label}<button onMouseDown={e=>{e.preventDefault();onRemove()}} style={{background:'none',border:'none',cursor:'pointer',color:'#1d4ed8',padding:0,display:'flex'}}><X size={8}/></button></span>
}
