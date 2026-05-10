'use strict'
const { workerData, parentPort } = require('worker_threads')
const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

// ── Standard hours by location ───────────────────────────────────────────────
function stdHrs(location) { return String(location||'').trim().toUpperCase()==='INDIA' ? 189 : 168 }

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}

function cleanCountry(raw) {
  if (!raw) return ''
  const s = String(raw).trim().toUpperCase()
  const map = {'UK':'UNITED KINGDOM','U.K.':'UNITED KINGDOM','USA':'UNITED STATES','U.S.A.':'UNITED STATES','US':'UNITED STATES'}
  return map[s] || s
}

function cleanSL(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const u = s.toUpperCase()
  if (u === 'EAS ORACLE' || u === 'EAS - ORACLE') return 'EAS ORACLE'
  if (u === 'EAS SAP'    || u === 'EAS - SAP')    return 'EAS SAP'
  if (u === 'ADM' || u.startsWith('ADM ') || u.startsWith('ADM\t')) return 'ADM'
  if (u === 'ITMS - EUC' || u === 'ITMS EUC')  return 'ITMS - EUC'
  if (u === 'ITMS IMS'   || u === 'ITMS - IMS') return 'ITMS IMS'
  return s
}

function toYYYYMMDD(val) {
  if (!val) return null
  const d = val instanceof Date ? val : toDate(val)
  if (!d || isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function toYYYYMM(val) {
  if (!val && val !== 0) return null
  // JS Date object from XLSX cellDates:true
  if (val instanceof Date) {
    if (isNaN(val)) return null
    return `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}`
  }
  // Excel serial
  if (typeof val === 'number' && val > 1000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    if (!isNaN(d)) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
  }
  const s = String(val).trim()
  if (!s || s === '0') return null
  if (/^\d{4}-\d{2}$/.test(s)) return s
  const dm = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/)
  if (dm) { const mo=MONTHS[dm[2].toLowerCase()]; let yr=parseInt(dm[3]); if(yr<100)yr+=2000; if(mo)return `${yr}-${String(mo).padStart(2,'0')}` }
  const m1 = s.match(/^([A-Za-z]{3})[-\s](\d{2,4})$/)
  if (m1) { const mo=MONTHS[m1[1].toLowerCase()]; let yr=parseInt(m1[2]); if(yr<100)yr+=2000; if(mo)return `${yr}-${String(mo).padStart(2,'0')}` }
  const iso = s.match(/^(\d{4})[-\/](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}`
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (sl) { let yr=parseInt(sl[3]); if(yr<100)yr+=2000; return `${yr}-${sl[1].padStart(2,'0')}` }
  return null
}

function toDate(val) {
  if (val == null || val === '') return null
  // Numeric (from raw XLSX) or numeric string (from CSV cache) — Excel serial date
  const n = typeof val === 'number' ? val : (String(val).trim().match(/^\d{4,6}$/) ? parseInt(val) : null)
  if (n != null && n > 1000) return new Date(Math.round((n - 25569) * 86400 * 1000))
  const s = String(val).trim()
  if (!s) return null
  // M/D/YY or M/D/YYYY
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (sl) { let yr=parseInt(sl[3]); if(yr<100)yr+=2000; return new Date(`${yr}-${sl[1].padStart(2,'0')}-${sl[2].padStart(2,'0')}`) }
  // YYYY-MM-DD or any ISO-like string
  const d = new Date(s); return isNaN(d) ? null : d
}

function monthWeights(s, e) {
  const weights = {}
  let cur = new Date(s.getFullYear(), s.getMonth(), 1)
  const end = new Date(e.getFullYear(), e.getMonth(), e.getDate())
  while (cur <= end) {
    const y=cur.getFullYear(), mo=cur.getMonth()
    const mEnd=new Date(y,mo+1,0)
    const segS=cur<s?s:cur, segE=mEnd<end?mEnd:end
    const days=Math.max(0,Math.round((segE-segS)/86400000)+1)
    if (days>0) { const k=`${y}-${String(mo+1).padStart(2,'0')}`; weights[k]=(weights[k]||0)+days }
    cur=new Date(y,mo+1,1)
  }
  const total=Object.values(weights).reduce((a,b)=>a+b,0)
  return total ? Object.fromEntries(Object.entries(weights).map(([k,v])=>[k,v/total])) : {}
}

const r2 = v => Math.round((v||0)*100)/100

function normKeyForLookup(k) {
  return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
function getField(row, candidates) {
  if (!row) return undefined
  for (const c of candidates) {
    if (row[c] != null && row[c] !== '') return row[c]
  }
  const lookup = {}
  for (const k of Object.keys(row)) lookup[normKeyForLookup(k)] = k
  for (const c of candidates) {
    const k = lookup[normKeyForLookup(c)]
    if (k && row[k] != null && row[k] !== '') return row[k]
  }
  return undefined
}

function normalizeProjectType(v, fallback='') {
  const s = String(v || fallback || '').trim()
  return s || fallback || ''
}
function sheetRows(wb, sheetName, projectTypeDefault=null) {
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  const csv = XLSX.utils.sheet_to_csv(ws, {FS:','})
  const rows = parseCSV(csv)
  return rows.map(r => {
    if (projectTypeDefault && !getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type'])) r['Project Type'] = projectTypeDefault
    return r
  })
}

const PROJECT_START_FIELDS = ['Project Start Date','Project Start','Start Date','ProjectStartDate','Start_Date','Project Start Date (YYYY-MM-DD)','start_date','Project_Start_Date']
const PROJECT_END_FIELDS   = ['Project End Date','Project End','End Date','Project Finish Date','Finish Date','ProjectEndDate','End_Date','project_end_date','end_date','Project_End_Date']

// ── CSV fast parser ───────────────────────────────────────────────────────────
function parseCSV(csv) {
  const lines = csv.split('\n')
  if (!lines.length) return []
  const headers = splitCSVLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (!line) continue
    const vals = splitCSVLine(line)
    const row = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j] !== undefined ? vals[j] : ''
    }
    rows.push(row)
  }
  return rows
}

function splitCSVLine(line) {
  const result = []
  let current = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim()); current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function csvEscape(v) {
  const s = String(v == null ? '' : v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function rowsToCSV(rows) {
  if (!rows || !rows.length) return ''
  const headers = []
  const seen = new Set()
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { seen.add(k); headers.push(k) }
    }
  }
  const out = [headers.map(csvEscape).join(',')]
  for (const row of rows) out.push(headers.map(h => csvEscape(row[h])).join(','))
  return out.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────
const { buffer, csvCachePath, forceRefresh=false } = workerData
const workerStartedAt = Date.now()
const bufferSizeMb = buffer ? Math.round((buffer.length || 0) / 1024 / 1024) : 0
const roughMs = bufferSizeMb > 0 ? Math.min(15*60*1000, Math.max(45*1000, bufferSizeMb * 1800)) : 60*1000
function emitProgress(msg, extra = {}) {
  const elapsedMs = Date.now() - workerStartedAt
  const pct = Number.isFinite(extra.pct) ? extra.pct : undefined
  const etaMs = pct && pct > 2 ? Math.max(0, Math.round((elapsedMs / pct) * (100 - pct))) : Math.max(0, roughMs - elapsedMs)
  parentPort.postMessage({
    type:'progress',
    msg,
    pct,
    stage: extra.stage || msg,
    sheet1: extra.sheet1,
    sheet2: extra.sheet2,
    recordsLoaded: extra.recordsLoaded,
    elapsedMs,
    etaMs,
    fileSizeMb: bufferSizeMb,
  })
}
function sheetApproxRows(ws) {
  if (!ws || !ws['!ref']) return 0
  try { const range = XLSX.utils.decode_range(ws['!ref']); return Math.max(0, range.e.r - range.s.r) } catch(e) { return 0 }
}

// Try reading from CSV cache first
let rows
const bufferHasData = buffer && buffer.length > 0
if (!forceRefresh && csvCachePath && fs.existsSync(csvCachePath)) {
  // Cache hit — skip Excel entirely regardless of buffer
  emitProgress('Loading Sheet 1 from compact cache (fast)…', {pct:12, stage:'cache', sheet1:{status:'Loading from cache'}, sheet2:{status:'Not needed for Fixed dashboard'}})
  const cached = fs.readFileSync(csvCachePath, 'utf8')
  if (cached.trim().startsWith('{')) {
    // Backward compatibility with older cache files. Older patches stored Sheet 1 + Sheet 2
    // as JSON, which made the cache balloon in size. Keep only Sheet 1 for the fixed dashboard.
    rows = (JSON.parse(cached).rows || []).filter(r => r._source_sheet !== 'Sheet2')
  } else {
    rows = parseCSV(cached).filter(r => r._source_sheet !== 'Sheet2')
  }
  emitProgress(`Sheet 1 cache loaded: ${rows.length} records`, {pct:38, stage:'cache-loaded', sheet1:{status:'Loaded from cache', records:rows.length}, sheet2:{status:'Not loaded during Fixed startup'}, recordsLoaded:rows.length})
} else if (bufferHasData) {
  emitProgress('Opening Fixed Projects workbook… this is the slow Excel step. The spinner is active while Sheet 1 metadata is being read.', {pct:15, stage:'open-workbook', sheet1:{status:'Opening workbook'}, sheet2:{status:'Separate All Projects workbook/cache'}, recordsLoaded:0})
  const wb = XLSX.read(buffer, {type:'buffer', cellDates:false, dense:true})
  const sheet1Name = wb.SheetNames && wb.SheetNames[0]
  const sheet1Approx = sheetApproxRows(wb.Sheets[sheet1Name])
  emitProgress(`Fixed workbook opened. Sheet 1: ${sheet1Name || 'missing'} (${sheet1Approx} rows).`, {pct:24, stage:'workbook-opened', sheet1:{status:'Detected', name:sheet1Name, approxRows:sheet1Approx}, sheet2:{status:'Separate All Projects workbook/cache'}, recordsLoaded:0})
  emitProgress('Loading Fixed Projects Sheet 1 records…', {pct:30, stage:'load-sheet1', sheet1:{status:'Loading', name:sheet1Name, approxRows:sheet1Approx}, sheet2:{status:'Separate All Projects workbook/cache'}})
  // Main dashboard cache must stay Sheet 1 only. Sheet 2 is read directly by the separate
  // All Types dashboard from the same workbook, with no join/union/shared cache.
  rows = sheetRows(wb, sheet1Name, 'Fixed Price').map(r => ({
    ...r,
    Project_Type:'Fixed Price',
    'Project Type':'Fixed Price'
  }))

  // Write a compact CSV cache instead of JSON. This prevents 150 MB caches from inflating
  // to 300+ MB and avoids storing Sheet 2 twice.
  if (csvCachePath) {
    try { fs.writeFileSync(csvCachePath, rowsToCSV(rows)); emitProgress('Compact fixed-price cache saved', {pct:48, stage:'cache-saved', sheet1:{status:'Cached', records:rows.length}, sheet2:{status:'Detected only'}, recordsLoaded:rows.length}) }
    catch(e) { /* ignore cache write failures */ }
  }

  emitProgress(`Sheet 1 parsed: ${rows.length} Fixed Price records`, {pct:55, stage:'sheet1-parsed', sheet1:{status:'Loaded', records:rows.length}, sheet2:{status:'Separate All Projects workbook/cache'}, recordsLoaded:rows.length})
} else {
  emitProgress('No data available — upload your Budget_Cost.xlsx/xls file.', {pct:100, stage:'no-data', sheet1:{status:'No workbook'}, sheet2:{status:'No workbook'}, recordsLoaded:0})
  parentPort.postMessage({type:'done', budget:[], actuals:[], resourceRows:[], projectMeta:{}, bandHeadcount:{}, periodEmpSizes:{}, stats:{budgetRows:0,budgetDist:0,actualRows:0,actualsAgg:0}})
  process.exit(0)
}

// Case/space-insensitive category matching
const normCat = v => String(v||'').trim().toLowerCase().replace(/\s+/g,' ')
const nonFixedRevenueRows = rows.filter(r => r._source_sheet === 'Sheet2')
const sheet1RowsOnly = rows.filter(r => r._source_sheet !== 'Sheet2')
const budgetRows = sheet1RowsOnly.filter(r => {
  const cat = normCat(r['Category'])
  return cat === 'budgeted cost' || cat === 'budget' || cat === 'plan' || cat === 'planned cost'
})
const actualRows = sheet1RowsOnly.filter(r => {
  const cat = normCat(r['Category'])
  return cat === 'actual cost' || cat === 'actual' || cat === 'actuals'
})
emitProgress(`Sheet 1 classified: ${budgetRows.length} budget rows, ${actualRows.length} actual rows`, {pct:65, stage:'classify-sheet1', sheet1:{status:'Classified', records:sheet1RowsOnly.length, budgetRows:budgetRows.length, actualRows:actualRows.length}, sheet2:{status:'Separate'}, recordsLoaded:sheet1RowsOnly.length})
// Debug: show first few category values if both are 0
if (budgetRows.length === 0 && actualRows.length === 0) {
  const cats = [...new Set(rows.slice(0,50).map(r=>r['Category']).filter(Boolean))]
  emitProgress(`WARNING: No rows matched. Category values found: ${cats.slice(0,5).join(' | ')}`, {pct:70, stage:'warning', sheet1:{status:'No matching category rows', records:sheet1RowsOnly.length}, sheet2:{status:'Separate'}, recordsLoaded:sheet1RowsOnly.length})
}

function upsertProjectMetaFromRow(r) {
  const pid = String(getField(r, ['Project Number','Project_ID','Project ID']) || '').trim()
  if (!pid) return
  const start = toDate(getField(r, PROJECT_START_FIELDS))
  const end   = toDate(getField(r, PROJECT_END_FIELDS))
  const tcv   = parseFloat(getField(r, ['TCV'])) || 0
  const pidb  = parseFloat(getField(r, ['PID Cost Budget','PID_Budget','Planned Budget'])) || 0
  const existing = projectMeta[pid] || {}
  projectMeta[pid] = {
    Project_Name:   existing.Project_Name   || String(getField(r, ['Project Name','Project_Name']) || '').trim(),
    Customer:       existing.Customer       || String(getField(r, ['Customer Name','Customer']) || '').trim(),
    Project_Group:  existing.Project_Group  || String(getField(r, ['Project Group','Project_Group']) || '').trim(),
    Opp_ID:         existing.Opp_ID         || String(getField(r, ['Opportunity ID','Opportunity_ID','Opp ID','Opp_ID']) || '').trim(),
    Opp_Name:       existing.Opp_Name       || String(getField(r, ['Opp Name','Opportunity Name','Opp_Name']) || '').trim(),
    TCV:            Math.max(existing.TCV || 0, tcv),
    PID_Budget:     Math.max(existing.PID_Budget || 0, pidb),
    Start_Date:     existing.Start_Date || null,
    End_Date:       existing.End_Date || null,
    Start_Date_Full: existing.Start_Date_Full || null,
    End_Date_Full:   existing.End_Date_Full || null,
    Status:         existing.Status || String(getField(r, ['Project Status','Status']) || '').trim(),
    Actual_Headcount: existing.Actual_Headcount || 0,
    Project_Type:    existing.Project_Type || normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), ''),
  }
  const meta = projectMeta[pid]
  const sYM = toYYYYMM(start), eYM = toYYYYMM(end)
  const sFull = toYYYYMMDD(start), eFull = toYYYYMMDD(end)
  if (sYM && (!meta.Start_Date || sYM < meta.Start_Date)) meta.Start_Date = sYM
  if (eYM && (!meta.End_Date || eYM > meta.End_Date)) meta.End_Date = eYM
  if (sFull && (!meta.Start_Date_Full || sFull < meta.Start_Date_Full)) meta.Start_Date_Full = sFull
  if (eFull && (!meta.End_Date_Full || eFull > meta.End_Date_Full)) meta.End_Date_Full = eFull
}

// Detect which cost column exists in actuals
if (actualRows.length > 0) {
  const sampleRow = actualRows[0]
  const costColCandidates = [
    'Project burdened cost @ USD',
    'Burdened Cost', 'Burdened_Cost',
    'Actual Cost', 'Project Cost',
  ]
  const foundCol = costColCandidates.find(col => sampleRow[col] != null && sampleRow[col] !== '')
  emitProgress(`Actual cost column: "${foundCol || 'NOT FOUND - check column names!'}" | Sample value: ${sampleRow[foundCol] || 'N/A'}`, {pct:72, stage:'actual-column', sheet1:{status:'Validating actuals', records:sheet1RowsOnly.length}, sheet2:{status:'Separate'}, recordsLoaded:sheet1RowsOnly.length})
}

emitProgress(`Processing Sheet 1 records: ${budgetRows.length} budget + ${actualRows.length} actuals…`, {pct:75, stage:'process-sheet1', sheet1:{status:'Processing', records:sheet1RowsOnly.length, budgetRows:budgetRows.length, actualRows:actualRows.length}, sheet2:{status:'Separate'}, recordsLoaded:sheet1RowsOnly.length})

// ── Budget distribution ───────────────────────────────────────────────────────
const budgetDist = []
const projectMeta = {}
// Fixed-price dashboard metadata must come from Sheet 1 only.
// Sheet 2 is used only by the separate All Types dashboard endpoint.
for (const r of sheet1RowsOnly) upsertProjectMetaFromRow(r)

for (const r of budgetRows) {
  const pid  = String(r['Project Number']||'').trim()
  const band = String(r['Band']||'').trim()
  const loc  = cleanCountry(r['Country'])
  const sl   = cleanSL(r['Offering'])
  const bc   = parseFloat(r['Budgeted Cost'])||0
  const bh   = parseFloat(r['Actual Hours'])||0
  const tcv  = parseFloat(r['TCV'])||0
  const pidb = parseFloat(r['PID Cost Budget'])||0
  if (!pid) continue

  let start = toDate(getField(r, PROJECT_START_FIELDS))
  let end   = toDate(getField(r, PROJECT_END_FIELDS))

  if (!projectMeta[pid]) {
    projectMeta[pid] = {
      Project_Name: String(r['Project Name']||'').trim(),
      Customer:     String(r['Customer Name']||'').trim(),
      Project_Group:String(r['Project Group']||'').trim(),
      Opp_ID:       String(getField(r, ['Opportunity ID','Opportunity_ID','Opp ID','Opp_ID']) || '').trim(),
      Opp_Name:     String(r['Opp Name']||'').trim(),
      TCV: tcv, PID_Budget: pidb,
      Start_Date: toYYYYMM(start), End_Date: toYYYYMM(end), Start_Date_Full: toYYYYMMDD(start), End_Date_Full: toYYYYMMDD(end),
      Status: String(r['Project Status']||'').trim(),
      Project_Type: normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Fixed Price'),
    }
  } else {
    if (tcv  > (projectMeta[pid].TCV||0))       projectMeta[pid].TCV       = tcv
    if (pidb > (projectMeta[pid].PID_Budget||0)) projectMeta[pid].PID_Budget = pidb
    const sYM = toYYYYMM(start), eYM = toYYYYMM(end)
    if (sYM && (!projectMeta[pid].Start_Date || sYM < projectMeta[pid].Start_Date)) projectMeta[pid].Start_Date = sYM
    if (eYM && (!projectMeta[pid].End_Date   || eYM > projectMeta[pid].End_Date))   projectMeta[pid].End_Date   = eYM
    const sFull = toYYYYMMDD(start), eFull = toYYYYMMDD(end)
    if (sFull && (!projectMeta[pid].Start_Date_Full || sFull < projectMeta[pid].Start_Date_Full)) projectMeta[pid].Start_Date_Full = sFull
    if (eFull && (!projectMeta[pid].End_Date_Full   || eFull > projectMeta[pid].End_Date_Full))   projectMeta[pid].End_Date_Full   = eFull
  }

  if (!start || !end || isNaN(start) || isNaN(end)) {
    // Store meta even if dates missing, just skip budget distribution
    continue
  }
  const weights = monthWeights(start, end)
  for (const [period, w] of Object.entries(weights)) {
    budgetDist.push({
      Period: period, Project_ID: pid, Band: band,
      Service_Line: sl, Location: loc,
      Budgeted_Hours: r2(bh*w), Budgeted_Cost: r2(bc*w),
      // Monthly planned revenue is derived from direct project TCV/PID budget when no monthly revenue field exists.
      Budgeted_Revenue: pidb > 0 ? r2((bc*w)/pidb*tcv) : 0,
      Project_Type: 'Fixed Price',
    })
  }
}

// ── Actuals aggregation ───────────────────────────────────────────────────────
const actMap = {}
const projEmps     = {}
const bandEmps     = {}
const periodEmps   = {}
const projPeriodEmps = {}  // pid|period -> Set of employees
const resourceRows = []     // employee-level rows for unique resource counts

for (const r of actualRows) {
  const pid    = String(r['Project Number']||'').trim()
  const band   = String(r['Band']||'').trim()
  const loc    = cleanCountry(r['Country'])
  const sl     = cleanSL(r['Offering'])
  const period = toYYYYMM(r['Item Expenditure Period'])
  const emp    = String(r['Employee Number']||'').trim()
  if (!pid || !period) continue

  const actualHrs = parseFloat(r['Actual Hours'])||0
  const projectType = normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Fixed Price')
  const meta = projectMeta[pid] || {}

  const key = [pid,band,sl,loc,period].join('||')
  if (!actMap[key]) actMap[key] = {Project_ID:pid,Band:band,Service_Line:sl,Location:loc,Period:period,Project_Type:projectType,
    Actual_Hours:0,Burdened_Cost:0,Actual_Revenue:0}
  actMap[key].Actual_Hours  += actualHrs
  // Try multiple possible column names for actual cost
  const _burdenedCost = parseFloat(
    r['Project burdened cost @ USD'] ||
    r['Burdened Cost'] ||
    r['Burdened_Cost'] ||
    r['Actual Cost'] ||
    r['Project Cost'] ||
    0
  ) || 0
  actMap[key].Burdened_Cost += _burdenedCost
  const _explicitRevenue = parseFloat(r['Actual Revenue'] || r['Revenue'] || r['Revenue Accrued'] || r['Accrued Revenue'] || 0) || 0
  const _derivedRevenue = (!_explicitRevenue && meta.PID_Budget > 0) ? (_burdenedCost / meta.PID_Budget * (meta.TCV || 0)) : 0
  // Item Expenditure Period drives the monthly revenue bucket.
  actMap[key].Actual_Revenue += _explicitRevenue || _derivedRevenue

  // Only count as a resource if they actually clocked hours
  if (emp && actualHrs > 0) {
    if (!projEmps[pid])                projEmps[pid]                = new Set()
    if (band && !bandEmps[band])       bandEmps[band]               = new Set()
    if (!periodEmps[period])           periodEmps[period]           = new Set()
    projEmps[pid].add(emp)
    if (band) bandEmps[band].add(emp)
    periodEmps[period].add(emp)
    resourceRows.push({
      Project_ID: pid,
      Band: band,
      Service_Line: sl,
      Location: loc,
      Country: loc,
      Period: period,
      Employee_Number: emp,
      Actual_Hours: actualHrs,
      Project_Type: projectType,
    })


    // Store per project+period (for project drill-down)
    const ppKey = pid + '|' + period
    if (!projPeriodEmps[ppKey]) projPeriodEmps[ppKey] = new Set()
    projPeriodEmps[ppKey].add(emp)
  }
}


// Sheet 2 rows are intentionally NOT added to the fixed dashboard actuals.
// They are read directly by /api/tcv-revenue-quarterly for the All Types dashboard.

for (const [pid,s] of Object.entries(projEmps))
  if (projectMeta[pid]) projectMeta[pid].Actual_Headcount = s.size

// No longer need employee sets - headcount derived from hours/168
const actuals = Object.values(actMap).map(r => {
  const { _emps, ...rest } = r
  return rest
})

emitProgress('Finalizing dashboard data…', {pct:92, stage:'finalizing', sheet1:{status:'Finalizing', records:sheet1RowsOnly.length}, sheet2:{status:'Separate'}, recordsLoaded:sheet1RowsOnly.length})

parentPort.postMessage({
  type:         'done',
  budget:       budgetDist,
  actuals,
  resourceRows,
  projectMeta,
  bandHeadcount:    Object.fromEntries(Object.entries(bandEmps).map(([b,s])=>[b,s.size])),
  periodEmpSizes:      Object.fromEntries(Object.entries(periodEmps).map(([p,s])=>[p,s.size])),

  stats: { budgetRows:budgetRows.length, budgetDist:budgetDist.length,
           actualRows:actualRows.length, actualsAgg:actuals.length }
})
