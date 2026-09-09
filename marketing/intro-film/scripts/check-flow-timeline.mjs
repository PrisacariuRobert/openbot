import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DURATION, events, targets, stateAt, happened, draftAt} from '../src/flow/timeline.ts';

assert.equal(DURATION, 3600);
assert.ok(events.length >= 30, 'The film must show actual navigation, not canvas swaps');
for (let i = 0; i < events.length; i++) {
  const event = events[i];
  assert.ok(event.at > (events[i-1]?.at ?? 0));
  assert.ok(event.at < DURATION);
  const [x, y] = targets[event.target];
  assert.ok(x > 0 && x < 1440 && y > 0 && y < 890);
  if (event.thread) {
    assert.equal(stateAt(event.at).thread, event.thread);
    assert.notEqual(stateAt(event.at-1).thread, event.thread);
  }
  if (event.panel !== undefined) {
    assert.equal(stateAt(event.at).panel, event.panel);
    assert.notEqual(stateAt(event.at-1).panel, event.panel);
  }
  if (event.action) {
    assert.equal(happened(event.at-1,event.action), false);
    assert.equal(happened(event.at,event.action), true);
  }
}
assert.ok(draftAt(299).includes('launch notes'));
assert.equal(draftAt(300), '');
assert.equal(stateAt(1259).approved, false);
assert.equal(stateAt(1260).approved, true);
assert.equal(stateAt(2170).routineSaved, true);
assert.equal(stateAt(2640).aiSaved, true);
assert.equal(stateAt(3069).created, false);
assert.equal(stateAt(3070).created, true);
assert.equal(stateAt(3070).thread, 'Iris');
assert.equal(stateAt(3599).panel, null);
assert.ok(stateAt(3599).routineSaved && stateAt(3599).aiSaved && stateAt(3599).created);
const launch = readFileSync('src/LaunchFilm.tsx','utf8');
const active = launch.slice(launch.indexOf('export function LaunchFilm'),launch.indexOf('export function AnimatedStory'));
assert.match(active, /<FlowFilm\s*\/>/);
assert.doesNotMatch(active, /AnimatedStory|ActualStudioFilm/);
for (const name of ['FlowFilm','FlowWindow','FlowPanels','FlowConversation']) {
  const source = readFileSync(`src/flow/${name}.tsx`, 'utf8');
  assert.doesNotMatch(source, /actual-ui\/|setInterval|setTimeout|Math.random/);
}
const panels = new Set(events.map(e => e.panel).filter(Boolean));
console.log(`Flow timeline passed: ${events.length} synchronized clicks, ${panels.size} panel routes, persistent results, 3600 frames.`);
