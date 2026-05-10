'use strict'
const { Worker, isMainThread } = require('worker_threads')
const path0    = require('path')
const express  = require('express')
const cors     = require('cors')
const XLSX     = require('xlsx')
const multer   = require('multer')
const path     = require('path')
const fs       = require('fs')
const { runAgent } = require('./agent')

const app    = express()
const upload = multer({ storage: multer.memoryStorage() })
app.use(cors())
app.use(express.json())

const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) app.use(express.static(distPath))

// ── Store ─────────────────────────────────────────────────────────────────────
let store = { budget: [], actuals: [], resourceRows: [], merged: null, projectMeta: {}, bandHeadcount: {}, _periodEmpSets: {}, _projPeriodHeadcount: {}, _allProjectTypesCache: null, _allProjectsViewCache: null, _allProjectsWorkbookBuffer: null, _allProjectsWorkbookName: null, _fixedWorkbookBuffer: null, _fixedWorkbookName: null }
let manualInputs = {}

const MANUAL_FILE = path.join(__dirname, '..', 'data', 'manual_inputs.json')
function saveManual() { try { fs.writeFileSync(MANUAL_FILE, JSON.stringify(manualInputs, null, 2)) } catch(e) {} }
function loadManual() { try { if (fs.existsSync(MANUAL_FILE)) manualInputs = JSON.parse(fs.readFileSync(MANUAL_FILE)) } catch(e) {} }

// ── Reference values ──────────────────────────────────────────────────────────
const REF_BANDS = ['2.2','3.3','4.4A','4.4B','4.4C','4.4D','5.5A','5.5B',
  'Band 4A','Band 4B','Band 4C','Band 4D',
  'Contractor Level1','Contractor Level2','Contractor Level3','Sub. Contractor']
const REF_SLS   = ['APS','ADM','CLOUD','EAS','EAS - ORACLE','EAS - SAP','EAS ORACLE',
  'EAS QA','EAS SAP','ITMS DBA','ITMS - EUC','ITMS IMS','QA']
const REF_LOCS  = ['CANADA','CHINA','FRANCE','HUNGARY','INDIA','POLAND','SLOVAKIA',
  'SOUTH AFRICA','SWITZERLAND','UNITED KINGDOM','UNITED STATES','UK','USA']

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }

// ── Helpers ───────────────────────────────────────────────────────────────────
const round2 = v => Math.round((v||0)*100)/100

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

function sheetRows(wb, sheetName, projectTypeDefault=null) {
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { raw:false, dateNF:'yyyy-mm-dd' }).map(r => {
    const o = {}
    for (const [k,v] of Object.entries(r || {})) {
      const kk = String(k || '').trim()
      if (!kk) continue
      o[kk] = typeof v === 'string' ? v.trim() : v
    }
    if (projectTypeDefault && !getField(o, ['Project Type','Project_Type','Deal Type','Deal_Type'])) o['Project Type'] = projectTypeDefault
    return o
  })
}
function normalizeProjectType(v, fallback='') {
  const s = String(v || fallback || '').trim()
  return s || fallback || ''
}
function isFixedPriceType(v) {
  return String(v || '').trim().toLowerCase() === 'fixed price'
}
function applyProjectTypeFilter(rows, q) {
  const pt = String(q.project_type || '').trim()
  if (!pt || pt === 'All') return rows
  if (pt === 'Fixed Price') return rows.filter(x => isFixedPriceType(x.Project_Type || store.projectMeta[x.Project_ID]?.Project_Type))
  if (pt === 'Non Fixed Price') return rows.filter(x => !isFixedPriceType(x.Project_Type || store.projectMeta[x.Project_ID]?.Project_Type))
  const wanted = toArr(pt)
  return wanted ? rows.filter(x => wanted.includes(x.Project_Type || store.projectMeta[x.Project_ID]?.Project_Type || '')) : rows
}
const PROJECT_START_FIELDS = ['Project Start Date','Project Start','Start Date','ProjectStartDate','Start_Date','Project Start Date (YYYY-MM-DD)','start_date','Project_Start_Date']
const PROJECT_END_FIELDS   = ['Project End Date','Project End','End Date','Project Finish Date','Finish Date','ProjectEndDate','End_Date','project_end_date','end_date','Project_End_Date']

function toYYYYMMDD(val) {
  if (!val) return null
  const d = val instanceof Date ? val : toDate(val)
  if (!d || isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function toYYYYMM(val) {
  if (!val) return null
  // Already YYYY-MM
  if (typeof val === 'string' && /^\d{4}-\d{2}$/.test(val.trim())) return val.trim()

  let d
  if (val instanceof Date) { d = val }
  else if (typeof val === 'number' && val > 1000) {
    d = new Date(Math.round((val - 25569) * 86400 * 1000))
  } else if (typeof val === 'string') {
    const s = val.trim()
    // 1-Mar-26, 01-Mar-2026
    const dayMonYY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/)
    if (dayMonYY) {
      const mo = MONTHS[dayMonYY[2].toLowerCase()]
      let yr = parseInt(dayMonYY[3]); if (yr < 100) yr += 2000
      if (mo) return `${yr}-${String(mo).padStart(2,'0')}`
    }
    // Dec-25, Aug-25, Jan-26 (Oracle format Mon-YY)
    const monYY = s.match(/^([A-Za-z]{3})-(\d{2})$/)
    if (monYY) {
      const mo = MONTHS[monYY[1].toLowerCase()]
      const yr = 2000 + parseInt(monYY[2])
      if (mo) return `${yr}-${String(mo).padStart(2,'0')}`
    }
    // Jan-2025
    const monYYYY = s.match(/^([A-Za-z]{3})-(\d{4})$/)
    if (monYYYY) {
      const mo = MONTHS[monYYYY[1].toLowerCase()]
      if (mo) return `${monYYYY[2]}-${String(mo).padStart(2,'0')}`
    }
    // YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(s)) { d = new Date(s.replace(/\//g,'-')) }
    else {
      // M/D/YYYY
      const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (mdy) d = new Date(`${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`)
      else { d = new Date(s) }
    }
  }
  if (!d || isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function toDate(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) return val
  // Numeric or numeric-string Excel serial (e.g. 45887 or "45887" from CSV cache)
  const num = typeof val === 'number' ? val : (String(val).trim().match(/^\d{4,6}$/) ? parseInt(val) : null)
  if (num != null && num > 1000) return new Date(Math.round((num - 25569) * 86400 * 1000))
  if (typeof val === 'string') {
    const s = val.trim()
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s)
    // M/D/YYYY or M/D/YY (with optional time)
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (slash) {
      let yr = parseInt(slash[3])
      if (yr < 100) yr += 2000  // 2-digit year: 25 → 2025
      const d = new Date(`${yr}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`)
      if (!isNaN(d)) return d
    }
    // Mon-YY → first day of month
    const monYY = s.match(/^([A-Za-z]{3})-(\d{2,4})/)
    if (monYY) {
      const mo = MONTHS[monYY[1].toLowerCase()]
      let yr = parseInt(monYY[2]); if (yr < 100) yr += 2000
      if (mo) return new Date(yr, mo-1, 1)
    }
    const d = new Date(s); if (!isNaN(d)) return d
  }
  return null
}

function toQuarter(period) {
  if (!period) return null
  const [y, m] = period.split('-').map(Number)
  return `${y}-Q${Math.ceil(m/3)}`
}

function currentPeriodKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
}
function periodQuarterNum(period) {
  if (!period) return null
  const [, m] = String(period).split('-').map(Number)
  return Math.ceil((m || 1) / 3)
}
function periodYear(period) {
  const y = parseInt(String(period || '').slice(0,4), 10)
  return Number.isFinite(y) ? y : new Date().getFullYear()
}
function buildQuarterRevenueOutlook(projectRows, meta={}, selectedYear=null) {
  const now = new Date()
  const year = selectedYear || now.getFullYear()
  const curPeriod = currentPeriodKey()
  const currentQ = Math.ceil((now.getMonth()+1) / 3)
  const out = {
    Revenue_Q1: 0, Revenue_Q2: 0, Revenue_Q3: 0, Revenue_Q4: 0,
    Revenue_Q1_Label: year < now.getFullYear() || 1 < currentQ ? 'Q1 Actuals' : 'Q1 OL',
    Revenue_Q2_Label: year < now.getFullYear() || 2 < currentQ ? 'Q2 Actuals' : 'Q2 OL',
    Revenue_Q3_Label: year < now.getFullYear() || 3 < currentQ ? 'Q3 Actuals' : 'Q3 OL',
    Revenue_Q4_Label: year < now.getFullYear() || 4 < currentQ ? 'Q4 Actuals' : 'Q4 OL',
    Revenue_Outlook_Year: year,
  }
  const byPeriod = {}
  for (const r of projectRows || []) {
    if (!r.Period || periodYear(r.Period) !== year) continue
    if (!byPeriod[r.Period]) byPeriod[r.Period] = { actual:0, plan:0 }
    byPeriod[r.Period].actual += r.Actual_Revenue || 0
    byPeriod[r.Period].plan   += r.Budgeted_Revenue || 0
  }
  for (const [per, vals] of Object.entries(byPeriod)) {
    const q = periodQuarterNum(per)
    if (!q) continue
    const isPast = per < curPeriod || year < now.getFullYear()
    const amount = isPast ? vals.actual : (vals.actual || 0) + Math.max(0, (vals.plan || 0) - (vals.actual || 0))
    out[`Revenue_Q${q}`] = round2((out[`Revenue_Q${q}`] || 0) + amount)
  }
  return out
}


function revenue4Q(obj={}) {
  return round2((obj.Revenue_Q1 || 0) + (obj.Revenue_Q2 || 0) + (obj.Revenue_Q3 || 0) + (obj.Revenue_Q4 || 0))
}

function scopedRowTotals(rows, outlookYear=null) {
  const q = buildQuarterRevenueOutlook(rows || [], {}, outlookYear)
  const burCost = round2((rows || []).reduce((s,r)=>s+(r.Burdened_Cost||0),0))
  const revAcc  = round2((rows || []).reduce((s,r)=>s+(r.Actual_Revenue||0),0))
  const budRev  = round2((rows || []).reduce((s,r)=>s+(r.Budgeted_Revenue||0),0))
  const totalRev = revenue4Q(q) || budRev || revAcc
  return {
    TCV: totalRev,
    Revenue_Accrued: revAcc,
    Remaining_Revenue: round2(Math.max(0, totalRev - revAcc)),
    Burdened_Cost: burCost,
    Current_PM_Pct: revAcc > 0 ? round2((revAcc - burCost) / revAcc * 100) : null,
    ...q,
    Revenue_4Q: totalRev,
  }
}

function buildRowsByProject(rows) {
  const m = {}
  for (const row of (rows || [])) {
    const pid = row.Project_ID
    if (!pid) continue
    if (!m[pid]) m[pid] = []
    m[pid].push(row)
  }
  return m
}

function uniqueProjectTotals(rows) {
  const byPid = new Map()
  for (const row of (rows || [])) {
    const pid = row.Project_ID
    if (!pid) continue
    if (!byPid.has(pid)) byPid.set(pid, { Burdened_Cost:0, Budgeted_Cost:0, Budgeted_Revenue:0, Actual_Revenue:0 })
    const g = byPid.get(pid)
    g.Burdened_Cost += row.Burdened_Cost || 0
    g.Budgeted_Cost += row.Budgeted_Cost || 0
    g.Budgeted_Revenue += row.Budgeted_Revenue || 0
    g.Actual_Revenue += row.Actual_Revenue || 0
  }
  let TCV=0, PID_Budget=0, Burdened_Cost=0, Revenue_Accrued=0, Remaining_Revenue=0
  for (const [pid, vals] of byPid.entries()) {
    const meta = store.projectMeta[pid] || {}
    const tcv = meta.TCV || 0
    const pidb = meta.PID_Budget || vals.Budgeted_Cost || 0
    const pk = calcKpis(tcv, pidb, vals.Burdened_Cost || 0)
    TCV += tcv
    PID_Budget += pidb
    Burdened_Cost += vals.Burdened_Cost || 0
    Revenue_Accrued += pk.Revenue_to_Date || 0
    Remaining_Revenue += pk.Revenue_Remaining || 0
  }
  return { TCV:round2(TCV), PID_Budget:round2(PID_Budget), Burdened_Cost:round2(Burdened_Cost), Revenue_Accrued:round2(Revenue_Accrued), Remaining_Revenue:round2(Remaining_Revenue) }
}

function selectedYearFromQuery(q) {
  const ys = toArr(q?.years)
  if (ys && ys.length === 1 && /^\d{4}$/.test(String(ys[0]))) return parseInt(ys[0], 10)
  const p = q?.period_from || q?.period_to || null
  if (p && /^\d{4}/.test(p)) return parseInt(String(p).slice(0,4), 10)
  const qtr = q?.quarter_from || q?.quarter_to || null
  if (qtr && /^\d{4}/.test(qtr)) return parseInt(String(qtr).slice(0,4), 10)
  return new Date().getFullYear()
}

// Distribute a total budget across months proportionally by calendar days
function monthWeights(startDate, endDate) {
  const weights = {}
  let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  while (cur <= end) {
    const y = cur.getFullYear(), mo = cur.getMonth()
    const mEnd   = new Date(y, mo+1, 0)
    const segS   = cur < startDate ? startDate : cur
    const segE   = mEnd < end ? mEnd : end
    const days   = Math.max(0, Math.round((segE - segS) / 86400000) + 1)
    if (days > 0) {
      const key = `${y}-${String(mo+1).padStart(2,'0')}`
      weights[key] = (weights[key]||0) + days
    }
    cur = new Date(y, mo+1, 1)
  }
  const total = Object.values(weights).reduce((a,b)=>a+b,0)
  return total ? Object.fromEntries(Object.entries(weights).map(([k,v])=>[k,v/total])) : {}
}

// ── Standard hours by location ───────────────────────────────────────────────
// Offshore/nearshore = 189 hrs/month, onshore = 168 hrs/month
// Only India uses offshore standard hours (189); all other locations use 168
function stdHrs(location) {
  return String(location||'').trim().toUpperCase() === 'INDIA' ? 189 : 168
}

// Compute FTE for a set of hours given location
function toFTE(hours, location) {
  if (!hours || hours <= 0) return 0
  return Math.round(hours / stdHrs(location) * 100) / 100
}

