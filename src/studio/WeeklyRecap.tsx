import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import type { Bot } from "../shared/types";
import { duration, type WeeklyRecap } from "../shared/weekly-recap";
import "./weekly-recap.css";

/** A quiet row above the chat list, and a sheet that looks back at the week.
 * Everything in it comes from tasks that really finished. */
export function WeeklyRecapEntry({ recap, bots, face }: { recap: WeeklyRecap | null | undefined; bots: Bot[]; face: (bot: Bot, size: number) => ReactNode }) {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("recap") === "week");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("recap")) { params.delete("recap"); history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`); }
  }, []);
  if (!recap) return open ? <RecapSheet recap={null} bots={bots} face={face} onClose={() => setOpen(false)} /> : null;
  return <>
    <button type="button" className="weekly-recap-row" onClick={() => setOpen(true)}>
      <span className="weekly-recap-icon" aria-hidden="true"><Sparkles size={15} /></span>
      <span><strong>Your week</strong><small>{recap.finished === 1 ? "1 thing done" : `${recap.finished} things done`}{recap.workedMs >= 60_000 ? ` · ${duration(recap.workedMs)} of work` : ""}</small></span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>
    {open && <RecapSheet recap={recap} bots={bots} face={face} onClose={() => setOpen(false)} />}
  </>;
}

function RecapSheet({ recap, bots, face, onClose }: { recap: WeeklyRecap | null; bots: Bot[]; face: (bot: Bot, size: number) => ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  const helpers = (recap?.teammates || []).map((entry) => ({ entry, bot: bots.find((bot) => bot.id === entry.botId) })).filter((item): item is { entry: WeeklyRecap["teammates"][number]; bot: Bot } => Boolean(item.bot));
  return <dialog ref={dialog} className="weekly-recap-sheet" aria-labelledby="weekly-recap-title" onCancel={close} onClick={(event) => { if (event.target === dialog.current) close(); }}>
    <div className="weekly-recap-faces" aria-hidden="true">{helpers.slice(0, 3).map(({ bot }) => <span key={bot.id}>{face(bot, 46)}</span>)}</div>
    <p className="weekly-recap-overline">THE LAST 7 DAYS</p>
    <h2 id="weekly-recap-title" tabIndex={-1} autoFocus>Your week with your team</h2>
    {recap ? <>
      <div className="weekly-recap-stats">
        <div><strong>{recap.finished}</strong><span>{recap.finished === 1 ? "thing done" : "things done"}</span></div>
        {recap.workedMs >= 60_000 && <div><strong>{duration(recap.workedMs)}</strong><span>of work, not yours</span></div>}
      </div>
      <p className="weekly-recap-detail">{recap.detail}</p>
      {recap.highlights.length > 0 && <>
        <h3>Highlights</h3>
        <ul className="weekly-recap-highlights">{recap.highlights.map((item) => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul>
      </>}
      {helpers.length > 1 && <ul className="weekly-recap-team">{helpers.map(({ entry, bot }) => <li key={bot.id}>{face(bot, 26)}<span>{bot.name}</span><b>{entry.finished}</b></li>)}</ul>}
    </> : <p className="weekly-recap-detail">Nothing finished in the last seven days yet. Give a teammate something small — it adds up.</p>}
    <button type="button" className="primary full-width weekly-recap-done" onClick={close}>Done</button>
  </dialog>;
}
