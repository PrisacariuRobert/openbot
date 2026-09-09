// Deterministic stand-in for model choices; only calls the disposable local host.
const fs = require('node:fs'), path = require('node:path');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture runtime'); process.exit(0); }
const file = path.join(process.cwd(), '.customer-fixture-' + process.env.OPENBOT_RUN_ID + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { phase: 0 };
const prompt = process.argv.at(-1);
const customer = state.customer || (prompt.includes('Harbor') ? 'Harbor' : 'Cedar');
const tool = async (action, args) => {
  const response = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action, args }) });
  const value = await response.json(); if (!response.ok) throw Error(JSON.stringify(value)); return value;
};
async function main() {
  if (state.phase === 0) {
    const found = await tool('gmail_search', { query: customer });
    const original = await tool('gmail_read', { messageId: found.messages[0].id });
    await tool('google_calendar_agenda', { days: 7 });
    const result = await tool('google_calendar_create', { title: customer + ' review', start: '2026-09-09T10:00:00+02:00', end: '2026-09-09T10:30:00+02:00', attendees: [customer.toLowerCase() + '-team@example.com'], description: 'Synthetic customer workflow test' });
    fs.writeFileSync(file, JSON.stringify({ phase: 1, customer, originalId: original.id, approvalId: result.approvalId })); setInterval(() => {}, 1000);
  } else if (state.phase === 1) {
    const link = prompt.match(/https:\/\/calendar\.google\.com\/calendar\/event\?eid=[a-z]+/)?.[0];
    if (!link) throw Error('No host-confirmed meeting link in continuation');
    const result = await tool('gmail_reply', { messageId: state.originalId, body: 'Your project review is arranged for 9 September at 10:00 Brussels time. Meeting details: ' + link });
    fs.writeFileSync(file, JSON.stringify({ phase: 2, customer, approvalId: result.approvalId })); setInterval(() => {}, 1000);
  } else console.log(JSON.stringify({ type: 'text', text: prompt.includes('but it failed') ? 'The reply needs a new review; the meeting is already created.' : 'The meeting is created and the reply is checked in the original conversation.' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