// ── Data cleansing ───────────────────────────────────────────────────────────
function cleanCountry(raw) {
  if (!raw) return ''
  const s = String(raw).trim().toUpperCase()
  const map = {
    'UK': 'UNITED KINGDOM', 'U.K.': 'UNITED KINGDOM', 'GREAT BRITAIN': 'UNITED KINGDOM',
    'USA': 'UNITED STATES', 'U.S.A.': 'UNITED STATES', 'US': 'UNITED STATES',
  }
  return map[s] || s
}

function cleanServiceLine(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const u = s.toUpperCase()
  // Normalise EAS Oracle casing only (keep EAS BIDS as-is)
  if (u === 'EAS ORACLE' || u === 'EAS - ORACLE') return 'EAS ORACLE'
  if (u === 'EAS SAP'    || u === 'EAS - SAP')    return 'EAS SAP'
  // Combine ALL ADM variants into ADM
  if (u === 'ADM' || u.startsWith('ADM ') || u.startsWith('ADM	')) return 'ADM'
  if (u === 'ITMS - EUC' || u === 'ITMS EUC')  return 'ITMS - EUC'
  if (u === 'ITMS IMS'   || u === 'ITMS - IMS') return 'ITMS IMS'
  return s
}

// ── Parse the combined Budget+Actuals file ────────────────────────────────────
function parseCombinedFile(buffer) {
  const wb   = XLSX.read(buffer, { type:'buffer', cellDates:true })
  const sheet1Rows = sheetRows(wb, wb.SheetNames[0], 'Fixed Price')
  const sheet2Rows = wb.SheetNames[1] ? sheetRows(wb, wb.SheetNames[1], null) : []

  // Sheet 1 is Fixed Price. Sheet 2 contains non-fixed revenue rows and may include multiple Project Type values.
  const clean = sheet1Rows.map(r => ({ ...r, Project_Type: 'Fixed Price', 'Project Type': 'Fixed Price' }))
  const nonFixedRevenueRows = sheet2Rows.map(r => {
    const pt = normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Non Fixed Price')
    return { ...r, Project_Type: pt, 'Project Type': pt }
  }).filter(r => String(getField(r, ['Project Number','Project_ID','Project ID','project number']) || '').trim())

  const budgetRows  = clean.filter(r => r['Category'] === 'Budgeted cost')
  const actualRows  = clean.filter(r => r['Category'] === 'Actual Cost')

  function upsertProjectMetaFromRow(r) {
    const pid = String(getField(r, ['Project Number','Project_ID','Project ID']) || '').trim()
    if (!pid) return
    const start = toDate(getField(r, PROJECT_START_FIELDS))
    const end   = toDate(getField(r, PROJECT_END_FIELDS))
    const tcv   = parseFloat(getField(r, ['TCV'])) || 0
    const pidb  = parseFloat(getField(r, ['PID Cost Budget','PID_Budget','Planned Budget'])) || 0
    const existing = projectMeta[pid] || {}
    projectMeta[pid] = {
      Project_Name:    existing.Project_Name   || String(getField(r, ['Project Name','Project_Name']) || '').trim(),
      Customer:        existing.Customer       || String(getField(r, ['Customer Name','Customer']) || '').trim(),
      Project_Group:   existing.Project_Group  || String(getField(r, ['Project Group','Project_Group']) || '').trim(),
      Opp_ID:          existing.Opp_ID         || String(getField(r, ['Opportunity ID','Opportunity_ID','Opp ID','Opp_ID']) || '').trim(),
      Opp_Name:        existing.Opp_Name       || String(getField(r, ['Opp Name','Opportunity Name','Opp_Name']) || '').trim(),
      TCV:             Math.max(existing.TCV || 0, tcv),
      PID_Budget:      Math.max(existing.PID_Budget || 0, pidb),
      Start_Date:      existing.Start_Date || null,
      End_Date:        existing.End_Date || null,
      Start_Date_Full: existing.Start_Date_Full || null,
      End_Date_Full:   existing.End_Date_Full || null,
      Status:          existing.Status || String(getField(r, ['Project Status','Status']) || '').trim(),
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

  // --- Budget: distribute each row across months by calendar days ---
  const budgetDist = []
  const projectMeta = {}
  for (const r of clean) upsertProjectMetaFromRow(r)

  for (const r of budgetRows) {
    const pid  = String(r['Project Number']||'').trim()
    const band = String(r['Band']||'').trim()
    const loc  = cleanCountry(r['Country'])
    const sl   = cleanServiceLine(r['Offering'])
    const bc   = parseFloat(r['Budgeted Cost'])||0
    const bh   = parseFloat(r['Actual Hours'])||0   // budget hours stored in Actual Hours col
    const tcv  = parseFloat(r['TCV'])||0
    const pidb = parseFloat(r['PID Cost Budget'])||0

    let start = toDate(getField(r, PROJECT_START_FIELDS))
    let end   = toDate(getField(r, PROJECT_END_FIELDS))
    if (!pid) continue

    // Store project-level meta (name, TCV, budget) even if one date is blank.
    // Missing dates should not prevent the project from appearing in the report.
    if (!projectMeta[pid]) {
      projectMeta[pid] = {
        Project_Name:   String(r['Project Name']||'').trim(),
        Customer:       String(r['Customer Name']||'').trim(),
        Project_Group:  String(r['Project Group']||'').trim(),
        Opp_ID:         String(getField(r, ['Opportunity ID','Opportunity_ID','Opp ID','Opp_ID']) || '').trim(),
        Opp_Name:       String(r['Opp Name']||'').trim(),
        TCV:            tcv,
        PID_Budget:     pidb,
        Start_Date:     toYYYYMM(start),
        End_Date:       toYYYYMM(end),
        Start_Date_Full: toYYYYMMDD(start),
        End_Date_Full:   toYYYYMMDD(end),
        Status:         String(r['Project Status']||'').trim(),
        Project_Type:   normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Fixed Price'),
      }
    } else {
      // Update TCV/budget if larger (take max across rows for same project)
      if (tcv  > (projectMeta[pid].TCV||0))      projectMeta[pid].TCV      = tcv
      if (pidb > (projectMeta[pid].PID_Budget||0)) projectMeta[pid].PID_Budget = pidb
      const sYM = toYYYYMM(start), eYM = toYYYYMM(end)
      if (sYM && (!projectMeta[pid].Start_Date || sYM < projectMeta[pid].Start_Date)) projectMeta[pid].Start_Date = sYM
      if (eYM && (!projectMeta[pid].End_Date   || eYM > projectMeta[pid].End_Date))   projectMeta[pid].End_Date   = eYM
      const sFull = toYYYYMMDD(start), eFull = toYYYYMMDD(end)
      if (sFull && (!projectMeta[pid].Start_Date_Full || sFull < projectMeta[pid].Start_Date_Full)) projectMeta[pid].Start_Date_Full = sFull
      if (eFull && (!projectMeta[pid].End_Date_Full   || eFull > projectMeta[pid].End_Date_Full))   projectMeta[pid].End_Date_Full   = eFull
    }

    if (!start || !end || isNaN(start) || isNaN(end)) continue
    const weights = monthWeights(start, end)
    for (const [period, w] of Object.entries(weights)) {
      budgetDist.push({
        Period:           period,
        Project_ID:       pid,
        Band:             band,
        Service_Line:     sl,
        Location:         loc,
        Budgeted_Hours:   round2(bh * w),
        Budgeted_Cost:    round2(bc * w),
        // Monthly planned revenue is derived from the direct project TCV and PID budget.
        // The budget file does not always include a monthly revenue column.
        Budgeted_Revenue: pidb > 0 ? round2((bc * w) / pidb * tcv) : 0,
        Project_Type: 'Fixed Price',
      })
    }
  }

  // --- Actuals: aggregate by Project+Band+Country+Offering+Period ---
  const JOIN_KEYS = ['Project_ID','Band','Service_Line','Location','Period']
  const actMap = {}
  // Track unique employees per project, band, and period
  const projEmployees   = {}   // pid   -> Set of employee numbers
  const bandEmployees   = {}   // band  -> Set of employee numbers
  const periodEmployees = {}   // period -> Set of employee numbers

  for (const r of actualRows) {
    const pid    = String(r['Project Number']||'').trim()
    const band   = String(r['Band']||'').trim()
    const loc    = cleanCountry(r['Country'])
    const sl     = cleanServiceLine(r['Offering'])
    const period = toYYYYMM(r['Item Expenditure Period'])
    const emp    = String(r['Employee Number']||'').trim()
    if (!pid || !period) continue

    const actualHours = parseFloat(r['Actual Hours'])||0
    const projectType = normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Fixed Price')

    // Track unique employees per project, band and period. Only count resources with actual hours.
    if (emp && actualHours > 0) {
      if (!projEmployees[pid]) projEmployees[pid] = new Set()
      projEmployees[pid].add(emp)
      if (band) {
        if (!bandEmployees[band]) bandEmployees[band] = new Set()
        bandEmployees[band].add(emp)
      }
      if (period) {
        if (!periodEmployees[period]) periodEmployees[period] = new Set()
        periodEmployees[period].add(emp)
      }
      resourceRows.push({
        Project_ID: pid,
        Band: band,
        Service_Line: sl,
        Location: loc,
        Country: loc,
        Period: period,
        Employee_Number: emp,
        Actual_Hours: actualHours,
        Project_Type: projectType,
      })
    }

    const key  = [pid, band, sl, loc, period].join('||')
    if (!actMap[key]) actMap[key] = { Project_ID:pid, Band:band, Service_Line:sl, Location:loc, Period:period, Project_Type: projectType,
                                       Actual_Hours:0, Burdened_Cost:0, Actual_Revenue:0, _emps: new Set() }
    if (emp && actualHours > 0) actMap[key]._emps.add(emp)
    const burdenedCost = parseFloat(r['Project burdened cost @ USD'] || r['Burdened Cost'] || r['Burdened_Cost'] || r['Actual Cost'] || r['Project Cost'] || 0) || 0
    const meta = projectMeta[pid] || {}
    const explicitRevenue = parseFloat(r['Actual Revenue'] || r['Revenue'] || r['Revenue Accrued'] || r['Accrued Revenue'] || 0) || 0
    const derivedRevenue = (!explicitRevenue && meta.PID_Budget > 0) ? (burdenedCost / meta.PID_Budget * (meta.TCV || 0)) : 0
    actMap[key].Actual_Hours   += actualHours
    actMap[key].Burdened_Cost  += burdenedCost
    // Item Expenditure Period drives the monthly bucket; revenue is either direct, or derived by month from cost/PID budget * TCV.
    actMap[key].Actual_Revenue += explicitRevenue || derivedRevenue
  }


  // --- Sheet 2: non-fixed-price revenue rows (multiple Project Type values preserved) ---
  for (const r of nonFixedRevenueRows) {
    const pid = String(getField(r, ['Project Number','Project_ID','Project ID','project number']) || '').trim()
    const projectType = normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type']), 'Non Fixed Price')
    const loc = cleanCountry(getField(r, ['Country','Location']))
    const sl = cleanServiceLine(getField(r, ['SL','Service Line','Service_Line','Offering']))
    const period = toYYYYMM(getField(r, ['Period','Item Expenditure Period','Month']))
    const oppId = String(getField(r, ['Opp ID','Opportunity ID','Opportunity_ID','Opp_ID']) || '').trim()
    const oppName = String(getField(r, ['Opp Name','Opportunity Name','Opp_Name']) || '').trim()
    const revenue = parseFloat(getField(r, ['Revenue','Actual Revenue','Revenue Accrued','Accrued Revenue'])) || 0
    if (!pid || !period) continue

    const existing = projectMeta[pid] || {}
    projectMeta[pid] = {
      ...existing,
      Project_Name: existing.Project_Name || oppName,
      Opp_ID: existing.Opp_ID || oppId,
      Opp_Name: existing.Opp_Name || oppName,
      Project_Type: projectType,
      Start_Date: existing.Start_Date || period,
      End_Date: existing.End_Date || period,
      Start_Date_Full: existing.Start_Date_Full || `${period}-01`,
      End_Date_Full: existing.End_Date_Full || `${period}-01`,
      Status: existing.Status || 'Active',
      Actual_Headcount: existing.Actual_Headcount || 0,
    }

    const band = String(getField(r, ['Band']) || '').trim()
    const key = [pid, band, sl, loc, period].join('||')
    if (!actMap[key]) actMap[key] = { Project_ID:pid, Band:band, Service_Line:sl, Location:loc, Period:period, Project_Type: projectType,
                                      Actual_Hours:0, Burdened_Cost:0, Actual_Revenue:0, _emps: new Set() }
    actMap[key].Actual_Revenue += revenue
  }

  // Convert employee sets to counts
  for (const [pid, empSet] of Object.entries(projEmployees)) {
    if (projectMeta[pid]) projectMeta[pid].Actual_Headcount = empSet.size
  }

  // Convert employee sets to headcount counts in actuals
  const actuals = Object.values(actMap).map(r => {
    const hc = r._emps ? r._emps.size : 0
    const { _emps, ...rest } = r
    return { ...rest, Actual_Headcount: hc }
  })
  const bandHeadcount = Object.fromEntries(
    Object.entries(bandEmployees).map(([b, s]) => [b, s.size])
  )
  const periodEmpSets = periodEmployees

  console.log(`Parsed: ${budgetRows.length} budget rows → ${budgetDist.length} distributed, ${actualRows.length} actual rows → ${actuals.length} aggregated`)
  return { budget: budgetDist, actuals, resourceRows, projectMeta, bandHeadcount, periodEmpSets }
}

// ── Merge budget + actuals ────────────────────────────────────────────────────
// ── Standard KPI formulas (applied consistently everywhere) ─────────────────
// 1. TCV               = contract value
// 2. Planned Budget    = total budgeted cost (PID Budget)
// 3. Planned PM%       = (TCV - Planned Budget) / TCV × 100
// 4. Cost to Date      = Total Burdened Cost @ USD
// 5. Revenue to Date   = Cost to Date / Planned Budget × TCV
// 6. Current PM%       = (Rev to Date - Cost to Date) / Rev to Date × 100
// 7. Revenue Remaining = TCV - Revenue to Date
// 8. Cost Remaining    = Planned Budget - Cost to Date
// 9. Projected PM%     = (Rev Remaining - Cost Remaining) / Rev Remaining × 100
function calcKpis(tcv, plannedBudget, costToDate) {
  const rev  = plannedBudget > 0 ? costToDate / plannedBudget * tcv : 0
  const revR = Math.max(0, tcv - rev)
  const costR = Math.max(0, plannedBudget - costToDate)
  return {
    TCV:               round2(tcv),
    Planned_Budget:    round2(plannedBudget),
    Planned_PM_Pct:    tcv > 0 ? round2((tcv - plannedBudget) / tcv * 100) : null,
    Cost_to_Date:      round2(costToDate),
    Revenue_to_Date:   round2(rev),
    Current_PM_Pct:    rev  > 0 ? round2((rev - costToDate) / rev * 100) : null,
    Revenue_Remaining: round2(revR),
    Cost_Remaining:    round2(costR),
    Projected_PM_Pct:  revR > 0 ? round2((revR - costR) / revR * 100) : null,
    // Legacy aliases kept for chart compatibility
    Cost_Variance:     round2(plannedBudget - costToDate),
    Cost_Variance_Pct: plannedBudget > 0 ? round2((plannedBudget - costToDate) / plannedBudget * 100) : null,
    Budget_Margin_Pct: tcv > 0 ? round2((tcv - plannedBudget) / tcv * 100) : null,
    Actual_Margin_Pct: rev  > 0 ? round2((rev - costToDate) / rev * 100) : null,  // alias = Current_PM_Pct
  }
}

// ── EAC Engine: Hybrid Rolling Trend (3-month rolling avg burn rate) ─────────
// EAC = Cost to Date + (3-month rolling avg burn rate × Remaining Months)
// EAC PM% = (TCV − EAC) / TCV × 100
// CPI = Revenue to Date / Cost to Date
// VAC = TCV − EAC

function calcEAC(tcv, plannedBudget, costToDate, monthlyActuals, endDatePeriod) {
  const base = calcKpis(tcv, plannedBudget, costToDate)

  // Only count periods that actually have costs (actual spend periods)
  const activePeriods = monthlyActuals.filter(m => (m.cost||0) > 0)

  // Current month cost = latest period's actual cost (used for ETC)
  const currentMonthCost = activePeriods.length > 0
    ? activePeriods[activePeriods.length - 1].cost
    : 0

  // 3-month rolling average burn rate
  const recent3  = activePeriods.slice(-3)
  const burnRate = recent3.length > 0
    ? round2(recent3.reduce((s,m) => s + (m.cost||0), 0) / recent3.length)
    : 0

  // Remaining months = project end date vs TODAY's date
  const today = new Date()
  const todayYr = today.getFullYear()
  const todayMo = today.getMonth() + 1
  let remainingMonths = 0
  if (endDatePeriod) {
    const parts = endDatePeriod.split('-').map(Number)
    const endYr = parts[0], endMo = parts[1] || 12
    remainingMonths = Math.max(0, (endYr - todayYr) * 12 + (endMo - todayMo))
  }

  // ETC = current month cost × remaining months (issue 3)
  const etc  = round2(currentMonthCost * remainingMonths)
  const eac  = round2(costToDate + etc)
  const vac  = round2(tcv - eac)
  const eacPM = tcv > 0 ? round2(vac / tcv * 100) : null

  const cpi = costToDate > 0 ? round2(base.Revenue_to_Date / costToDate) : null
  const tcpiVal = base.Revenue_Remaining > 0
    ? round2((tcv - base.Revenue_to_Date) / base.Revenue_Remaining) : null

  // RAG: GREEN ≥35%, AMBER 30-35%, RED <30%
  const pmRef = eacPM ?? base.Planned_PM_Pct
  const rag = pmRef == null ? 'GREEN' : pmRef < 30 ? 'RED' : pmRef < 35 ? 'AMBER' : 'GREEN'

  return {
    ...base,
    // Current PM% = (Revenue Earned - Cost to Date) / Revenue Earned
    Current_PM_Pct:     base.Current_PM_Pct,
    Actual_Margin_Pct:  base.Actual_Margin_Pct,
    Burn_Rate:          burnRate,
    Current_Month_Cost: round2(currentMonthCost),
    ETC:                etc,
    Remaining_Months:   remainingMonths,
    EAC:                eac,
    VAC:                vac,
    EAC_PM_Pct:         eacPM,
    CPI:                cpi,
    TCPI:               tcpiVal,
    RAG:                rag,
  }
}


// ── Canonical project status + health helpers ───────────────────────────────
function normalizePercent(v) {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace('%',''))
  return Number.isFinite(n) ? n : 0
}

function periodToEndDate(period) {
  if (!period) return null
  const full = String(period).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (full) {
    const d = new Date(parseInt(full[1],10), parseInt(full[2],10)-1, parseInt(full[3],10), 23, 59, 59, 999)
    return isNaN(d) ? null : d
  }
  const m = String(period).match(/^(\d{4})-(\d{1,2})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null
  return new Date(y, mo, 0, 23, 59, 59, 999)
}

function getProjectStatus(metaOrRow) {
  const pct = normalizePercent(metaOrRow?.Pct_Complete)
  if (pct >= 100) return 'Closed'
  // Try full date first, then YYYY-MM period
  const rawEnd = metaOrRow?.End_Date_Full || metaOrRow?.End_Date
  let end = null
  if (rawEnd) {
    // YYYY-MM-DD full date
    if (/^\d{4}-\d{2}-\d{2}/.test(String(rawEnd))) {
      end = new Date(rawEnd)
    } else if (/^\d{4}-\d{2}$/.test(String(rawEnd))) {
      // YYYY-MM period: treat last day of that month as end
      const [y,m] = String(rawEnd).split('-').map(Number)
      end = new Date(y, m, 0) // day 0 of next month = last day of this month
    }
  }
  const today = new Date()
  today.setHours(0,0,0,0)
  if (end && !isNaN(end) && end < today && pct < 100) return 'Past Due'
  return 'Active'
}

function normalizeProjectStatusFilter(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!s) return null
  if (s === 'closed' || s === 'complete' || s === 'completed') return 'Closed'
  if (s === 'past_due' || s === 'pastdue' || s === 'overdue') return 'Past Due'
  if (s === 'active' || s === 'open') return 'Active'
  return null
}

function getHealthThresholds(q = {}) {
  const off = Number.isFinite(parseFloat(q.health_off_track_lt)) ? parseFloat(q.health_off_track_lt) : 25
  const risk = Number.isFinite(parseFloat(q.health_at_risk_lt)) ? parseFloat(q.health_at_risk_lt) : 35
  return { off, risk: Math.max(risk, off) }
}

function healthFromCurrentPM(pm, status = 'Active', thresholds = {}) {
  if (pm == null || !Number.isFinite(Number(pm))) return 'GREEN'
  const v = Number(pm)
  const off = Number.isFinite(Number(thresholds.off)) ? Number(thresholds.off) : 25
  const risk = Number.isFinite(Number(thresholds.risk)) ? Number(thresholds.risk) : 35
  if (v < off) return 'RED'
  // At Risk is only applicable to active projects. Closed and Past Due projects
  // should not be classified Amber by the PM% band alone.
  if (status === 'Active' && v >= off && v < risk) return 'AMBER'
  return 'GREEN'
}



// Consolidated Service Line Group mapping used by dashboard filters and SL views.
function normalizeText(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}
function serviceLineGroup(serviceLine) {
  const s = normalizeText(serviceLine)
  if (!s) return null
  if (s.includes('eas sap') || /\bsap\b/.test(s) || s.includes('bids')) return 'SAP'
  if (s.includes('eas oracle') || s.includes('oracle')) return 'Oracle'
  if (/\badm\b/.test(s) || /\baps\b/.test(s) || /\bqa\b/.test(s) || s.includes('quality')) return 'ADM'
  if (s.includes('platform') || s.includes('cloud') || /\beuc\b/.test(s) || /\bdba\b/.test(s) || /\bims\b/.test(s)) return 'ITMS'
  return null
}
const SERVICE_LINE_GROUPS = ['SAP','Oracle','ADM','ITMS']

function addKpis(row, tcv=0, pidBudget=0) {
  const bc = row.Budgeted_Cost  || 0
  const ac = row.Burdened_Cost  || 0
  const kpis = calcKpis(tcv, pidBudget || bc, ac)
  Object.assign(row, kpis)
  row.TCV_PM_Pct = kpis.Projected_PM_Pct  // backward compat alias
  row.Margin_Variance = null
  return row
}

function groupAgg(rows, keys, nums) {
  const map = {}
  for (const r of rows) {
    const k = keys.map(key=>r[key]??'').join('||')
    if (!map[k]) { map[k]={_k:{}}; keys.forEach(key=>map[k]._k[key]=r[key]??'') }
    for (const n of nums) map[k][n] = (map[k][n]||0) + (parseFloat(r[n])||0)
  }
  return Object.values(map).map(g => ({ ...g._k, ...Object.fromEntries(nums.map(n=>[n,round2(g[n]||0)])) }))
}

function buildMerged() {
  // Main/fixed dashboard is based on Sheet 1 only. If an older cache contains
  // Sheet 2/non-fixed rows, exclude them here so existing tabs still load fast.
  const fixedBudget = (store.budget || []).filter(r => isFixedPriceType(r.Project_Type || store.projectMeta?.[r.Project_ID]?.Project_Type || 'Fixed Price'))
  const fixedActuals = (store.actuals || []).filter(r => isFixedPriceType(r.Project_Type || store.projectMeta?.[r.Project_ID]?.Project_Type || 'Fixed Price'))
  const NUMS = ['Budgeted_Hours','Budgeted_Cost','Budgeted_Revenue','Actual_Hours','Burdened_Cost','Actual_Revenue']
  const JOIN  = ['Period','Project_ID','Band','Service_Line','Location','Project_Type']

  // Aggregate budget by join keys
  const bAgg = groupAgg(fixedBudget, JOIN, ['Budgeted_Hours','Budgeted_Cost','Budgeted_Revenue'])
  const aAgg = groupAgg(fixedActuals, JOIN, ['Actual_Hours','Burdened_Cost','Actual_Revenue'])

  const aMap = {}
  for (const a of aAgg) aMap[JOIN.map(k=>a[k]).join('||')] = a

  const seen   = new Set()
  const merged = []

  // Budget rows + matched actuals
  for (const b of bAgg) {
    const key = JOIN.map(k=>b[k]).join('||')
    const a   = aMap[key] || {}
    seen.add(key)
    merged.push(addKpis({
      ...b,
      Actual_Hours:   round2(a.Actual_Hours  ||0),
      Burdened_Cost:  round2(a.Burdened_Cost ||0),
      Actual_Revenue: round2(a.Actual_Revenue||0),
    }))
  }

  // Actuals with no matching budget
  for (const a of aAgg) {
    const key = JOIN.map(k=>a[k]).join('||')
    if (!seen.has(key)) {
      merged.push(addKpis({
        Period:a.Period, Project_ID:a.Project_ID, Band:a.Band,
        Service_Line:a.Service_Line, Location:a.Location, Project_Type:a.Project_Type || store.projectMeta[a.Project_ID]?.Project_Type || '',
        Budgeted_Hours:0, Budgeted_Cost:0, Budgeted_Revenue:0,
        Actual_Hours:round2(a.Actual_Hours||0),
        Burdened_Cost:round2(a.Burdened_Cost||0),
        Actual_Revenue:round2(a.Actual_Revenue||0),
      }))
    }
  }

  store.merged = merged

  // Pre-compute Pct_Complete and RAG per project (for fast filter lookups)
  const projAC = {}
  for (const r of merged) {
    projAC[r.Project_ID] = (projAC[r.Project_ID]||0) + (r.Burdened_Cost||0)
  }
  for (const [pid, ac] of Object.entries(projAC)) {
    if (!store.projectMeta[pid]) continue
    const meta = store.projectMeta[pid]
    const pidb = meta.PID_Budget || 0
    meta.Pct_Complete = pidb > 0 ? round2(Math.min(100, ac / pidb * 100)) : 0

    const tcv  = meta.TCV || 0
    const pidbV = meta.PID_Budget || 0
    const pctRatio = Math.min(1, meta.Pct_Complete / 100)
    const revToDate = round2(tcv * pctRatio)
    const currPM = revToDate > 0 ? round2((revToDate - ac) / revToDate * 100) : null
    meta.Current_PM_Pct = currPM
    meta.Project_Status = getProjectStatus(meta)
    meta.RAG = healthFromCurrentPM(currPM, meta.Project_Status)
  }

  console.log(`✓ Merged: ${merged.length} rows (${[...new Set(merged.map(r=>r.Project_ID))].length} projects, ${[...new Set(merged.map(r=>r.Period))].length} periods)`)
  if (merged.length < 10) {
    console.log('Sample row:', JSON.stringify(merged[0]))
  }
}

// ── File load ────────────────────────────────────────────────────────────────
let parseState = { loading: false, progress: 'Ready', pct: 0, stage: 'ready', startedAt: null, elapsedMs: 0, etaMs: 0, recordsLoaded: 0, sheet1: {status:'Ready'}, sheet2: {status:'Ready'} }

function processFile(buffer, onDone, options = {}) {
  if (buffer && buffer.length) {
    // Fixed dashboard workbook is independent from All Projects.
    store._fixedWorkbookBuffer = Buffer.from(buffer)
    store._fixedWorkbookName = options.fileName || store._fixedWorkbookName || 'Fixed Projects workbook'
  }
  parseState = { loading: true, progress: 'Starting worker…', pct: 3, stage: 'starting', startedAt: Date.now(), elapsedMs: 0, etaMs: 60000, recordsLoaded: 0, sheet1: {status:'Pending'}, sheet2: {status:'Pending'} }

  // CSV cache path — same filename with .csv extension
  const csvCachePath = options.csvCachePath || path0.join(__dirname, '..', 'data', 'Fixed_Projects_cache')

  const worker = new Worker(path0.join(__dirname, 'parseWorker.js'), {
    workerData: { buffer, csvCachePath, forceRefresh: !!options.forceRefresh }
  })

  worker.on('message', msg => {
    if (msg.type === 'progress') {
      parseState = { ...parseState, ...msg, loading: true, progress: msg.msg || parseState.progress, pct: msg.pct ?? parseState.pct, elapsedMs: msg.elapsedMs ?? (parseState.startedAt ? Date.now() - parseState.startedAt : 0), etaMs: msg.etaMs ?? parseState.etaMs }
      delete parseState.type
      console.log('[worker]', msg.msg)
    } else if (msg.type === 'done') {
      try {
        store.budget          = msg.budget || []
        store.actuals         = msg.actuals || []
        store.resourceRows    = msg.resourceRows || []
        store.projectMeta     = msg.projectMeta || {}
        store.bandHeadcount   = msg.bandHeadcount   || {}
        store._periodEmpSets  = msg.periodEmpSizes  || {}
        store._allProjectTypesCache = null
  store._allProjectsViewCache = null
        buildMerged()
        parseState = { ...parseState, loading: false, progress: 'Done', pct: 100, stage: 'done', elapsedMs: parseState.startedAt ? Date.now() - parseState.startedAt : parseState.elapsedMs, etaMs: 0, sheet1: {...(parseState.sheet1||{}), status:'Done'}, sheet2: {...(parseState.sheet2||{}), status:(parseState.sheet2&&parseState.sheet2.status)||'Available separately'} }
        const st = msg.stats || {}
        console.log(`✓ Parsed: ${st.budgetRows || 0} budget → ${st.budgetDist || 0} rows, ${st.actualRows || 0} actuals → ${st.actualsAgg || 0} aggregated`)
        if (onDone) onDone()
      } catch (e) {
        console.error('Post-parse build error:', e)
        parseState = { ...parseState, loading: false, progress: `Error building dashboard data: ${e.message}`, stage:'error', etaMs:0 }
      }
    }
  })

  worker.on('error', err => {
    console.error('Worker error:', err)
    parseState = { ...parseState, loading: false, progress: `Error: ${err.message}`, stage:'error', etaMs:0 }
  })

  worker.on('exit', code => {
    if (code !== 0 && parseState.loading) {
      parseState = { ...parseState, loading: false, progress: `Worker stopped before completing. Exit code: ${code}`, stage:'error', etaMs:0 }
    }
  })
}

function processFileSync(buffer) {
  // Fallback: parse in main thread (used during startup)
  const result = parseCombinedFile(buffer)
  store.budget          = result.budget
  store.actuals         = result.actuals
  store.resourceRows    = result.resourceRows || []
  store.projectMeta     = result.projectMeta
  store.bandHeadcount   = result.bandHeadcount   || {}
  store._periodEmpSets  = result.periodEmpSets   || {}
  store._allProjectTypesCache = null
  store._allProjectsViewCache = null
  buildMerged()
}

function dataDirPath() {
  const d = path.join(__dirname, '..', 'data')
  try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }) } catch(e) {}
  return d
}

