/** Internal teammate-created routines are drafts unless activation is explicit. */
export function internalRoutineEnabled(value: unknown): boolean {
  return value === true;
}
