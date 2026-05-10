import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
         Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { fmt } from '../utils/api'

const k   = fmt.k
const num = v => v == null ? '—' : Math.round(v).toLocaleString()
const pct = v => v == null ? '—' : `${v.toFixed(1)}%`

const pmBg    = v => v==null?'#f1f5f9':v>=20?'#dcfce7':v>=10?'#dbeafe':v>=0?'#fef3c7':'#fee2e2'
const pmColor = v => v==null?'#64748b':v>=20?'#059669':v>=10?'#1d4ed8':v>=0?'#b45309':'#dc2626'

function PMPill({ val }) {
  if (val == null) return <span style={{color:'#94a3b8'}}>—</span>
  return (
    <span style={{
      background:pmBg(val), color:pmColor(val),
      padding:'2px 9px', borderRadius:999, fontSize:'0.72rem', fontWeight:700
    }}>
      {val.toFixed(1)}%
    </span>
  )
}

export function PortfolioSummary() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portfolio-summary')
      const d   = await res.json()
      if (Array.isArray(d)) setData(d)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Grand totals
  const tot = data.reduce((s, r) => ({
    TCV:             (s.TCV||0)             + (r.TCV||0),
    Budgeted_Cost:   (s.Budgeted_Cost||0)   + (r.Budgeted_Cost||0),
    Burdened_Cost:   (s.Burdened_Cost||0)   + (r.Burdened_Cost||0),
    Budgeted_Hours:  (s.Budgeted_Hours||0)  + (r.Budgeted_Hours||0),
    Actual_Hours:    (s.Actual_Hours||0)    + (r.Actual_Hours||0),
    Revenue_Accrued: (s.Revenue_Accrued||0) + (r.Revenue_Accrued||0),
    Remaining_Revenue:(s.Remaining_Revenue||0)+(r.Remaining_Revenue||0),
    Project_Count:   (s.Project_Count||0)   + (r.Project_Count||0),
  }), {})

  const totCurrentPM  = tot.Revenue_Accrued > 0
    ? (tot.Revenue_Accrued - tot.Burdened_Cost) / tot.Revenue_Accrued * 100 : null

  if (loading) return (
    <div className="card" style={{padding:'3rem',textAlign:'center',color:'#64748b'}}>
      <RefreshCw size={20} style={{animation:'spin 1s linear infinite',display:'block',margin:'0 auto 8px'}}/>
      Loading portfolio summary…
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!data.length) return (
    <div className="card" style={{padding:'3rem',textAlign:'center',color:'#64748b',fontSize:'0.85rem'}}>
      No data. Upload your Budget_Cost.xlsx file.
    </div>
  )

  const th = (align='right', w=100) => ({
    padding:'8px 12px', fontSize:'0.63rem', fontWeight:700, color:'#64748b',
    letterSpacing:'.06em', textTransform:'uppercase', textAlign:align,
    borderBottom:'2px solid #e2e8f0', background:'white',
    position:'sticky', top:0, zIndex:1, minWidth:w, whiteSpace:'nowrap',
  })
  const td = (align='right', total=false) => ({
    padding:'9px 12px', textAlign:align, fontSize:'0.78rem',
    borderBottom: total ? 'none' : '1px solid #f8fafc',
    background: total ? '#f1f5f9' : 'white',
    fontWeight: total ? 700 : 400,
  })

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>

      {/* ── Executive Summary Cards ── */}
      <div style={{padding:'0.85rem 1.1rem',borderBottom:'1px solid #e2e8f0',
        display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0.65rem'}}>
        {[
          { label:'Total TCV',         val:fmt.k(tot.TCV),             color:'#0891b2', icon:'📋' },
          { label:'Total Budget',      val:fmt.k(tot.Budgeted_Cost),   color:'#64748b', icon:'📊' },
          { label:'Cost to Date',      val:fmt.k(tot.Burdened_Cost),   color: tot.Burdened_Cost > tot.Budgeted_Cost ? '#dc2626' : '#059669', icon:'💰' },
          { label:'Rev to Date',       val:fmt.k(tot.Revenue_Accrued), color:'#059669', icon:'📈' },
          { label:'Rev Remaining',     val:fmt.k(tot.Remaining_Revenue),color:'#0891b2', icon:'🎯' },
        ].map(({label,val,color,icon})=>(
          <div key={label} style={{background:'#f8fafc',borderRadius:8,padding:'0.65rem 0.85rem',
            borderLeft:`3px solid ${color}`}}>
            <div style={{fontSize:'0.58rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.07em'}}>{label}</div>
            <div style={{fontSize:'1rem',fontWeight:700,color,marginTop:2}}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Waterfall: TCV → Budget → Actuals by group ── */}
      <div style={{padding:'0.75rem 1.1rem',borderBottom:'1px solid #e2e8f0'}}>
        <div style={{fontSize:'0.74rem',fontWeight:700,color:'#1e293b',marginBottom:'0.5rem'}}>
          Portfolio Cost Waterfall — by Project Group
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data.map(r=>({
            name: r.Project_Group.length>14 ? r.Project_Group.slice(0,13)+'…' : r.Project_Group,
            TCV:  r.TCV,
            Budget: r.Budgeted_Cost,
            Actual: r.Burdened_Cost,
          }))} margin={{top:4,right:8,bottom:4,left:8}} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmt.k(v)} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={52}/>
            <Tooltip formatter={(v,n)=>[fmt.k(v),n]} contentStyle={{borderRadius:8,fontSize:'0.75rem',fontFamily:"'DM Sans',sans-serif"}}/>
            <Bar dataKey="TCV"    name="TCV"    fill="#bfdbfe" radius={[2,2,0,0]} maxBarSize={32}/>
            <Bar dataKey="Budget" name="Budget" fill="#64748b" radius={[2,2,0,0]} maxBarSize={32}/>
            <Bar dataKey="Actual" name="Actual" radius={[2,2,0,0]} maxBarSize={32}>
              {data.map((r,i)=>(
                <Cell key={i} fill={r.Burdened_Cost > r.Budgeted_Cost ? '#dc2626' : '#059669'}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Header */}
      <div style={{padding:'0.9rem 1.1rem',borderBottom:'1px solid #e2e8f0',
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h3 style={{margin:0,fontSize:'0.9rem',fontWeight:700,color:'#1e293b'}}>
            Portfolio Summary — by Project Group
          </h3>
          <p style={{margin:'2px 0 0',fontSize:'0.72rem',color:'#64748b'}}>
            Full dataset — not affected by page filters
          </p>
        </div>
        <button onClick={load}
          style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,
            padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,
            fontSize:'0.74rem',color:'#64748b',fontFamily:"'DM Sans',sans-serif"}}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={th('left',180)}>Project Group</th>
              <th style={th('center',70)}>Projects</th>
              <th style={th('right',110)}>TCV</th>
              <th style={th('right',115)}>Total Budget Cost</th>
              <th style={th('right',115)}>Total Actual Cost</th>
              <th style={th('right',90)}>Cost Var %</th>
              <th style={th('right',90)}>Planned Hrs</th>
              <th style={th('right',90)}>Actual Hrs</th>
              <th style={th('right',110)}>Rev to Date</th>
              <th style={th('right',105)}>Rem Revenue</th>
              <th style={th('right',95)}>% Complete</th>
              <th style={th('right',100)}>Current PM%</th>
              <th style={th('right',105)}>Projected PM%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const overBudget = r.Burdened_Cost > r.Budgeted_Cost
              return (
                <tr key={r.Project_Group}
                  onMouseEnter={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='#f0f9ff')}
                  onMouseLeave={e=>e.currentTarget.querySelectorAll('td').forEach(t=>t.style.background='white')}>

                  <td style={{...td('left'),fontWeight:700,color:'#1e293b',
                    borderLeft:`3px solid ${['#0891b2','#8b5cf6','#059669','#d97706','#dc2626'][i%5]}`}}>
                    {r.Project_Group}
                  </td>

                  <td style={{...td('center')}}>
                    <span style={{background:'#dbeafe',color:'#1d4ed8',
                      padding:'2px 8px',borderRadius:999,fontSize:'0.7rem',fontWeight:700}}>
                      {r.Project_Count}
                    </span>
                  </td>

                  <td style={{...td(),fontFamily:'monospace',fontWeight:600}}>
                    {k(r.TCV)}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',color:'#64748b'}}>
                    {k(r.Budgeted_Cost)}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',
                    color: overBudget ? '#dc2626' : '#059669', fontWeight: overBudget ? 700 : 400}}>
                    {k(r.Burdened_Cost)}{overBudget ? ' ▲' : ''}
                  </td>

                  <td style={{...td()}}>
                    {r.Cost_Variance_Pct != null && (
                      <span style={{
                        background: r.Cost_Variance_Pct >= 0 ? '#dcfce7' : '#fee2e2',
                        color:      r.Cost_Variance_Pct >= 0 ? '#15803d' : '#b91c1c',
                        padding:'2px 8px', borderRadius:999, fontSize:'0.7rem', fontWeight:700,
                      }}>
                        {r.Cost_Variance_Pct >= 0 ? '▼ ' : '▲ '}{Math.abs(r.Cost_Variance_Pct).toFixed(1)}%
                      </span>
                    )}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',color:'#64748b'}}>
                    {num(r.Budgeted_Hours)}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',
                    color: r.Actual_Hours > r.Budgeted_Hours ? '#dc2626' : '#1e293b'}}>
                    {num(r.Actual_Hours)}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',color:'#059669',fontWeight:600}}>
                    {k(r.Revenue_Accrued)}
                  </td>

                  <td style={{...td(),fontFamily:'monospace',color:'#0891b2'}}>
                    {k(r.Remaining_Revenue)}
                  </td>

                  <td style={{...td()}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                      <span style={{fontWeight:700,color:'#1e293b',fontSize:'0.76rem'}}>
                        {pct(r.Pct_Complete)}
                      </span>
                      <div style={{height:4,background:'#e2e8f0',borderRadius:2,width:52,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.min(r.Pct_Complete||0,100)}%`,
                          background:'#0891b2',borderRadius:2}}/>
                      </div>
                    </div>
                  </td>

                  <td style={td()}><PMPill val={r.Current_PM_Pct}/></td>
                  <td style={td()}><PMPill val={r.Projected_PM_Pct}/></td>

                </tr>
              )
            })}
          </tbody>

          {/* Grand total */}
          <tfoot>
            <tr>
              <td style={{...td('left',true),borderTop:'2px solid #e2e8f0',
                fontSize:'0.76rem',fontWeight:700,letterSpacing:'.03em',borderLeft:'3px solid #cbd5e1'}}>
                TOTAL PORTFOLIO
              </td>
              <td style={{...td('center',true),borderTop:'2px solid #e2e8f0'}}>
                <span style={{background:'#e2e8f0',color:'#475569',
                  padding:'2px 8px',borderRadius:999,fontSize:'0.7rem',fontWeight:700}}>
                  {tot.Project_Count}
                </span>
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace',fontWeight:700}}>
                {k(tot.TCV)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace'}}>
                {k(tot.Budgeted_Cost)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace'}}>
                {k(tot.Burdened_Cost)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace'}}>
                {num(tot.Budgeted_Hours)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace'}}>
                {num(tot.Actual_Hours)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace',color:'#059669'}}>
                {k(tot.Revenue_Accrued)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0',fontFamily:'monospace',color:'#0891b2'}}>
                {k(tot.Remaining_Revenue)}
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0'}}/>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0'}}>
                <PMPill val={totCurrentPM!=null?Math.round(totCurrentPM*10)/10:null}/>
              </td>
              <td style={{...td('right',true),borderTop:'2px solid #e2e8f0'}}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
