import { useState, useEffect, useMemo, useRef } from 'react'
import { fmt } from '../utils/api'
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis,
         CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList } from 'recharts'
import { ChevronDown, ChevronRight, Edit3, X, Trash2, RefreshCw, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const k   = fmt.k
const num = v => v == null ? '—' : Math.round(v).toLocaleString()
const fmtMonth = p => { if(!p) return ''; const[y,m]=p.split('-'); return `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)]} ${y.slice(2)}` }
const qTotal = r => (Number(r?.Revenue_Q1)||0) + (Number(r?.Revenue_Q2)||0) + (Number(r?.Revenue_Q3)||0) + (Number(r?.Revenue_Q4)||0)

// ── PM% pill ──────────────────────────────────────────────────────────────────
const pmBg    = v => v==null?'#f1f5f9':v>=20?'#dcfce7':v>=10?'#dbeafe':v>=0?'#fef3c7':'#fee2e2'
const pmColor = v => v==null?'#64748b':v>=20?'#059669':v>=10?'#1d4ed8':v>=0?'#b45309':'#dc2626'
function PMPill({ val, sub }) {
  if (val==null) return <span style={{color:'#94a3b8',fontSize:'0.72rem'}}>—</span>
  return (
    <div>
      <span style={{background:pmBg(val),color:pmColor(val),padding:'2px 8px',borderRadius:999,fontSize:'0.72rem',fontWeight:700,whiteSpace:'nowrap'}}>
        {val.toFixed(1)}%
      </span>
      {sub && <div style={{fontSize:'0.6rem',color:'#94a3b8',marginTop:1}}>{sub}</div>}
    </div>
  )
}

// ── RAG indicator ─────────────────────────────────────────────────────────────
function RAGBadge({ rag }) {
  const cfg = {
    GREEN: { bg:'#dcfce7', color:'#15803d', label:'● On Track' },
    AMBER: { bg:'#fef3c7', color:'#b45309', label:'● At Risk' },
    RED:   { bg:'#fee2e2', color:'#b91c1c', label:'● Off Track' },
  }
  const { bg, color, label } = cfg[rag] || cfg.GREEN
  return (
    <span style={{background:bg,color,padding:'2px 8px',borderRadius:999,
      fontSize:'0.68rem',fontWeight:700,whiteSpace:'nowrap'}}>{label}</span>
  )
}

// ── CPI gauge ────────────────────────────────────────────────────────────────
function CPIBar({ val }) {
  if (val==null) return <span style={{color:'#94a3b8',fontSize:'0.72rem'}}>—</span>
  const color = val >= 1 ? '#059669' : val >= 0.9 ? '#d97706' : '#dc2626'
  const width  = Math.min(100, val * 100)
  return (
    <div style={{display:'flex',alignItems:'center',gap:5}}>
      <div style={{width:44,height:5,background:'#e2e8f0',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${width}%`,background:color,borderRadius:3}}/>
      </div>
      <span style={{fontSize:'0.75rem',fontWeight:700,color,minWidth:28}}>{val.toFixed(2)}</span>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ row, onSave, onClose }) {
  const ex = row.Manual || {}
  const [form, setForm] = useState({
    projected_extra_cost:  ex.projected_extra_cost  ?? '',
    projected_extra_label: ex.projected_extra_label ?? 'Projected Extra Cost',
    notes: ex.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const inp = { background:'#f8fafc',border:'1px solid #e2e8f0',color:'#1e293b',
    padding:'6px 10px',borderRadius:6,fontSize:'0.78rem',width:'100%',
    fontFamily:"'DM Sans',sans-serif",outline:'none' }

  const save = async () => {
    setSaving(true)
    await fetch('/api/manual-inputs',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project_id:row.Project_ID,tcv:row.TCV,
        projected_extra_cost:parseFloat(form.projected_extra_cost)||0,
        projected_extra_label:form.projected_extra_label,notes:form.notes})})
    onSave(); setSaving(false); onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'white',borderRadius:12,padding:'1.5rem',width:400,display:'flex',flexDirection:'column',gap:'1rem',boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontWeight:700,fontSize:'0.9rem',color:'#1e293b'}}>Edit Projections</div>
            <div style={{fontSize:'0.72rem',color:'#64748b',marginTop:2}}>{row.Project_ID} — {row.Project_Name}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:4}}><X size={16}/></button>
        </div>
        <div><label style={{fontSize:'0.62rem',fontWeight:700,color:'#64748b',letterSpacing:'.07em',textTransform:'uppercase',display:'block',marginBottom:4}}>Extra Cost ($)</label>
          <input style={inp} type="number" value={form.projected_extra_cost} onChange={e=>setForm(f=>({...f,projected_extra_cost:e.target.value}))} placeholder="0"/></div>
        <div><label style={{fontSize:'0.62rem',fontWeight:700,color:'#64748b',letterSpacing:'.07em',textTransform:'uppercase',display:'block',marginBottom:4}}>Notes</label>
          <textarea style={{...inp,resize:'vertical',minHeight:52}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:6,border:'1px solid #e2e8f0',background:'white',cursor:'pointer',fontSize:'0.78rem',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{padding:'6px 14px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#0891b2,#3b82f6)',color:'white',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>{saving?'Saving…':'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Monthly drilldown ─────────────────────────────────────────────────────────
function MonthlyDrilldown({ projectId, projectName, eac, burnRate, remainingMonths, startDate, endDate, pctComplete, etc, currentMonthCost, plannedPM, currentPM }) {
  const props = { etc, currentMonthCost }  // for KPI strip access
  const [rows,     setRows]     = useState([])
  const [bandRows, setBandRows] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState('cost')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/trend?project=${projectId}`).then(r=>r.json()),
      fetch(`/api/by-band-period?project=${projectId}`).then(r=>r.json()),
    ]).then(([trend, bands]) => {
      if (Array.isArray(trend)) setRows(trend)
      if (Array.isArray(bands)) setBandRows(bands)
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [projectId])

  if (loading) return <div style={{padding:'1rem',textAlign:'center',color:'#94a3b8',fontSize:'0.78rem'}}>Loading…</div>
  if (!rows.length) return <div style={{padding:'1rem',textAlign:'center',color:'#94a3b8',fontSize:'0.78rem'}}>No monthly data</div>

  // Build cumulative + EAC forecast
  let cumBud=0, cumAct=0
  const lastActualIdx = rows.reduce((last, r, i) => (r.Burdened_Cost||0)>0 ? i : last, -1)
  const chartData = rows.map((r, i) => {
    cumBud += r.Budgeted_Cost||0
    cumAct += r.Burdened_Cost||0
    return {
      ...r,
      _label:    fmtMonth(r.Period),
      cumBud:    Math.round(cumBud),
      cumAct:    Math.round(cumAct),
      Planned_FTE:      r.Planned_FTE      || 0,
      Actual_Headcount: r.Actual_Headcount || 0,
      // Forecast months: null for actuals, projected for future
      _forecast: i > lastActualIdx ? Math.round(burnRate || 0) : null,
    }
  })

  // Add EAC marker if EAC > last cumulative
  const lastCumAct = chartData[chartData.length-1]?.cumAct || 0

  const totBudCost = rows.reduce((s,r)=>s+(r.Budgeted_Cost||0), 0)
  const totActCost = rows.reduce((s,r)=>s+(r.Burdened_Cost||0), 0)
  const totBudRev  = rows.reduce((s,r)=>s+(r.Budgeted_Revenue||0), 0)
  const totActRev  = rows.reduce((s,r)=>s+(r.Actual_Revenue||0), 0)
  const totBudHrs  = rows.reduce((s,r)=>s+(r.Budgeted_Hours||0), 0)
  const totActHrs  = rows.reduce((s,r)=>s+(r.Actual_Hours||0), 0)

  // Mode-aware tooltip: cost/forecast use k(), hours/FTE/resources use plain numbers
  const makeTip = (isCurrency=true) => ({active,payload,label}) => {
    if(!active||!payload?.length) return null
    const fmt = v => isCurrency ? k(v) : (v!=null ? Math.round(v).toLocaleString() : '—')
    return (
      <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',
        boxShadow:'0 4px 12px rgba(0,0,0,.1)',fontFamily:"'DM Sans',sans-serif",minWidth:180}}>
        <div style={{fontWeight:700,marginBottom:6,fontSize:'0.78rem'}}>{label}</div>
        {payload.map(p => p.value!=null && (
          <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:3,fontSize:'0.73rem'}}>
            <span style={{color:p.color||'#1e293b'}}>{p.name}</span>
            <span style={{fontFamily:'monospace',fontWeight:700}}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  const Tip = makeTip(true)  // currency (cost charts)

  const btn = active => ({
    padding:'3px 10px',borderRadius:5,border:'none',cursor:'pointer',
    fontSize:'0.7rem',fontWeight:600,fontFamily:"'DM Sans',sans-serif",
    background:active?'#0891b2':'#f1f5f9',color:active?'white':'#64748b',
  })

  const fmtPct = v => v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`
  const pmTone = v => v == null || Number.isNaN(Number(v)) ? '#64748b' : Number(v) >= 20 ? '#059669' : Number(v) >= 10 ? '#1d4ed8' : Number(v) >= 0 ? '#d97706' : '#dc2626'


  const exportMonthlyRevenueToExcel = () => {
    const headers = ['Month','Planned Revenue','Actual Revenue','Revenue Variance','Revenue Var %','Cumulative Planned Revenue','Cumulative Actual Revenue']
    let cumPlan = 0, cumActual = 0
    const detailRows = rows.map(r => {
      const planned = Number(r.Budgeted_Revenue || 0)
      const actual = Number(r.Actual_Revenue || 0)
      const variance = actual - planned
      const varPct = planned ? (variance / planned * 100) : null
      cumPlan += planned
      cumActual += actual
      return [fmtMonth(r.Period), planned, actual, variance, varPct, cumPlan, cumActual]
    })
    const totalVar = totActRev - totBudRev
    const totalPct = totBudRev ? (totalVar / totBudRev * 100) : null
    const aoa = [
      [`Monthly Revenue Drilldown — ${projectId}${projectName ? ' — ' + projectName : ''}`],
      [`Exported ${new Date().toLocaleString()}`],
      [],
      headers,
      ...detailRows,
      ['TOTAL', totBudRev, totActRev, totalVar, totalPct, totBudRev, totActRev],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [
      {s:{r:0,c:0}, e:{r:0,c:headers.length-1}},
      {s:{r:1,c:0}, e:{r:1,c:headers.length-1}},
    ]
    ws['!cols'] = [{wch:14},{wch:18},{wch:16},{wch:18},{wch:14},{wch:26},{wch:24}]
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:3,c:0}, e:{r:3 + detailRows.length,c:headers.length-1}}) }
    ws['!freeze'] = {xSplit:0, ySplit:4}
    const moneyCols = new Set([1,2,3,5,6])
    const pctCols = new Set([4])
    for (let r = 4; r <= 4 + detailRows.length; r++) {
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({r, c})
        const cell = ws[addr]
        if (!cell) continue
        if (moneyCols.has(c) && typeof cell.v === 'number') cell.z = '$#,##0;[Red]($#,##0);-'
        if (pctCols.has(c) && typeof cell.v === 'number') cell.z = '0.0%'
      }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Revenue')
    XLSX.writeFile(wb, `Monthly_Revenue_${projectId}_${new Date().toISOString().slice(0,10)}.xlsx`, { compression:true })
  }

  // Band deviation data
  const periods = [...new Set(bandRows.map(r=>r.Period))].sort()
  const bands   = [...new Set(bandRows.map(r=>r.Band))].filter(Boolean).sort()
  const COLORS  = ['#0891b2','#8b5cf6','#059669','#d97706','#dc2626','#0369a1','#7c3aed']
  const byPeriod = {}
  bandRows.forEach(r => { if(!byPeriod[r.Period]) byPeriod[r.Period]={}; byPeriod[r.Period][r.Band]=r })

  return (
    <div style={{padding:'0.75rem 1rem',background:'#f8fafc',borderTop:'2px solid #0891b2'}}>

      {/* Project date header */}
      {(startDate || endDate) && (
        <div style={{display:'flex',gap:'1.5rem',marginBottom:'0.5rem',paddingBottom:'0.4rem',
          borderBottom:'1px solid #e2e8f0',flexWrap:'wrap',alignItems:'center'}}>
          {startDate && (
            <div>
              <span style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>Start Date </span>
              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#1e293b'}}>{startDate}</span>
            </div>
          )}
          {endDate && (
            <div>
              <span style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>End Date </span>
              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#1e293b'}}>{endDate}</span>
            </div>
          )}
          {pctComplete != null && (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>Complete </span>
              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#1e293b'}}>{pctComplete.toFixed(0)}%</span>
              <div style={{width:60,height:5,background:'#e2e8f0',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.min(pctComplete,100)}%`,
                  background:pctComplete>=80?'#059669':pctComplete>=50?'#0891b2':'#f59e0b',borderRadius:3}}/>
              </div>
            </div>
          )}
          {remainingMonths > 0 && (
            <div>
              <span style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>Remaining </span>
              <span style={{fontSize:'0.78rem',fontWeight:700,
                color:remainingMonths<=2?'#dc2626':remainingMonths<=4?'#d97706':'#0891b2'}}>{remainingMonths} months</span>
            </div>
          )}
        </div>
      )}

      {/* Mini KPI strip */}
      <div style={{display:'flex',gap:'1.5rem',marginBottom:'0.75rem',flexWrap:'wrap'}}>
        {[
          {l:'Planned Cost',   v:k(totBudCost),    c:'#64748b'},
          {l:'Actual Cost',    v:k(totActCost),    c:totActCost>totBudCost?'#dc2626':'#059669'},
          {l:'Variance',       v:k(totBudCost-totActCost), c:totActCost<=totBudCost?'#059669':'#dc2626'},
          {l:'Plan Revenue',   v:k(totBudRev),     c:'#64748b'},
          {l:'Actual Revenue', v:k(totActRev),     c:totActRev>=totBudRev?'#059669':'#d97706'},
          {l:'Planned PM%',    v:fmtPct(plannedPM), c:pmTone(plannedPM)},
          {l:'Current PM%',    v:fmtPct(currentPM), c:pmTone(currentPM)},
          {l:'EAC',            v:eac!=null?k(eac):'—',    c:'#8b5cf6'},
          {l:'ETC (to complete)',v:props.etc!=null?k(props.etc):'—',c:'#d97706'},
          {l:'Burn Rate/Mo',   v:burnRate?k(burnRate):'—', c:'#d97706'},
          {l:'Rem Months',     v:remainingMonths??'—',     c:'#64748b'},
          {l:'Planned Hrs',    v:num(totBudHrs),   c:'#64748b'},
          {l:'Actual Hrs',     v:num(totActHrs),   c:totActHrs>totBudHrs?'#dc2626':'#059669'},
        ].map(({l,v,c})=>(
          <div key={l}>
            <div style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>{l}</div>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* View buttons */}
      <div style={{display:'flex',gap:4,marginBottom:'0.5rem'}}>
        {[['cost','Monthly Cost'],['revenue','Monthly Revenue'],['cumulative','Cumulative + EAC'],['hours','Hours'],['resources','Resources'],['bands','Band Deviation']].map(([id,lbl])=>(
          <button key={id} style={btn(view===id)} onClick={()=>setView(id)}>{lbl}</button>
        ))}
        <button onClick={exportMonthlyRevenueToExcel} disabled={!rows.length} title="Export this project's monthly revenue table to Excel" style={{display:'flex',alignItems:'center',gap:4,marginLeft:6,padding:'3px 10px',borderRadius:5,border:'1px solid #bae6fd',cursor:rows.length?'pointer':'not-allowed',fontSize:'0.7rem',fontWeight:700,fontFamily:"'DM Sans',sans-serif",background:rows.length?'#e0f2fe':'#f1f5f9',color:rows.length?'#0369a1':'#94a3b8'}}><Download size={12}/> Export Revenue</button>
      </div>

      {/* Charts */}
      <div style={{height:200}}>

        {view==='cost' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:16,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
              <YAxis tickFormatter={v=>k(v)} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={52}/>
              <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
              <Bar dataKey="Budgeted_Cost" name="Planned" fill="#93c5fd" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Budgeted_Cost" position="top" style={{fontSize:'0.55rem',fill:'#64748b'}} formatter={v=>v>0?k(v):''}/>
              </Bar>
              <Bar dataKey="Burdened_Cost" name="Actual"  fill="#0891b2" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Burdened_Cost" position="top" style={{fontSize:'0.55rem',fill:'#0891b2'}} formatter={v=>v>0?k(v):''}/>
              </Bar>
              <Bar dataKey="_forecast" name="Forecast (avg)" fill="#c4b5fd" radius={[2,2,0,0]} maxBarSize={20} opacity={0.8}>
                <LabelList dataKey="_forecast" position="top" style={{fontSize:'0.55rem',fill:'#8b5cf6'}} formatter={v=>v>0?k(v):''}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}


        {view==='revenue' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:16,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
              <YAxis tickFormatter={v=>k(v)} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={52}/>
              <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
              <Bar dataKey="Budgeted_Revenue" name="Planned Revenue" fill="#bbf7d0" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Budgeted_Revenue" position="top" style={{fontSize:'0.55rem',fill:'#15803d'}} formatter={v=>v>0?k(v):''}/>
              </Bar>
              <Bar dataKey="Actual_Revenue" name="Actual Revenue" fill="#059669" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Actual_Revenue" position="top" style={{fontSize:'0.55rem',fill:'#047857'}} formatter={v=>v>0?k(v):''}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {view==='cumulative' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:4,right:8,bottom:16,left:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
              <YAxis tickFormatter={v=>k(v)} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={52}/>
              <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
              <Line dataKey="cumBud" name="Cumul Plan"   stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false}/>
              <Line dataKey="cumAct" name="Cumul Actual" stroke="#0891b2" strokeWidth={2.5} dot={{r:2,fill:'#0891b2',strokeWidth:0}}/>
              {eac!=null && (
                <ReferenceLine y={eac} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3"
                  label={{value:`EAC ${k(eac)}`,position:'insideTopRight',fontSize:9,fill:'#8b5cf6'}}/>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {view==='hours' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:16,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
              <YAxis tickFormatter={v=>v>=1000?`${(v/1000).toFixed(1)}K`:v} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={40}/>
              <Tooltip content={makeTip(false)}/><Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
              <Bar dataKey="Budgeted_Hours" name="Planned Hrs" fill="#c4b5fd" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Budgeted_Hours" position="top" style={{fontSize:'0.55rem',fill:'#7c3aed'}} formatter={v=>v>0?num(v):''}/>
              </Bar>
              <Bar dataKey="Actual_Hours" name="Actual Hrs" fill="#8b5cf6" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Actual_Hours" position="top" style={{fontSize:'0.55rem',fill:'#5b21b6'}} formatter={v=>v>0?num(v):''}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {view==='resources' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:16,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
              <YAxis tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={30} tickFormatter={v=>Math.round(v)}/>
              <Tooltip content={({active,payload,label})=>{
                if(!active||!payload?.length) return null
                return (<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',minWidth:160}}>
                  <div style={{fontWeight:700,marginBottom:6,fontSize:'0.78rem'}}>{label}</div>
                  {payload.map(p=>(<div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:3,fontSize:'0.73rem'}}><span style={{color:p.color}}>{p.name}</span><span style={{fontWeight:700}}>{(p.value||0).toFixed(1)}</span></div>))}
                </div>)
              }}/>
              <Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
              <Bar dataKey="Planned_FTE" name="Planned FTE" fill="#93c5fd" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Planned_FTE" position="top" style={{fontSize:'0.55rem',fill:'#0369a1'}} formatter={v=>v>0?v.toFixed(1):''}/>
              </Bar>
              <Bar dataKey="Actual_Headcount" name="Actual FTE" fill="#0891b2" radius={[2,2,0,0]} maxBarSize={20}>
                <LabelList dataKey="Actual_Headcount" position="top" style={{fontSize:'0.55rem',fill:'#0891b2'}} formatter={v=>v>0?v.toFixed(1):''}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {view==='bands' && (() => {
          const chartRows = periods.map(p => {
            const row = { _label: fmtMonth(p), _period: p }
            bands.forEach(b => {
              const d = byPeriod[p]?.[b]
              row[`${b}_plan`] = d?.Plan_FTE || 0
              row[`${b}_act`]  = d?.Act_FTE  || 0
            })
            return row
          })

          // Tabular tooltip
          const BandTip = ({active, payload, label}) => {
            if (!active || !label) return null
            const period = chartRows.find(r => r._label === label)?._period
            return (
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
                padding:'8px 12px',boxShadow:'0 4px 16px rgba(0,0,0,.12)',minWidth:220,
                fontFamily:"'DM Sans',sans-serif"}}>
                <div style={{fontWeight:700,fontSize:'0.78rem',color:'#1e293b',marginBottom:8}}>{label}</div>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.68rem'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',color:'#94a3b8',fontWeight:700,paddingBottom:4,fontSize:'0.6rem',textTransform:'uppercase'}}>Band</th>
                      <th style={{textAlign:'right',color:'#64748b',fontWeight:700,paddingBottom:4,fontSize:'0.6rem',textTransform:'uppercase',paddingLeft:10}}>Plan FTE</th>
                      <th style={{textAlign:'right',color:'#0891b2',fontWeight:700,paddingBottom:4,fontSize:'0.6rem',textTransform:'uppercase',paddingLeft:10}}>Act FTE</th>
                      <th style={{textAlign:'right',color:'#64748b',fontWeight:700,paddingBottom:4,fontSize:'0.6rem',textTransform:'uppercase',paddingLeft:10}}>Var</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b,i) => {
                      const row = period ? byPeriod[period]?.[b] : null
                      const pFTE = row?.Plan_FTE || 0
                      const aFTE = row?.Act_FTE  || 0
                      const vFTE = Math.round((aFTE - pFTE)*10)/10
                      const over = vFTE > 0.05, under = vFTE < -0.05
                      return (
                        <tr key={b}>
                          <td style={{padding:'2px 0',fontWeight:700,color:COLORS[i%COLORS.length]}}>{b}</td>
                          <td style={{padding:'2px 0 2px 10px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{pFTE > 0 ? pFTE.toFixed(1) : '—'}</td>
                          <td style={{padding:'2px 0 2px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:over||under?700:400,color:over?'#dc2626':under?'#059669':'#1e293b'}}>{aFTE > 0 ? aFTE.toFixed(1) : '—'}</td>
                          <td style={{padding:'2px 0 2px 10px',textAlign:'right'}}>
                            {(pFTE>0||aFTE>0) && (
                              <span style={{background:over?'#fee2e2':under?'#dcfce7':'#f1f5f9',color:over?'#b91c1c':under?'#15803d':'#64748b',padding:'1px 5px',borderRadius:4,fontSize:'0.6rem',fontWeight:700,fontFamily:'monospace'}}>
                                {vFTE>0?'+':''}{vFTE.toFixed(1)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }

          return (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{top:4,right:8,bottom:16,left:8}} barGap={1} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
                <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}
                  tickLine={false} angle={-25} textAnchor="end" interval={0} height={30}/>
                <YAxis tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={28}
                  label={{value:'FTE',angle:-90,position:'insideLeft',offset:8,style:{fontSize:9,fill:'#94a3b8'}}}/>
                <Tooltip content={<BandTip/>}/>
                <Legend wrapperStyle={{fontSize:'0.62rem',paddingTop:2}}/>
                {bands.map((b,i)=>[
                  <Bar key={`${b}_plan`} dataKey={`${b}_plan`} name={`${b} Plan`}
                    fill={COLORS[i%COLORS.length]+'50'} stroke={COLORS[i%COLORS.length]} strokeWidth={1}
                    radius={[2,2,0,0]} maxBarSize={12}>
                    <LabelList dataKey={`${b}_plan`} position="top" style={{fontSize:'0.52rem',fill:COLORS[i%COLORS.length]}} formatter={v=>v>0?v.toFixed(1):''}/>
                  </Bar>,
                  <Bar key={`${b}_act`}  dataKey={`${b}_act`}  name={`${b} Actual`}
                    fill={COLORS[i%COLORS.length]} radius={[2,2,0,0]} maxBarSize={12}>
                    <LabelList dataKey={`${b}_act`}  position="top" style={{fontSize:'0.52rem',fill:COLORS[i%COLORS.length]}} formatter={v=>v>0?v.toFixed(1):''}/>
                  </Bar>,
                ])}
              </BarChart>
            </ResponsiveContainer>
          )
        })()}
      </div>

      {/* Monthly table */}
      <div style={{marginTop:'0.5rem',overflowX:'auto',maxHeight:240,overflowY:'auto'}}>
        {view === 'revenue' ? (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.7rem'}}>
            <thead style={{position:'sticky',top:0,background:'#f8fafc',zIndex:1}}>
              <tr>{['Month','Plan Revenue','Actual Revenue','Variance','Var%','Cumulative Plan','Cumulative Actual'].map(h=>(
                <th key={h} style={{padding:'4px 8px',textAlign:h==='Month'?'left':'right',color:'#94a3b8',fontWeight:700,fontSize:'0.58rem',letterSpacing:'.05em',textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(() => { let cp=0, ca=0; return rows.map(r => {
                const planned = r.Budgeted_Revenue || 0
                const actual = r.Actual_Revenue || 0
                const rv = actual - planned
                const rvp = planned > 0 ? rv / planned * 100 : null
                cp += planned; ca += actual
                const good = rv >= 0
                return (
                  <tr key={r.Period}
                    onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}
                    onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='transparent')}>
                    <td style={{padding:'4px 8px',fontWeight:600,color:'#1e293b'}}>{fmtMonth(r.Period)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{k(planned)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:good?'#059669':'#dc2626',fontWeight:actual?700:400}}>{k(actual)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:good?'#059669':'#dc2626'}}>{k(rv)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right'}}>{rvp!=null&&<span style={{background:good?'#dcfce7':'#fee2e2',color:good?'#15803d':'#b91c1c',padding:'1px 6px',borderRadius:999,fontWeight:700}}>{rv>=0?'+':''}{rvp.toFixed(1)}%</span>}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{k(cp)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#059669'}}>{k(ca)}</td>
                  </tr>
                )
              })})()}
            </tbody>
            <tfoot>
              <tr style={{background:'#f1f5f9',fontWeight:700}}>
                <td style={{padding:'4px 8px'}}>TOTAL</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}>{k(totBudRev)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:totActRev>=totBudRev?'#059669':'#dc2626'}}>{k(totActRev)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:totActRev>=totBudRev?'#059669':'#dc2626'}}>{k(totActRev-totBudRev)}</td>
                <td style={{padding:'4px 8px',textAlign:'right'}}>{totBudRev>0&&<span style={{background:totActRev>=totBudRev?'#dcfce7':'#fee2e2',color:totActRev>=totBudRev?'#15803d':'#b91c1c',padding:'1px 6px',borderRadius:999,fontWeight:700}}>{totActRev>=totBudRev?'+':''}{((totActRev-totBudRev)/totBudRev*100).toFixed(1)}%</span>}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}>{k(totBudRev)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#059669'}}>{k(totActRev)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.7rem'}}>
            <thead style={{position:'sticky',top:0,background:'#f8fafc',zIndex:1}}>
              <tr>{['Month','Plan Cost','Act Cost','Variance','Var%','Plan Hrs','Act Hrs','Forecast'].map(h=>(
                <th key={h} style={{padding:'4px 8px',textAlign:h==='Month'?'left':'right',color:'#94a3b8',fontWeight:700,fontSize:'0.58rem',letterSpacing:'.05em',textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cv  = (r.Budgeted_Cost||0)-(r.Burdened_Cost||0)
                const cvp = r.Budgeted_Cost>0 ? cv/r.Budgeted_Cost*100 : null
                const over = cv<0
                return (
                  <tr key={r.Period}
                    onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}
                    onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='transparent')}>
                    <td style={{padding:'4px 8px',fontWeight:600,color:'#1e293b'}}>{fmtMonth(r.Period)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{k(r.Budgeted_Cost)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:over?'#dc2626':'#059669',fontWeight:over?700:400}}>{k(r.Burdened_Cost)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:cv>=0?'#059669':'#dc2626'}}>{k(cv)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right'}}>{cvp!=null&&<span style={{background:cvp>=0?'#dcfce7':'#fee2e2',color:cvp>=0?'#15803d':'#b91c1c',padding:'1px 6px',borderRadius:999,fontWeight:700}}>{cvp>=0?'▼ ':'▲ '}{Math.abs(cvp).toFixed(1)}%</span>}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{num(r.Budgeted_Hours)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}>{num(r.Actual_Hours)}</td>
                    <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#8b5cf6'}}>{burnRate&&r.Burdened_Cost===0?k(burnRate):'—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{background:'#f1f5f9',fontWeight:700}}>
                <td style={{padding:'4px 8px'}}>TOTAL</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}>{k(totBudCost)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:totActCost>totBudCost?'#dc2626':'#059669'}}>{k(totActCost)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:totBudCost-totActCost>=0?'#059669':'#dc2626'}}>{k(totBudCost-totActCost)}</td>
                <td style={{padding:'4px 8px',textAlign:'right'}}>{totBudCost>0&&<span style={{background:totActCost<=totBudCost?'#dcfce7':'#fee2e2',color:totActCost<=totBudCost?'#15803d':'#b91c1c',padding:'1px 6px',borderRadius:999,fontWeight:700}}>{totActCost<=totBudCost?'▼ ':'▲ '}{Math.abs((totBudCost-totActCost)/totBudCost*100).toFixed(1)}%</span>}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}>{num(totBudHrs)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:totActHrs>totBudHrs?'#dc2626':'#059669'}}>{num(totActHrs)}</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#8b5cf6'}}>{eac?k(eac):'—'}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol!==col) return <span style={{color:'#cbd5e1',marginLeft:3,fontSize:'0.6rem'}}>⇅</span>
  return <span style={{color:'#0891b2',marginLeft:3,fontSize:'0.6rem'}}>{sortDir==='asc'?'▲':'▼'}</span>
}


// ── Searchable multi-select column filter ───────────────────────────────────
function ColumnFilterDropdown({ label, options = [], selected = [], onChange, onClear }) {
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? options.filter(o => o.toLowerCase().includes(q)) : options).slice(0, 250)
  }, [options, query])
  const toggle = (value) => {
    const next = selectedSet.has(value) ? selected.filter(v => v !== value) : [...selected, value]
    onChange(next)
  }
  return (
    <details style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <summary style={{listStyle:'none',cursor:'pointer',height:22,border:'1px solid #e2e8f0',borderRadius:5,background:selected.length?'#e0f2fe':'white',color:selected.length?'#0369a1':'#64748b',display:'flex',alignItems:'center',justifyContent:'space-between',gap:4,padding:'0 5px',fontSize:'0.62rem',fontWeight:700,userSelect:'none'}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selected.length ? `${selected.length} selected` : 'Filter'}</span>
        <span>▾</span>
      </summary>
      <div style={{position:'absolute',top:25,left:0,zIndex:20,width:220,maxWidth:'70vw',background:'white',border:'1px solid #cbd5e1',borderRadius:8,boxShadow:'0 12px 30px rgba(15,23,42,.16)',padding:8,textAlign:'left'}}>
        <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${label}`} style={{width:'100%',boxSizing:'border-box',height:28,border:'1px solid #e2e8f0',borderRadius:6,padding:'2px 7px',fontSize:'0.72rem',fontFamily:"'DM Sans',sans-serif",outline:'none',marginBottom:6}} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5,fontSize:'0.62rem',color:'#64748b',gap:6}}>
          <span>{options.length.toLocaleString()} values</span>
          <div style={{display:'flex',gap:4}}>
            <button type="button" onClick={() => onChange(options)} style={{border:'none',background:'#ecfdf5',color:'#047857',borderRadius:4,cursor:'pointer',fontSize:'0.62rem'}}>Select all</button>
            {selected.length > 0 && <button type="button" onClick={onClear} style={{border:'none',background:'#f1f5f9',color:'#0369a1',borderRadius:4,cursor:'pointer',fontSize:'0.62rem'}}>Clear</button>}
          </div>
        </div>
        <div style={{maxHeight:220,overflow:'auto'}}>
          {visible.map(o => (
            <label key={o} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 2px',fontSize:'0.68rem',color:'#334155',cursor:'pointer'}}>
              <input type="checkbox" checked={selectedSet.has(o)} onChange={()=>toggle(o)} />
              <span title={o} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o || '—'}</span>
            </label>
          ))}
          {visible.length === 0 && <div style={{padding:'12px 4px',fontSize:'0.68rem',color:'#94a3b8',textAlign:'center'}}>No matching values</div>}
        </div>
      </div>
    </details>
  )
}


function serializeFilters(filters={}) {
  const params = new URLSearchParams()
  Object.entries(filters || {}).forEach(([k,v]) => {
    if (v == null || v === '') return
    if (Array.isArray(v)) { if (v.length) params.set(k, v.join(',')) }
    else params.set(k, String(v))
  })
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function OpportunityRevenueTable({ filters={} }) {
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/by-opportunity-projects${serializeFilters(filters)}`).then(r=>r.json()).then(d => {
      setRows(Array.isArray(d) ? d : [])
      setExpanded(prev => Object.keys(prev).length ? prev : (Array.isArray(d) && d[0] ? {[d[0].Opp_ID]: true} : {}))
    }).catch(()=>setRows([])).finally(()=>setLoading(false))
  }, [JSON.stringify(filters)])

  const qLabel = (q) => rows?.[0]?.projects?.[0]?.[`Revenue_Q${q}_Label`] || `Q${q} OL`
  const exportOpp = () => {
    const headers = ['Opportunity ID','Opportunity Name','Project Number','Project Name','TCV','% Complete','Current PM%','Rem Revenue',qLabel(1),qLabel(2),qLabel(3),qLabel(4),'Total 4Q']
    const aoa = [['Opportunity Revenue Outlook'], [`Exported ${new Date().toLocaleString()}`], [], headers]
    rows.forEach(o => {
      aoa.push([o.Opp_ID,o.Opp_Name,'TOTAL',`${o.Project_Count} projects`,o.TCV,o.Pct_Complete,o.Current_PM_Pct,o.Remaining_Revenue,o.Revenue_Q1,o.Revenue_Q2,o.Revenue_Q3,o.Revenue_Q4,qTotal(o)])
      ;(o.projects||[]).forEach(p => aoa.push([o.Opp_ID,o.Opp_Name,p.Project_ID,p.Project_Name,p.TCV,p.Pct_Complete,p.Current_PM_Pct,p.Remaining_Revenue,p.Revenue_Q1,p.Revenue_Q2,p.Revenue_Q3,p.Revenue_Q4,qTotal(p)]))
    })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = headers.map(h => ({wch: Math.max(12, h.length + 3)}))
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:3,c:0}, e:{r:Math.max(3,aoa.length-1),c:headers.length-1}}) }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'By Opportunity')
    XLSX.writeFile(wb, `Opportunity_Revenue_Outlook_${new Date().toISOString().slice(0,10)}.xlsx`, { compression:true })
  }
  const th = (align='right', w=100) => ({padding:'5px 5px',fontSize:'0.55rem',fontWeight:800,color:'#64748b',letterSpacing:'.04em',textTransform:'uppercase',textAlign:align,borderBottom:'1px solid #e2e8f0',background:'white',position:'sticky',top:0,zIndex:2,width:w,minWidth:0,whiteSpace:'normal',lineHeight:1.15})
  const td = (align='right', header=false) => ({padding:'5px 5px',textAlign:align,fontSize:'0.66rem',borderBottom:'1px solid #f1f5f9',background:header?'#f0f9ff':'white',fontWeight:header?800:500,overflow:'hidden',textOverflow:'ellipsis'})
  if (loading) return <div style={{padding:'2rem',textAlign:'center',color:'#64748b'}}>Loading opportunity revenue outlook…</div>
  return <div style={{border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',flex:'0 1 auto',minHeight:360,display:'flex',flexDirection:'column',maxWidth:'100%',width:'100%',margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
      <div style={{fontSize:'0.72rem',fontWeight:800,color:'#334155'}}>Revenue outlook by Opportunity ID, broken down by Project Number</div>
      <button onClick={exportOpp} disabled={!rows.length} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',border:'1px solid #bae6fd',borderRadius:6,background:rows.length?'#e0f2fe':'#f1f5f9',color:rows.length?'#0369a1':'#94a3b8',cursor:rows.length?'pointer':'not-allowed',fontSize:'0.68rem',fontWeight:800,fontFamily:"'DM Sans',sans-serif"}}><Download size={13}/> Export Excel</button>
    </div>
    <div style={{overflowY:'auto',overflowX:'hidden',flex:1}}>
      <table style={{width:'100%',minWidth:0,borderCollapse:'collapse',tableLayout:'fixed'}}>
        <thead><tr><th style={th('left','24%')}>Opportunity / Project</th><th style={th('right','9%')}>TCV</th><th style={th('right','8%')}>% Complete</th><th style={th('right','10%')}>Current PM%</th><th style={th('right','10%')}>Rem Revenue</th><th style={th('right','8%')}>{qLabel(1)}</th><th style={th('right','8%')}>{qLabel(2)}</th><th style={th('right','8%')}>{qLabel(3)}</th><th style={th('right','8%')}>{qLabel(4)}</th><th style={th('right','9%')}>Total 4Q</th></tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={10} style={{padding:'2rem',textAlign:'center',color:'#94a3b8'}}>No opportunity revenue data available.</td></tr>}
          {rows.map(o => <>
            <tr key={o.Opp_ID} onClick={()=>setExpanded(e=>({...e,[o.Opp_ID]:!e[o.Opp_ID]}))} style={{cursor:'pointer'}}>
              <td style={{...td('left',true),borderLeft:'3px solid #0891b2'}}><div style={{display:'flex',alignItems:'center',gap:6}}>{expanded[o.Opp_ID]?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<div><div>{o.Opp_ID}</div>{o.Opp_Name&&<div title={o.Opp_Name} style={{fontSize:'0.58rem',color:'#64748b',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o.Opp_Name}</div>}<div style={{fontSize:'0.6rem',color:'#94a3b8'}}>{o.Project_Count} projects</div></div></div></td>
              <td style={td('right',true)}>{k(o.TCV)}</td><td style={td('right',true)}>{o.Pct_Complete!=null?`${o.Pct_Complete.toFixed(1)}%`:'—'}</td><td style={td('right',true)}><PMPill val={o.Current_PM_Pct}/></td><td style={td('right',true)}>{k(o.Remaining_Revenue)}</td><td style={td('right',true)}>{k(o.Revenue_Q1)}</td><td style={td('right',true)}>{k(o.Revenue_Q2)}</td><td style={td('right',true)}>{k(o.Revenue_Q3)}</td><td style={td('right',true)}>{k(o.Revenue_Q4)}</td><td style={td('right',true)}>{k(qTotal(o))}</td>
            </tr>
            {expanded[o.Opp_ID] && (o.projects||[]).map(p => <tr key={`${o.Opp_ID}-${p.Project_ID}`}><td style={td('left')}><div style={{paddingLeft:22}}><div style={{fontWeight:700,color:'#1e293b'}}>{p.Project_ID}</div>{p.Project_Name&&<div title={p.Project_Name} style={{fontSize:'0.58rem',color:'#64748b',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.Project_Name}</div>}</div></td><td style={td()}>{k(p.TCV)}</td><td style={td()}>{p.Pct_Complete!=null?`${p.Pct_Complete.toFixed(1)}%`:'—'}</td><td style={td()}><PMPill val={p.Current_PM_Pct}/></td><td style={td()}>{k(p.Remaining_Revenue)}</td><td style={td()}>{k(p.Revenue_Q1)}</td><td style={td()}>{k(p.Revenue_Q2)}</td><td style={td()}>{k(p.Revenue_Q3)}</td><td style={td()}>{k(p.Revenue_Q4)}</td><td style={td()}>{k(qTotal(p))}</td></tr>)}
          </>)}
        </tbody>
      </table>
    </div>
  </div>
}



function SimpleRollupTable({ title, rows=[] }) {
  const [expanded,setExpanded]=useState({})
  const [colFilters,setColFilters]=useState({})
  const qLabel=q=>rows?.[0]?.[`Revenue_Q${q}_Label`]||`Q${q} OL`
  const cols=[{key:'Service_Line',label:'SL Group / Service Line',align:'left',w:220,type:'text'},{key:'TCV',label:'TCV',w:105,type:'num'},{key:'Current_PM_Pct',label:'Current PM%',w:105,type:'num'},{key:'Revenue_Q1',label:qLabel(1),w:100,type:'num'},{key:'Revenue_Q2',label:qLabel(2),w:100,type:'num'},{key:'Revenue_Q3',label:qLabel(3),w:100,type:'num'},{key:'Revenue_Q4',label:qLabel(4),w:100,type:'num'},{key:'Revenue_4Q',label:'Total 4Q',w:105,type:'num'}]
  const display=(r,c)=> c.key==='Service_Line' ? (r.Service_Line||'Unassigned') : c.key.includes('Pct') ? String(Math.round((r[c.key]||0)*10)/10) : String(Math.round(c.key==='Revenue_4Q'?qTotal(r):(r[c.key]||0)))
  const prepared=useMemo(()=>rows.map(r=>({row:r,filterText:Object.fromEntries(cols.map(c=>[c.key,display(r,c)]))})),[rows])
  const options=useMemo(()=>Object.fromEntries(cols.map(c=>[c.key,[...new Set(prepared.map(x=>x.filterText[c.key]||'—'))].sort((a,b)=>a.localeCompare(b))])),[prepared])
  const filtered=useMemo(()=>{const sets=Object.entries(colFilters).filter(([,v])=>Array.isArray(v)&&v.length).map(([k,v])=>[k,new Set(v)]);return sets.length?prepared.filter(x=>sets.every(([k,set])=>set.has(x.filterText[k]||'—'))).map(x=>x.row):prepared.map(x=>x.row)},[prepared,colFilters])
  const total=filtered.reduce((t,r)=>{['TCV','Revenue_Q1','Revenue_Q2','Revenue_Q3','Revenue_Q4'].forEach(k=>t[k]=(t[k]||0)+(r[k]||0));t.Revenue_Accrued=(t.Revenue_Accrued||0)+(r.Revenue_Accrued||0);t.Burdened_Cost=(t.Burdened_Cost||0)+(r.Burdened_Cost||0);return t},{})
  total.Current_PM_Pct=total.Revenue_Accrued>0?(total.Revenue_Accrued-total.Burdened_Cost)/total.Revenue_Accrued*100:null
  const border='1px solid #e2e8f0'
  const th=(a='right',w=100)=>({padding:'6px 8px',fontSize:'0.6rem',fontWeight:800,color:'#64748b',letterSpacing:'.06em',textTransform:'uppercase',textAlign:a,border,background:'white',position:'sticky',top:0,zIndex:3,minWidth:w,whiteSpace:'nowrap'})
  const td=(a='right',h=false)=>({padding:'6px 8px',textAlign:a,fontSize:'0.72rem',border,background:h?'#f0f9ff':'white',fontWeight:h?800:500})
  const render=(r,c)=>c.key==='Service_Line'?(r.children?<div style={{display:'flex',alignItems:'center',gap:6}}>{expanded[r.Service_Line]?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span>{r.Service_Line}</span></div>:<span style={{paddingLeft:22}}>{r.Service_Line}</span>):c.key==='Current_PM_Pct'?<PMPill val={r.Current_PM_Pct}/>:k(c.key==='Revenue_4Q'?qTotal(r):r[c.key])
  const exportRows=()=>{const headers=cols.map(c=>c.label);const aoa=[[title],[`Exported ${new Date().toLocaleString()}`],[],headers];filtered.forEach(r=>{aoa.push(cols.map(c=>c.key==='Service_Line'?r.Service_Line:(c.key==='Revenue_4Q'?qTotal(r):r[c.key])));(expanded[r.Service_Line]&&(r.children||[])).forEach(ch=>aoa.push(cols.map(c=>c.key==='Service_Line'?`  ${ch.Service_Line}`:(c.key==='Revenue_4Q'?qTotal(ch):ch[c.key])))) });aoa.push(cols.map(c=>c.key==='Service_Line'?`TOTAL (${filtered.length})`:(c.key==='Revenue_4Q'?qTotal(total):(total[c.key]??''))));const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=cols.map(c=>({wch:Math.max(12,Math.round((c.w||100)/5.5))}));ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:3,c:0},e:{r:Math.max(3,aoa.length-1),c:cols.length-1}})};const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Service Line View');XLSX.writeFile(wb,`Service_Line_View_${new Date().toISOString().slice(0,10)}.xlsx`,{compression:true})}
  return <div style={{width:'100%',maxWidth:980,margin:'0 auto',border,borderRadius:8,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:430}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',borderBottom:border,background:'#f8fafc'}}><div style={{fontSize:'0.74rem',fontWeight:800,color:'#334155'}}>{title}</div><button onClick={exportRows} disabled={!filtered.length} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',border:'1px solid #bae6fd',borderRadius:6,background:filtered.length?'#e0f2fe':'#f1f5f9',color:filtered.length?'#0369a1':'#94a3b8',cursor:filtered.length?'pointer':'not-allowed',fontSize:'0.68rem',fontWeight:800,fontFamily:"'DM Sans',sans-serif"}}><Download size={13}/> Export Excel</button></div><div style={{overflow:'auto',flex:1}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{cols.map(c=><th key={c.key} style={th(c.align||'right',c.w)}>{c.label}</th>)}</tr><tr>{cols.map(c=><th key={`f-${c.key}`} style={{...th(c.align||'right',c.w),top:29,background:'#f8fafc',padding:'3px 6px'}}><ColumnFilterDropdown label={c.label} options={options[c.key]||[]} selected={colFilters[c.key]||[]} onChange={vals=>setColFilters(p=>({...p,[c.key]:vals}))} onClear={()=>setColFilters(p=>({...p,[c.key]:[]}))}/></th>)}</tr><tr>{cols.map(c=><th key={`t-${c.key}`} style={{...th(c.align||'right',c.w),top:57,background:'#fff7ed',fontSize:'0.7rem'}}>{c.key==='Service_Line'?`TOTAL (${filtered.length})`:c.key==='Current_PM_Pct'?<PMPill val={total.Current_PM_Pct}/>:k(c.key==='Revenue_4Q'?qTotal(total):total[c.key])}</th>)}</tr></thead><tbody>{!filtered.length&&<tr><td colSpan={cols.length} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',border}}>No rows match selected filters.</td></tr>}{filtered.map(r=><>{<tr key={r.Service_Line} onClick={()=>r.children&&setExpanded(e=>({...e,[r.Service_Line]:!e[r.Service_Line]}))} style={{cursor:r.children?'pointer':'default'}}>{cols.map(c=><td key={c.key} style={td(c.align||'right',!!r.children)}>{render(r,c)}</td>)}</tr>}{expanded[r.Service_Line]&&(r.children||[]).map(ch=><tr key={`${r.Service_Line}-${ch.Service_Line}`}>{cols.map(c=><td key={c.key} style={td(c.align||'right')}>{render(ch,c)}</td>)}</tr>)}</>)}</tbody></table></div></div>
}

export function ServiceLineView({ rows=[] }) { return <SimpleRollupTable title="Service Line View" rows={rows}/> }

// ── Main Project Table ────────────────────────────────────────────────────────


export function OpportunityRollupView({ filters={} }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})
  useEffect(() => {
    setLoading(true)
    fetch(`/api/by-opportunity-projects${serializeFilters(filters)}`)
      .then(r => r.json())
      .then(d => {
        const data = Array.isArray(d) ? d : []
        setRows(data)
        const first = data[0]?.Opp_ID
        if (first) setExpanded({ [first]: true })
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [JSON.stringify(filters)])
  if (loading) return <div style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontSize:'0.82rem'}}>Loading opportunity view…</div>
  const qLabel = n => rows[0]?.[`Revenue_Q${n}_Label`] || `Q${n}`
  const cols=[
    {key:'Service_Line',label:'Opportunity / Project',align:'left',w:230,type:'text'},
    {key:'Pct_Complete',label:'% Complete',w:100,type:'pct'},
    {key:'TCV',label:'TCV',w:105,type:'num'},
    {key:'Current_PM_Pct',label:'Current PM%',w:105,type:'pm'},
    {key:'Revenue_Q1',label:qLabel(1),w:100,type:'num'},
    {key:'Revenue_Q2',label:qLabel(2),w:100,type:'num'},
    {key:'Revenue_Q3',label:qLabel(3),w:100,type:'num'},
    {key:'Revenue_Q4',label:qLabel(4),w:100,type:'num'},
    {key:'Revenue_4Q',label:'Total 4Q',w:105,type:'num'},
  ]
  const norm = rows.map(o => ({
    ...o,
    Service_Line: o.Opp_ID || o.Opp_Name || 'Opportunity',
    Revenue_4Q: qTotal(o),
    children: (o.projects || []).map(p => ({
      ...p,
      Service_Line: `${p.Project_ID}${p.Project_Name ? ' — ' + p.Project_Name : ''}`,
      Revenue_4Q: qTotal(p),
    }))
  }))
  const totals = norm.reduce((a,r)=>{ for (const k of ['TCV','Revenue_Q1','Revenue_Q2','Revenue_Q3','Revenue_Q4','Revenue_4Q']) a[k]=(a[k]||0)+(r[k]||0); return a },{})
  const totalPct = norm.length ? norm.reduce((s,r)=>s+(r.Pct_Complete||0)*(r.TCV||1),0) / norm.reduce((s,r)=>s+(r.TCV||1),0) : 0
  const th=(align='right',w=100)=>({padding:'7px 10px',fontSize:'0.62rem',fontWeight:800,color:'#64748b',letterSpacing:'.06em',textTransform:'uppercase',textAlign:align,borderBottom:'2px solid #e2e8f0',background:'white',position:'sticky',top:0,zIndex:2,minWidth:w,whiteSpace:'nowrap'})
  const td=(align='right',strong=false)=>({padding:'7px 10px',fontSize:'0.76rem',textAlign:align,borderBottom:'1px solid #f1f5f9',background:strong?'#f0f9ff':'white',fontWeight:strong?800:500})
  const val=(r,c)=> c.type==='pm'?<PMPill val={r[c.key]}/>:c.type==='pct'?`${Number(r[c.key]||0).toFixed(1)}%`:c.type==='num'?k(r[c.key]||0):r[c.key]
  return <div style={{width:'100%',maxWidth:980,margin:'0 auto',overflow:'auto',border:'1px solid #e2e8f0',borderRadius:8,maxHeight:'calc(100vh - 210px)'}}>
    <table style={{width:'100%',borderCollapse:'collapse'}}>
      <thead><tr>{cols.map(c=><th key={c.key} style={th(c.align||'right',c.w)}>{c.label}</th>)}</tr></thead>
      <tbody>
        {norm.map(r => <>
          <tr key={r.Opp_ID} onClick={()=>setExpanded(e=>({...e,[r.Opp_ID]:!e[r.Opp_ID]}))} style={{cursor:'pointer'}}>
            {cols.map((c,i)=><td key={c.key} style={td(c.align||'right',true)}>{i===0?<div style={{display:'flex',alignItems:'center',gap:6}}>{expanded[r.Opp_ID]?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span>{val(r,c)}</span></div>:val(r,c)}</td>)}
          </tr>
          {expanded[r.Opp_ID] && (r.children||[]).map(ch => <tr key={`${r.Opp_ID}-${ch.Project_ID}`}>
            {cols.map((c,i)=><td key={c.key} style={{...td(c.align||'right'),paddingLeft:i===0?34:10}}>{val(ch,c)}</td>)}
          </tr>)}
        </>)}
        <tr>{cols.map(c=><td key={c.key} style={{...td(c.align||'right',true),background:'#fff7ed',borderTop:'2px solid #cbd5e1'}}>{c.key==='Service_Line'?`TOTAL (${norm.length})`:c.key==='Pct_Complete'?`${totalPct.toFixed(1)}%`:c.type==='pm'?'':c.type==='num'?k(totals[c.key]||0):''}</td>)}</tr>
      </tbody>
    </table>
  </div>
}

export function ProjectTable({ data, summary, activeFilters={}, onReload }) {
  const [expanded, setExpanded] = useState({})
  const [editRow, setEditRow] = useState(null)
  const [sortCol, setSortCol] = useState('Project_ID')
  const [sortDir, setSortDir] = useState('asc')
  const [colFilters, setColFilters] = useState({})
  const [showVolumeCols, setShowVolumeCols] = useState(true)

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const qLabel = (q) => (data?.[0]?.[`Revenue_Q${q}_Label`] || `Q${q} OL`)

  const BASE_COLS = [
    {key:'Project_ID', label:'Project', w:185, align:'left', type:'text'},
    {key:'Project_Status', label:'Status', w:90, align:'center', type:'text'},
    {key:'RAG', label:'Health', w:92, align:'center', type:'text'},
    {key:'Pct_Complete', label:'% Complete', w:86, align:'center', type:'num'},
    {key:'Start_Date', label:'Start', w:78, align:'center', type:'text'},
    {key:'End_Date', label:'End', w:95, align:'center', type:'text'},
    {key:'TCV', label:'TCV', w:88, type:'num'},
    {key:'Planned_PM_Pct', label:'Planned PM%', w:92, type:'num'},
    {key:'Current_PM_Pct', label:'Current PM%', w:92, type:'num'},
    {key:'Projected_PM_Pct', label:'Projected PM%', w:98, type:'num'},
    {key:'Remaining_Revenue', label:'Rem Revenue', w:96, type:'num'},
    {key:'Revenue_Q1', label:qLabel(1), w:92, type:'num'},
    {key:'Revenue_Q2', label:qLabel(2), w:92, type:'num'},
    {key:'Revenue_Q3', label:qLabel(3), w:92, type:'num'},
    {key:'Revenue_Q4', label:qLabel(4), w:92, type:'num'},
    {key:'Revenue_4Q', label:'Total 4Q', w:96, type:'num'},
    {key:'Budgeted_Cost', label:'Planned Bud', w:98, type:'num'},
    {key:'Burdened_Cost', label:'Cost to Date', w:102, type:'num'},
    {key:'Revenue_Accrued', label:'Rev to Date', w:102, type:'num'},
  ]
  const COLS = BASE_COLS.filter(c => showVolumeCols || !c.volume)

  const displayForFilter = (r, c) => {
    let val = c.key === 'Revenue_4Q' ? qTotal(r) : r[c.key]
    if (c.key === 'Project_ID') val = [r.Project_ID, r.Project_Name].filter(Boolean).join(' — ')
    if (c.key === 'RAG') val = r.RAG === 'RED' ? 'Off Track' : r.RAG === 'AMBER' ? 'At Risk' : 'On Track'
    if (c.key === 'Project_Status') val = r.Project_Status || r.Status || 'Active'
    if (c.key === 'Start_Date') val = r.Start_Date || r.Start_Date_Full || ''
    if (c.key === 'End_Date') val = r.End_Date || r.End_Date_Full || ''
    if (val == null || val === '') return '—'
    if (c.type === 'num') {
      const n = Number(val)
      if (!Number.isFinite(n)) return String(val)
      if (c.key.includes('Pct')) return `${Math.round(n * 10) / 10}`
      return `${Math.round(n)}`
    }
    return String(val)
  }

  const preparedRows = useMemo(() => (data || []).map(r => {
    const filterText = {}
    COLS.forEach(c => { filterText[c.key] = displayForFilter(r, c) })
    return { row: r, filterText }
  }), [data, showVolumeCols])

  const filterOptions = useMemo(() => {
    const out = {}
    COLS.forEach(c => {
      const set = new Set()
      preparedRows.forEach(({filterText}) => set.add(filterText[c.key] || '—'))
      out[c.key] = [...set].sort((a,b) => {
        const na = Number(a), nb = Number(b)
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
        return a.localeCompare(b)
      })
    })
    return out
  }, [preparedRows, showVolumeCols])

  const sorted = useMemo(() => {
    const activeFilters = Object.entries(colFilters).filter(([,v]) => Array.isArray(v) && v.length)
    const filterSets = activeFilters.map(([key, vals]) => [key, new Set(vals)])
    const filteredRows = filterSets.length
      ? preparedRows.filter(({filterText}) => filterSets.every(([key, set]) => set.has(filterText[key] || '—'))).map(x => x.row)
      : preparedRows.map(x => x.row)
    return [...filteredRows].sort((a,b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (sortCol === 'Project_ID') { av = `${a.Project_ID || ''} ${a.Project_Name || ''}`; bv = `${b.Project_ID || ''} ${b.Project_Name || ''}` }
      if (sortCol === 'Project_Status') { av = a.Project_Status || a.Status || 'Active'; bv = b.Project_Status || b.Status || 'Active' }
      if (sortCol === 'RAG') { av = av || ''; bv = bv || '' }
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(String(bv)) : String(bv).localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [preparedRows, colFilters, sortCol, sortDir])

  if (!data?.length) return <div style={{color:'#94a3b8',padding:'3rem',textAlign:'center',fontSize:'0.85rem'}}>No project data. Upload your Budget_Cost.xlsx file.</div>

  const tot = {
    TCV: sorted.reduce((s,r)=>s+(r.TCV||0),0),
    Budgeted_Cost: sorted.reduce((s,r)=>s+(r.Budgeted_Cost||0),0),
    Burdened_Cost: sorted.reduce((s,r)=>s+(r.Burdened_Cost||0),0),
    Revenue_Accrued: sorted.reduce((s,r)=>s+(r.Revenue_Accrued||0),0),
    Remaining_Revenue: sorted.reduce((s,r)=>s+(r.Remaining_Revenue||0),0),
    Revenue_Q1: sorted.reduce((s,r)=>s+(r.Revenue_Q1||0),0),
    Revenue_Q2: sorted.reduce((s,r)=>s+(r.Revenue_Q2||0),0),
    Revenue_Q3: sorted.reduce((s,r)=>s+(r.Revenue_Q3||0),0),
    Revenue_Q4: sorted.reduce((s,r)=>s+(r.Revenue_Q4||0),0),
    Revenue_4Q: sorted.reduce((s,r)=>s+qTotal(r),0),
  }
  const totCurrPM = tot.Revenue_Accrued > 0 ? (tot.Revenue_Accrued - tot.Burdened_Cost) / tot.Revenue_Accrued * 100 : null

  const th = (w, align='right', top=0, z=3) => ({
    padding:'6px 8px',fontSize:'0.6rem',fontWeight:700,color:'#64748b',letterSpacing:'.06em',textTransform:'uppercase',textAlign:align,borderBottom:'1px solid #e2e8f0',background:'white',position:'sticky',top,zIndex:z,minWidth:w,whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'
  })
  const filterCell = (w, align='right') => ({
    padding:'3px 6px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',position:'sticky',top:29,zIndex:3,minWidth:w,textAlign:align
  })
  const totalCell = (align='right') => ({
    padding:'6px 8px',textAlign:align,fontSize:'0.72rem',borderBottom:'2px solid #cbd5e1',background:'#fff7ed',fontWeight:800,position:'sticky',top:57,zIndex:3,color:'#1e293b'
  })
  const td = (align='right') => ({padding:'6px 8px',textAlign:align,fontSize:'0.74rem',border:'1px solid #e2e8f0',background:'white'})
  const COL_COUNT = COLS.length + 1

  const excelValue = (r, c) => {
    if (c.key === 'Project_ID') return [r.Project_ID, r.Project_Name].filter(Boolean).join(' — ')
    if (c.key === 'Project_Status') return r.Project_Status || r.Status || 'Active'
    if (c.key === 'RAG') return r.RAG === 'RED' ? 'Off Track' : r.RAG === 'AMBER' ? 'At Risk' : 'On Track'
    if (c.key === 'Start_Date') return r.Start_Date || r.Start_Date_Full || ''
    if (c.key === 'End_Date') return r.End_Date || r.End_Date_Full || ''
    const val = c.key === 'Revenue_4Q' ? qTotal(r) : r[c.key]
    if (val == null || val === '') return ''
    return c.type === 'num' ? Number(val) : String(val)
  }

  const exportProfitabilityToExcel = () => {
    const headers = COLS.map(c => c.label)
    const rows = sorted.map(r => COLS.map(c => excelValue(r, c)))
    const totalRow = COLS.map(c => {
      if (c.key === 'Project_ID') return `TOTAL (${sorted.length})`
      if (c.key === 'TCV') return tot.TCV
      if (c.key === 'Planned_PM_Pct') return ''
      if (c.key === 'Current_PM_Pct') return totCurrPM
      if (c.key === 'Projected_PM_Pct') return ''
      if (c.key === 'Remaining_Revenue') return tot.Remaining_Revenue
      if (c.key === 'Revenue_Q1') return tot.Revenue_Q1
      if (c.key === 'Revenue_Q2') return tot.Revenue_Q2
      if (c.key === 'Revenue_Q3') return tot.Revenue_Q3
      if (c.key === 'Revenue_Q4') return tot.Revenue_Q4
      if (c.key === 'Revenue_4Q') return tot.Revenue_4Q
      if (c.key === 'Budgeted_Cost') return tot.Budgeted_Cost
      if (c.key === 'Burdened_Cost') return tot.Burdened_Cost
      if (c.key === 'Revenue_Accrued') return tot.Revenue_Accrued
      return ''
    })

    const aoa = [
      ['Project Profitability Report'],
      [`Exported ${new Date().toLocaleString()} | Rows: ${sorted.length}`],
      [],
      headers,
      ...rows,
      totalRow,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [
      {s:{r:0,c:0}, e:{r:0,c:Math.max(COLS.length - 1, 0)}},
      {s:{r:1,c:0}, e:{r:1,c:Math.max(COLS.length - 1, 0)}},
    ]
    ws['!cols'] = COLS.map(c => ({wch: Math.max(10, Math.min(34, Math.round((c.w || 90) / 5.5)))}))
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:3,c:0}, e:{r:3 + rows.length,c:COLS.length-1}}) }
    ws['!freeze'] = {xSplit:0, ySplit:4}

    const pctKeys = new Set(['Current_PM_Pct','Pct_Complete'])
    const currencyKeys = new Set(['TCV','Remaining_Revenue','Revenue_Q1','Revenue_Q2','Revenue_Q3','Revenue_Q4','Revenue_4Q','Budgeted_Cost','Burdened_Cost','Revenue_Accrued',''])
    const decimalKeys = new Set([])
    for (let r = 4; r <= 4 + rows.length; r++) {
      COLS.forEach((c, idx) => {
        const addr = XLSX.utils.encode_cell({r, c:idx})
        const cell = ws[addr]
        if (!cell) return
        if (pctKeys.has(c.key)) cell.z = '0.0%'
        else if (currencyKeys.has(c.key)) cell.z = '$#,##0;[Red]-$#,##0'
        else if (decimalKeys.has(c.key)) cell.z = '0.0'
        else if (c.type === 'num') cell.z = '#,##0'
        if (pctKeys.has(c.key) && typeof cell.v === 'number') cell.v = cell.v / 100
      })
    }

    // Give downstream users an Excel-native filterable table range with the visible, currently filtered rows.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Project Profitability')
    XLSX.writeFile(wb, `Project_Profitability_${new Date().toISOString().slice(0,10)}.xlsx`, { compression:true })
  }


  const renderTotal = (key) => {
    if (key === 'Project_ID') return `TOTAL (${sorted.length})`
    if (key === 'TCV') return k(tot.TCV)
    if (key === 'Budgeted_Cost') return k(tot.Budgeted_Cost)
    if (key === 'Burdened_Cost') return k(tot.Burdened_Cost)
    if (key === 'Revenue_Accrued') return k(tot.Revenue_Accrued)
    if (key === 'Planned_PM_Pct') return ''
    if (key === 'Current_PM_Pct') return <PMPill val={totCurrPM != null ? Math.round(totCurrPM*10)/10 : null}/>
    if (key === 'Projected_PM_Pct') return ''
    if (key === 'Remaining_Revenue') return k(tot.Remaining_Revenue)
    if (key === 'Revenue_Q1') return k(tot.Revenue_Q1)
    if (key === 'Revenue_Q2') return k(tot.Revenue_Q2)
    if (key === 'Revenue_Q3') return k(tot.Revenue_Q3)
    if (key === 'Revenue_Q4') return k(tot.Revenue_Q4)
    if (key === 'Revenue_4Q') return k(tot.Revenue_4Q)
    return ''
  }

  const statusBadge = (status) => {
    const cfg = status === 'Closed' ? {bg:'#f1f5f9', color:'#475569'} : status === 'Past Due' ? {bg:'#ffedd5', color:'#c2410c'} : {bg:'#dcfce7', color:'#15803d'}
    return <span style={{background:cfg.bg,color:cfg.color,padding:'2px 7px',borderRadius:999,fontSize:'0.68rem',fontWeight:800,whiteSpace:'nowrap'}}>{status || 'Active'}</span>
  }

  const endDateCell = r => {
    if (!r.End_Date) return <span style={{fontSize:'0.7rem',color:'#94a3b8'}}>—</span>
    const status = r.Project_Status || r.Status
    const now = new Date()
    const [ey,em] = String(r.End_Date).split('-').map(Number)
    const rem = (ey - now.getFullYear())*12 + (em - (now.getMonth()+1))
    if (status === 'Closed') {
      return <div><div style={{fontSize:'0.7rem',color:'#475569',fontWeight:600,whiteSpace:'nowrap'}}>{r.End_Date}</div><span style={{background:'#f1f5f9',color:'#475569',padding:'1px 5px',borderRadius:3,fontSize:'0.6rem',fontWeight:800}}>Closed</span></div>
    }
    if (status === 'Past Due' || rem < 0) {
      return <div><div style={{fontSize:'0.7rem',color:'#dc2626',fontWeight:600,whiteSpace:'nowrap'}}>{r.End_Date}</div><span style={{background:'#fee2e2',color:'#b91c1c',padding:'1px 5px',borderRadius:3,fontSize:'0.6rem',fontWeight:800}}>Past Due</span></div>
    }
    return <div><div style={{fontSize:'0.7rem',color:rem<=3?'#d97706':'#059669',fontWeight:600,whiteSpace:'nowrap'}}>{r.End_Date}</div><span style={{background:rem<=3?'#fef3c7':'#f0f9ff',color:rem<=3?'#b45309':'#0369a1',padding:'1px 5px',borderRadius:3,fontSize:'0.6rem',fontWeight:800,whiteSpace:'nowrap'}}>{rem===0?'this month':`${rem}mo left`}</span></div>
  }

  return <>
    <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap',flexShrink:0}}>
      <button onClick={exportProfitabilityToExcel} disabled={!sorted.length} title="Export visible filtered rows to formatted Excel" style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',border:'1px solid #bae6fd',borderRadius:6,background:sorted.length?'#e0f2fe':'#f1f5f9',color:sorted.length?'#0369a1':'#94a3b8',cursor:sorted.length?'pointer':'not-allowed',fontSize:'0.68rem',fontWeight:800,fontFamily:"'DM Sans',sans-serif"}}>
        <Download size={13}/> Export formatted Excel
      </button>
    </div>
    <div style={{overflow:'auto',maxHeight:'calc(100vh - 218px)',border:'1px solid #e2e8f0',borderRadius:8,flex:1,minHeight:430,maxWidth:1280,width:'100%',margin:'0 auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr>{COLS.map(c=><th key={c.key} style={th(c.w,c.align||'right',0,4)} onClick={()=>toggleSort(c.key)}>{c.label}<SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir}/></th>)}<th style={{...th(58,'center',0,4),cursor:'default'}}>Edit</th></tr>
          <tr>{COLS.map(c=><th key={`f-${c.key}`} style={filterCell(c.w,c.align||'right')}><ColumnFilterDropdown label={c.label} options={filterOptions[c.key] || []} selected={colFilters[c.key] || []} onChange={(vals)=>setColFilters(prev=>({...prev,[c.key]:vals}))} onClear={()=>setColFilters(prev=>({...prev,[c.key]:[]}))}/></th>)}<th style={filterCell(58,'center')}>{Object.values(colFilters).some(v=>Array.isArray(v)&&v.length) && <button onClick={()=>setColFilters({})} style={{fontSize:'0.6rem',border:'none',background:'#e0f2fe',color:'#0369a1',borderRadius:4,cursor:'pointer'}}>Clear</button>}</th></tr>
          <tr>{COLS.map(c=><th key={`t-${c.key}`} style={totalCell(c.align||'right')}>{renderTotal(c.key)}</th>)}<th style={totalCell('center')}></th></tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={COL_COUNT} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontSize:'0.82rem'}}>No rows match the selected filters.</td></tr>}
          {sorted.map(r => {
            const isExpanded = !!expanded[r.Project_ID]
            const overBudget = (r.Burdened_Cost||0) > (r.Budgeted_Cost||0)
            const status = r.Project_Status || r.Status || 'Active'
            return <>
              <tr key={r.Project_ID} style={{cursor:'default'}} onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')} onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background=isExpanded?'#f0f9ff':'white')}>
                <td style={{...td('left'),position:'sticky',left:0,background:isExpanded?'#f0f9ff':'white',zIndex:2,borderLeft:`3px solid ${isExpanded?'#0891b2':'transparent'}`}}><div style={{display:'flex',alignItems:'center',gap:6}}><div><div style={{fontWeight:700,fontSize:'0.74rem',color:'#1e293b'}}>{r.Project_ID}</div>{r.Project_Name&&<div style={{fontSize:'0.62rem',color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:155}} title={r.Project_Name}>{r.Project_Name}</div>}</div></div></td>
                <td style={td('center')}>{statusBadge(status)}</td>
                <td style={td('center')}><RAGBadge rag={r.RAG||'GREEN'}/></td>
                <td style={td('center')}><div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}><span style={{fontWeight:700,fontSize:'0.76rem',color:'#1e293b'}}>{r.Pct_Complete!=null?`${r.Pct_Complete.toFixed(1)}%`:'—'}</span><div style={{width:54,height:4,background:'#e2e8f0',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(r.Pct_Complete||0,100)}%`,background:(r.Pct_Complete||0)>=80?'#059669':(r.Pct_Complete||0)>=50?'#0891b2':'#f59e0b'}}/></div></div></td>
                <td style={td('center')}><span style={{fontSize:'0.7rem',color:'#64748b',whiteSpace:'nowrap'}}>{r.Start_Date||'—'}</span></td>
                <td style={td('center')}>{endDateCell(r)}</td>
                <td style={td()}><span style={{fontFamily:'monospace',fontWeight:600}}>{k(r.TCV)}</span></td>
                <td style={td()}><PMPill val={r.Planned_PM_Pct!=null?Math.round(r.Planned_PM_Pct*10)/10:null}/></td>
                <td style={td()}><PMPill val={r.Current_PM_Pct!=null?Math.round(r.Current_PM_Pct*10)/10:null}/></td>
                <td style={td()}><PMPill val={r.Projected_PM_Pct!=null?Math.round(r.Projected_PM_Pct*10)/10:null}/></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0891b2'}}>{k(r.Remaining_Revenue)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0f766e',fontWeight:600}}>{k(r.Revenue_Q1)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0f766e',fontWeight:600}}>{k(r.Revenue_Q2)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0f766e',fontWeight:600}}>{k(r.Revenue_Q3)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0f766e',fontWeight:600}}>{k(r.Revenue_Q4)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#0f766e',fontWeight:800}}>{k(qTotal(r))}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#64748b'}}>{k(r.Budgeted_Cost)}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',fontWeight:overBudget?700:400,color:overBudget?'#dc2626':'#059669'}}>{k(r.Burdened_Cost)}{overBudget?' ▲':''}</span></td>
                <td style={td()}><span style={{fontFamily:'monospace',color:'#059669',fontWeight:600}}>{k(r.Revenue_Accrued)}</span></td>
                <td style={{...td('center')}} onClick={e=>{e.stopPropagation();setEditRow(r)}}><button style={{background:'none',border:'1px solid #e2e8f0',borderRadius:5,padding:'3px 7px',cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center',gap:3,fontSize:'0.68rem',fontFamily:"'DM Sans',sans-serif"}} onClick={e=>{e.stopPropagation();setEditRow(r)}}><Edit3 size={11}/> Edit</button></td>
              </tr>
            </>
          })}
        </tbody>
      </table>
    </div>
    {editRow && <EditModal row={editRow} onSave={onReload||(()=>{})} onClose={()=>setEditRow(null)}/>} 
  </>
}


export function DrilldownReport({ projects=[] }) {
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!selected && Array.isArray(projects) && projects.length) setSelected(projects[0].Project_ID)
  }, [projects, selected])
  const current = (projects || []).find(p => p.Project_ID === selected) || null
  if (!projects?.length) return <div style={{color:'#94a3b8',padding:'3rem',textAlign:'center',fontSize:'0.85rem'}}>No project data available for drill down.</div>
  return <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:1180,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 10px'}}>
      <div>
        <div style={{fontSize:'0.78rem',fontWeight:800,color:'#1e293b'}}>Monthly Project Drill Down</div>
        <div style={{fontSize:'0.66rem',color:'#64748b'}}>Select a project to view monthly revenue, cost, hours, and forecast detail.</div>
      </div>
      <select value={selected} onChange={e=>setSelected(e.target.value)} style={{minWidth:300,maxWidth:520,height:30,border:'1px solid #cbd5e1',borderRadius:6,padding:'0 8px',fontSize:'0.74rem',fontFamily:"'DM Sans',sans-serif",background:'white'}}>
        {(projects || []).map(p => <option key={p.Project_ID} value={p.Project_ID}>{p.Project_ID} — {p.Project_Name || ''}</option>)}
      </select>
    </div>
    {current && <MonthlyDrilldown projectId={current.Project_ID} eac={current.EAC} burnRate={current.Burn_Rate} remainingMonths={current.Remaining_Months} etc={current.ETC} currentMonthCost={current.Current_Month_Cost} projectName={current.Project_Name} startDate={current.Start_Date} endDate={current.End_Date} pctComplete={current.Pct_Complete} plannedPM={current.Planned_PM_Pct} currentPM={current.Current_PM_Pct}/>} 
  </div>
}

// ── Resource count month-wise stacked by SL ────────────────────────────────
export function ResourceCountMonthly({ filters = {} }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const chartScrollRef = useRef(null)

  const qs = (params) => {
    const parts = []
    for (const [k, v] of Object.entries(params || {})) {
      if (v == null || v === '' || k === 'project_type') continue
      if (Array.isArray(v)) {
        if (!v.length) continue
        parts.push(`${k}=${v.map(x => encodeURIComponent(String(x).trim())).join(',')}`)
      } else {
        parts.push(`${k}=${encodeURIComponent(String(v).trim())}`)
      }
    }
    return parts.length ? `?${parts.join('&')}` : ''
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/resource-count-monthly${qs(filters)}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) { setRows([]); setServerPeriods([]); setServerProjectTypes([]); setServerServiceLines([]) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [JSON.stringify(filters)])

  const bandOrder = ['2', '3', 'contractor', '4D', '4C', '4B', '4A', '5B', '5A']
  const bandRank = band => {
    const raw = String(band || '').trim()
    const idx = bandOrder.findIndex(x => x.toLowerCase() === raw.toLowerCase())
    return idx >= 0 ? idx : 999
  }
  const bandSort = (a,b) => bandRank(a) - bandRank(b) || String(a || '').localeCompare(String(b || ''))

  const slColors = ['#8ecae6','#b7e4c7','#cdb4db','#ffd6a5','#bde0fe','#d8e2dc','#fbc4ab','#c7d2fe','#bbf7d0','#fde68a','#e0e7ff','#fecaca']

  const sorted = useMemo(() => [...rows].sort((a,b) =>
    String(a.Period || '').localeCompare(String(b.Period || '')) ||
    String(a.Service_Line || '').localeCompare(String(b.Service_Line || '')) ||
    bandSort(a.Band, b.Band)
  ), [rows])

  const chartData = useMemo(() => {
    const byMonth = new Map()
    for (const r of sorted) {
      const period = r.Period || 'Unknown'
      const sl = r.Service_Line || 'Unassigned SL'
      const band = r.Band || 'Unassigned Band'
      const count = Number(r.Resource_Count || 0)
      if (!byMonth.has(period)) byMonth.set(period, { Period: period, Resource_Count: 0, __slDetails: {} })
      const m = byMonth.get(period)
      m.Resource_Count += count
      m[sl] = Number(m[sl] || 0) + count
      if (!m.__slDetails[sl]) m.__slDetails[sl] = { total: 0, bands: {} }
      m.__slDetails[sl].total += count
      m.__slDetails[sl].bands[band] = Number(m.__slDetails[sl].bands[band] || 0) + count
    }
    return [...byMonth.values()].sort((a,b) => String(a.Period).localeCompare(String(b.Period)))
  }, [sorted])

  const visibleSLs = useMemo(() => {
    const set = new Set()
    for (const row of chartData) Object.keys(row.__slDetails || {}).forEach(sl => set.add(sl))
    return [...set].sort((a,b) => String(a).localeCompare(String(b)))
  }, [chartData])

  const totals = useMemo(() => ({
    months: new Set(rows.map(r=>r.Period).filter(Boolean)).size,
    serviceLines: new Set(rows.map(r=>r.Service_Line).filter(Boolean)).size,
    bands: new Set(rows.map(r=>r.Band).filter(Boolean)).size,
    resources: rows.reduce((s,r)=>s + Number(r.Resource_Count || 0), 0),
  }), [rows])

  const exportExcel = () => {
    const headers = ['Month','Service Line','Band','Country','Resource Count','Actual Hours']
    const aoa = [
      ['Monthly Resource Count by SL'],
      ['X-axis is month; bars are stacked by SL. Tooltip shows the hovered SL stack with its band split.'],
      [`Exported ${new Date().toLocaleString()}`],
      [],
      headers,
      ...sorted.map(r => [fmtMonth(r.Period), r.Service_Line, r.Band, r.Country || r.Location || '', r.Resource_Count, r.Actual_Hours]),
      [],
      ['TOTAL','','','', totals.resources, Math.round(rows.reduce((s,r)=>s + Number(r.Actual_Hours || 0), 0))],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{wch:12},{wch:22},{wch:14},{wch:20},{wch:16},{wch:14}]
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:4,c:0},e:{r:Math.max(4,aoa.length-3),c:headers.length-1}}) }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Resource Count Detail')
    XLSX.writeFile(wb, `Resource_Count_Monthly_${new Date().toISOString().slice(0,10)}.xlsx`, { compression:true })
  }

  const ResourceTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const point = payload.find(p => p && p.dataKey && Number(p.value || 0) > 0) || payload[0]
    const row = point?.payload || {}
    const sl = String(point?.dataKey || '').trim()
    const item = row.__slDetails?.[sl]
    if (!item) return null
    const monthTotal = Number(row.Resource_Count || 0)
    const pct = monthTotal ? (Number(item.total || 0) / monthTotal) * 100 : 0
    const bandRows = Object.entries(item.bands || {}).sort((a,b) => bandSort(a[0], b[0]))
    return <div style={{background:'rgba(255,255,255,.98)',border:'1px solid #dbe4ee',borderRadius:12,padding:'10px 12px',boxShadow:'0 12px 28px rgba(15,23,42,.16)',fontFamily:"'DM Sans',sans-serif",minWidth:240,maxWidth:330,animation:'plTooltipCenterSplit 160ms ease-out both'}}>
      <style>{`@keyframes plTooltipCenterSplit{0%{opacity:0;transform:scaleX(.12) translateY(4px)}65%{opacity:1;transform:scaleX(1.03) translateY(0)}100%{opacity:1;transform:scaleX(1) translateY(0)}}`}</style>
      <div style={{display:'flex',justifyContent:'space-between',gap:14,marginBottom:8,borderBottom:'1px solid #e2e8f0',paddingBottom:6}}>
        <div><div style={{fontSize:'0.72rem',fontWeight:900,color:'#1e293b'}}>{fmtMonth(label)}</div><div style={{fontSize:'0.62rem',fontWeight:900,color:'#64748b'}}>{sl}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontSize:'0.82rem',fontWeight:900,color:'#0f766e'}}>{Number(item.total || 0).toLocaleString()}</div><div style={{fontSize:'0.58rem',fontWeight:800,color:'#94a3b8'}}>{pct.toFixed(1)}% of month</div></div>
      </div>
      <div style={{fontSize:'0.6rem',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Band split</div>
      <div style={{display:'flex',flexDirection:'column',gap:3}}>
        {bandRows.map(([band,value]) => <div key={band} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',fontSize:'0.68rem',padding:'3px 0',borderBottom:'1px solid #f1f5f9'}}>
          <span style={{color:'#334155',fontWeight:800}}>Band {band}</span>
          <span style={{fontFamily:'monospace',fontWeight:900,color:'#0f172a'}}>{Number(value || 0).toLocaleString()}</span>
        </div>)}
      </div>
    </div>
  }

  const chartWidth = Math.max(980, chartData.length * 92)

  useEffect(() => {
    if (!chartData.length || !chartScrollRef.current) return
    const now = new Date()
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    let idx = chartData.findIndex(r => String(r.Period) === currentPeriod)
    if (idx < 0) {
      idx = chartData.reduce((best, r, i) => String(r.Period) <= currentPeriod ? i : best, -1)
      if (idx < 0) idx = chartData.length - 1
    }
    const scroller = chartScrollRef.current
    const target = Math.max(0, (idx * 92) - (scroller.clientWidth / 2) + 46)
    const t = setTimeout(() => { scroller.scrollTo({ left: target, behavior: 'smooth' }) }, 120)
    return () => clearTimeout(t)
  }, [chartData])

  return <div style={{width:'100%',maxWidth:1180,margin:'0 auto',display:'flex',flexDirection:'column',gap:10}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 10px'}}>
      <div>
        <div style={{fontSize:'0.78rem',fontWeight:800,color:'#1e293b'}}>Monthly Resource Count Chart</div>
        <div style={{fontSize:'0.66rem',color:'#64748b'}}>X-axis is month. Bars are stacked by SL. Hover on a stacked section to see that SL’s band split.</div>
      </div>
      <button onClick={exportExcel} disabled={!sorted.length} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',border:'1px solid #bae6fd',borderRadius:6,background:sorted.length?'#e0f2fe':'#f1f5f9',color:sorted.length?'#0369a1':'#94a3b8',cursor:sorted.length?'pointer':'not-allowed',fontSize:'0.68rem',fontWeight:800,fontFamily:"'DM Sans',sans-serif"}}><Download size={13}/> Export Detail</button>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(120px,1fr))',gap:8}}>
      {[["Months", totals.months], ["Service Lines", totals.serviceLines.toLocaleString()], ["Bands", totals.bands.toLocaleString()], ["Total Resources", totals.resources.toLocaleString()]].map(([l,v])=>(
        <div key={l} style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'9px 10px'}}>
          <div style={{fontSize:'0.58rem',fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.07em'}}>{l}</div>
          <div style={{fontSize:'1rem',fontWeight:800,color:'#1e293b'}}>{v}</div>
        </div>
      ))}
    </div>

    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px'}}>
      {loading && <div style={{height:420,display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}>Loading chart…</div>}
      {!loading && chartData.length === 0 && <div style={{height:420,display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}>No resource count data available for the selected filters.</div>}
      {!loading && chartData.length > 0 && <div ref={chartScrollRef} style={{width:'100%',overflowX:'auto',paddingBottom:6,scrollBehavior:'smooth'}}>
        <div style={{width:chartWidth,height:430}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
              <XAxis dataKey="Period" tickFormatter={fmtMonth} angle={-30} textAnchor="end" height={60} style={{fontSize:'0.65rem'}} />
              <YAxis style={{fontSize:'0.65rem'}} allowDecimals={false} />
              <Tooltip content={<ResourceTooltip />} shared={false} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
              <Legend wrapperStyle={{fontSize:'0.65rem',paddingTop:8}} />
              {visibleSLs.map((sl, idx) => (
                <Bar key={sl} dataKey={sl} name={sl} stackId="resources" fill={slColors[idx % slColors.length]} radius={idx === visibleSLs.length - 1 ? [6,6,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}
    </div>
  </div>
}




export function TcvRevenueQuarterly() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [viewTab, setViewTab] = useState('report')
  const [filters, setFilters] = useState({ Project_Group: [], SL: [], Opp_ID: [], Start_Date: [], End_Date: [] })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/tcv-revenue-quarterly')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const next = Array.isArray(data?.rows) ? data.rows : []
        setRows(next)
        const first = next[0]
        const key = first ? `${first.Opp_ID || 'Blank'}||${first.Name || 'Blank'}` : null
        setExpanded(key ? { [key]: true } : {})
      })
      .catch(err => { console.error('All Projects load failed', err); if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const money = v => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const pct = v => v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `${Number(v || 0).toFixed(1)}%`
  const clean = v => String(v ?? '').trim()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const filterFields = [
    { key:'Project_Group', label:'Project Group' },
    { key:'SL', label:'Project HSL' },
    { key:'Opp_ID', label:'Opp ID' },
    { key:'Start_Date', label:'Start Date' },
    { key:'End_Date', label:'End Date' },
  ]

  const optionValues = useMemo(() => {
    const out = {}
    filterFields.forEach(f => {
      const vals = new Set()
      rows.forEach(r => String(r[f.key] || '').split(',').map(x=>x.trim()).filter(Boolean).forEach(v => vals.add(v)))
      out[f.key] = Array.from(vals).sort((a,b)=>a.localeCompare(b))
    })
    return out
  }, [rows])

  const filteredRows = useMemo(() => {
    const active = Object.entries(filters).filter(([,v]) => Array.isArray(v) && v.length)
    if (!active.length) return rows
    return rows.filter(r => active.every(([key, selected]) => {
      const vals = String(r[key] || '').split(',').map(x=>x.trim()).filter(Boolean)
      return vals.some(v => selected.includes(v))
    }))
  }, [rows, filters])

  const totals = useMemo(() => {
    const uniqueTcv = new Map(); let revenue=0, cost=0
    const monthTotals = Object.fromEntries(months.map(m => [m, 0]))
    for (const r of filteredRows) {
      const pid = clean(r.PID)
      if (pid && !uniqueTcv.has(pid)) uniqueTcv.set(pid, Number(r.TCV || 0))
      revenue += Number(r.Total_Revenue || 0); cost += Number(r.Total_Cost || 0)
      months.forEach(m => { monthTotals[m] += Number(r[m] || 0) })
    }
    const tcv = Array.from(uniqueTcv.values()).reduce((s,v)=>s+v,0)
    return { Projects: uniqueTcv.size, TCV:tcv, Total_Revenue:revenue, Total_Cost:cost, Grand_Total: revenue + cost, Current_PM_Pct: revenue>0 ? ((revenue-cost)/revenue)*100 : null, ...monthTotals }
  }, [filteredRows])

  const activeMonths = useMemo(() => months.filter(m => Math.abs(Number(totals[m] || 0)) > 0 || filteredRows.some(r => Math.abs(Number(r[`Cost_${m}`] || 0)) > 0)), [totals, filteredRows])

  const monthlyChartData = useMemo(() => {
    return months.map(m => {
      const revenue = filteredRows.reduce((sum, r) => sum + Number(r[m] || 0), 0)
      const cost = filteredRows.reduce((sum, r) => sum + Number(r[`Cost_${m}`] || 0), 0)
      return {
        Month: m,
        Revenue: Math.round(revenue),
        Cost: Math.round(cost),
        Current_PM_Pct: revenue > 0 ? Number((((revenue - cost) / revenue) * 100).toFixed(1)) : null,
      }
    }).filter(r => r.Revenue || r.Cost)
  }, [filteredRows])

  const MonthlyChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const item = monthlyChartData.find(x => x.Month === label) || {}
    return (
      <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'9px 11px',boxShadow:'0 8px 24px rgba(15,23,42,.14)',minWidth:190}}>
        <div style={{fontSize:'0.76rem',fontWeight:900,color:'#0f172a',marginBottom:6}}>{label}</div>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,fontSize:'0.7rem',marginBottom:4}}><span style={{color:'#2563eb',fontWeight:800}}>Revenue</span><span style={{fontWeight:900}}>{k(item.Revenue || 0)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,fontSize:'0.7rem',marginBottom:4}}><span style={{color:'#f97316',fontWeight:800}}>Cost</span><span style={{fontWeight:900}}>{k(item.Cost || 0)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,fontSize:'0.7rem'}}><span style={{color:pmColor(item.Current_PM_Pct),fontWeight:800}}>Current PM%</span><span style={{fontWeight:900,color:pmColor(item.Current_PM_Pct)}}>{pct(item.Current_PM_Pct)}</span></div>
      </div>
    )
  }

  const opportunityRows = useMemo(() => {
    const map = new Map()
    for (const r of filteredRows) {
      const key = `${r.Opp_ID || 'Blank'}||${r.Name || 'Blank'}`
      if (!map.has(key)) map.set(key, { key, Opp_ID:r.Opp_ID || '—', Name:r.Name || '—', children:[] })
      map.get(key).children.push(r)
    }
    const agg = (arr) => {
      const uniqueTcv = new Map(); let revenue=0, cost=0
      const monthTotals = Object.fromEntries(months.map(m => [m, 0]))
      for (const r of arr) {
        const pid = clean(r.PID)
        if (pid && !uniqueTcv.has(pid)) uniqueTcv.set(pid, Number(r.TCV || 0))
        revenue += Number(r.Total_Revenue || 0); cost += Number(r.Total_Cost || 0)
        months.forEach(m => { monthTotals[m] += Number(r[m] || 0) })
      }
      return { TCV:Array.from(uniqueTcv.values()).reduce((s,v)=>s+v,0), Total_Revenue:revenue, Total_Cost:cost, Current_PM_Pct: revenue>0 ? ((revenue-cost)/revenue)*100 : null, ...monthTotals }
    }
    return Array.from(map.values()).map(g => {
      const t = agg(g.children)
      return {
        ...g,
        Opportunity: `${g.Opp_ID}${g.Name ? ' — ' + g.Name : ''}`,
        PID: `${g.children.length} PID${g.children.length === 1 ? '' : 's'}`,
        ...t,
        children: g.children.sort((a,b)=>String(a.PID||'').localeCompare(String(b.PID||'')))
      }
    }).sort((a,b)=>String(a.Opp_ID).localeCompare(String(b.Opp_ID)) || String(a.Name).localeCompare(String(b.Name)))
  }, [filteredRows])

  const monthW = activeMonths.length > 9 ? '4.8%' : activeMonths.length > 6 ? '5.8%' : '7%'
  const cols = [
    {key:'Opportunity', label:'Opportunity ID + Name', align:'left', w:'21%', type:'text'},
    {key:'PID', label:'PID', align:'left', w:'7.5%', type:'text'},
    {key:'TCV', label:'TCV', w:'7.5%', type:'num'},
    {key:'Total_Revenue', label:'Revenue', w:'8.2%', type:'num'},
    {key:'Total_Cost', label:'Cost', w:'7.8%', type:'num'},
    {key:'Current_PM_Pct', label:'PM%', align:'center', w:'7%', type:'pm'},
    ...activeMonths.map(m => ({key:m, label:m, w:monthW, type:'num'})),
  ]

  const clearFilters = () => setFilters({ Project_Group: [], SL: [], Opp_ID: [], Start_Date: [], End_Date: [] })
  const expandAll = () => setExpanded(Object.fromEntries(opportunityRows.map(r => [r.key, true])))
  const collapseAll = () => setExpanded({})

  const exportExcel = () => {
    const headers = cols.map(c => c.label)
    const rowsOut = []
    opportunityRows.forEach(o => {
      rowsOut.push(cols.map(c => c.key === 'Opportunity' ? o.Opportunity : c.key === 'Current_PM_Pct' ? o.Current_PM_Pct : (o[c.key] ?? '')))
      if (expanded[o.key]) (o.children || []).forEach(ch => rowsOut.push(cols.map(c => c.key === 'Opportunity' ? `  ${ch.Opportunity || ch.Name || ''}` : c.key === 'Current_PM_Pct' ? ch.Current_PM_Pct : (ch[c.key] ?? ''))))
    })
    const totalRow = cols.map(c => {
      if (c.key === 'Opportunity') return `TOTAL (${filteredRows.length} PID lines)`
      if (c.key === 'PID') return `${totals.Projects} unique PIDs`
      if (c.key === 'Current_PM_Pct') return totals.Current_PM_Pct
      if (c.type === 'num') return totals[c.key] || 0
      return ''
    })
    const aoa = [['All Projects - By Opportunity'], [`Exported ${new Date().toLocaleString()}`], [], totalRow, headers, ...rowsOut]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = cols.map(c => ({ wch: Math.max(12, Math.round((c.w || 100) / 6)) }))
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:4,c:0}, e:{r:Math.max(4,aoa.length-1),c:headers.length-1}}) }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'All Projects')
    XLSX.writeFile(wb, `All_Projects_By_Opportunity_${new Date().toISOString().slice(0,10)}.xlsx`, { compression:true })
  }

  const th = (w, align='right', top=0, z=5, bg='white') => ({padding:'5px 4px',fontSize:'0.54rem',fontWeight:800,color:'#64748b',letterSpacing:'.035em',textTransform:'uppercase',textAlign:align,borderBottom:'1px solid #e2e8f0',background:bg,position:'sticky',top,zIndex:z,width:w,minWidth:0,maxWidth:w,whiteSpace:'normal',lineHeight:1.08,overflow:'hidden',textOverflow:'ellipsis'})
  const td = (align='right', strong=false) => ({padding:'5px 4px',fontSize:'0.66rem',textAlign:align,borderBottom:'1px solid #f1f5f9',background:strong?'#f0f9ff':'white',fontWeight:strong?800:500,verticalAlign:'middle',minWidth:0,overflow:'hidden',textOverflow:'ellipsis'})
  const renderVal = (r,c,isOpp=false) => {
    if (c.key === 'Opportunity') {
      const text = isOpp ? r.Opportunity : ([r.Opp_ID, r.Name].filter(Boolean).join(' — ') || '—')
      return <span title={text} style={{display:'block',paddingLeft:isOpp?0:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{text}</span>
    }
    if (c.key === 'Current_PM_Pct') return <PMPill val={r.Current_PM_Pct}/>
    if (c.type === 'num') return k(Number(r[c.key] || 0))
    return r[c.key] || '—'
  }

  if (loading) return <div style={{height:'100%',display:'flex',flexDirection:'column',gap:10,alignItems:'center',justifyContent:'center',color:'#94a3b8'}}><div style={{width:30,height:30,border:'3px solid #e2e8f0',borderTopColor:'#4f46e5',borderRadius:'50%',animation:'plSpin .8s linear infinite'}}/><style>{`@keyframes plSpin{to{transform:rotate(360deg)}}`}</style><div>Loading All Projects dashboard…</div></div>

  return <div style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',background:'#f8fafc',padding:10,gap:8,boxSizing:'border-box'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'9px 11px',flexShrink:0}}>
      <div>
        <div style={{fontSize:'1rem',fontWeight:900,color:'#0f172a'}}>All Projects — By Opportunity</div>
        <div style={{fontSize:'0.66rem',color:'#64748b'}}>Source: All Projects Excel only. Revenue and Cost come from P&L Lines and CONVERTED_OP_AMNT.</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}}>
        <button onClick={() => setViewTab('report')} style={{padding:'7px 11px',border:'1px solid #c7d2fe',borderRadius:8,background:viewTab==='report'?'#4f46e5':'white',color:viewTab==='report'?'white':'#4338ca',fontSize:'0.68rem',fontWeight:900,cursor:'pointer'}}>Report</button>
        <button onClick={() => setViewTab('monthlyChart')} style={{padding:'7px 11px',border:'1px solid #c7d2fe',borderRadius:8,background:viewTab==='monthlyChart'?'#4f46e5':'white',color:viewTab==='monthlyChart'?'white':'#4338ca',fontSize:'0.68rem',fontWeight:900,cursor:'pointer'}}>Monthly Chart</button>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={expandAll} style={{padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:8,background:'#fff',fontSize:'0.68rem',fontWeight:900,color:'#475569',cursor:'pointer'}}>Expand all</button>
        <button onClick={collapseAll} style={{padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:8,background:'#fff',fontSize:'0.68rem',fontWeight:900,color:'#475569',cursor:'pointer'}}>Collapse all</button>
        <button onClick={clearFilters} style={{padding:'7px 10px',border:'1px solid #e2e8f0',borderRadius:8,background:'#f8fafc',fontSize:'0.68rem',fontWeight:900,color:'#64748b',cursor:'pointer'}}>Clear filters</button>
        <button onClick={exportExcel} disabled={!filteredRows.length} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 11px',border:'1px solid #c7d2fe',borderRadius:8,background:filteredRows.length?'#eef2ff':'#f1f5f9',color:filteredRows.length?'#4338ca':'#94a3b8',cursor:filteredRows.length?'pointer':'not-allowed',fontSize:'0.72rem',fontWeight:900,fontFamily:"'DM Sans',sans-serif"}}><Download size={14}/> Export</button>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(125px,1fr))',gap:8,flexShrink:0}}>
      {[
        ['Unique PIDs', Number(totals.Projects || 0).toLocaleString()],
        ['Total TCV', k(totals.TCV)],
        ['Total Revenue', k(totals.Total_Revenue)],
        ['Total Cost', k(totals.Total_Cost)],
        ['Current PM%', pct(totals.Current_PM_Pct)]
      ].map(([l,v]) => <div key={l} title={String(v)} style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'9px 11px',minWidth:0}}><div style={{fontSize:'0.58rem',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.07em'}}>{l}</div><div style={{fontSize:'1.04rem',fontWeight:900,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{v}</div></div>)}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(160px,1fr))',gap:8,background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:8,flexShrink:0,overflow:'visible'}}>
      {filterFields.map(f => <div key={f.key} style={{minWidth:0}}><div style={{fontSize:'0.58rem',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{f.label}</div><ColumnFilterDropdown label={f.label} options={optionValues[f.key] || []} selected={filters[f.key] || []} onChange={vals => setFilters(p => ({...p,[f.key]:vals}))} onClear={() => setFilters(p => ({...p,[f.key]:[]}))}/></div>)}
    </div>

    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden',flex:1,minHeight:0}}>
      {!rows.length && <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}>No All Projects data available. Upload the All Projects Excel file.</div>}

      {!!rows.length && viewTab === 'monthlyChart' && (
        <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:14,boxSizing:'border-box',overflow:'auto'}}>
          <div style={{width:'100%',maxWidth:940,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexShrink:0}}>
            <div>
              <div style={{fontSize:'0.82rem',fontWeight:900,color:'#0f172a'}}>Monthly Revenue, Cost and Current PM%</div>
              <div style={{fontSize:'0.64rem',color:'#64748b'}}>Filtered view. Months with no values are hidden from the report table.</div>
            </div>
            <div style={{fontSize:'0.66rem',fontWeight:800,color:'#64748b'}}>Filtered rows: {filteredRows.length.toLocaleString()}</div>
          </div>
          {!monthlyChartData.length ? (
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}>No monthly revenue/cost data for the selected filters.</div>
          ) : (
            <>
              <div style={{width:'100%',maxWidth:940,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:10,flexShrink:0}}>
                {[
                  ['Revenue', totals.Total_Revenue || 0, '#93c5fd'],
                  ['Cost', totals.Total_Cost || 0, '#fdba74'],
                  ['Current PM%', totals.Current_PM_Pct, '#a7f3d0']
                ].map(([label,value,color]) => {
                  const maxVal = Math.max(Math.abs(totals.Total_Revenue || 0), Math.abs(totals.Total_Cost || 0), 1)
                  const isPct = label === 'Current PM%'
                  const width = isPct ? Math.max(0, Math.min(100, Number(value || 0))) : Math.min(100, Math.abs(Number(value || 0)) / maxVal * 100)
                  return <div key={label} style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'10px 12px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:7}}>
                      <span style={{fontSize:'0.62rem',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'.07em'}}>{label}</span>
                      <span style={{fontSize:'0.95rem',fontWeight:900,color:'#0f172a'}}>{isPct ? pct(value) : k(value)}</span>
                    </div>
                    <div style={{height:7,background:'#f1f5f9',borderRadius:999,overflow:'hidden'}}><div style={{height:'100%',width:`${width}%`,background:color,borderRadius:999}} /></div>
                  </div>
                })}
              </div>
              <div style={{width:'100%',maxWidth:940,height:420,background:'white',border:'1px solid #e2e8f0',borderRadius:14,padding:10,boxSizing:'border-box',flexShrink:0}}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyChartData} margin={{top:18,right:30,left:12,bottom:32}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                    <XAxis dataKey="Month" tick={{fontSize:11,fill:'#475569'}} interval={0} axisLine={{stroke:'#cbd5e1'}} tickLine={false} label={{value:'Month',position:'insideBottom',offset:-18,fill:'#64748b',fontSize:11,fontWeight:800}}/>
                    <YAxis yAxisId="money" tickFormatter={v => k(v)} tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="pm" orientation="right" tickFormatter={v => `${v}%`} tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<MonthlyChartTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Bar yAxisId="money" dataKey="Revenue" name="Revenue" fill="#93c5fd" radius={[5,5,0,0]} maxBarSize={44}/>
                    <Bar yAxisId="money" dataKey="Cost" name="Cost" fill="#fdba74" radius={[5,5,0,0]} maxBarSize={44}/>
                    <Line yAxisId="pm" type="monotone" dataKey="Current_PM_Pct" name="Current PM% Trend" stroke="#7c3aed" strokeWidth={2.4} dot={{r:3}} activeDot={{r:5}} connectNulls/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {!!rows.length && viewTab === 'report' && <div style={{overflowY:'auto',overflowX:'hidden',height:'100%'}}>
        <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
          <thead>
            <tr>{cols.map(c => <th key={c.key} style={th(c.w,c.align||'right',0,8)}>{c.label}</th>)}</tr>
            <tr>{cols.map(c => <th key={`t-${c.key}`} style={th(c.w,c.align||'right',30,7,'#fff7ed')}>{c.key==='Opportunity'?`TOTAL (${filteredRows.length})`:c.key==='PID'?`${totals.Projects} PIDs`:c.key==='Current_PM_Pct'?<PMPill val={totals.Current_PM_Pct}/>:c.type==='num'?k(totals[c.key]||0):''}</th>)}</tr>
          </thead>
          <tbody>
            {!opportunityRows.length && <tr><td colSpan={cols.length} style={{padding:'2rem',textAlign:'center',color:'#94a3b8'}}>No rows match the selected filters.</td></tr>}
            {opportunityRows.map(o => <>
              <tr key={o.key} onClick={() => setExpanded(e => ({...e,[o.key]:!e[o.key]}))} style={{cursor:'pointer'}}>
                {cols.map((c,i) => <td key={c.key} style={td(c.align||'right',true)}>{i===0?<div style={{display:'flex',alignItems:'center',gap:6}}>{expanded[o.key]?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{renderVal(o,c,true)}</span></div>:renderVal(o,c,true)}</td>)}
              </tr>
              {expanded[o.key] && (o.children || []).map(ch => <tr key={`${o.key}-${ch.PID}`}>
                {cols.map(c => <td key={c.key} style={{...td(c.align||'right'), paddingLeft:c.key==='Opportunity'?34:8}}>{renderVal(ch,c,false)}</td>)}
              </tr>)}
            </>)}
          </tbody>
        </table>
      </div>}
    </div>
  </div>
}

