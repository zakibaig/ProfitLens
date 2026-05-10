import { fmt } from '../utils/api'

export function KpiCard({ label, value, sub, type='neutral', formatter=fmt.k, subFormatter }) {
  const subFmt = subFormatter || (v => `${v>0?'+':''}${v.toFixed(1)}%`)
  const isNum  = typeof sub === 'number'
  const tone   = type === 'auto'
    ? (isNum ? (sub >= 0 ? 'positive' : 'negative') : 'neutral')
    : type

  const accentColor = {
    positive: '#059669', negative: '#dc2626', warn: '#d97706',
    neutral: '#0891b2',
  }[tone] || '#0891b2'

  return (
    <div style={{
      background:'white', border:'1px solid #e2e8f0', borderRadius:10,
      padding:'1rem 1.25rem', position:'relative', overflow:'hidden',
      boxShadow:'0 1px 3px rgba(0,0,0,.05)',
    }}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:accentColor,borderRadius:'10px 10px 0 0'}}/>
      <p style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',
        color:'#64748b',margin:'0 0 6px'}}>{label}</p>
      <p style={{fontSize:'1.4rem',fontWeight:700,margin:0,lineHeight:1.1,color:'#1e293b'}}>
        {formatter(value)}
      </p>
      {sub != null && (
        <p style={{fontSize:'0.72rem',marginTop:5,margin:'5px 0 0',
          color: isNum ? (sub >= 0 ? '#059669' : '#dc2626') : '#64748b',
          display:'flex',alignItems:'center',gap:3}}>
          {subFmt(sub)}
        </p>
      )}
    </div>
  )
}
