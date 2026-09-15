import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, Monitor, ShieldQuestion } from "lucide-react";
import type { AppState, Bot, Run } from "../shared/types";
import { Character } from "./Character";
import { BrowserAccessCard } from "./BrowserAccessCard";
import { ChoiceMenu } from "./ChoiceMenu";
import { LiveComputer } from "./LiveComputer";
import { orderContextRuns } from "./context-runs";

const statusText = (status: Bot["status"]) =>
  status === "working" ? "Working now" : status === "waiting" ? "Waiting for you" : "Ready";

export function ConversationContext({
  state,
  bot,
  threadId,
  onRun,
  onSchedule,
  onTakeover,
  onEditGroup,
  yoloMode,
  safetyBusy,
  onToggleSafety,
}: {
  state: AppState;
  bot?: Bot;
  threadId: string;
  onRun: (run: Run) => void;
  onSchedule: () => void;
  onTakeover?: (bot: Bot) => void;
  onEditGroup?: () => void;
  yoloMode?: boolean;
  safetyBusy?: boolean;
  onToggleSafety?: () => void;
}) {
  const [chosen, setChosen] = useState(bot?.id || "");
  const selected = bot || state.bots.find((item) => item.id === chosen);
  const group = !selected ? state.threads.find((thread) => thread.id === threadId && thread.botIds?.length) : undefined;
  const runs = orderContextRuns(Array.from(new Map(
    [...state.studioRuns, ...state.runs]
      .filter((run) => !run.parentRunId && (selected ? run.botId === selected.id : run.threadId === threadId))
      .map((run) => [run.id, run] as const),
  ).values()));
  const activeRuns = runs.filter((run) => ["queued", "running", "awaiting_approval", "waiting_for_teammate"].includes(run.status));
  const currentRuns = activeRuns.length ? activeRuns : runs.slice(0, 1);
  const olderRuns = runs.filter((run) => !currentRuns.some((current) => current.id === run.id));
  const routines = state.routines.filter((routine) =>
    selected ? routine.botId === selected.id : routine.threadId === threadId,
  );

  return (
    <div className="conversation-context-content">
      {!bot && (
        <div className="context-picker">
          <span>Show me</span>
          <ChoiceMenu
            label="Whose work?"
            value={chosen}
            onChange={setChosen}
            choices={[
              { value: "", label: "The whole conversation" },
              ...state.bots.map((item) => ({
                value: item.id,
                label: item.name,
                detail: item.role,
                icon: <Character name={item.name} color={item.color} variant={item.mascot} size={26} />,
              })),
            ]}
          />
        </div>
      )}

      {group && onEditGroup && (
        <div className="context-group">
          <span>
            <small>People in this room</small>
            <strong>{group.botIds?.map((id) => state.bots.find((member) => member.id === id)?.name).filter(Boolean).join(" · ")}</strong>
          </span>
          <button className="text-action" onClick={onEditGroup}>
            Change people <ArrowRight size={13} />
          </button>
        </div>
      )}

      {selected && (
        <div className="context-person">
          <Character
            name={selected.name}
            variant={selected.mascot}
            color={selected.color}
            status={selected.status}
            size={52}
          />
          <div>
            <strong>{selected.name}</strong>
            <p>{selected.role}</p>
            <small>{statusText(selected.status)}</small>
          </div>
        </div>
      )}

      <section className="context-now" aria-label="Work">
        <div className="section-heading">
          <h3>{activeRuns.length ? "Right now" : "Latest work"}</h3>
        </div>
        {currentRuns.length ? (
          <>
            {currentRuns.map((run) => (
              <button
                className="context-work"
                key={run.id}
                title={run.task?.goal || run.prompt}
                aria-label={`Work: ${run.task?.goal || run.prompt}`}
                onClick={() => onRun(run)}
              >
                <strong>{run.task?.goal || run.prompt}</strong>
                <small>
                  {run.status === "awaiting_approval"
                    ? "Needs you to review something"
                    : run.status === "completed"
                      ? "Finished"
                      : run.status === "waiting_for_teammate"
                        ? "Checking with the team"
                        : run.status === "queued"
                          ? "Up next"
                          : "Working"}
                </small>
                <ArrowRight size={13} />
              </button>
            ))}
            {olderRuns.length > 0 && (
              <details className="context-work-history">
                <summary>Earlier work ({olderRuns.length})</summary>
                {olderRuns.map((run) => (
                  <button
                    className="context-work"
                    key={run.id}
                    title={run.task?.goal || run.prompt}
                    aria-label={`Work: ${run.task?.goal || run.prompt}`}
                    onClick={() => onRun(run)}
                  >
                    <strong>{run.task?.goal || run.prompt}</strong>
                    <small>{run.status === "failed" ? "Needs attention" : run.status === "completed" ? "Finished" : run.status}</small>
                    <ArrowRight size={13} />
                  </button>
                ))}
              </details>
            )}
          </>
        ) : (
          <p className="quiet-copy">When work starts, its progress and result will appear here.</p>
        )}
      </section>

      {selected && (
        <details className="context-capabilities">
          <summary>
            <span><Monitor size={15} /> Computer & web</span>
            <span className="context-summary-note">Watch or help when needed</span>
            <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <div className="context-capabilities-body">
            <LiveComputer bot={selected} threadId={selected.threadId} onTakeover={onTakeover} />
            <BrowserAccessCard bot={selected} onTakeover={onTakeover} />
          </div>
        </details>
      )}

      <section aria-label="Routines">
        <div className="section-heading">
          <h3><CalendarDays size={15} /> Scheduled</h3>
          <button onClick={onSchedule}>
            See schedule <ArrowRight size={13} />
          </button>
        </div>
        {routines.length ? (
          routines.map((routine) => (
            <button key={routine.id} className="context-work" onClick={onSchedule}>
              <strong>{routine.name}</strong>
              <small>
                {!routine.enabled
                  ? "Paused"
                  : routine.nextRunAt
                    ? `Next ${new Date(routine.nextRunAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
                    : "Waiting for its trigger"}
              </small>
              <ArrowRight size={13} />
            </button>
          ))
        ) : (
          <p className="quiet-copy">Nothing repeats from this conversation yet. You can create one just by asking in chat.</p>
        )}
      </section>

      {onToggleSafety && (
        <section className="safety-card" aria-label="Safety">
          <div className="section-heading">
            <h3>Before important actions</h3>
          </div>
          <p>
            {yoloMode
              ? "Auto-approve is on. Sign-ins and new access still pause for you."
              : "Ask first is on. OpenBot can work, but sensitive actions wait for your review."}
          </p>
          <button
            type="button"
            className="safety-toggle"
            aria-pressed={yoloMode === true}
            disabled={safetyBusy}
            onClick={onToggleSafety}
          >
            <ShieldQuestion size={15} />
            {yoloMode ? "Auto-approve on" : "Ask first on"}
          </button>
        </section>
      )}
    </div>
  );
}