function findWorkbook(kind='fixed') {
  const dataDir = dataDirPath()
  const fixedCandidates = [
    'Fixed_Projects.xlsx', 'Fixed_Projects.xls',
    'Fixed Projects.xlsx', 'Fixed Projects.xls',
    'FixedProjects.xlsx', 'FixedProjects.xls',
    // Backward compatible fallback for existing installs
    'Budget_Cost.xlsx', 'Budget_cost.xlsx', 'budget_cost.xlsx',
    'Budget_Cost.xls',  'Budget_cost.xls',  'budget_cost.xls'
  ]
  const allCandidates = [
    'All_Projects.xlsx', 'All_Projects.xls',
    'All Projects.xlsx', 'All Projects.xls',
    'AllProjects.xlsx', 'AllProjects.xls',
    'All_Project_Types.xlsx', 'All_Project_Types.xls',
    'All Project Types.xlsx', 'All Project Types.xls'
  ]
  const candidates = kind === 'all' ? allCandidates : fixedCandidates
  for (const name of candidates) {
    const p = path.join(dataDir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function findDefaultWorkbook() { return findWorkbook('fixed') }

function resolveFixedCachePath(dataDir) {
  // Keep this intentionally broad. Existing installs may have an extensionless
  // cache (Fixed_Projects_cache), a .csv cache, a space-based name, or the
  // older Budget_Cost cache. If any usable file exists, startup must use it and
  // skip the slow Excel workbook open step.
  const preferred = [
    'Fixed_Projects_cache',
    'Fixed_Projects_cache.csv',
    'Fixed Projects_cache',
    'Fixed Projects_cache.csv',
    'FixedProjects_cache',
    'FixedProjects_cache.csv',
    'Budget_Cost_cache.csv',
    'Budget_cost_cache.csv',
    'budget_cost_cache.csv'
  ].map(name => path.join(dataDir, name))

  for (const p of preferred) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) return p
    } catch(e) {}
  }

  // Last-resort discovery: any fixed-project cache-like file in /data.
  try {
    const files = fs.readdirSync(dataDir)
    const match = files.find(f => /^fixed[ _-]?projects?[ _-]?cache(\.csv)?$/i.test(f))
    if (match) {
      const p = path.join(dataDir, match)
      if (fs.statSync(p).isFile() && fs.statSync(p).size > 0) return p
    }
  } catch(e) {}
  return null
}

