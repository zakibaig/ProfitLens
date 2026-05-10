import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         Legend, ResponsiveContainer, LabelList } from 'recharts'
import { fmt } from '../utils/api'

const num = v => v == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
      padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',fontFamily:"'DM Sans',sans-serif",minWidth:180}}>
      <p style={{fontWeight:700,margin:'0 0 6px',color:'#1e293b',fontSize:'0.8rem'}}>{label}</p>
      {/* Headcount row if available */}
      {(d.Headcount > 0 || d.Planned_FTE > 0) && (
        <div style={{display:'flex',gap:12,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f1f5f9'}}>
          {d.Planned_FTE > 0 && (
            <div><div style={{fontSize:'0.6rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Planned FTE</div>
              <div style={{fontWeight:700,color:'#64748b',fontSize:'0.8rem'}}>~{num(d.Planned_FTE)}</div></div>
          )}
          {d.Headcount > 0 && (
            <div><div style={{fontSize:'0.6rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Actual People</div>
              <div style={{fontWeight:700,color:'#0891b2',fontSize:'0.8rem'}}>👥 {d.Headcount}</div></div>
          )}
        </div>
      )}
      {payload.map(p => (
        <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:20,marginBottom:3}}>
          <span style={{color:p.color,fontSize:'0.75rem'}}>{p.name}</span>
          <span style={{fontFamily:'monospace',color:'#1e293b',fontSize:'0.75rem',fontWeight:600}}>
            {fmt.k(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

const HoursTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,
      padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',fontFamily:"'DM Sans',sans-serif",minWidth:180}}>
      <p style={{fontWeight:700,margin:'0 0 6px',color:'#1e293b',fontSize:'0.8rem'}}>{label}</p>
      {(d.Headcount > 0 || d.Planned_FTE > 0) && (
        <div style={{display:'flex',gap:12,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f1f5f9'}}>
          {d.Planned_FTE > 0 && (
            <div><div style={{fontSize:'0.6rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Planned FTE</div>
              <div style={{fontWeight:700,color:'#64748b',fontSize:'0.8rem'}}>~{num(d.Planned_FTE)}</div></div>
          )}
          {d.Headcount > 0 && (
            <div><div style={{fontSize:'0.6rem',color:'#94a3b8',textTransform:'uppercase',fontWeight:700}}>Actual People</div>
              <div style={{fontWeight:700,color:'#0891b2',fontSize:'0.8rem'}}>👥 {d.Headcount}</div></div>
          )}
        </div>
      )}
      {payload.map(p => (
        <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:20,marginBottom:3}}>
          <span style={{color:p.color,fontSize:'0.75rem'}}>{p.name}</span>
          <span style={{fontFamily:'monospace',color:'#1e293b',fontSize:'0.75rem',fontWeight:600}}>
            {p.value >= 1000 ? `${(p.value/1000).toFixed(1)}K` : Math.round(p.value||0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// Cost bar chart (for band, SL, location)
export function GroupedBarChart({ data, xKey }) {
  if (!data?.length) return (
    <div style={{color:'var(--muted)',textAlign:'center',padding:'2rem',fontSize:'0.82rem'}}>No data</div>
  )
  const chartData = data.map(r => ({
    ...r,
    _label: (r[xKey]||'').length > 14 ? (r[xKey]||'').slice(0,14)+'…' : (r[xKey]||''),
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{top:4,right:8,bottom:22,left:8}} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
        <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false}
          tickLine={false} angle={-20} textAnchor="end" interval={0} height={32}/>
        <YAxis tickFormatter={v=>fmt.k(v)} tick={{fill:'#94a3b8',fontSize:10}}
          axisLine={false} tickLine={false} width={54}/>
        <Tooltip content={<CustomTooltip/>}/>
        <Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
        <Bar dataKey="Budgeted_Cost" name="Planned Cost" fill="#93c5fd" radius={[2,2,0,0]} maxBarSize={28}/>
        <Bar dataKey="Burdened_Cost" name="Actual Cost"  fill="#0891b2" radius={[2,2,0,0]} maxBarSize={28}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Hours + headcount bar chart (for band breakdown)
export function MarginBarChart({ data, xKey }) {
  if (!data?.length) return (
    <div style={{color:'var(--muted)',textAlign:'center',padding:'2rem',fontSize:'0.82rem'}}>No data</div>
  )
  const chartData = data.map(r => ({
    ...r,
    _label: (r[xKey]||'').length > 14 ? (r[xKey]||'').slice(0,14)+'…' : (r[xKey]||''),
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{top:4,right:8,bottom:22,left:8}} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
        <XAxis dataKey="_label" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false}
          tickLine={false} angle={-20} textAnchor="end" interval={0} height={32}/>
        <YAxis tickFormatter={v=>v>=1000?`${(v/1000).toFixed(1)}K`:v} tick={{fill:'#94a3b8',fontSize:10}}
          axisLine={false} tickLine={false} width={40}/>
        <Tooltip content={<HoursTooltip/>}/>
        <Legend wrapperStyle={{fontSize:'0.68rem',paddingTop:4}}/>
        <Bar dataKey="Budgeted_Hours" name="Planned Hrs" fill="#c4b5fd" radius={[2,2,0,0]} maxBarSize={28}/>
        <Bar dataKey="Actual_Hours"   name="Actual Hrs"  fill="#8b5cf6" radius={[2,2,0,0]} maxBarSize={28}/>
      </BarChart>
    </ResponsiveContainer>
  )
}
