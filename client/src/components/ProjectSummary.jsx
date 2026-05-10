import { useState, useEffect, useCallback } from 'react'
import { Edit3, X, PlusCircle, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
         Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

const BASE = '/api'
const get  = (p) => fetch(`${BASE}${p}`).then(r => r.json())
const post = (p, body) => fetch(`${BASE}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}).then(r => r.json())

const currency = v => v == null ? '—' : new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
}).format(v)
const k = v => {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e6) return `${v < 0 ? '-' : ''}$${(a/1e6).toFixed(2)}M`
  if (a >= 1e3) return `${v < 0 ? '-' : ''}$${(a/1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const pct = v => v == null ? '—' : `${v.toFixed(1)}%`
const num = v => v == null ? '—' : new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(v)
const fmtMonth = p => {
  if (!p) return ''
  const [y, m] = p.split('-')
  return `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)]} ${y.slice(2)}`
}

const pmColor = v => v == null ? '#64748b' : v >= 20 ? '#059669' : v >= 10 ? '#0891b2' : v >= 0 ? '#d97706' : '#dc2626'
const pmBg    = v => v == null ? '#f1f5f9' : v >= 20 ? '#dcfce7' : v >= 10 ? '#dbeafe' : v >= 0 ? '#fef3c7' : '#fee2e2'

// ── Monthly breakdown chart shown when a project row is expanded ──────────────
function MonthlyBreakdown({ projectId }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState('cost') // 'cost' | 'hours' | 'cumulative'

  useEffect(() => {
    setLoading(true)
    fetch(`/api/trend?project=${projectId}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setRows(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div style={{padding:'1.5rem',textAlign:'center',color:'#64748b',fontSize:'0.8rem'}}>
      Loading monthly data…
    </div>
  )
  if (!rows.length) return (
    <div style={{padding:'1.5rem',textAlign:'center',color:'#64748b',fontSize:'0.8rem'}}>
      No monthly data available for this project.
    </div>
  )

  // Build cumulative rows
  let cumBud = 0, cumAct = 0, cumBudH = 0, cumActH = 0
  const cumRows = rows.map(r => {
    cumBud  += r.Budgeted_Cost  || 0
    cumAct  += r.Burdened_Cost  || 0
    cumBudH += r.Budgeted_Hours || 0
    cumActH += r.Actual_Hours   || 0
    return { ...r, _label: fmtMonth(r.Period), cumBudCost: Math.round(cumBud), cumActCost: Math.round(cumAct),
             cumBudHours: Math.round(cumBudH), cumActHours: Math.round(cumActH) }
  })
  const chartData = cumRows.map(r => ({ ...r, _label: fmtMonth(r.Period) }))

  // Tooltip
  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
        padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',fontFamily:"'DM Sans',sans-serif",minWidth:200}}>
        <p style={{fontWeight:700,margin:'0 0 8px',color:'#1e293b',fontSize:'0.82rem'}}>{label}</p>
        {payload.map(p => (
          <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:20,marginBottom:4}}>
            <span style={{color:p.color,fontSize:'0.75rem',display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:p.color,display:'inline-block'}}/>
              {p.name}
            </span>
            <span style={{fontFamily:'monospace',color:'#1e293b',fontSize:'0.75rem',fontWeight:700}}>
              {view === 'hours' ? num(p.value) : k(p.value)}
            </span>
          </div>
        ))}
        {payload.length === 2 && view !== 'hours' && (
          <div style={{borderTop:'1px solid #f1f5f9',marginTop:6,paddingTop:6,fontSize:'0.7rem',color:'#64748b'}}>
            Variance: {k((payload[1]?.value||0) - (payload[0]?.value||0))}
          </div>
        )}
      </div>
    )
  }

  const btnStyle = (active) => ({
    padding:'4px 12px', borderRadius:5, border:'none', cursor:'pointer',
    fontSize:'0.72rem', fontWeight:600, fontFamily:"'DM Sans',sans-serif",
    background: active ? '#0891b2' : '#f1f5f9',
    color: active ? 'white' : '#64748b',
    transition:'all .12s',
  })

  // Summary stats
  const totalBudCost = rows.reduce((s,r) => s+(r.Budgeted_Cost||0), 0)
  const totalActCost = rows.reduce((s,r) => s+(r.Burdened_Cost||0), 0)
  const totalBudHrs  = rows.reduce((s,r) => s+(r.Budgeted_Hours||0), 0)
  const totalActHrs  = rows.reduce((s,r) => s+(r.Actual_Hours||0), 0)
  const costVar      = totalBudCost - totalActCost
  const overMonths   = rows.filter(r => (r.Burdened_Cost||0) > (r.Budgeted_Cost||0)).length

  return (
    <div style={{padding:'1rem 1.5rem',background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>

      {/* Mini KPI strip */}
      <div style={{display:'flex',gap:'1.5rem',marginBottom:'1rem',flexWrap:'wrap'}}>
        {[
          { label:'Budget Cost (to date)', val: k(totalBudCost), color:'#64748b' },
          { label:'Actual Cost (to date)', val: k(totalActCost), color: totalActCost > totalBudCost ? '#dc2626' : '#059669' },
          { label:'Variance', val: k(costVar), color: costVar >= 0 ? '#059669' : '#dc2626' },
          { label:'Budget Hours', val: num(totalBudHrs), color:'#64748b' },
          { label:'Actual Hours', val: num(totalActHrs), color: totalActHrs > totalBudHrs ? '#dc2626' : '#059669' },
          { label:'Over-budget months', val: overMonths, color: overMonths > 0 ? '#d97706' : '#059669' },
        ].map(item => (
          <div key={item.label}>
            <div style={{fontSize:'0.62rem',fontWeight:700,color:'#94a3b8',letterSpacing:'.06em',textTransform:'uppercase'}}>
              {item.label}
            </div>
            <div style={{fontSize:'1rem',fontWeight:700,color:item.color}}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{display:'flex',gap:4,marginBottom:'0.75rem'}}>
        <button style={btnStyle(view==='cost')}       onClick={()=>setView('cost')}>Monthly Cost</button>
        <button style={btnStyle(view==='hours')}      onClick={()=>setView('hours')}>Monthly Hours</button>
        <button style={btnStyle(view==='cumulative')} onClick={()=>setView('cumulative')}>Cumulative Cost</button>
      </div>

      {/* Chart */}
      <div style={{height:220}}>
        {view === 'cost' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:20,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false}
                angle={-30} textAnchor="end" interval={0} height={36}/>
              <YAxis tickFormatter={v=>k(v)} tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} width={58}/>
              <Tooltip content={<Tip/>}/>
              <Legend wrapperStyle={{fontSize:'0.72rem',paddingTop:4}}/>
              <Bar dataKey="Budgeted_Cost" name="Budget Cost" fill="#93c5fd" radius={[2,2,0,0]} maxBarSize={24}/>
              <Bar dataKey="Burdened_Cost" name="Actual Cost"
                fill="#0891b2" radius={[2,2,0,0]} maxBarSize={24}
                label={(props) => {
                  const { x, y, width, value, index } = props
                  const budVal = chartData[index]?.Budgeted_Cost || 0
                  if (value > budVal) {
                    return <text x={x+width/2} y={y-2} fill="#dc2626" fontSize={8}
                      textAnchor="middle">▲</text>
                  }
                  return null
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        {view === 'hours' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top:4,right:8,bottom:20,left:8}} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false}
                angle={-30} textAnchor="end" interval={0} height={36}/>
              <YAxis tickFormatter={v=>v>=1000?`${(v/1000).toFixed(1)}K`:v} tick={{fill:'#94a3b8',fontSize:10}}
                axisLine={false} tickLine={false} width={44}/>
              <Tooltip content={<Tip/>}/>
              <Legend wrapperStyle={{fontSize:'0.72rem',paddingTop:4}}/>
              <Bar dataKey="Budgeted_Hours" name="Budget Hours" fill="#c4b5fd" radius={[2,2,0,0]} maxBarSize={24}/>
              <Bar dataKey="Actual_Hours"   name="Actual Hours" fill="#8b5cf6" radius={[2,2,0,0]} maxBarSize={24}/>
            </BarChart>
          </ResponsiveContainer>
        )}

        {view === 'cumulative' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{top:4,right:8,bottom:20,left:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false}
                angle={-30} textAnchor="end" interval={0} height={36}/>
              <YAxis tickFormatter={v=>k(v)} tick={{fill:'#94a3b8',fontSize:10}}
                axisLine={false} tickLine={false} width={58}/>
              <Tooltip content={<Tip/>}/>
              <Legend wrapperStyle={{fontSize:'0.72rem',paddingTop:4}}/>
              <Line dataKey="cumBudCost" name="Cumulative Budget" stroke="#94a3b8"
                strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{r:4}}/>
              <Line dataKey="cumActCost" name="Cumulative Actual" stroke="#0891b2"
                strokeWidth={2.5} dot={{r:3,fill:'#0891b2',strokeWidth:0}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Monthly detail table */}
      <div style={{marginTop:'1rem',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.73rem'}}>
          <thead>
            <tr>
              {['Month','Budget Cost','Actual Cost','Variance','Var %','Budget Hrs','Actual Hrs','Hrs Var'].map(h => (
                <th key={h} style={{padding:'5px 10px',textAlign:h==='Month'?'left':'right',
                  color:'#94a3b8',fontWeight:700,fontSize:'0.62rem',letterSpacing:'.05em',
                  textTransform:'uppercase',borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const cVar  = (r.Budgeted_Cost||0)  - (r.Burdened_Cost||0)
              const cVarP = (r.Budgeted_Cost||0) > 0 ? cVar/(r.Budgeted_Cost||1)*100 : null
              const hVar  = (r.Budgeted_Hours||0) - (r.Actual_Hours||0)
              const over  = cVar < 0
              return (
                <tr key={r.Period}
                  onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}
                  onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='transparent')}>
                  <td style={{padding:'5px 10px',fontWeight:600,color:'#1e293b'}}>{fmtMonth(r.Period)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{k(r.Budgeted_Cost)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',
                    fontWeight:over?700:400,color:over?'#dc2626':'#059669'}}>{k(r.Burdened_Cost)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',
                    color:cVar>=0?'#059669':'#dc2626'}}>{k(cVar)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right'}}>
                    {cVarP != null && (
                      <span style={{
                        background:cVarP>=0?'#dcfce7':'#fee2e2',
                        color:cVarP>=0?'#15803d':'#b91c1c',
                        padding:'1px 6px',borderRadius:999,fontSize:'0.68rem',fontWeight:700
                      }}>
                        {cVarP>=0?'▼ ':'▲ '}{Math.abs(cVarP).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{num(r.Budgeted_Hours)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',
                    color:(r.Actual_Hours||0)>(r.Budgeted_Hours||0)?'#dc2626':'#1e293b'}}>{num(r.Actual_Hours)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',
                    color:hVar>=0?'#059669':'#dc2626'}}>{hVar>0?'+':''}{num(hVar)}</td>
                </tr>
              )
            })}
          </tbody>
          {/* Totals */}
          <tfoot>
            <tr style={{background:'#f1f5f9',fontWeight:700}}>
              <td style={{padding:'6px 10px',fontWeight:700,fontSize:'0.75rem'}}>TOTAL</td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace'}}>{k(totalBudCost)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',
                color:totalActCost>totalBudCost?'#dc2626':'#059669'}}>{k(totalActCost)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',
                color:costVar>=0?'#059669':'#dc2626'}}>{k(costVar)}</td>
              <td style={{padding:'6px 10px',textAlign:'right'}}>
                {totalBudCost > 0 && (
                  <span style={{
                    background:costVar>=0?'#dcfce7':'#fee2e2',
                    color:costVar>=0?'#15803d':'#b91c1c',
                    padding:'1px 6px',borderRadius:999,fontSize:'0.68rem',fontWeight:700
                  }}>
                    {costVar>=0?'▼ ':'▲ '}{Math.abs(costVar/totalBudCost*100).toFixed(1)}%
                  </span>
                )}
              </td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace'}}>{num(totalBudHrs)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',
                color:totalActHrs>totalBudHrs?'#dc2626':'#059669'}}>{num(totalActHrs)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',
                color:(totalBudHrs-totalActHrs)>=0?'#059669':'#dc2626'}}>
                {totalBudHrs-totalActHrs>0?'+':''}{num(totalBudHrs-totalActHrs)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Manual Input Modal ────────────────────────────────────────────────────────
function ManualInputModal({ row, onSave, onClose }) {
  const existing = row.Manual || {}
  const [form, setForm] = useState({
    projected_extra_cost:  existing.projected_extra_cost  ?? '',
    projected_extra_label: existing.projected_extra_label ?? 'Projected Extra Cost',
    notes:                 existing.notes                 ?? '',
    custom_fields:         existing.custom_fields         ?? [],
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    await post('/api/manual-inputs', {
      project_id:            row.Project_ID,
      tcv:                   row.TCV,
      projected_extra_cost:  parseFloat(form.projected_extra_cost) || 0,
      projected_extra_label: form.projected_extra_label,
      notes:                 form.notes,
      custom_fields:         form.custom_fields,
    })
    onSave()
    setSaving(false)
    onClose()
  }

  const inp = {
    background:'#f8fafc', border:'1px solid #e2e8f0', color:'#1e293b',
    padding:'7px 10px', borderRadius:6, fontSize:'0.8rem', width:'100%',
    fontFamily:"'DM Sans',sans-serif", outline:'none',
  }
  const lbl = {
    fontSize:'0.65rem', fontWeight:700, color:'#64748b',
    letterSpacing:'.07em', textTransform:'uppercase', display:'block', marginBottom:4,
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,
      display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',
        padding:'1.5rem',width:460,maxHeight:'80vh',overflowY:'auto',
        display:'flex',flexDirection:'column',gap:'1rem',
        boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>

        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h3 style={{margin:0,fontSize:'0.95rem',fontWeight:700,color:'#1e293b'}}>Edit Projections</h3>
            <p style={{margin:'3px 0 0',fontSize:'0.75rem',color:'#64748b'}}>
              {row.Project_ID} — {row.Project_Name}
            </p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',padding:4}}>
            <X size={18}/>
          </button>
        </div>

        <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'10px 14px',fontSize:'0.78rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            <div><div style={{color:'#0369a1',fontWeight:700,fontSize:'0.65rem',textTransform:'uppercase'}}>TCV</div>
              <div style={{fontWeight:700,color:'#1e293b'}}>{currency(row.TCV)}</div></div>
            <div><div style={{color:'#0369a1',fontWeight:700,fontSize:'0.65rem',textTransform:'uppercase'}}>Cost to Date</div>
              <div style={{fontWeight:700,color:'#1e293b'}}>{currency(row.Cost_Till_Date)}</div></div>
            <div><div style={{color:'#0369a1',fontWeight:700,fontSize:'0.65rem',textTransform:'uppercase'}}>% Complete</div>
              <div style={{fontWeight:700,color:'#1e293b'}}>{row.Pct_Complete?.toFixed(0)}%</div></div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
          <div>
            <label style={lbl}>Projected Extra Cost ($)</label>
            <input style={inp} type="number" value={form.projected_extra_cost}
              onChange={e => set('projected_extra_cost', e.target.value)} placeholder="e.g. 54000"/>
          </div>
          <div>
            <label style={lbl}>Extra Cost Label</label>
            <input style={inp} value={form.projected_extra_label}
              onChange={e => set('projected_extra_label', e.target.value)}
              placeholder="e.g. Risk provision"/>
          </div>
        </div>

        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={{...lbl,marginBottom:0}}>Additional Fields</label>
            <button onClick={() => set('custom_fields', [...form.custom_fields, {label:'',value:''}])}
              style={{background:'none',border:'none',color:'#0891b2',cursor:'pointer',
                display:'flex',alignItems:'center',gap:4,fontSize:'0.75rem',fontWeight:600,
                fontFamily:"'DM Sans',sans-serif"}}>
              <PlusCircle size={13}/> Add
            </button>
          </div>
          {form.custom_fields.map((cf, i) => (
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6,marginBottom:6,alignItems:'center'}}>
              <input style={inp} value={cf.label}
                onChange={e => set('custom_fields', form.custom_fields.map((x,j)=>j===i?{...x,label:e.target.value}:x))}
                placeholder="Label"/>
              <input style={inp} value={cf.value}
                onChange={e => set('custom_fields', form.custom_fields.map((x,j)=>j===i?{...x,value:e.target.value}:x))}
                placeholder="Value"/>
              <button onClick={() => set('custom_fields', form.custom_fields.filter((_,j)=>j!==i))}
                style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',padding:4}}>
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>

        <div>
          <label style={lbl}>Notes</label>
          <textarea style={{...inp,resize:'vertical',minHeight:56}} value={form.notes}
            onChange={e => set('notes', e.target.value)} placeholder="Optional notes…"/>
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose}
            style={{padding:'7px 16px',borderRadius:6,border:'1px solid #e2e8f0',
              background:'white',cursor:'pointer',fontSize:'0.8rem',fontFamily:"'DM Sans',sans-serif"}}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{padding:'7px 16px',borderRadius:6,border:'none',
              background:'linear-gradient(135deg,#0891b2,#3b82f6)',color:'white',
              cursor:'pointer',fontSize:'0.8rem',fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProjectSummary({ filters={} }) {
  const [data,     setData]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(null)
  const [expanded, setExpanded] = useState({}) // { [pid]: true/false }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = Object.entries(filters)
        .filter(([,v]) => v!=null && (!Array.isArray(v) || v.length>0))
        .map(([k,v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`)
        .join('&')
      const res = await fetch(`/api/project-summary${qs?'?'+qs:''}`)
      const d   = await res.json()
      if (Array.isArray(d) && d.length > 0) setData(d)
      else setData([])
    } catch(e) { console.error(e); setData([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, JSON.stringify(filters)])

  const toggleExpand = (pid) => setExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))

  if (loading) return (
    <div className="card" style={{textAlign:'center',padding:'3rem',color:'#64748b'}}>
      <RefreshCw size={20} style={{animation:'spin 1s linear infinite',margin:'0 auto 8px',display:'block'}}/>
      Loading project summary…
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!data.length) return (
    <div className="card" style={{textAlign:'center',padding:'3rem',color:'#64748b',fontSize:'0.85rem'}}>
      No project data available. Make sure Budget_Cost.xlsx is loaded.
    </div>
  )

  // Grand total
  const gt = data.reduce((s, r) => ({
    Cost_Till_Date:       (s.Cost_Till_Date       ||0) + (r.Cost_Till_Date       ||0),
    Budget_Cost:          (s.Budget_Cost           ||0) + (r.Budget_Cost          ||0),
    TCV:                  (s.TCV                   ||0) + (r.TCV                  ||0),
    Revenue_Accrued:      (s.Revenue_Accrued       ||0) + (r.Revenue_Accrued      ||0),
    Remaining_Revenue:    (s.Remaining_Revenue     ||0) + (r.Remaining_Revenue    ||0),
    Projected_Total_Cost: (s.Projected_Total_Cost  ||0) + (r.Projected_Total_Cost ||0),
    Budgeted_Hours:       (s.Budgeted_Hours        ||0) + (r.Budgeted_Hours       ||0),
    Actual_Hours:         (s.Actual_Hours          ||0) + (r.Actual_Hours         ||0),
  }), {})
  const gtCurrentPM   = gt.Revenue_Accrued > 0
    ? (gt.Revenue_Accrued - gt.Cost_Till_Date) / gt.Revenue_Accrued * 100 : null
  const gtProjectedPM = gt.TCV > 0
    ? (gt.TCV - gt.Projected_Total_Cost) / gt.TCV * 100 : null

  const th = {
    padding:'8px 12px', fontSize:'0.65rem', fontWeight:700, color:'#64748b',
    letterSpacing:'.06em', textTransform:'uppercase', textAlign:'right',
    borderBottom:'2px solid #e2e8f0', background:'white',
    position:'sticky', top:0, zIndex:1,
  }
  const tdStyle = (isTotal=false) => ({
    padding:'9px 12px', fontSize:'0.78rem', borderBottom:'1px solid #f1f5f9',
    background: isTotal ? '#f8fafc' : 'white', fontWeight: isTotal ? 700 : 400,
  })

  // How many columns total (for colspan in expanded row)
  const COL_COUNT = 16

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #e2e8f0',
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h3 style={{margin:0,fontSize:'0.88rem',fontWeight:700,color:'#1e293b'}}>Project Summary</h3>
          <p style={{margin:'2px 0 0',fontSize:'0.72rem',color:'#64748b'}}>
            Click any project row to expand monthly budget vs cost breakdown
          </p>
        </div>
        <button onClick={load} style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,
          padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,
          fontSize:'0.75rem',color:'#64748b',fontFamily:"'DM Sans',sans-serif"}}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'}}>
          <thead>
            <tr>
              <th style={{...th,textAlign:'left',minWidth:180,position:'sticky',left:0,zIndex:2}}>Project</th>
              <th style={{...th,minWidth:70}}>% Complete</th>
              <th style={{...th,minWidth:110}}>Budget Cost</th>
              <th style={{...th,minWidth:110}}>Actual Cost</th>
              <th style={{...th,minWidth:90}}>Cost Var</th>
              <th style={{...th,minWidth:90}}>Bud Hrs</th>
              <th style={{...th,minWidth:90}}>Act Hrs</th>
              <th style={{...th,minWidth:110}}>TCV</th>
              <th style={{...th,minWidth:120}}>Rev Accrued</th>
              <th style={{...th,minWidth:120}}>Remaining Rev</th>
              <th style={{...th,minWidth:90}}>Current PM%</th>
              <th style={{...th,minWidth:90}}>As Sold PM%</th>
              <th style={{...th,minWidth:120}}>Proj Extra Cost</th>
              <th style={{...th,minWidth:110}}>Proj Total Cost</th>
              <th style={{...th,minWidth:90}}>Proj PM%</th>
              <th style={{...th,minWidth:60}}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const overBudget  = r.Cost_Till_Date > r.Budget_Cost
              const complete100 = r.Pct_Complete >= 100
              const isExpanded  = !!expanded[r.Project_ID]

              return (
                <>
                  <tr key={r.Project_ID}
                    style={{cursor:'pointer',transition:'background .1s'}}
                    onClick={() => toggleExpand(r.Project_ID)}
                    onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>{if(!t.dataset.nohover)t.style.background='#f0f9ff'})}
                    onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>{if(!t.dataset.nohover)t.style.background=isExpanded?'#f0f9ff':'white'})}>

                    {/* Project ID + expand indicator */}
                    <td style={{...tdStyle(),textAlign:'left',position:'sticky',left:0,
                      background:isExpanded?'#f0f9ff':'white',borderRight:'1px solid #f1f5f9',zIndex:1,
                      borderLeft:`3px solid ${isExpanded?'#0891b2':'transparent'}`,transition:'all .15s'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{color:'#0891b2',flexShrink:0,display:'flex',alignItems:'center'}}>
                          {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </span>
                        <div>
                          <div style={{fontWeight:700,fontSize:'0.78rem',color:'#1e293b'}}>{r.Project_ID}</div>
                          {r.Project_Name && (
                            <div style={{fontSize:'0.67rem',color:'#64748b',marginTop:1,maxWidth:160,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                              title={r.Project_Name}>{r.Project_Name}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* % Complete */}
                    <td style={{...tdStyle(),textAlign:'right'}}>
                      <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'flex-end'}}>
                        <span style={{fontWeight:700,color:complete100?'#dc2626':'#0891b2',fontSize:'0.78rem'}}>
                          {r.Pct_Complete?.toFixed(0)}%{complete100?' ⚠️':''}
                        </span>
                        <div style={{height:4,background:'#e2e8f0',borderRadius:2,overflow:'hidden',width:52}}>
                          <div style={{height:'100%',width:`${Math.min(r.Pct_Complete||0,100)}%`,
                            background:complete100?'#dc2626':'#0891b2',borderRadius:2}}/>
                        </div>
                      </div>
                    </td>

                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                      {currency(r.Budget_Cost)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',
                      color:overBudget?'#dc2626':'#059669',fontWeight:overBudget?700:400}}>
                      {currency(r.Cost_Till_Date)}{overBudget?' ▲':''}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right'}}>
                      {r.Cost_Variance_Pct != null && (
                        <span style={{background:r.Cost_Variance>=0?'#dcfce7':'#fee2e2',
                          color:r.Cost_Variance>=0?'#15803d':'#b91c1c',
                          padding:'2px 7px',borderRadius:999,fontSize:'0.7rem',fontWeight:700}}>
                          {r.Cost_Variance>=0?'▼ ':'▲ '}{Math.abs(r.Cost_Variance_Pct).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                      {num(r.Budgeted_Hours)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',
                      color:(r.Actual_Hours||0)>(r.Budgeted_Hours||0)?'#dc2626':'#1e293b'}}>
                      {num(r.Actual_Hours)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',fontWeight:600}}>
                      {currency(r.TCV)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',color:'#059669',fontWeight:600}}>
                      {currency(r.Revenue_Accrued)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',color:'#0891b2'}}>
                      {currency(r.Remaining_Revenue)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right'}}>
                      {r.Current_PM_Pct != null ? (
                        <span style={{background:pmBg(r.Current_PM_Pct),color:pmColor(r.Current_PM_Pct),
                          padding:'3px 9px',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>
                          {r.Current_PM_Pct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',color:'#64748b',fontSize:'0.78rem'}}>
                      {r.Budget_PM_Pct != null ? `${r.Budget_PM_Pct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                      {r.Projected_Extra_Cost > 0 ? (
                        <div>
                          <div style={{color:'#d97706',fontWeight:600}}>{currency(r.Projected_Extra_Cost)}</div>
                          <div style={{fontSize:'0.65rem',color:'#94a3b8'}}>{r.Projected_Extra_Label}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right',fontFamily:'monospace'}}>
                      {currency(r.Projected_Total_Cost)}
                    </td>
                    <td style={{...tdStyle(),textAlign:'right'}}>
                      {r.Is_Closed || r.Project_State === 'closed' ? (
                        <span style={{color:'#94a3b8',fontSize:'0.75rem',fontWeight:700}}>—</span>
                      ) : !(r.Is_Closed || r.Project_State === 'closed' || r.Status_Label === 'Closed') && r.Projected_PM_Pct != null ? (
                        <span style={{background:pmBg(r.Projected_PM_Pct),color:pmColor(r.Projected_PM_Pct),
                          padding:'3px 9px',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>
                          {r.Projected_PM_Pct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    {/* Edit button - stop propagation so it doesn't toggle expand */}
                    <td style={{...tdStyle(),textAlign:'center'}} data-nohover="1"
                      onClick={e => { e.stopPropagation(); setModal(r) }}>
                      <button style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,
                        padding:'4px 8px',cursor:'pointer',color:'#64748b',
                        display:'flex',alignItems:'center',gap:4,fontSize:'0.72rem',
                        fontFamily:"'DM Sans',sans-serif"}}
                        onClick={e => { e.stopPropagation(); setModal(r) }}>
                        <Edit3 size={12}/> Edit
                      </button>
                    </td>
                  </tr>

                  {/* ── Expanded monthly breakdown ── */}
                  {isExpanded && (
                    <tr key={`${r.Project_ID}-detail`}>
                      <td colSpan={COL_COUNT} style={{padding:0,borderBottom:'2px solid #0891b2'}}>
                        <MonthlyBreakdown projectId={r.Project_ID}/>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>

          <tfoot>
            <tr style={{background:'#f8fafc'}}>
              <td style={{...tdStyle(true),textAlign:'left',position:'sticky',left:0,
                background:'#f8fafc',borderRight:'1px solid #f1f5f9',zIndex:1,
                borderTop:'2px solid #e2e8f0',borderLeft:'3px solid transparent'}}>
                TOTAL
              </td>
              <td style={{...tdStyle(true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.Budget_Cost)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.Cost_Till_Date)}
              </td>
              <td style={{...tdStyle(true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {num(gt.Budgeted_Hours)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {num(gt.Actual_Hours)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.TCV)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',color:'#059669',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.Revenue_Accrued)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',color:'#0891b2',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.Remaining_Revenue)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',borderTop:'2px solid #e2e8f0'}}>
                {gtCurrentPM != null ? (
                  <span style={{background:pmBg(gtCurrentPM),color:pmColor(gtCurrentPM),
                    padding:'3px 9px',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>
                    {gtCurrentPM.toFixed(1)}%
                  </span>
                ) : '—'}
              </td>
              <td style={{...tdStyle(true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...tdStyle(true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...tdStyle(true),textAlign:'right',fontFamily:'monospace',borderTop:'2px solid #e2e8f0'}}>
                {currency(gt.Projected_Total_Cost)}
              </td>
              <td style={{...tdStyle(true),textAlign:'right',borderTop:'2px solid #e2e8f0'}}>
                {gtProjectedPM != null ? (
                  <span style={{background:pmBg(gtProjectedPM),color:pmColor(gtProjectedPM),
                    padding:'3px 9px',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>
                    {gtProjectedPM.toFixed(1)}%
                  </span>
                ) : '—'}
              </td>
              <td style={{...tdStyle(true),borderTop:'2px solid #e2e8f0'}}/>
            </tr>
          </tfoot>
        </table>
      </div>

      {modal && <ManualInputModal row={modal} onSave={load} onClose={() => setModal(null)}/>}
    </div>
  )
}
