import { LineChart, Line, BarChart, Bar, ComposedChart,
         XAxis, YAxis, CartesianGrid, Tooltip,
         Legend, ResponsiveContainer, ReferenceLine, LabelList } from 'recharts'
import { fmt } from '../utils/api'

// Format period label for both monthly (2025-08) and quarterly (2025-Q3)
const fmtPeriod = p => {
  if (!p) return ''
  if (p.includes('-Q')) return p  // quarterly: keep as-is e.g. "2025-Q3"
  const [y, m] = p.split('-')
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m)] || m} ${y.slice(2)}`
}

const Tip = ({ active, payload, label, isPercent }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
      padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',
      fontFamily:"'DM Sans',sans-serif",minWidth:190}}>
      <p style={{fontWeight:700,margin:'0 0 6px',color:'#1e293b',fontSize:'0.82rem'}}>{label}</p>
      {(d.Planned_FTE > 0 || d.Actual_Headcount > 0) && (
        <div style={{display:'flex',gap:14,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f1f5f9'}}>
          {d.Planned_FTE > 0 && <div>
            <div style={{fontSize:'0.58rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Planned FTE</div>
            <div style={{fontWeight:700,color:'#64748b',fontSize:'0.78rem'}}>~{d.Planned_FTE}</div>
          </div>}
          {d.Actual_Headcount > 0 && <div>
            <div style={{fontSize:'0.58rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Actual FTE</div>
            <div style={{fontWeight:700,color:'#0891b2',fontSize:'0.78rem'}}>~{d.Actual_Headcount}</div>
          </div>}
        </div>
      )}
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:24,marginBottom:4}}>
          <span style={{color:p.color,fontSize:'0.75rem',display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:p.color,display:'inline-block'}}/>
            {p.name}
          </span>
          <span style={{fontFamily:'monospace',color:'#1e293b',fontSize:'0.75rem',fontWeight:700}}>
            {isPercent ? `${(p.value||0).toFixed(1)}%` : fmt.k(p.value)}
          </span>
        </div>
      ))}
      {!isPercent && payload.length >= 2 && payload[0].value != null && payload[1].value != null && (
        <div style={{borderTop:'1px solid #f1f5f9',marginTop:6,paddingTop:6,fontSize:'0.72rem',color:'#64748b'}}>
          Variance: {fmt.k((payload[1].value||0)-(payload[0].value||0))}
          {' '}({(((payload[1].value||0)-(payload[0].value||0))/(payload[0].value||1)*100).toFixed(1)}%)
        </div>
      )}
    </div>
  )
}

// Data label formatter
const labelFmt = v => v != null && v > 0 ? fmt.k(v) : ''

export function TrendChart({ data, mode }) {
  if (!data?.length) return (
    <div style={{color:'var(--muted)',textAlign:'center',padding:'2rem',fontSize:'0.82rem'}}>No data</div>
  )

  // Compute forecast bars from recent burn, then spread the remaining burn
  // according to the future budget shape. This avoids showing the exact same
  // burn amount for every future month when the engagement has varying planned effort.
  const withForecast = (() => {
    if (mode !== 'cost') return data.map(r => ({...r, _label: fmtPeriod(r.Period)}))
    const actuals  = data.filter(r => (r.Burdened_Cost||0) > 0)
    const recent3  = actuals.slice(-3)
    const burnRate = recent3.length > 0
      ? recent3.reduce((s,r) => s+(r.Burdened_Cost||0), 0) / recent3.length
      : 0

    const lastActualIdx = data.reduce((last, r, i) => (r.Burdened_Cost||0) > 0 ? i : last, -1)
    const futureRows = data.filter((r, i) => i > lastActualIdx && (r.Burdened_Cost||0) === 0)
    const totalForecast = burnRate * futureRows.length
    const futureBudget = futureRows.reduce((s,r) => s + Math.max(0, r.Budgeted_Cost||0), 0)

    return data.map((r, i) => {
      let forecast = null
      if (i > lastActualIdx && (r.Burdened_Cost||0) === 0 && burnRate > 0) {
        const weight = futureBudget > 0
          ? Math.max(0, r.Budgeted_Cost||0) / futureBudget
          : (futureRows.length ? 1 / futureRows.length : 0)
        forecast = Math.round(totalForecast * weight)
      }
      return { ...r, _label: fmtPeriod(r.Period), _forecast: forecast }
    })
  })()

  const cfg = mode === 'hours'
    ? { plan:'Budgeted_Hours', actual:'Actual_Hours',   forecast:null,        planColor:'#fcd34d', actualColor:'#f59e0b' }
    : { plan:'Budgeted_Cost',  actual:'Burdened_Cost',  forecast:'_forecast', planColor:'#93c5fd', actualColor:'#0891b2', forecastColor:'#8b5cf6' }

  const tickInterval = Math.max(0, Math.floor(withForecast.length / 8) - 1)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={withForecast} margin={{top:16,right:8,bottom:16,left:8}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
        <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}
          tickLine={false} interval={tickInterval} height={20}/>
        <YAxis tickFormatter={v => mode==='cost' ? fmt.k(v) : v>=1000?`${(v/1000).toFixed(1)}K`:v}
          tick={{fill:'#94a3b8',fontSize:9}} axisLine={false} tickLine={false} width={52}/>
        <Tooltip content={<Tip isPercent={false}/>}/>
        <Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
        <Line dataKey={cfg.plan}   name="Planned"  stroke={cfg.planColor}   strokeWidth={2}
          strokeDasharray="5 4" dot={false}/>
        <Line dataKey={cfg.actual} name="Actual"   stroke={cfg.actualColor} strokeWidth={2.5}
          dot={{r:2,fill:cfg.actualColor,strokeWidth:0}}>
          <LabelList dataKey={cfg.actual} position="top" style={{fontSize:'0.55rem',fill:cfg.actualColor}}
            formatter={labelFmt}/>
        </Line>
        {cfg.forecast && (
          <Bar dataKey={cfg.forecast} name="Forecast (burn rate)"
            fill={cfg.forecastColor} opacity={0.6} radius={[2,2,0,0]} maxBarSize={16}>
            <LabelList dataKey={cfg.forecast} position="top" style={{fontSize:'0.55rem',fill:cfg.forecastColor}}
              formatter={labelFmt}/>
          </Bar>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function MarginTrendChart({ data }) {
  if (!data?.length) return (
    <div style={{color:'var(--muted)',textAlign:'center',padding:'2rem',fontSize:'0.82rem'}}>No data</div>
  )

  let cumRev = 0, cumCost = 0
  const enriched = data.map(r => {
    cumRev  += r.Burdened_Cost || 0
    cumCost += r.Burdened_Cost || 0
    const pm = r.Actual_Margin_Pct ?? r.Budget_Margin_Pct ?? null
    const runCPI = cumCost > 0 ? Math.round(cumRev/cumCost*100)/100 : null
    return { ...r, _pm: pm, _cpi: runCPI, _label: fmtPeriod(r.Period) }
  })

  const tickInterval = Math.max(0, Math.floor(enriched.length / 8) - 1)

  const Tip2 = ({active,payload,label}) => {
    if (!active||!payload?.length) return null
    return (
      <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
        padding:'8px 12px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',fontFamily:"'DM Sans',sans-serif"}}>
        <p style={{fontWeight:700,margin:'0 0 6px',fontSize:'0.78rem'}}>{label}</p>
        {payload.map(p => p.value!=null && (
          <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:20,marginBottom:3,fontSize:'0.73rem'}}>
            <span style={{color:p.color}}>{p.name}</span>
            <span style={{fontWeight:700,fontFamily:'monospace'}}>
              {p.name==='CPI' ? p.value.toFixed(2) : `${p.value.toFixed(1)}%`}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={enriched} margin={{top:16,right:28,bottom:16,left:8}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
        <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}
          tickLine={false} interval={tickInterval} height={20}/>
        <YAxis yAxisId="pm" tickFormatter={v=>`${v}%`} tick={{fill:'#94a3b8',fontSize:9}}
          axisLine={false} tickLine={false} width={36}/>
        <YAxis yAxisId="cpi" orientation="right" domain={[0,2]}
          tickFormatter={v=>v.toFixed(1)} tick={{fill:'#94a3b8',fontSize:9}}
          axisLine={false} tickLine={false} width={28}/>
        <Tooltip content={<Tip2/>}/>
        <Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
        <ReferenceLine yAxisId="pm"  y={0}  stroke="#e2e8f0" strokeWidth={1.5}/>
        <ReferenceLine yAxisId="cpi" y={1}  stroke="#d97706" strokeWidth={1}
          strokeDasharray="4 3" label={{value:'CPI=1',position:'right',fontSize:8,fill:'#d97706'}}/>
        <Line yAxisId="pm"  dataKey="_pm"  name="PM%"
          stroke="#8b5cf6" strokeWidth={2.5} dot={{r:2,fill:'#8b5cf6',strokeWidth:0}}>
          <LabelList dataKey="_pm"  position="top" style={{fontSize:'0.55rem',fill:'#8b5cf6'}}
            formatter={v => v!=null ? `${v.toFixed(0)}%` : ''}/>
        </Line>
        <Line yAxisId="cpi" dataKey="_cpi" name="CPI"
          stroke="#d97706" strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
      </ComposedChart>
    </ResponsiveContainer>
  )
}
