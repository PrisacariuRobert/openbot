import type { NextFunction, Request, Response } from "express";
import { ownerFixForToolError, ownerSentence } from "../shared/failure-fixes.js";
import type { OpenBotDatabase } from "./database.js";

/** Task J6. When a teammate's tool call fails for a reason only the owner can fix
 * (a macOS permission, Files & apps turned off, no browser, an app to reconnect),
 * the conversation says so in one note with the fix, whatever the teammate's reply
 * says. Only calls the tool route has already checked (run token, teammate, active
 * run) are noted: the route marks them in response.locals.toolCall. One note per
 * task and fix. A note is not an action: it changes nothing until the owner clicks. */

export type ToolCallMark = { runId: string; botId: string };
type Db = Pick<OpenBotDatabase, "getRun" | "addMessage" | "messagesForRunEvent">;

export function noteToolFailure(db: Db, call: ToolCallMark, error: string): boolean {
  const fix = ownerFixForToolError(error);
  if (!fix) return false;
  const run = db.getRun(call.runId);
  if (!run || run.botId !== call.botId) return false;
  if (db.messagesForRunEvent(run.id, "needs_fix").some((message) => message.eventData?.fix === fix.id)) return false;
  db.addMessage({
    threadId: run.threadId, senderType: "system", senderId: null, runId: run.id, kind: "event", eventType: "needs_fix",
    body: `${run.botName}: ${ownerSentence(error)}`,
    eventData: { title: fix.title, botId: run.botId, fix: fix.id },
  });
  return true;
}

/** Express middleware for the tool route: watches its error replies. */
export function noteFixableToolFailures(db: Db, onChange: () => void) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const json = response.json.bind(response);
    response.json = ((body: unknown) => {
      const call = response.locals.toolCall as ToolCallMark | undefined;
      const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      if (call && response.statusCode >= 400 && typeof error === "string") {
        try { if (noteToolFailure(db, call, error)) onChange(); } catch { /* A note never changes the tool's answer. */ }
      }
      return json(body);
    }) as Response["json"];
    next();
  };
}