function loadDefault() {
  const combined = findWorkbook('fixed')
  const dataDir = dataDirPath()

  // Startup optimization: cache first, workbook second. This prevents the app
  // from sticking at the 15% Excel-open step when a cache already exists.
  const fixedCacheWritePath = path.join(dataDir, 'Fixed_Projects_cache')
  const csvCache = resolveFixedCachePath(dataDir)

  if (csvCache) {
    console.log(`✓ Fixed dashboard cache found: ${csvCache}. Skipping Excel parse.`)
    parseState = {
      loading: true,
      progress: 'Loading Fixed dashboard from cache…',
      pct: 8,
      stage: 'cache-hit',
      startedAt: Date.now(),
      elapsedMs: 0,
      etaMs: 1500,
      recordsLoaded: 0,
      sheet1: { status: 'Loading from cache', cache: path.basename(csvCache) },
      sheet2: { status: 'Separate All Projects cache/workbook' }
    }
    processFile(Buffer.alloc(0), null, { forceRefresh: false, fileName: path.basename(csvCache), csvCachePath: csvCache })
  } else if (combined) {
    console.log(`No Fixed cache found. Parsing ${combined} (${(fs.statSync(combined).size/1024/1024).toFixed(1)} MB)…`)
    processFile(fs.readFileSync(combined), null, { forceRefresh: true, fileName: path.basename(combined), csvCachePath: fixedCacheWritePath })
  } else {
    parseState = { ...parseState, loading: false, progress: 'No Fixed Projects cache or workbook found. Upload Fixed Projects.xlsx/xls.', pct:100, stage:'no-data', etaMs:0 }
    console.log('ℹ No Fixed Projects cache/workbook found. Upload via UI.')
  }
  loadManual()
}

// ── Filters ───────────────────────────────────────────────────────────────────
// Parse a comma-separated string into an array: "A,B,C" -> ['A','B','C']
// Also handles Express array params (already an array)
function toArr(val) {
  if (!val) return null
  if (Array.isArray(val)) return val.map(s=>String(s).trim()).filter(Boolean)
  const parts = String(val).split(',').map(s=>s.trim()).filter(Boolean)
  return parts.length ? parts : null
}

function applyFilters(rows, q) {
  let r = rows

  // Multi-value: project, project_group, opp_name
  const projects = toArr(q.project)
  const groups   = toArr(q.project_group)
  const opps     = toArr(q.opp_name)
  const oppIds   = toArr(q.opp_id)

  if (projects) r = r.filter(x => projects.includes(x.Project_ID))
  if (groups)   r = r.filter(x => groups.includes(store.projectMeta[x.Project_ID]?.Project_Group || ''))
  if (opps)     r = r.filter(x => opps.includes(store.projectMeta[x.Project_ID]?.Opp_Name || ''))
  if (oppIds)   r = r.filter(x => oppIds.includes(store.projectMeta[x.Project_ID]?.Opp_ID || ''))

  // Multi-value filters (FilterBar sends arrays)
  const bands    = toArr(q.band)
  const sls      = toArr(q.service_line)
  const slGroups = toArr(q.sl_group)
  const locs     = toArr(q.location)
  if (bands) r = r.filter(x => bands.includes(x.Band))
  if (sls)   r = r.filter(x => sls.includes(x.Service_Line))
  if (slGroups) r = r.filter(x => slGroups.includes(serviceLineGroup(x.Service_Line)))
  if (locs)  r = r.filter(x => locs.includes(x.Location))

  // Dashboard-wide Year / Quarter button filters
  const years = toArr(q.years)
  const qnums = toArr(q.quarters)
  if (years) r = r.filter(x => years.includes(String(periodYear(x.Period))))
  if (qnums) r = r.filter(x => qnums.includes(String(periodQuarterNum(x.Period))))

  // Period range
  if (q.period_from)  r = r.filter(x => x.Period >= q.period_from)
  if (q.period_to)    r = r.filter(x => x.Period <= q.period_to)
  if (q.quarter_from) r = r.filter(x => { const qp=toQuarter(x.Period); return qp&&qp>=q.quarter_from })
  if (q.quarter_to)   r = r.filter(x => { const qp=toQuarter(x.Period); return qp&&qp<=q.quarter_to })

  // RAG health filter uses editable PM% thresholds from the query string.
  // Evaluate at project level from the currently filtered rows so SL Group/Year/Quarter
  // filters do not inherit stale or full-project PM values.
  if (q.rag) {
    const wanted = toArr(q.rag) || []
    const thresholds = getHealthThresholds(q)
    const byPid = buildRowsByProject(r)
    const projectHealth = {}
    for (const [pid, rowsForPid] of Object.entries(byPid)) {
      const meta = store.projectMeta[pid] || {}
      const cost = rowsForPid.reduce((s, row) => s + (row.Burdened_Cost || 0), 0)
      const pk = calcKpis(meta.TCV || 0, meta.PID_Budget || 0, cost)
      const pct = meta.PID_Budget > 0 ? round2(Math.min(1, cost / meta.PID_Budget) * 100) : 0
      const status = getProjectStatus({ ...meta, Pct_Complete: pct })
      projectHealth[pid] = healthFromCurrentPM(pk.Current_PM_Pct, status, thresholds)
    }
    r = r.filter(x => wanted.includes(projectHealth[x.Project_ID]))
  }

  // Project Status filter: Active, Past Due, Closed — one canonical rule
  if (q.project_status) {
    const wanted = normalizeProjectStatusFilter(q.project_status)
    if (wanted) {
      r = r.filter(x => getProjectStatus(store.projectMeta[x.Project_ID] || {}) === wanted)
    }
  }

  // Closed project year filter: year is based on the direct Project End Date.
  // This intentionally limits the dataset to projects that are closed in the selected end year(s).
  const closedYears = toArr(q.closed_year || q.end_year)
  if (closedYears) {
    const wantedYears = new Set(closedYears.map(String))
    r = r.filter(x => {
      const meta = store.projectMeta[x.Project_ID] || {}
      if (getProjectStatus(meta) !== 'Closed') return false
      const rawEnd = meta.End_Date_Full || meta.End_Date || ''
      const year = String(rawEnd).slice(0,4)
      return wantedYears.has(year)
    })
  }

  r = applyProjectTypeFilter(r, q)

  return r
}

