import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Temporal } from "@js-temporal/polyfill";
import { calendarKeyDate, calendarMonthDays } from "../shared/calendar-grid";

export function ScheduleCalendar({ today, selectedDate, repeatingDays = [], onSelect }: {
  today: string; selectedDate?: string; repeatingDays?: number[]; onSelect?: (date: string) => void;
}) {
  const [month, setMonth] = useState((selectedDate || today).slice(0, 7) + "-01");
  const [focusDate, setFocusDate] = useState(selectedDate || today);
  const focusPending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const heading = useId();
  const days = calendarMonthDays(month);
  useEffect(() => {
    if (focusPending.current) { root.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus(); focusPending.current = false; }
  }, [focusDate, month]);
  useEffect(() => { if (selectedDate) { setMonth(selectedDate.slice(0, 7) + "-01"); setFocusDate(selectedDate); } }, [selectedDate]);
  const moveMonth = (offset: number) => {
    const next = Temporal.PlainDate.from(month).add({ months: offset });
    setMonth(next.toString()); setFocusDate(next.toString());
  };
  return <div className="schedule-calendar" ref={root}>
    <header><h4 id={heading} aria-live="polite">{Temporal.PlainDate.from(month).toLocaleString(undefined, { month: "long", year: "numeric" })}</h4>
      <button type="button" className="calendar-today" onClick={() => { setMonth(today.slice(0, 7) + "-01"); setFocusDate(today); }}>Today</button>
      <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
      <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
    </header>
    <table aria-labelledby={heading} role={onSelect ? "grid" : undefined}>
      <thead><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <th key={day} scope="col"><abbr title={day}>{day.slice(0, 1)}</abbr></th>)}</tr></thead>
      <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((date) => {
        const iso = date.toString(), outside = iso.slice(0, 7) !== month.slice(0, 7);
        const selected = iso === selectedDate, repeats = repeatingDays.includes(date.dayOfWeek);
        const label = date.toLocaleString(undefined, { dateStyle: "full" });
        return <td key={iso} aria-selected={onSelect ? selected : undefined} className={`${outside ? "outside" : ""} ${selected ? "picked" : ""} ${iso === today ? "today" : ""} ${repeats ? "repeats" : ""}`}>
          {onSelect ? <button type="button" data-date={iso} tabIndex={focusDate === iso ? 0 : -1} aria-label={label} aria-current={iso === today ? "date" : undefined}
            onClick={() => onSelect(iso)} onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
              event.preventDefault();
              const next = calendarKeyDate(iso, event.key);
              if (next === iso) return;
              focusPending.current = true; setFocusDate(next);
              if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(next.slice(0, 7) + "-01");
            }}>{date.day}</button> : <span aria-label={`${label}${repeats ? ", repeating day" : ""}`} aria-current={iso === today ? "date" : undefined}>{date.day}<i aria-hidden="true" /></span>}
        </td>;
      })}</tr>)}</tbody>
    </table>
    <p className="calendar-caption">{onSelect ? "Choose a date for this one-time task." : "Dots show the weekdays this task repeats."}</p>
  </div>;
}
