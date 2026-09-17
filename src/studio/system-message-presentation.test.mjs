import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroupMembershipNotice } from './system-message-presentation.mjs';

test('ordinary prose mentioning joined is not a membership event', () => {
  for (const body of [
    'Nothing was posted, joined or changed. Here is your draft.',
    'I joined the group.',
    'We joined the group.',
    'Pixel joined the group. Here is a complete report.',
    'The total now has a different value in it.',
    'Done — [draft.md](draft.md). Nothing was posted or joined.',
    'Pixel joined the group.\n\nPlease read the report below.',
    '', null, undefined
  ]) assert.equal(isGroupMembershipNotice(body), false, String(body));
});

test('bounded canonical system notices remain recognizable', () => {
  for (const body of [
    'Pixel joined the group.', 'Scout left the group.',
    'The group "Launch" is ready.',
    'The group "Launch" now has Pixel and Scout in it.'
  ]) assert.equal(isGroupMembershipNotice(body), true, body);
});