function sumAll(rows) {
  return rows.reduce((s,r)=>{
    s.Budgeted_Cost    +=(r.Budgeted_Cost    ||0)
    s.Burdened_Cost    +=(r.Burdened_Cost    ||0)
    s.Budgeted_Revenue +=(r.Budgeted_Revenue ||0)
    s.Actual_Revenue   +=(r.Actual_Revenue   ||0)
    s.Budgeted_Hours   +=(r.Budgeted_Hours   ||0)
    s.Actual_Hours     +=(r.Actual_Hours     ||0)
    return s
  },{Budgeted_Cost:0,Burdened_Cost:0,Budgeted_Revenue:0,Actual_Revenue:0,Budgeted_Hours:0,Actual_Hours:0})
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Upload combined file
app.post('/api/upload', upload.single('combined_file'), (req, res) => {
  try {
    const file = req.file ||
      (req.files && (req.files['budget_file']?.[0] || req.files['combined_file']?.[0]))
    if (!file) return res.status(400).json({ detail: 'No file received. Upload a Fixed Projects or All Projects Excel file.' })

    const original = file.originalname || ''
    const lower = original.toLowerCase()
    const isAllProjects = /all[ _-]*projects?|all[ _-]*project[ _-]*types?/.test(lower)
    const dataDir = dataDirPath()

    if (isAllProjects) {
      const ext = lower.endsWith('.xls') && !lower.endsWith('.xlsx') ? '.xls' : '.xlsx'
      const savePath = path.join(dataDir, `All_Projects${ext}`)
      fs.writeFileSync(savePath, file.buffer)
      store._allProjectsWorkbookBuffer = Buffer.from(file.buffer)
      store._allProjectsWorkbookName = original || `All_Projects${ext}`
      store._allProjectTypesCache = null
      store._allProjectsViewCache = null
      try { for (const c of ['All_Projects_cache.csv','All_Projects_pnl_v2_cache.csv']) { const cp = path.join(dataDir, c); if (fs.existsSync(cp)) fs.unlinkSync(cp) } } catch(e) {}
      const rows = getAllProjectsRowsDirect(true)
      return res.json({ status:'ready', dashboard:'allProjects', detail:`All Projects uploaded and parsed: ${rows.length.toLocaleString()} rows.` })
    }

    const ext = lower.endsWith('.xls') && !lower.endsWith('.xlsx') ? '.xls' : '.xlsx'
    const savePath = path.join(dataDir, `Fixed_Projects${ext}`)
    fs.writeFileSync(savePath, file.buffer)
    console.log(`Fixed Projects upload received: ${original} (${file.size} bytes)`)
    try { for (const c of ['Fixed_Projects_cache','Fixed_Projects_cache.csv','Budget_Cost_cache.csv']) { const cp = path.join(dataDir, c); if (fs.existsSync(cp)) fs.unlinkSync(cp) } } catch(e) {}
    processFile(file.buffer, null, { forceRefresh: true, fileName: original || `Fixed_Projects${ext}`, csvCachePath: path.join(dataDir, 'Fixed_Projects_cache') })
    res.json({ status: 'processing', dashboard:'fixed', detail: 'Fixed Projects upload received. Parsing started with a refreshed fixed cache.' })
  } catch(e) {
    console.error('Upload error:', e.message)
    res.status(400).json({ detail: e.message })
  }
})

// Legacy multi-file upload (budget_file + actuals_file)
app.post('/api/upload-legacy', upload.fields([
  {name:'budget_file',maxCount:1},{name:'actuals_file',maxCount:1}
]), (req, res) => {
  res.status(400).json({ detail: 'Please use the new single-file upload. Upload your Budget_Cost.xlsx file which contains both budget and actuals.' })
})


app.get('/api/parse-status', (req,res) => {
  // Keep elapsed / ETA moving even while XLSX.read is blocking inside the worker.
  // The worker cannot emit messages during the synchronous workbook-open step, so
  // the UI used to look frozen at 15% with 0s elapsed / 0s remaining.
  const live = { ...parseState }
  if (live.loading && live.startedAt) {
    const elapsedMs = Math.max(0, Date.now() - live.startedAt)
    const pct = Number(live.pct) || 0
    const fileSizeMb = Number(live.fileSizeMb) || 0
    const roughMs = fileSizeMb > 0
      ? Math.min(15 * 60 * 1000, Math.max(45 * 1000, fileSizeMb * 1800))
      : 60 * 1000
    let etaMs = 0
    if (pct > 2 && pct < 100) {
      etaMs = Math.max(1000, Math.round((elapsedMs / pct) * (100 - pct)))
    } else {
      etaMs = Math.max(1000, roughMs - elapsedMs)
    }
    live.elapsedMs = elapsedMs
    live.etaMs = etaMs
    // Make the 15% stage visibly active while the worker is opening/parsing Excel.
    if (pct <= 15 && live.stage === 'open-workbook') {
      live.progress = live.progress || 'Opening workbook…'
      live.sheet1 = {
        ...(live.sheet1 || {}),
        status: 'Opening workbook',
        elapsed: `${Math.round(elapsedMs / 1000)}s`,
      }
    }
  }
  res.json(live)
})


app.get('/api/status', (req,res) => res.json({
  budget_loaded:  store.budget.length > 0,
  actuals_loaded: store.actuals.length > 0,
  merged_rows:    store.merged?.length || 0,
  projects:       store.merged ? [...new Set(store.merged.map(r=>r.Project_ID))] : [],
}))

// ── Project cost audit endpoint ─────────────────────────────────────────────
// GET /api/audit?project=91718775  → shows raw aggregated rows for a project
app.get('/api/audit', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const pid = req.query.project
  if (!pid) return res.status(400).json({detail:'Pass ?project=<id>'})

  const projRows = store.merged.filter(r => r.Project_ID === pid)
  const actRows  = store.actuals?.filter(r => r.Project_ID === pid) || []

  // Aggregate actuals by period
  const byPeriod = {}
  for (const r of actRows) {
    if (!byPeriod[r.Period]) byPeriod[r.Period] = { hours: 0, cost: 0, rows: 0 }
    byPeriod[r.Period].hours += r.Actual_Hours    || 0
    byPeriod[r.Period].cost  += r.Burdened_Cost   || 0
    byPeriod[r.Period].rows  += 1
  }

  const totalActualCost  = actRows.reduce((s,r) => s + (r.Burdened_Cost||0), 0)
  const totalActualHours = actRows.reduce((s,r) => s + (r.Actual_Hours ||0), 0)
  const meta = store.projectMeta[pid] || {}

  res.json({
    project_id:         pid,
    project_name:       meta.Project_Name,
    tcv:                meta.TCV,
    pid_budget:         meta.PID_Budget,
    total_actual_cost:  Math.round(totalActualCost * 100) / 100,
    total_actual_hours: Math.round(totalActualHours * 100) / 100,
    actuals_agg_rows:   actRows.length,
    merged_rows:        projRows.length,
    by_period: Object.entries(byPeriod)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([period, v]) => ({
        period,
        actual_hours: Math.round(v.hours * 100) / 100,
        actual_cost:  Math.round(v.cost  * 100) / 100,
        agg_rows:     v.rows,
      }))
  })
})

app.get('/api/diagnose', (req,res) => {
  const m = store.merged || []
  res.json({
    budget_rows:    store.budget.length,
    actuals_rows:   store.actuals.length,
    merged_rows:    m.length,
    projects:       [...new Set(m.map(r=>r.Project_ID))].sort(),
    periods:        [...new Set(m.map(r=>r.Period))].sort(),
    budget_sample:  store.budget[0],
    actuals_sample: store.actuals[0],
    merged_sample:  m[0],
    project_meta:   store.projectMeta,
  })
})

app.get('/api/filters', (req,res) => {
  const m = store.merged || []
  const fromData = key => [...new Set(m.map(r=>r[key]).filter(v=>v!=null&&v!==''))].sort()
  const periods   = fromData('Period')
  const quarters  = [...new Set(periods.map(p=>toQuarter(p)).filter(Boolean))].sort()
  const projects  = [...new Set(m.map(r=>r.Project_ID).filter(Boolean))].sort()

  // Enrich project list with names from meta
  const projectList = projects.map(pid => ({
    id:    pid,
    name:  store.projectMeta[pid]?.Project_Name  || '',
    group: store.projectMeta[pid]?.Project_Group || '',
    label: `${pid} — ${store.projectMeta[pid]?.Project_Name || ''}`.trim()
  }))

  // Unique project groups and opp names from meta
  const projectGroups = [...new Set(
    Object.values(store.projectMeta).map(m => m.Project_Group).filter(Boolean)
  )].sort()
  const oppNames = [...new Set(
    Object.values(store.projectMeta).map(m => m.Opp_Name).filter(Boolean)
  )].sort()
  const oppIds = [...new Set(
    Object.values(store.projectMeta).map(m => m.Opp_ID).filter(Boolean)
  )].sort()
  const years = [...new Set(periods.map(p => String(p).slice(0,4)).filter(Boolean))].sort()
  const closedYears = [...new Set(Object.values(store.projectMeta)
    .filter(m => getProjectStatus(m) === 'Closed')
    .map(m => String(m.End_Date_Full || m.End_Date || '').slice(0,4))
    .filter(y => /^\d{4}$/.test(y))
  )].sort()

  res.json({
    projects:       projectList,
    project_ids:    projects,
    project_groups: projectGroups,
    opp_names:      oppNames,
    opp_ids:        oppIds,
    years,
    closed_years: closedYears,
    project_statuses:['Active','Past Due','Closed'],
    bands:          fromData('Band'),
    service_lines:  fromData('Service_Line'),
    sl_groups:      SERVICE_LINE_GROUPS,
    locations:      fromData('Location'),
    project_types: [...new Set([...m.map(r=>r.Project_Type), ...Object.values(store.projectMeta).map(mm=>mm.Project_Type)].filter(Boolean))].sort(),
    periods,
    quarters,
  })
})

app.get('/api/summary', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const rows = applyFilters(store.merged, req.query)
  const s    = sumAll(rows)
  // Planned Budget = sum of full PID Budgets for filtered projects
  // NOT period-filtered Budgeted_Cost (which is only a slice of the distributed budget)
  const filteredPidSet = new Set(rows.map(r => r.Project_ID))
  const pidBudgetTotal = [...filteredPidSet].reduce((sum, pid) => {
    const meta = store.projectMeta[pid] || {}
    return sum + (meta.PID_Budget || 0)
  }, 0)
  const bc = pidBudgetTotal || s.Budgeted_Cost  // fallback to distributed if no PID Budget
  const ac=s.Burdened_Cost, br=s.Budgeted_Revenue, ar=s.Actual_Revenue

  // ── Header KPIs: always use FULL lifetime costs (period filter ignored for header) ──
  // Scan ALL periods for filtered projects regardless of period filter
  let totalTCV   = 0
  let lifetimeAC = 0   // full lifetime actual cost (all periods)
  for (const pid of filteredPidSet) {
    const meta = store.projectMeta[pid] || {}
    totalTCV   += meta.TCV || 0
    // Sum actuals for this project across ALL periods (not just filtered periods)
    const allProjRows = (store.merged || []).filter(r => r.Project_ID === pid)
    lifetimeAC += allProjRows.reduce((s, r) => s + (r.Burdened_Cost || 0), 0)
  }
  totalTCV   = round2(totalTCV)
  lifetimeAC = round2(lifetimeAC)

  // Header KPIs: Revenue to Date = lifetimeAC / PID_Budget * TCV (standard formula)
  const sk = calcKpis(totalTCV, bc, lifetimeAC)

  // ── Period-scoped KPIs (amber bar, only when period filter active) ───────────
  // Uses the SAME calcKpis formula but with period-filtered actual cost
  const periodFrom = req.query.period_from || (req.query.quarter_from
    ? (() => { const [y,q]=req.query.quarter_from.split('-Q'); return `${y}-${String((parseInt(q)-1)*3+1).padStart(2,'0')}` })()
    : null)
  const periodTo = req.query.period_to || (req.query.quarter_to
    ? (() => { const [y,q]=req.query.quarter_to.split('-Q'); return `${y}-${String(parseInt(q)*3).padStart(2,'0')}` })()
    : null)

  let periodRevAccrued = null, periodCost = null, periodPlanCost = null
  if (periodFrom || periodTo) {
    // Period-filtered cost = actuals ONLY within the selected window
    const periodAC = round2(s.Burdened_Cost)  // rows already period-filtered via applyFilters
    // Revenue for the period = calcKpis with period-filtered cost
    const psk = calcKpis(totalTCV, bc, periodAC)
    periodRevAccrued = psk.Revenue_to_Date
    periodCost       = periodAC
    periodPlanCost   = bc
  }
  const periodPM = periodRevAccrued != null && periodCost != null && periodRevAccrued > 0
    ? round2((periodRevAccrued - periodCost) / periodRevAccrued * 100)
    : null

  res.json({
    ...Object.fromEntries(Object.entries(s).map(([k,v])=>[k,round2(v)])),
    Total_TCV:             sk.TCV,
    Planned_Budget:        sk.Planned_Budget,
    Revenue_Accrued:       sk.Revenue_to_Date,
    Remaining_Revenue:     sk.Revenue_Remaining,
    Remaining_Cost:        sk.Cost_Remaining,
    Period_Revenue:        periodRevAccrued,
    Period_Cost:           periodCost,
    Period_Plan_Cost:      periodPlanCost,
    Period_PM_Pct:         periodPM,
    Has_Period_Filter:     !!(periodFrom || periodTo),
    Budget_Margin_Pct:     sk.Planned_PM_Pct,
    Actual_Margin_Pct:     sk.Current_PM_Pct,
    Projected_PM_Pct:      sk.Projected_PM_Pct,
    TCV_PM_Pct:            sk.Projected_PM_Pct,
    Cost_Variance:         sk.Cost_Variance,
    Cost_Variance_Pct:     sk.Cost_Variance_Pct,
    // Location-weighted FTE from filtered rows
    Planned_Headcount:     round2(rows.reduce((sum,r)=>sum+(r.Budgeted_Hours||0)/stdHrs(r.Location),0)),
    Actual_Headcount:      round2(rows.reduce((sum,r)=>sum+(r.Actual_Hours  ||0)/stdHrs(r.Location),0)),
    Cost_Variance:         round2(bc-ac),
    Cost_Variance_Pct:     bc ? round2((bc-ac)/bc*100) : null,
    Revenue_Variance:      round2(ar-br),
    Revenue_Variance_Pct:  br ? round2((ar-br)/br*100) : null,
  })
})

app.get('/api/by-project', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const filtered = applyFilters(store.merged, req.query)
  const agg = groupAgg(filtered, ['Project_ID'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])
  const thresholds = getHealthThresholds(req.query)
  const outlookYear = selectedYearFromQuery(req.query)
  // Pre-index all rows once; avoids re-scanning the full dataset for every project.
  // Quarter/outlook must use the same filtered row set as this report.
  // This prevents SL Group = ADM from pulling full-project/non-ADM revenue after filtering.
  const rowsByProject = buildRowsByProject(filtered)

  // Enrich with meta
  const enriched = agg.map(p => {
    const meta     = store.projectMeta[p.Project_ID] || {}
    const tcv      = meta.TCV || 0
    const pidb     = meta.PID_Budget || 0
    const withKpis = addKpis({...p}, tcv, pidb)

    // ── Apply standard KPI formulas ──────────────────────────────────────────
    // Build monthly actuals for EAC burn rate calculation
    const projAllRows  = rowsByProject[p.Project_ID] || []
    const projPeriods  = [...new Set(projAllRows.map(r => r.Period))].sort()
    const projMonths   = Math.max(projPeriods.length, 1)
    const latestPeriod = projPeriods[projPeriods.length - 1] || null
    const monthlyCostMap = {}
    for (const r of projAllRows) monthlyCostMap[r.Period] = (monthlyCostMap[r.Period]||0) + (r.Burdened_Cost||0)
    const monthlyActuals = projPeriods.map(per => ({ period: per, cost: monthlyCostMap[per]||0 }))

    // EAC engine (3-month rolling avg burn rate)
    const kpis = calcEAC(tcv, pidb, p.Burdened_Cost||0, monthlyActuals, meta.End_Date||null)

    const costToDate  = p.Burdened_Cost || 0
    const pctComplete = pidb > 0 ? Math.min(1, costToDate / pidb) : 0
    // Current PM% is the actual-to-date margin.
    // Projected PM% is the forecast closeout margin based on EAC and is only shown for active projects.
    const currentPM  = kpis.Current_PM_Pct
    const projectStatus = getProjectStatus({ ...meta, Pct_Complete: round2(pctComplete * 100) })
    const projectedPM = projectStatus === 'Active' ? kpis.EAC_PM_Pct : null

    // FTE
    const plannedHC = p.Budgeted_Hours > 0 ? round2(Math.max(0, p.Budgeted_Hours / (168 * projMonths))) : 0
    const actualHC  = p.Actual_Hours   > 0 ? round2(Math.max(0, p.Actual_Hours   / 168))               : 0

    return {
      ...withKpis,
      Project_Name:             meta.Project_Name || '',
      Opp_ID:                   meta.Opp_ID || '',
      Opp_Name:                 meta.Opp_Name || '',
      ...buildQuarterRevenueOutlook(projAllRows, meta, outlookYear),
      Customer:                 meta.Customer || '',
      Start_Date:               meta.Start_Date_Full || meta.Start_Date || null,
      End_Date:                 meta.End_Date_Full   || meta.End_Date   || null,
      TCV:                      kpis.TCV,
      PID_Budget:               pidb,
      Pct_Complete:             round2(pctComplete * 100),
      Revenue_Accrued:          kpis.Revenue_to_Date,
      Remaining_Revenue:        kpis.Revenue_Remaining,
      Remaining_Projected_Cost: kpis.Cost_Remaining,
      Remaining_Budget_Cost:    kpis.Cost_Remaining,
      Projected_Total_Cost:     round2(costToDate + kpis.Cost_Remaining),
      Current_PM_Pct:           currentPM,
      Projected_PM_Pct:         projectedPM,
      Planned_PM_Pct:           kpis.Planned_PM_Pct,
      // EAC fields
      ETC:                      kpis.ETC,
      Current_Month_Cost:       kpis.Current_Month_Cost,
      Burn_Rate:                kpis.Burn_Rate,
      Remaining_Months:         kpis.Remaining_Months,
      EAC:                      kpis.EAC,
      VAC:                      kpis.VAC,
      EAC_PM_Pct:               kpis.EAC_PM_Pct,
      CPI:                      kpis.CPI,
      TCPI:                     kpis.TCPI,
      RAG:                      healthFromCurrentPM(currentPM, projectStatus, thresholds),
      Health:                   healthFromCurrentPM(currentPM, projectStatus, thresholds),
      Project_Status:           projectStatus,
      Status:                   projectStatus,
      Actual_Headcount:         actualHC,
      Planned_Headcount:        plannedHC,
    }
  }).sort((a,b)=>a.Project_ID.localeCompare(b.Project_ID))
  res.json(enriched)
})

