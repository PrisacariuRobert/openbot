/** Pure presentation rules. Never infer a system event from a word in prose. */
export function isGroupMembershipNotice(body) {
  if (typeof body !== 'string') return false;
  const text = body.trim().replace(/\*\*([^*]+)\*\*/g, '$1');
  if (!text || text.length > 320 || /[\r\n]/.test(text)) return false;
  if (/^(?:I|We|You|They|He|She)\b/i.test(text)) return false;
  return /^The group "[^"\r\n]{1,120}" (?:was created|is ready|now has [^.\r\n]{1,160} in it)\.?$/i.test(text)
    || /^[^.!?\r\n]{1,80} (?:joined|left) the group\.?$/i.test(text)
    || /^The group "[^"\r\n]{1,120}" (?:has been created|has been updated)\.?$/i.test(text);
}
