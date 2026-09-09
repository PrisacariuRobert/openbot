// Deterministic model choices, real upload/tool/export/artifact pipeline. No external services.
const fs = require('node:fs');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture runtime'); process.exit(0); }
const prompt = process.argv.at(-1);
const paths = [...prompt.matchAll(/Workspace copy: (inbox\/[^\n]+\.csv)/g)].map(match => match[1]);
const tool = async (action, args) => {
  const response = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action, args }) });
  const result = await response.json(); if (!response.ok) throw Error(JSON.stringify(result)); return result;
};
const csv = rows => rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';
async function main() {
  const leftPath = paths.find(file => file.endsWith('-expenses.csv')), rightPath = paths.find(file => file.endsWith('-receipts.csv'));
  if (!leftPath || !rightPath) throw Error('Original uploaded sources were not supplied to the runner');
  const reconciliation = await tool('table_reconcile', { leftPath, rightPath, leftKey: 'receipt_id', rightKey: 'receipt_id', compare: [{ left: 'amount', right: 'amount', as: 'decimal' }, { left: 'currency', right: 'currency', as: 'text' }], leftFilters: [{ column: 'status', operator: 'equals', value: 'paid' }] });
  const totals = await tool('table_summary', { csvPath: leftPath, groupBy: ['currency'], sumColumns: ['amount'], filters: [{ column: 'status', operator: 'not_equals', value: 'cancelled' }] });
  fs.writeFileSync('totals.csv', csv([['currency', 'total'], ...totals.groups.map(group => [group.key.currency, group.sums.amount])]));
  fs.writeFileSync('exceptions.csv', csv([['source_row', 'receipt_id', 'status', 'differences'], ...reconciliation.records.filter(record => record.status !== 'matched').map(record => [record.leftRow, record.key, record.status, JSON.stringify(record.differences || [])])]));
  const workbook = await tool('spreadsheet_export', { filename: 'reconciliation.xlsx', sheets: [{ name: 'Expenses', csvPath: leftPath, numberColumns: [4] }, { name: 'Receipts', csvPath: rightPath, numberColumns: [2] }, { name: 'Totals', csvPath: 'totals.csv', numberColumns: [2] }, { name: 'Exceptions', csvPath: 'exceptions.csv', numberColumns: [1] }] });
  const inspection = await tool('spreadsheet_inspect', { path: workbook.path });
  fs.writeFileSync('reconciliation.json', JSON.stringify({ reconciliation, totals, workbook, inspection }, null, 2));
  console.log(JSON.stringify({ type: 'text', text: 'Compared the original records. Missing, ambiguous and different values still need review. Refunds are included in totals; cancelled entries are excluded. No currency conversion, reimbursement approval or messages sent.\n\n[Editable reconciliation](reconciliation.xlsx)\n[Source evidence](reconciliation.json)' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
