'use strict'

function runAgent(message, store) {
  const text = String(message || '').trim()
  const rows = Array.isArray(store?.merged) ? store.merged : []
  const projects = store?.projectMeta ? Object.keys(store.projectMeta).length : 0
  return {
    type: 'text',
    reply: `AI Agent is available. Loaded ${projects} projects and ${rows.length} dashboard rows. Ask a profitability, resource, or project question.`,
    input: text,
  }
}

module.exports = { runAgent }
