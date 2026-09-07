import { useEffect, useId, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { RoutineSchedule } from "../shared/calendar-schedule";
import { onceAtLocal } from "../shared/calendar-grid";
import { ScheduleCalendar } from "./ScheduleCalendar";
import "./calendar-schedule.css";

type Preview = { label: string; nextRuns: string[]; descriptions: string[]; policy: string };
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function CalendarScheduleFields({ value, onChange, intervalMinutes, routineId, enabled, onValid, onLabel }: {
  value: RoutineSchedule; onChange: (value: RoutineSchedule) => void; intervalMinutes: number; routineId?: string; enabled: boolean;
  onValid: (valid: boolean) => void; onLabel: (label: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ source: string; local: string; error: string } | null>(null);
  const zoneList = useId();
  const source = JSON.stringify(value);
  const inputError = draft?.source === source ? draft.error : "";
  const request = JSON.stringify({ schedule: value, intervalMinutes, routineId });
  useEffect(() => {
    const abort = new AbortController();
    setPreview(null); setError(""); onValid(false); onLabel("");
    if (inputError) return;
    const timer = setTimeout(() => {
      void fetch("/api/routines/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: request, signal: abort.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not check this schedule."); return body as Preview; })
        .then((result) => {
          if (abort.signal.aborted) return;
          setPreview(result); onLabel(result.label); onValid(!enabled || result.nextRuns.length > 0);
          if (enabled && !result.nextRuns.length) setError("Choose a future date, or turn this routine off to save it as a draft.");
        }).catch((reason: unknown) => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not check this schedule."); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [request, enabled, inputError, onValid, onLabel]);
  const zone = value.kind === "interval" ? localZone() : value.timeZone;
  let today = Temporal.Now.plainDateISO().toString(), localOnce = "";
  try {
    today = Temporal.Now.plainDateISO(zone).toString();
    if (value.kind === "once") localOnce = Temporal.Instant.from(value.at).toZonedDateTimeISO(zone).toPlainDateTime().toString().slice(0, 16);
  } catch { /* Invalid zone remains editable and is rejected by the host preview. */ }
  if (draft?.source === source) localOnce = draft.local;
  const date = localOnce.slice(0, 10) || today;
  const time = value.kind === "calendar" ? value.time : localOnce ? localOnce.slice(11, 16) : "08:00";
  const updateOnce = (day: string, clock: string) => {
    if (value.kind !== "once") return;
    try { onChange({ ...value, at: onceAtLocal(day, clock, zone) }); setDraft(null); }
    catch { onValid(false); setDraft({ source, local: `${day}T${clock}`, error: "Choose another time. This clock time is missing or repeated when the clocks change, or the time zone is invalid." }); }
  };
  const repeat = value.kind !== "calendar" ? value.kind : value.daysOfWeek.join() === "1,2,3,4,5" ? "weekdays" : value.daysOfWeek.length === 7 ? "daily" : "custom";
  return <fieldset className="routine-fieldset calendar-schedule-fields">
    <legend>When should it run?</legend>
    <div className="schedule-control-row">
      <label>Repeat<select aria-label="Repeat" value={repeat} onChange={(event) => {
        setDraft(null);
        const kind = event.target.value;
        onChange(kind === "interval" ? { kind: "interval" } : kind === "once" ? { kind: "once", at: new Date(Date.now() + 3_600_000).toISOString(), timeZone: zone } : {
          kind: "calendar", time, timeZone: zone, daysOfWeek: kind === "daily" ? [1, 2, 3, 4, 5, 6, 7] : kind === "weekdays" ? [1, 2, 3, 4, 5] : [Temporal.PlainDate.from(today).dayOfWeek],
        });
      }}><option value="once">Never · just once</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="custom">Choose weekdays…</option><option value="interval">On an interval</option></select></label>
      {value.kind !== "interval" && <label>Time<input type="time" value={time} onChange={(event) => value.kind === "calendar" ? onChange({ ...value, time: event.target.value }) : updateOnce(date, event.target.value)} /></label>}
    </div>
    {repeat === "custom" && value.kind === "calendar" && <div className="calendar-days" role="group" aria-label="Days of the week">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => <button type="button" key={day} aria-pressed={value.daysOfWeek.includes(index + 1)} onClick={() => onChange({ ...value, daysOfWeek: value.daysOfWeek.includes(index + 1) ? value.daysOfWeek.filter((d) => d !== index + 1) : [...value.daysOfWeek, index + 1].sort() })}>{day}</button>)}
    </div>}
    {value.kind !== "interval" && <>
      <ScheduleCalendar key={value.kind} today={today} selectedDate={value.kind === "once" ? date : undefined} repeatingDays={value.kind === "calendar" ? value.daysOfWeek : undefined} onSelect={value.kind === "once" ? (day) => updateOnce(day, time) : undefined} />
      <details className="schedule-zone"><summary>{zone.replaceAll("_", " ")} time <span>Change</span></summary><label>Time zone<input value={value.timeZone} placeholder="Europe/Brussels" spellCheck={false} onChange={(event) => { setDraft(null); onChange({ ...value, timeZone: event.target.value }); }} list={zoneList} /><datalist id={zoneList}>{[...new Set([localZone(), "UTC", "Europe/Brussels", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"])].map((item) => <option value={item} key={item} />)}</datalist></label></details>
    </>}
    <div className="schedule-preview" aria-live="polite">
      {inputError || error ? <p className="routine-error">{inputError || error}</p> : preview ? <><strong>{enabled ? "Next run" : "Preview · paused"}</strong><p>{preview.descriptions[0] || "No upcoming runs"}</p>{preview.descriptions.length > 1 && <details><summary>Following runs</summary><ol>{preview.descriptions.slice(1).map((at, index) => <li key={preview.nextRuns[index + 1]}>{at}</li>)}</ol></details>}</> : <p>Checking the next run times…</p>}
      <small>{preview?.policy || "The schedule stays in its saved time zone, even when you travel."}</small>
    </div>
  </fieldset>;
}
