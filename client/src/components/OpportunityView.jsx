import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Building2 } from 'lucide-react'

const currency = v => v == null ? '—' : new Intl.NumberFormat('en-US', {
  style:'currency', currency:'USD', maximumFractionDigits:0
}).format(v)
const pct  = v => v == null ? '—' : `${v.toFixed(1)}%`
const num  = v => v == null ? '—' : new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(v)

const pmBg    = v => v == null ? '#f1f5f9' : v >= 20 ? '#dcfce7' : v >= 10 ? '#dbeafe' : v >= 0 ? '#fef3c7' : '#fee2e2'
const pmColor = v => v == null ? '#64748b' : v >= 20 ? '#059669' : v >= 10 ? '#1d4ed8' : v >= 0 ? '#b45309' : '#b91c1c'

function PMPill({ val }) {
  if (val == null) return <span style={{color:'#94a3b8'}}>—</span>
  return (
    <span style={{
      background: pmBg(val), color: pmColor(val),
      padding:'2px 9px', borderRadius:999, fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap'
    }}>
      {val.toFixed(1)}%
    </span>
  )
}

function ProgressBar({ val, max=100 }) {
  const pct = Math.min(val||0, 100)
  const over = (val||0) > 100
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{width:52,height:5,background:'#e2e8f0',borderRadius:3,overflow:'hidden',flexShrink:0}}>
        <div style={{height:'100%',width:`${pct}%`,background:over?'#dc2626':'#0891b2',borderRadius:3}}/>
      </div>
      <span style={{fontSize:'0.75rem',fontWeight:700,color:over?'#dc2626':'#1e293b',minWidth:36}}>
        {(val||0).toFixed(0)}%{over?' ⚠️':''}
      </span>
    </div>
  )
}

function CostPill({ val, budget }) {
  if (val == null) return <span style={{color:'#94a3b8'}}>—</span>
  const pct = budget > 0 ? ((budget-val)/budget*100) : null
  const over = val > budget
  return (
    <div style={{textAlign:'right'}}>
      <span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:over?700:400,
        color:over?'#dc2626':'#1e293b'}}>
        {currency(val)}{over?' ▲':''}
      </span>
      {pct != null && (
        <div style={{fontSize:'0.65rem',color:over?'#dc2626':'#059669',marginTop:1}}>
          {over ? `${Math.abs(pct).toFixed(1)}% over` : `${pct.toFixed(1)}% saved`}
        </div>
      )}
    </div>
  )
}