// ── Portfolio summary by project group (no filters, always full data) ────────
app.get('/api/portfolio-summary', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})

  // Always use ALL data — no applyFilters
  const allRows = store.merged

  // Aggregate by project group via projectMeta
  const groups = {}

  for (const r of allRows) {
    const meta  = store.store.projectMeta[r.Project_ID] || {}
    const group = meta.Project_Group || 'Unknown'

    if (!groups[group]) groups[group] = {
      Project_Group:   group,
      projects:        new Set(),
      TCV:             0,
      Budgeted_Cost:   0,
      Burdened_Cost:   0,
      Budgeted_Hours:  0,
      Actual_Hours:    0,
    }

    const g = groups[group]
    g.projects.add(r.Project_ID)
    g.Budgeted_Cost  += r.Budgeted_Cost  || 0
    g.Burdened_Cost  += r.Burdened_Cost  || 0
    g.Budgeted_Hours += r.Budgeted_Hours || 0
    g.Actual_Hours   += r.Actual_Hours   || 0
  }

  // Add TCV from projectMeta (sum per group)
  const groupTCV = {}
  for (const [pid, meta] of Object.entries(store.projectMeta)) {
    const group = meta.Project_Group || 'Unknown'
    if (!groupTCV[group]) groupTCV[group] = new Set()
    groupTCV[group].add(pid)
  }

  const result = Object.values(groups).map(g => {
    const tcv      = [...g.projects].reduce((s,pid) => s + (store.projectMeta[pid]?.TCV||0), 0)
    const pidb     = [...g.projects].reduce((s,pid) => s + (store.projectMeta[pid]?.PID_Budget||0), 0)
    const bc       = round2(g.Burdened_Cost)
    const budC     = round2(g.Budgeted_Cost)
    // Apply standard KPI formulas
    const kpis2 = calcKpis(round2(tcv), round2(pidb), round2(bc))
    const revAcc = kpis2.Revenue_to_Date
    const remRev = kpis2.Revenue_Remaining
    const currPM = kpis2.Current_PM_Pct
    const projPM = kpis2.Projected_PM_Pct

    return {
      Project_Group:     g.Project_Group,
      Project_Count:     g.projects.size,
      TCV:               round2(tcv),
      Budgeted_Cost:     budC,
      Burdened_Cost:     bc,
      Cost_Variance:     round2(budC - bc),
      Cost_Variance_Pct: budC > 0 ? round2((budC - bc) / budC * 100) : null,
      Budgeted_Hours:    round2(g.Budgeted_Hours),
      Actual_Hours:      round2(g.Actual_Hours),
      Revenue_Accrued:   revAcc,
      Remaining_Revenue: remRev,
      Cost_Remaining:    kpis2.Cost_Remaining,
      Current_PM_Pct:    currPM,
      Planned_PM_Pct:    kpis2.Planned_PM_Pct,
      Projected_PM_Pct:  projPM,
      Pct_Complete:      pidb > 0 ? round2(Math.min(1, bc/pidb)*100) : 0,
    }
  }).sort((a,b) => b.TCV - a.TCV)

  res.json(result)
})


app.get('/api/by-opportunity-projects', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const filtered = applyFilters(store.merged, req.query)
  const agg = groupAgg(filtered, ['Project_ID'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])
  const outlookYear = selectedYearFromQuery(req.query)
  // Quarter/outlook must use the same filtered row set as this report.
  // This prevents SL Group = ADM from pulling full-project/non-ADM revenue after filtering.
  const rowsByProject = buildRowsByProject(filtered)
  const projects = agg.map(p => {
    const meta = store.projectMeta[p.Project_ID] || {}
    const tcv = meta.TCV || 0
    const pidb = meta.PID_Budget || 0
    const pk = calcKpis(tcv, pidb, p.Burdened_Cost || 0)
    return {
      Opp_ID: meta.Opp_ID || meta.Opp_Name || 'Unassigned',
      Opp_Name: meta.Opp_Name || '',
      Project_ID: p.Project_ID,
      Project_Name: meta.Project_Name || '',
      TCV: pk.TCV,
      Current_PM_Pct: pk.Current_PM_Pct,
      Remaining_Revenue: pk.Revenue_Remaining,
      Revenue_Accrued: pk.Revenue_to_Date,
      Burdened_Cost: round2(p.Burdened_Cost || 0),
      Pct_Complete: pidb > 0 ? round2(Math.min(1, (p.Burdened_Cost || 0) / pidb) * 100) : 0,
      ...(() => { const q = buildQuarterRevenueOutlook(rowsByProject[p.Project_ID] || [], meta, outlookYear); return { ...q, Revenue_4Q: revenue4Q(q) } })(),
    }
  }).sort((a,b) => String(a.Opp_ID).localeCompare(String(b.Opp_ID)) || a.Project_ID.localeCompare(b.Project_ID))

  const opps = {}
  for (const p of projects) {
    const key = p.Opp_ID || 'Unassigned'
    if (!opps[key]) opps[key] = { Opp_ID:key, Opp_Name:p.Opp_Name || '', Project_Count:0, TCV:0, Current_PM_Pct:null, Remaining_Revenue:0, Revenue_Accrued:0, Burdened_Cost:0, Pct_Complete:0, _pctWeight:0, Revenue_Q1:0, Revenue_Q2:0, Revenue_Q3:0, Revenue_Q4:0, Revenue_4Q:0, projects:[] }
    const o = opps[key]
    o.Project_Count += 1
    o.TCV += p.TCV || 0
    o.Remaining_Revenue += p.Remaining_Revenue || 0
    o.Revenue_Accrued += p.Revenue_Accrued || 0
    o.Burdened_Cost += p.Burdened_Cost || 0
    const pctWeight = p.TCV || 1
    o.Pct_Complete += (p.Pct_Complete || 0) * pctWeight
    o._pctWeight += pctWeight
    o.Revenue_Q1 += p.Revenue_Q1 || 0
    o.Revenue_Q2 += p.Revenue_Q2 || 0
    o.Revenue_Q3 += p.Revenue_Q3 || 0
    o.Revenue_Q4 += p.Revenue_Q4 || 0
    o.projects.push(p)
  }
  for (const o of Object.values(opps)) {
    o.Current_PM_Pct = o.Revenue_Accrued > 0 ? round2((o.Revenue_Accrued - o.Burdened_Cost) / o.Revenue_Accrued * 100) : null
    o.TCV = round2(o.TCV); o.Remaining_Revenue = round2(o.Remaining_Revenue); o.Revenue_Accrued=round2(o.Revenue_Accrued); o.Burdened_Cost=round2(o.Burdened_Cost)
    o.Pct_Complete = o._pctWeight ? round2(o.Pct_Complete / o._pctWeight) : 0
    delete o._pctWeight
    o.Revenue_Q1=round2(o.Revenue_Q1); o.Revenue_Q2=round2(o.Revenue_Q2); o.Revenue_Q3=round2(o.Revenue_Q3); o.Revenue_Q4=round2(o.Revenue_Q4); o.Revenue_4Q=revenue4Q(o)
  }
  res.json(Object.values(opps).sort((a,b)=>String(a.Opp_ID).localeCompare(String(b.Opp_ID))))
})

app.get('/api/by-customer', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})

  // Apply filters first, then roll up by project group
  const filtered = applyFilters(store.merged, req.query)
  const projAgg = groupAgg(filtered, ['Project_ID'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])

  // Group projects by customer
  const custMap = {}
  for (const p of projAgg) {
    const meta     = store.projectMeta[p.Project_ID] || {}
    const customer = meta.Project_Group || 'Unknown'
    const group    = meta.Opp_Name || ''
    if (!custMap[customer]) {
      custMap[customer] = {
        Project_Group:  customer,
        Opp_Name:       group,
        projects:       [],
        Budgeted_Hours: 0, Actual_Hours:    0,
        Budgeted_Cost:  0, Burdened_Cost:   0,
        Budgeted_Revenue: 0, Actual_Revenue: 0,
        TCV: 0, PID_Budget: 0,
      }
    }
    const c = custMap[customer]
    const tcv  = meta.TCV || 0
    const pidb = meta.PID_Budget || 0
    const pk = calcKpis(tcv, pidb, p.Burdened_Cost||0)
    c.projects.push({
      Project_ID:        p.Project_ID,
      Project_Name:      meta.Project_Name || '',
      TCV:               pk.TCV,
      PID_Budget:        pidb,
      Pct_Complete:      pidb>0 ? round2(Math.min(1,(p.Burdened_Cost||0)/pidb)*100) : 0,
      Budget_Cost:       round2(p.Budgeted_Cost),
      Actual_Cost:       round2(p.Burdened_Cost),
      Budget_Hours:      round2(p.Budgeted_Hours),
      Actual_Hours:      round2(p.Actual_Hours),
      Revenue_Accrued:   pk.Revenue_to_Date,
      Remaining_Revenue: pk.Revenue_Remaining,
      Current_PM_Pct:    pk.Current_PM_Pct,
      Planned_PM_Pct:    pk.Planned_PM_Pct,
      Projected_PM_Pct:  pk.Projected_PM_Pct,
    })
    c.Budgeted_Hours   += p.Budgeted_Hours  || 0
    c.Actual_Hours     += p.Actual_Hours    || 0
    c.Budgeted_Cost    += p.Budgeted_Cost   || 0
    c.Burdened_Cost    += p.Burdened_Cost   || 0
    c.TCV              += tcv
    c.PID_Budget       += pidb
  }

  // Compute rollup KPIs per customer using calcKpis
  const result = Object.values(custMap).map(cust => {
    const ck = calcKpis(round2(cust.TCV), round2(cust.PID_Budget), round2(cust.Burdened_Cost))
    return {
      Project_Group:     cust.Customer,
      Opp_Name:          cust.Project_Group,
      Project_Count:     cust.projects.length,
      Budgeted_Hours:    round2(cust.Budgeted_Hours),
      Actual_Hours:      round2(cust.Actual_Hours),
      Budget_Cost:       round2(cust.PID_Budget),
      Actual_Cost:       round2(cust.Burdened_Cost),
      Cost_Variance:     ck.Cost_Variance,
      Cost_Variance_Pct: ck.Cost_Variance_Pct,
      TCV:               ck.TCV,
      Revenue_Accrued:   ck.Revenue_to_Date,
      Remaining_Revenue: ck.Revenue_Remaining,
      Cost_Remaining:    ck.Cost_Remaining,
      Pct_Complete:      cust.PID_Budget>0 ? round2(Math.min(1,cust.Burdened_Cost/cust.PID_Budget)*100) : 0,
      Current_PM_Pct:    ck.Current_PM_Pct,
      Budget_PM_Pct:     ck.Planned_PM_Pct,
      Planned_PM_Pct:    ck.Planned_PM_Pct,
      Projected_PM_Pct:  ck.Projected_PM_Pct,
      projects:          cust.projects.sort((a,b) => a.Project_ID.localeCompare(b.Project_ID)),
    }
  }).sort((a,b) => a.Customer.localeCompare(b.Customer))

  res.json(result)
})

app.get('/api/trend', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  let rows = applyFilters(store.merged, req.query)
  if (req.query.granularity === 'quarter') {
    rows = rows.map(r=>({...r, Period: toQuarter(r.Period)||r.Period}))
  }
  const agg = groupAgg(rows, ['Period'], ['Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue','Budgeted_Hours','Actual_Hours'])

  // Unique projects per period
  const projectsPerPeriod = {}
  for (const r of rows) {
    if (!projectsPerPeriod[r.Period]) projectsPerPeriod[r.Period] = new Set()
    projectsPerPeriod[r.Period].add(r.Project_ID)
  }

  // Compute location-weighted FTE per period
  // Each row has a Location — divide by offshore (189) or onshore (168) hours
  const periodFTE = {}  // period -> { planned, actual }
  for (const r of rows) {
    const p = r.Period
    if (!periodFTE[p]) periodFTE[p] = { planned: 0, actual: 0 }
    const sh = stdHrs(r.Location)
    periodFTE[p].planned += (r.Budgeted_Hours || 0) / sh
    periodFTE[p].actual  += (r.Actual_Hours   || 0) / sh
  }

  const sorted = agg.sort((a,b)=>a.Period.localeCompare(b.Period)).map(r => {
    const fte = periodFTE[r.Period] || { planned: 0, actual: 0 }
    return {
      ...addKpis({...r}),
      Active_Projects:  (projectsPerPeriod[r.Period]||new Set()).size,
      Planned_FTE:      Math.round(fte.planned * 10) / 10,
      Actual_Headcount: Math.round(fte.actual  * 10) / 10,
    }
  })

  res.json(sorted)
})

