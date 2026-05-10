const BASE = '/api'

const qs = (params) => {
  const parts = []
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue
    // Don't encode commas — they're our multi-select separator
    // encodeURIComponent encodes comma as %2C which Express doesn't decode back
    const encoded = String(v).split(',').map(s => encodeURIComponent(s.trim())).join(',')
    parts.push(`${k}=${encoded}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

const get = (path, params) => {
  const url = `${BASE}${path}${qs(params)}`
  console.log('[API]', url)
  return fetch(url).then(r => r.json())
}

export const api = {
  status:        ()  => get('/status'),
  filters:       ()  => get('/filters'),
  summary:       (p) => get('/summary', p),
  byProject:     (p) => get('/by-project', p),
  byOpportunityProjects: (p) => get('/by-opportunity-projects', p),
  trend:         (p) => get('/trend', p),
  byBand:        (p) => get('/by-band', p),
  byServiceLine: (p) => get('/by-service-line', p),
  serviceLineView: (p) => get('/service-line-view', p),
  byLocation:    (p) => get('/by-location', p),
  resourceCountMonthly: (p) => get('/resource-count-monthly', p),
  detail:        (p) => get('/detail', p),
  projectSummary:(p) => get('/project-summary', p),
  manualInputs:  ()  => get('/manual-inputs'),
  upload: (file) => {
    const fd = new FormData()
    fd.append('combined_file', file)
    return fetch(`${BASE}/upload`, { method: 'POST', body: fd }).then(r => r.json())
  }
}

export const fmt = {
  currency: v => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v),
  pct:      v => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
  num:      v => v == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v),
  k: v => {
    if (v == null) return '—'
    const a = Math.abs(v)
    if (a >= 1e6) return `${v < 0 ? '-' : ''}$${(a / 1e6).toFixed(1)}M`
    if (a >= 1e3) return `${v < 0 ? '-' : ''}$${(a / 1e3).toFixed(0)}K`
    return `$${v.toFixed(0)}`
  }
}