export function OpportunityView({ filters={} }) {
  const [data,     setData]    = useState([])
  const [loading,  setLoading] = useState(false)
  const [expanded, setExpanded]= useState({})

  const load = async () => {
    setLoading(true)
    try {
      const qs = Object.entries(filters).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&')
      const res = await fetch(`/api/by-customer${qs?'?'+qs:''}`)
      const d   = await res.json()
      if (Array.isArray(d)) {
        setData(d)
        // Auto-expand first customer
        if (d.length > 0) setExpanded({ [d[0].Customer]: true })
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const toggle = (customer) => setExpanded(prev => ({ ...prev, [customer]: !prev[customer] }))

  if (loading) return (
    <div className="card" style={{textAlign:'center',padding:'3rem',color:'#64748b'}}>
      <RefreshCw size={20} style={{animation:'spin 1s linear infinite',margin:'0 auto 8px',display:'block'}}/>
      Loading opportunity view…
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!data.length) return (
    <div className="card" style={{textAlign:'center',padding:'3rem',color:'#64748b',fontSize:'0.85rem'}}>
      No data available. Make sure Budget_Cost.xlsx is loaded.
    </div>
  )

  // Portfolio grand total
  const gt = data.reduce((s, c) => ({
    Budget_Cost:       (s.Budget_Cost||0)       + (c.Budget_Cost||0),
    Actual_Cost:       (s.Actual_Cost||0)        + (c.Actual_Cost||0),
    TCV:               (s.TCV||0)               + (c.TCV||0),
    Revenue_Accrued:   (s.Revenue_Accrued||0)   + (c.Revenue_Accrued||0),
    Remaining_Revenue: (s.Remaining_Revenue||0) + (c.Remaining_Revenue||0),
    Budgeted_Hours:    (s.Budgeted_Hours||0)    + (c.Budgeted_Hours||0),
    Actual_Hours:      (s.Actual_Hours||0)       + (c.Actual_Hours||0),
    Project_Count:     (s.Project_Count||0)     + (c.Project_Count||0),
  }), {})

  const th = (align='right', minW=100) => ({
    padding:'8px 12px', fontSize:'0.65rem', fontWeight:700, color:'#64748b',
    letterSpacing:'.06em', textTransform:'uppercase', textAlign:align,
    borderBottom:'2px solid #e2e8f0', background:'white',
    position:'sticky', top:0, zIndex:1, minWidth:minW,
  })
  const td = (isHeader=false, isTotal=false) => ({
    padding:'9px 12px', fontSize:'0.78rem',
    borderBottom: `1px solid ${isHeader?'#e2e8f0':'#f8fafc'}`,
    background: isTotal ? '#f8fafc' : isHeader ? '#f0f9ff' : 'white',
    fontWeight: isTotal || isHeader ? 700 : 400,
  })

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #e2e8f0',
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h3 style={{margin:0,fontSize:'0.88rem',fontWeight:700,color:'#1e293b',
            display:'flex',alignItems:'center',gap:7}}>
            <Building2 size={16} style={{color:'#0891b2'}}/> Opportunity View — By Project Group
          </h3>
          <p style={{margin:'2px 0 0',fontSize:'0.72rem',color:'#64748b'}}>
            Click a project group row to expand and see individual project breakdown
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
              <th style={{...th('left',220)}}>Customer / Project</th>
              <th style={th('center',80)}>Projects</th>
              <th style={th('right',90)}>% Complete</th>
              <th style={th('right',120)}>Budget Cost</th>
              <th style={th('right',120)}>Actual Cost</th>
              <th style={th('right',90)}>Cost Var %</th>
              <th style={th('right',80)}>Bud Hrs</th>
              <th style={th('right',80)}>Act Hrs</th>
              <th style={th('right',120)}>TCV</th>
              <th style={th('right',130)}>Rev Accrued</th>
              <th style={th('right',130)}>Rev Remaining</th>
              <th style={th('right',110)}>Budget PM%</th>
              <th style={th('right',110)}>Current PM%</th>
              <th style={th('right',110)}>Projected PM%</th>
            </tr>
          </thead>
          <tbody>
            {data.map(cust => (
              <>
                {/* ── Customer summary row ── */}
                <tr key={cust.Customer}
                  style={{cursor:'pointer',transition:'background .1s'}}
                  onClick={() => toggle(cust.Project_Group)}
                  onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}
                  onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}>

                  <td style={{...td(true),textAlign:'left',borderLeft:'3px solid #0891b2'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{color:'#0891b2',flexShrink:0}}>
                        {expanded[cust.Project_Group]
                          ? <ChevronDown size={15}/>
                          : <ChevronRight size={15}/>}
                      </span>
                      <div>
                        <div style={{fontWeight:700,fontSize:'0.82rem',color:'#1e293b'}}>
                          {cust.Customer}
                        </div>
                        {cust.Project_Group && (
                          <div style={{fontSize:'0.67rem',color:'#64748b'}}>
                            {cust.Project_Group}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{...td(true),textAlign:'center'}}>
                    <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'2px 8px',
                      borderRadius:999,fontSize:'0.72rem',fontWeight:700}}>
                      {cust.Project_Count}
                    </span>
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    <ProgressBar val={cust.Pct_Complete}/>
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace'}}>
                    {currency(cust.Budget_Cost)}
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    <CostPill val={cust.Actual_Cost} budget={cust.Budget_Cost}/>
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    {cust.Cost_Variance_Pct != null && (
                      <span style={{
                        background: cust.Cost_Variance >= 0 ? '#dcfce7' : '#fee2e2',
                        color: cust.Cost_Variance >= 0 ? '#15803d' : '#b91c1c',
                        padding:'2px 8px',borderRadius:999,fontSize:'0.7rem',fontWeight:700
                      }}>
                        {cust.Cost_Variance >= 0 ? '▼ ' : '▲ '}{Math.abs(cust.Cost_Variance_Pct).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                    {num(cust.Budgeted_Hours)}
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace',
                    color:(cust.Actual_Hours||0)>(cust.Budgeted_Hours||0)?'#dc2626':'#1e293b'}}>
                    {num(cust.Actual_Hours)}
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace',fontWeight:700}}>
                    {currency(cust.TCV)}
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace',color:'#059669',fontWeight:700}}>
                    {currency(cust.Revenue_Accrued)}
                  </td>
                  <td style={{...td(true),textAlign:'right',fontFamily:'monospace',color:'#0891b2',fontWeight:700}}>
                    {currency(cust.Remaining_Revenue)}
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    <PMPill val={cust.Budget_PM_Pct}/>
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    <PMPill val={cust.Current_PM_Pct}/>
                  </td>
                  <td style={{...td(true),textAlign:'right'}}>
                    <PMPill val={cust.Projected_PM_Pct}/>
                  </td>
                </tr>

                {/* ── Expanded project rows ── */}
                {expanded[cust.Project_Group] && cust.projects.map(p => (
                  <tr key={p.Project_ID}
                    onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f8fafc')}
                    onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='white')}>

                    <td style={{...td(false),textAlign:'left',paddingLeft:40,
                      borderLeft:'3px solid #e2e8f0'}}>
                      <div style={{fontSize:'0.75rem',fontWeight:600,color:'#1e293b'}}>{p.Project_ID}</div>
                      {p.Project_Name && (
                        <div style={{fontSize:'0.67rem',color:'#64748b',maxWidth:200,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                          title={p.Project_Name}>{p.Project_Name}</div>
                      )}
                    </td>
                    <td style={{...td(false),textAlign:'center',color:'#94a3b8',fontSize:'0.72rem'}}>
                      —
                    </td>
                    <td style={{...td(false),textAlign:'right'}}>
                      <ProgressBar val={p.Pct_Complete}/>
                    </td>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                      {currency(p.Budget_Cost)}
                    </td>
                    <td style={{...td(false),textAlign:'right'}}>
                      <CostPill val={p.Actual_Cost} budget={p.Budget_Cost}/>
                    </td>
                    <td style={{...td(false)}}/>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>
                      {num(p.Budget_Hours)}
                    </td>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',
                      color:(p.Actual_Hours||0)>(p.Budget_Hours||0)?'#dc2626':'#1e293b'}}>
                      {num(p.Actual_Hours)}
                    </td>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',fontWeight:600}}>
                      {currency(p.TCV)}
                    </td>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',color:'#059669'}}>
                      {currency(p.Revenue_Accrued)}
                    </td>
                    <td style={{...td(false),textAlign:'right',fontFamily:'monospace',color:'#0891b2'}}>
                      {currency(p.Remaining_Revenue)}
                    </td>
                    <td style={{...td(false)}}/>
                    <td style={{...td(false),textAlign:'right'}}>
                      <PMPill val={p.TCV_PM_Pct}/>
                    </td>
                    <td style={{...td(false),textAlign:'right'}}>
                      <PMPill val={p.TCV_PM_Pct}/>
                    </td>
                  </tr>
                ))}
              </>
            ))}

            {/* ── Portfolio total row ── */}
            <tr style={{background:'#f1f5f9'}}>
              <td style={{...td(false,true),textAlign:'left',fontWeight:700,fontSize:'0.8rem',
                borderTop:'2px solid #e2e8f0',paddingLeft:16}}>
                PORTFOLIO TOTAL
              </td>
              <td style={{...td(false,true),textAlign:'center',borderTop:'2px solid #e2e8f0'}}>
                <span style={{background:'#e2e8f0',color:'#475569',padding:'2px 8px',
                  borderRadius:999,fontSize:'0.72rem',fontWeight:700}}>
                  {gt.Project_Count}
                </span>
              </td>
              <td style={{...td(false,true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',
                borderTop:'2px solid #e2e8f0'}}>{currency(gt.Budget_Cost)}</td>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',
                borderTop:'2px solid #e2e8f0'}}>{currency(gt.Actual_Cost)}</td>
              <td style={{...td(false,true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',
                borderTop:'2px solid #e2e8f0'}}>{num(gt.Budgeted_Hours)}</td>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',
                borderTop:'2px solid #e2e8f0'}}>{num(gt.Actual_Hours)}</td>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',fontWeight:700,
                borderTop:'2px solid #e2e8f0'}}>{currency(gt.TCV)}</td>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',color:'#059669',
                borderTop:'2px solid #e2e8f0'}}>{currency(gt.Revenue_Accrued)}</td>
              <td style={{...td(false,true),textAlign:'right',fontFamily:'monospace',color:'#0891b2',
                borderTop:'2px solid #e2e8f0'}}>{currency(gt.Remaining_Revenue)}</td>
              <td style={{...td(false,true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...td(false,true),textAlign:'right',borderTop:'2px solid #e2e8f0'}}>
                {gt.TCV > 0 && gt.Revenue_Accrued > 0 && (
                  <PMPill val={(gt.Revenue_Accrued - gt.Actual_Cost) / gt.Revenue_Accrued * 100}/>
                )}
              </td>
              <td style={{...td(false,true),textAlign:'right',borderTop:'2px solid #e2e8f0'}}>
                {gt.TCV > 0 && (
                  <PMPill val={(gt.TCV - gt.Actual_Cost) / gt.TCV * 100}/>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