app.get('/api/by-band', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const filtered = applyFilters(store.merged, req.query)
  const agg = groupAgg(filtered, ['Band'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])

  // Headcount computed below from filtered actuals

  // Compute planned FTE per band = sum(planned hours) / (160 * project_months)
  // Use all merged rows (not just filtered) for band FTE - aggregate across all projects
  const bandPlanHrs = {}
  const bandPlanMonths = {}
  for (const r of filtered) {
    const b = r.Band || ''
    bandPlanHrs[b]    = (bandPlanHrs[b]    || 0) + (r.Budgeted_Hours || 0)
    if (!bandPlanMonths[b]) bandPlanMonths[b] = new Set()
    bandPlanMonths[b].add(r.Project_ID + '|' + r.Period)
  }

  // Compute location-weighted FTE per band
  const bandFTE = {}
  for (const r of filtered) {
    const b = r.Band || ''
    if (!bandFTE[b]) bandFTE[b] = { planned: 0, actual: 0, months: new Set() }
    const sh = stdHrs(r.Location)
    bandFTE[b].planned += (r.Budgeted_Hours || 0) / sh
    bandFTE[b].actual  += (r.Actual_Hours   || 0) / sh
    if (r.Period) bandFTE[b].months.add(r.Period)
  }

  res.json(agg.map(r => {
    const b          = r.Band || ''
    const fte        = bandFTE[b] || { planned: 0, actual: 0, months: new Set() }
    const months     = fte.months.size || 1
    const plannedFTE = Math.round(fte.planned / months * 10) / 10  // avg FTE per month
    const actualHC   = Math.round(fte.actual  / months * 10) / 10
    return { ...addKpis({...r}), Headcount: actualHC, Planned_FTE: plannedFTE }
  }))
})

// ── Band × Period breakdown (for project drilldown) ─────────────────────────
app.get('/api/by-band-period', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const rows = applyFilters(store.merged, req.query)
  if (!rows.length) return res.json([])

  const STD_HRS = 168

  // Group by Band+Period
  const agg = groupAgg(rows, ['Band','Period'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost'])

  // Build result with FTE columns
  const result = agg.map(r => ({
    Band:         r.Band,
    Period:       r.Period,
    Plan_Hours:   round2(r.Budgeted_Hours),
    Act_Hours:    round2(r.Actual_Hours),
    Plan_Cost:    round2(r.Budgeted_Cost),
    Act_Cost:     round2(r.Burdened_Cost),
    // Note: by-band-period doesn't have single location — use average
    // Build from filtered rows for accurate per-location FTE
    Plan_FTE:     round2(r.Plan_FTE_weighted || r.Budgeted_Hours / 168),
    Act_FTE:      round2(r.Act_FTE_weighted  || r.Actual_Hours   / 168),
    FTE_Variance: round2((r.Act_FTE_weighted||r.Actual_Hours/168) - (r.Plan_FTE_weighted||r.Budgeted_Hours/168)),
    Cost_Variance:round2(r.Burdened_Cost - r.Budgeted_Cost),
  })).sort((a,b) => a.Period.localeCompare(b.Period) || a.Band.localeCompare(b.Band))

  res.json(result)
})


app.get('/api/resource-count-monthly', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})

  // First apply the dashboard filters to merged rows so project-level filters such as
  // RAG, status, opportunity and closed-year stay consistent with the rest of the app.
  const allowedProjects = new Set(applyFilters(store.merged, req.query).map(r => r.Project_ID))

  let rows = Array.isArray(store.resourceRows) && store.resourceRows.length
    ? store.resourceRows.filter(r => allowedProjects.has(r.Project_ID))
    : []

  // Apply row-level filters directly to the employee-resource rows.
  const projects = toArr(req.query.project)
  const bands    = toArr(req.query.band)
  const sls      = toArr(req.query.service_line)
  const slGroups = toArr(req.query.sl_group)
  const locs     = toArr(req.query.location)
  const years    = toArr(req.query.years)
  const qnums    = toArr(req.query.quarters)
  rows = applyProjectTypeFilter(rows, req.query)
  if (projects) rows = rows.filter(x => projects.includes(x.Project_ID))
  if (bands)    rows = rows.filter(x => bands.includes(x.Band))
  if (sls)      rows = rows.filter(x => sls.includes(x.Service_Line))
  if (slGroups) rows = rows.filter(x => slGroups.includes(serviceLineGroup(x.Service_Line)))
  if (locs)     rows = rows.filter(x => locs.includes(x.Location))
  if (years)    rows = rows.filter(x => years.includes(String(periodYear(x.Period))))
  if (qnums)    rows = rows.filter(x => qnums.includes(String(periodQuarterNum(x.Period))))
  if (req.query.period_from)  rows = rows.filter(x => x.Period >= req.query.period_from)
  if (req.query.period_to)    rows = rows.filter(x => x.Period <= req.query.period_to)
  if (req.query.quarter_from) rows = rows.filter(x => { const qp=toQuarter(x.Period); return qp&&qp>=req.query.quarter_from })
  if (req.query.quarter_to)   rows = rows.filter(x => { const qp=toQuarter(x.Period); return qp&&qp<=req.query.quarter_to })

  const groups = {}

  if (rows.length) {
    for (const r of rows) {
      const country = r.Country || r.Location || ''
      const key = [r.Period || '', r.Service_Line || '', r.Band || '', country].join('||')
      if (!groups[key]) groups[key] = {
        Period: r.Period || '',
        Service_Line: r.Service_Line || '',
        Band: r.Band || '',
        Location: country,
        Country: country,
        _emps: new Set(),
        Actual_Hours: 0,
        Project_Type: r.Project_Type || (store.projectMeta[r.Project_ID]?.Project_Type || ''),
      }
      if (r.Employee_Number) groups[key]._emps.add(String(r.Employee_Number))
      groups[key].Actual_Hours += Number(r.Actual_Hours || 0)
    }
  } else {
    // Fallback for older parsed data: sum existing aggregate headcount rows.
    const fallback = applyFilters(store.actuals || [], req.query)
    for (const r of fallback) {
      const country = r.Country || r.Location || ''
      const key = [r.Period || '', r.Service_Line || '', r.Band || '', country].join('||')
      if (!groups[key]) groups[key] = {
        Period: r.Period || '',
        Service_Line: r.Service_Line || '',
        Band: r.Band || '',
        Location: country,
        Country: country,
        _count: 0,
        Actual_Hours: 0,
        Project_Type: r.Project_Type || (store.projectMeta[r.Project_ID]?.Project_Type || ''),
      }
      groups[key]._count += Number(r.Actual_Headcount || 0)
      groups[key].Actual_Hours += Number(r.Actual_Hours || 0)
    }
  }

  const result = Object.values(groups).map(g => ({
    Period: g.Period,
    Service_Line: g.Service_Line,
    SL_Group: serviceLineGroup(g.Service_Line),
    Band: g.Band,
    Location: g.Location,
    Country: g.Country || g.Location,
    Resource_Count: g._emps ? g._emps.size : Math.round(g._count || 0),
    Actual_Hours: round2(g.Actual_Hours || 0),
    Project_Type: g.Project_Type || '',
  })).sort((a,b) => a.Period.localeCompare(b.Period) || a.Service_Line.localeCompare(b.Service_Line) || a.Band.localeCompare(b.Band) || a.Location.localeCompare(b.Location))

  res.json(result)
})





function rowsToCacheCSV(rows) {
  if (!rows || !rows.length) return ''
  const keys = Array.from(rows.reduce((set, r) => { Object.keys(r || {}).forEach(k => set.add(k)); return set }, new Set()))
  const esc = v => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
  }
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
}

function parseCacheCSV(text) {
  if (!text || !text.trim()) return []
  const rows = []
  let cur = '', row = [], inQ = false
  for (let i=0;i<text.length;i++) {
    const c = text[i], n = text[i+1]
    if (c === '"') { if (inQ && n === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { row.push(cur); cur = '' }
    else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && n === '\n') i++
      row.push(cur); rows.push(row); row=[]; cur=''
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  if (!rows.length) return []
  const headers = rows.shift().map(h => String(h || '').trim())
  return rows.filter(r => r.some(v => String(v||'').trim() !== '')).map(r => Object.fromEntries(headers.map((h,i)=>[h,r[i] ?? ''])))
}

function getAllProjectsRowsDirect(forceRefresh=false) {
  // All Projects dashboard is fully independent from Fixed.
  // It reads the first sheet of All Projects Excel and uses a separate compact cache.
  if (!forceRefresh && Array.isArray(store._allProjectTypesCache)) return store._allProjectTypesCache
  const dataDir = dataDirPath()
  const cachePath = path.join(dataDir, 'All_Projects_pnl_v2_cache.csv')

  try {
    if (!forceRefresh && fs.existsSync(cachePath)) {
      const rows = parseCacheCSV(fs.readFileSync(cachePath, 'utf8'))
      store._allProjectTypesCache = rows
      console.log(`All Projects: loaded ${rows.length} rows from separate cache`)
      return rows
    }

    let wb = null
    let sourceName = ''
    if (store._allProjectsWorkbookBuffer && store._allProjectsWorkbookBuffer.length) {
      wb = XLSX.read(store._allProjectsWorkbookBuffer, { type:'buffer', cellDates:true })
      sourceName = store._allProjectsWorkbookName || 'Uploaded All Projects workbook'
    } else {
      const workbookPath = findWorkbook('all')
      if (!workbookPath || !fs.existsSync(workbookPath)) {
        console.warn('All Projects: workbook not found. Expected data/All_Projects.xlsx or data/All Projects.xlsx')
        store._allProjectTypesCache = []
        return []
      }
      wb = XLSX.readFile(workbookPath, { cellDates:true })
      sourceName = path.basename(workbookPath)
    }

    const sheetName = wb.SheetNames && wb.SheetNames[0]
    if (!sheetName) {
      console.warn(`All Projects: first sheet not found in ${sourceName}`)
      store._allProjectTypesCache = []
      return []
    }

    const rows = sheetRows(wb, sheetName, null).map(r => {
      const pt = normalizeProjectType(getField(r, ['Project Type','Project_Type','Deal Type','Deal_Type','Type']), '')
      return pt ? { ...r, Project_Type: pt, 'Project Type': pt } : { ...r }
    })
    try { fs.writeFileSync(cachePath, rowsToCacheCSV(rows)) } catch(e) { console.warn('All Projects cache write failed:', e.message) }
    store._allProjectTypesCache = rows
    console.log(`All Projects: loaded ${rows.length} raw rows from ${sourceName} / ${sheetName}`)
    return rows
  } catch (e) {
    console.error('All Projects direct read failed:', e.message)
    store._allProjectTypesCache = []
    return []
  }
}


function buildAllProjectTypesRevenueView() {
  // All Projects dashboard is independent from Fixed.
  // Current All Projects schema:
  // P&L Lines, PID, Project Type, Country, MONTH (Short Names), CONVERTED_OP_AMNT,
  // Revised Client, Process, Project HSL, Opp ID, Opp Name, Start Date, End Date,
  // Offering, TCV, Project Group.
  // CONVERTED_OP_AMNT carries both revenue and cost; P&L Lines classifies it.
  // TCV is rolled up as average at PID level.
  if (store._allProjectsViewCache) return store._allProjectsViewCache

  const sourceRows = getAllProjectsRowsDirect()
  const pick = (r, names) => getField(r, names)
  const num = v => {
    if (v == null || v === '') return 0
    const cleaned = String(v).replace(/,/g,'').replace(/%/g,'').replace(/\$/g,'').trim()
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  const normalizeText = v => String(v || '').trim()
  const classifyPnL = v => {
    // All Projects Excel can contain detail rows plus subtotal rows.
    // Use only the source subtotal rows to match the pivot totals and avoid double-counting.
    const s = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!s) return 'other'
    if (/^total\s+revenue$/.test(s) || /^revenue$/.test(s)) return 'revenue'
    if (/^total\s+project\s+cost$/.test(s) || /^project\s+cost$/.test(s) || /^total\s+cost$/.test(s)) return 'cost'
    return 'other'
  }
  const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const normalizeMonth = (raw) => {
    if (raw == null || raw === '') return ''
    if (raw instanceof Date && !isNaN(raw)) return MONTH_ORDER[raw.getMonth()]
    const asPeriod = toYYYYMM(raw)
    if (asPeriod && /^\d{4}-\d{2}$/.test(asPeriod)) return MONTH_ORDER[Number(asPeriod.slice(5,7))-1] || ''
    const s = String(raw || '').trim()
    const m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i)
    if (m) {
      const key = m[1].slice(0,3).toLowerCase()
      const idx = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}[key]
      return MONTH_ORDER[idx] || ''
    }
    return s
  }

  const groups = new Map()
  const pidTcvVals = new Map() // PID -> all row TCVs, averaged once per PID
  const filterSets = {
    projectGroups: new Set(), serviceLines: new Set(), oppIds: new Set(), startDates: new Set(), endDates: new Set()
  }

  const mergeCsvValue = (current, value) => {
    const v = normalizeText(value)
    if (!v) return current || ''
    const set = new Set(String(current || '').split(',').map(x => x.trim()).filter(Boolean))
    set.add(v)
    return Array.from(set).sort((a,b)=>a.localeCompare(b)).join(', ')
  }
  const minDateText = (a,b) => {
    if (!a) return b || ''
    if (!b) return a || ''
    return String(b) < String(a) ? b : a
  }
  const maxDateText = (a,b) => {
    if (!a) return b || ''
    if (!b) return a || ''
    return String(b) > String(a) ? b : a
  }

  for (const r of sourceRows) {
    const pid = normalizeText(pick(r, ['PID','Pid','Project Number','project number','Project_Number','Project_ID','Project ID']))
    if (!pid) continue

    const oppId = normalizeText(pick(r, ['Opp ID','Opp_ID','Opportunity ID','Opportunity_ID','Opportunity Number','Opportunity_Number']))
    const oppName = normalizeText(pick(r, ['Opp Name','Opp_Name','Opportunity Name','Opportunity_Name','Name']))
    const process = normalizeText(pick(r, ['Process','process']))
    const revisedClient = normalizeText(pick(r, ['Revised Client','Revised_Client','Client','Customer']))
    const projectGroupRaw = normalizeText(pick(r, ['Project Group','Project_Group','ProjectGroup','Project group','Group','Project Portfolio','Portfolio']))
    const offering = normalizeText(pick(r, ['Offering','offering']))
    const startDate = toYYYYMMDD(pick(r, ['Start Date','Start_Date','Project Start','Project_Start','Start','Project Start Date'])) || normalizeText(pick(r, ['Start Date','Start_Date','Project Start','Project_Start','Start','Project Start Date']))
    const endDate = toYYYYMMDD(pick(r, ['End Date','End_Date','Project End','Project_End','End','Project End Date'])) || normalizeText(pick(r, ['End Date','End_Date','Project End','Project_End','End','Project End Date']))
    const sl = normalizeText(pick(r, ['Project HSL','Project_HSL','HSL','SL','Service Line','Service_Line','Service line','ServiceLine']))
    // Project Group must come from the actual Project Group field only.
    // Do not fall back to Project HSL; that caused incorrect Project Group filter values.
    const projectGroup = projectGroupRaw
    const displayName = oppName || process || revisedClient || projectGroup || offering
    const projectType = normalizeProjectType(pick(r, ['Project Type','Project_Type','Deal Type','Deal_Type','Type']), 'Unspecified')
    const country = normalizeText(pick(r, ['Country','country']))
    const month = normalizeMonth(pick(r, ['MONTH (Short Names)','MONTH','Month','month','Period','period']))
    const measure = classifyPnL(pick(r, ['P&L Lines','P&L Line','PnL Lines','PnL Line','P and L Lines','PL Lines','P_L_Lines']))
    const amount = num(pick(r, ['CONVERTED_OP_AMNT','Converted_OP_AMNT','Converted OP Amount','Converted OP AMNT','Converted Amount','Amount']))
    const tcv = num(pick(r, ['TCV','Total Contract Value','Contract Value','Total_Contract_Value']))

    if (tcv) {
      if (!pidTcvVals.has(pid)) pidTcvVals.set(pid, [])
      pidTcvVals.get(pid).push(tcv)
    }

    const key = [oppId, displayName, pid].join('||')
    if (!groups.has(key)) {
      groups.set(key, {
        Opp_ID: oppId, Opportunity_ID: oppId, Name: displayName,
        Opportunity: [oppId, displayName].filter(Boolean).join(' — '),
        PID: pid, Project_ID: pid,
        Project_Type: '', Project_Group: '', SL: '', Country: '', Revised_Client: '', Process: '', Offering: '',
        Start_Date: '', End_Date: '', TCV: 0,
        Total_Revenue: 0, Total_Cost: 0, Current_PM_Pct: null,
        Jan:0, Feb:0, Mar:0, Apr:0, May:0, Jun:0, Jul:0, Aug:0, Sep:0, Oct:0, Nov:0, Dec:0,
        Cost_Jan:0, Cost_Feb:0, Cost_Mar:0, Cost_Apr:0, Cost_May:0, Cost_Jun:0,
        Cost_Jul:0, Cost_Aug:0, Cost_Sep:0, Cost_Oct:0, Cost_Nov:0, Cost_Dec:0,
      })
    }
    const g = groups.get(key)
    g.Project_Type = mergeCsvValue(g.Project_Type, projectType)
    g.Project_Group = mergeCsvValue(g.Project_Group, projectGroup)
    g.SL = mergeCsvValue(g.SL, sl)
    g.Country = mergeCsvValue(g.Country, country)
    g.Revised_Client = mergeCsvValue(g.Revised_Client, revisedClient)
    g.Process = mergeCsvValue(g.Process, process)
    g.Offering = mergeCsvValue(g.Offering, offering)
    g.Start_Date = minDateText(g.Start_Date, startDate)
    g.End_Date = maxDateText(g.End_Date, endDate)

    const isValidMonth = MONTH_ORDER.includes(month)
    // Only month-level rows should feed the report totals. This prevents Excel subtotal / grand-total
    // rows from being counted again when they appear in the source extract.
    if (isValidMonth && measure === 'revenue') {
      g.Total_Revenue += amount
      g[month] += amount
    } else if (isValidMonth && measure === 'cost') {
      const costAmount = Math.abs(amount)
      g.Total_Cost += costAmount
      g[`Cost_${month}`] += costAmount
    }

    if (projectGroup) filterSets.projectGroups.add(projectGroup)
    if (sl) filterSets.serviceLines.add(sl)
    if (oppId) filterSets.oppIds.add(oppId)
    if (startDate) filterSets.startDates.add(startDate)
    if (endDate) filterSets.endDates.add(endDate)
  }

  const pidAvgTcv = new Map()
  for (const [pid, vals] of pidTcvVals.entries()) {
    const good = vals.filter(v => Number.isFinite(v) && v !== 0)
    pidAvgTcv.set(pid, good.length ? good.reduce((s,v)=>s+v,0) / good.length : 0)
  }

  const rows = Array.from(groups.values()).map(g => {
    const row = { ...g }
    row.TCV = round2(pidAvgTcv.get(row.PID) || 0)
    for (const m of MONTH_ORDER) {
      row[m] = round2(row[m] || 0)
      row[`Cost_${m}`] = round2(row[`Cost_${m}`] || 0)
    }
    row.Total_Revenue = round2(row.Total_Revenue || 0)
    row.Total_Cost = round2(row.Total_Cost || 0)
    row.Current_PM_Pct = row.Total_Revenue > 0 ? round2((row.Total_Revenue - row.Total_Cost) / row.Total_Revenue * 100) : null
    return row
  }).filter(r => r.Total_Revenue || r.Total_Cost || r.TCV).sort((a,b) =>
    String(a.Opp_ID || '').localeCompare(String(b.Opp_ID || '')) ||
    String(a.Name || '').localeCompare(String(b.Name || '')) ||
    String(a.PID || '').localeCompare(String(b.PID || ''))
  )

  const totalRevenue = rows.reduce((s,r) => s + Number(r.Total_Revenue || 0), 0)
  const totalCost = rows.reduce((s,r) => s + Number(r.Total_Cost || 0), 0)
  const result = {
    rows,
    months: MONTH_ORDER,
    projectGroups: Array.from(filterSets.projectGroups).sort((a,b)=>a.localeCompare(b)),
    serviceLines: Array.from(filterSets.serviceLines).sort((a,b)=>a.localeCompare(b)),
    oppIds: Array.from(filterSets.oppIds).sort((a,b)=>a.localeCompare(b)),
    startDates: Array.from(filterSets.startDates).sort(),
    endDates: Array.from(filterSets.endDates).sort(),
    source: 'All Projects Excel only',
    rawRows: sourceRows.length,
    totals: {
      Project_Count: new Set(rows.map(r => r.PID).filter(Boolean)).size,
      TCV: round2(Array.from(pidAvgTcv.values()).reduce((s,v)=>s+v,0)),
      Revenue: round2(totalRevenue),
      Cost: round2(totalCost),
      Current_PM_Pct: totalRevenue > 0 ? round2((totalRevenue - totalCost) / totalRevenue * 100) : null,
    }
  }
  store._allProjectsViewCache = result
  return result
}

app.get('/api/tcv-revenue-quarterly', (req,res) => {
  res.json(buildAllProjectTypesRevenueView())
})

app.get('/api/by-service-line', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const rows = applyFilters(store.merged,req.query).map(r => ({...r, Service_Line: serviceLineGroup(r.Service_Line)})).filter(r => r.Service_Line)
  const agg = groupAgg(rows, ['Service_Line'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])
  res.json(agg.map(r=>addKpis({...r})))
})

app.get('/api/service-line-view', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const filtered = applyFilters(store.merged, req.query)
  const outlookYear = selectedYearFromQuery(req.query)

  // Group by Service Line Group, with child rows for the original Service Lines.
  // Quarter/outlook must use the same filtered row set as this report.
  // This prevents SL Group = ADM from pulling full-project/non-ADM revenue after filtering.
  const rowsByProject = buildRowsByProject(filtered)
  const slProjects = {}
  for (const r of filtered) {
    const sl = r.Service_Line || ''
    const grp = serviceLineGroup(sl)
    if (!grp) continue
    const key = `${grp}||${sl}`
    if (!slProjects[key]) slProjects[key] = { SL_Group: grp, Service_Line: sl, rows: [], projects: new Set() }
    slProjects[key].rows.push(r)
    slProjects[key].projects.add(r.Project_ID)
  }

  const childRows = Object.values(slProjects).map(g => {
    const totals = scopedRowTotals(g.rows, outlookYear)
    return {
      SL_Group: g.SL_Group,
      Service_Line: g.Service_Line,
      ...totals,
    }
  })

  const groupRows = {}
  for (const r of filtered) {
    const grp = serviceLineGroup(r.Service_Line)
    if (!grp) continue
    if (!groupRows[grp]) groupRows[grp] = []
    groupRows[grp].push(r)
  }

  const groups = {}
  for (const grp of SERVICE_LINE_GROUPS) {
    const rowsForGroup = groupRows[grp] || []
    if (!rowsForGroup.length) continue
    const totals = scopedRowTotals(rowsForGroup, outlookYear)
    groups[grp] = {
      Service_Line: grp,
      SL_Group: grp,
      ...totals,
      children: childRows.filter(ch => ch.SL_Group === grp).sort((a,b)=>String(a.Service_Line).localeCompare(String(b.Service_Line)))
    }
  }
  const result = Object.values(groups).sort((a,b) => SERVICE_LINE_GROUPS.indexOf(a.Service_Line) - SERVICE_LINE_GROUPS.indexOf(b.Service_Line))
  res.json(result)
})

app.get('/api/by-location', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const agg = groupAgg(applyFilters(store.merged,req.query), ['Location'],
    ['Budgeted_Hours','Actual_Hours','Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue'])
  res.json(agg.map(r=>addKpis({...r})))
})

app.get('/api/project-summary', (req,res) => {
  if (!store.merged) return res.status(400).json({detail:'No data loaded'})
  const projs = groupAgg(applyFilters(store.merged, req.query), ['Project_ID'],
    ['Budgeted_Cost','Burdened_Cost','Budgeted_Revenue','Actual_Revenue','Budgeted_Hours','Actual_Hours'])

  const result = projs.map(p => {
    const pid    = p.Project_ID
    const meta   = store.projectMeta[pid] || {}
    const manual = manualInputs[pid] || {}
    const tcv    = meta.TCV || parseFloat(manual.tcv) || 0
    const pidb   = meta.PID_Budget || 0
    const extraC = parseFloat(manual.projected_extra_cost) || 0

    // Apply standard calcKpis formulas
    const sk = calcKpis(tcv, pidb, p.Burdened_Cost || 0)

    // Headcount
    const projPeriods = [...new Set((store.merged||[]).filter(r=>r.Project_ID===pid).map(r=>r.Period))]
    const projMonths  = Math.max(projPeriods.length, 1)
    const plannedHC   = p.Budgeted_Hours > 0 ? round2(Math.max(0, p.Budgeted_Hours / (168 * projMonths))) : 0
    const actualHC    = p.Actual_Hours   > 0 ? round2(Math.max(0, p.Actual_Hours   / 168))               : 0

    // Projected PM% adjusted for manual extra cost (9. Projected PM% = (RemRev-RemCost)/RemRev)
    const adjCostRemaining = round2(Math.max(0, sk.Cost_Remaining + extraC))
    const projPM = sk.Revenue_Remaining > 0
      ? round2((sk.Revenue_Remaining - adjCostRemaining) / sk.Revenue_Remaining * 100)
      : null

    return {
      Project_ID:            pid,
      Project_Name:          meta.Project_Name || '',
      Customer:              meta.Customer || '',
      Pct_Complete:          pidb>0 ? round2(Math.min(1,(p.Burdened_Cost||0)/pidb)*100) : 0,
      Cost_Till_Date:        round2(p.Burdened_Cost || 0),
      Budget_Cost:           round2(pidb || p.Budgeted_Cost || 0),
      Cost_Variance:         sk.Cost_Variance,
      Cost_Variance_Pct:     sk.Cost_Variance_Pct,
      TCV:                   sk.TCV,
      Revenue_Accrued:       sk.Revenue_to_Date,
      Remaining_Revenue:     sk.Revenue_Remaining,
      Cost_Remaining:        sk.Cost_Remaining,
      Current_PM_Pct:        sk.Current_PM_Pct,
      Budget_PM_Pct:         sk.Planned_PM_Pct,
      Planned_PM_Pct:        sk.Planned_PM_Pct,
      Projected_Extra_Cost:  extraC,
      Projected_Extra_Label: manual.projected_extra_label || 'Projected Extra Cost',
      Projected_Total_Cost:  round2((p.Burdened_Cost||0) + adjCostRemaining),
      Projected_PM_Pct:      projPM,
      Budgeted_Hours:        round2(p.Budgeted_Hours || 0),
      Actual_Hours:          round2(p.Actual_Hours   || 0),
      Planned_Headcount:     plannedHC,
      Actual_Headcount:      actualHC,
      Rev_Till_Date:         sk.Revenue_to_Date,
      Projected_Total_Revenue: tcv,
      Manual:                manual,
    }
  }).sort((a,b) => a.Project_ID.localeCompare(b.Project_ID))
  res.json(result)
})

app.post('/api/manual-inputs', (req,res) => {
  const { project_id, tcv, projected_extra_cost, projected_extra_label, notes } = req.body
  if (!project_id) return res.status(400).json({detail:'project_id required'})
  manualInputs[project_id] = {
    tcv: parseFloat(tcv)||0,
    projected_extra_cost: parseFloat(projected_extra_cost)||0,
    projected_extra_label: projected_extra_label||'Projected Extra Cost',
    notes: notes||'',
  }
  saveManual()
  res.json({status:'ok', data:manualInputs[project_id]})
})

app.post('/api/agent', (req,res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({detail:'message required'})
    // Pass projectMeta to agent for richer responses
    const enrichedStore = { ...store, projectMeta: store.projectMeta }
    const result = runAgent(message, enrichedStore)
    res.json(result)
  } catch(e) {
    console.error('Agent error:', e.message)
    res.status(500).json({ reply: `⚠️ Error: ${e.message}`, type:'error' })
  }
})

app.get('*', (req,res) => {
  const index = path.join(distPath, 'index.html')
  if (fs.existsSync(index)) res.sendFile(index)
  else res.status(404).send('Frontend not built.')
})

const PORT = process.env.PORT || 8000
app.listen(PORT, () => {
  console.log(`\n✓ Profitability Dashboard on http://localhost:${PORT}\n`)
  loadDefault()
})
