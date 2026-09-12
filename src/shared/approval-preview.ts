import type { Approval, Run } from "./types";
import { taskTokenRequestSchema, type TaskTokenReview } from "./task-token-budget";
import { codePublicationReviewSchema } from "./code-publication";
import { authoredSkillSchema } from "./skill-authoring";
import { gmailReplyReviewSchema } from "./gmail-reply";
import { browserControlApprovalSchema, type BrowserNavigationAllowanceOffer } from "./browser-control-review";
import { signInOrigin, type BrowserSignInHandoff } from "./browser-sign-in";

export interface ApprovalPreview {
  approvalId: string;
  runId: string;
  status: Approval["status"];
  actionLabel: string;
  reason: string;
  canApprove: boolean;
  limitation: string | null;
  fields: Array<{ label: string; value: string }>;
  /** Opaque server-issued binding; missing on older hosts means no approval. */
  reviewFingerprint: string | null;
  browserSignIn?: BrowserSignInHandoff;
  browserNavigationAllowance?: BrowserNavigationAllowanceOffer;
  taskTokens?: TaskTokenReview;
}

/** Never serialize stored action objects. Only the operation's explicit,
 * user-reviewable fields leave the server. Common credential formats inside
 * content are masked; any masking disables approval in this compact view.
 */
export function approvalPreview(
  approval: Approval,
  run: Pick<Run, "id" | "botId" | "prompt"> | null,
  action: unknown,
  accountLabel?: string | null,
  taskTokens?: TaskTokenReview | null,
): ApprovalPreview {
  let incomplete = false;
  function visible(value: string): string {
    if (value.length > 30_000) {
      incomplete = true;
      return "This content is too large for this review.";
    }
    const masked = value
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
        "[Private key hidden]",
      )
      .replace(
        /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]+)\b/gi,
        "[Credential hidden]",
      )
      .replace(
        /((?:password|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1[Credential hidden]",
      );
    if (masked !== value) incomplete = true;
    return masked;
  }
  const preview: ApprovalPreview = {
    approvalId: approval.id,
    runId: approval.runId,
    status: approval.status,
    actionLabel: visible(approval.actionLabel),
    reason: visible(approval.reason),
    canApprove: false,
    limitation: null,
    fields: [],
    reviewFingerprint: null,
  };
  const object =
    action && typeof action === "object" && !Array.isArray(action)
      ? (action as Record<string, unknown>)
      : {};
  const args =
    object.args &&
    typeof object.args === "object" &&
    !Array.isArray(object.args)
      ? (object.args as Record<string, unknown>)
      : {};
  const field = (key: string, label: string, required = false) => {
    const value = args[key];
    if (value === undefined && !required) {
      preview.fields.push({ label, value: "None" });
      return;
    }
    if (typeof value !== "string") {
      incomplete = true;
      return;
    }
    preview.fields.push({ label, value: visible(value) || "Empty" });
  };
  const boundedText = (key: string, label: string, maximum: number, required = false, nullable = false, absent = "None") => {
    const value = args[key];
    if (!required && (value === undefined || (nullable && value === null))) {
      preview.fields.push({ label, value: absent });
      return;
    }
    if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) {
      incomplete = true;
      return;
    }
    preview.fields.push({ label, value: value.trim() ? visible(value) : absent });
  };
  let supported = true;
  if (
    !run ||
    run.id !== approval.runId ||
    run.botId !== approval.botId ||
    (object.type !== "run" && object.botId !== approval.botId)
  )
    supported = false;
  else if (object.type === "run" && approval.kind === "prompt") {
    preview.fields.push({ label: "Task to start", value: visible(run.prompt) });
  } else if (object.type === "task_tokens" && approval.kind === "budget") {
    if (!taskTokenRequestSchema.safeParse(object).success || !taskTokens) incomplete = true;
    else {
      preview.taskTokens = taskTokens;
      preview.actionLabel = `Allow ${taskTokens.additionalTokens.toLocaleString()} more tokens`;
      preview.fields.push(
        { label: "Used by this task", value: `${taskTokens.usedTokens.toLocaleString()} reported tokens, including teammate work` },
        { label: "Current task allowance", value: `${taskTokens.currentJobLimit.toLocaleString()} tokens` },
        { label: "New total allowance", value: `${taskTokens.newJobLimit.toLocaleString()} tokens` },
        { label: "Models", value: taskTokens.models.join("\n") },
        { label: "What happens next", value: "Resume saved progress on this task only. Completed actions are not repeated. Pending actions require fresh review." },
        { label: "What stays unchanged", value: "Your model, provider, weekly allowance, time and step limits, and action permissions. This does not purchase tokens or reset a provider subscription. Provider charges and limits still apply; token reports can arrive after a model step has already run." },
      );
    }
  } else if (object.type === "browser_sign_in" && approval.kind === "browser") {
    try {
      const siteOrigin = signInOrigin(String(args.siteOrigin || ""));
      const rawEvidence = (args as Record<string, unknown>).evidence as { source?: unknown; observedUrl?: unknown; observedText?: unknown } | null | undefined;
      const evidenceOk = rawEvidence == null || (typeof rawEvidence === "object" &&
        (rawEvidence.source === "host" || rawEvidence.source === "teammate") &&
        (rawEvidence.observedUrl === undefined || typeof rawEvidence.observedUrl === "string") &&
        (rawEvidence.observedText === undefined || typeof rawEvidence.observedText === "string"));
      if (siteOrigin !== args.siteOrigin || Object.keys(args).some((key) => key !== "siteOrigin" && key !== "evidence") || !evidenceOk) incomplete = true;
      preview.browserSignIn = { botId: approval.botId, siteOrigin };
      const seen = rawEvidence && typeof rawEvidence === "object"
        ? [rawEvidence.observedUrl, rawEvidence.observedText].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ")
        : "";
      const seenBy = rawEvidence && typeof rawEvidence === "object" && rawEvidence.source === "host" ? "Host check" : "Teammate";
      preview.fields.push({ label: "Website requesting your help", value: siteOrigin },
        { label: "Private browser", value: `${approval.botName}’s browser only. Other teammates do not receive this login.` },
        { label: "What was seen", value: seen ? visible(`${seenBy}: ${seen}`.slice(0, 300)) : "No login wall was cited. Check the page yourself before signing in." },
        { label: "After you continue", value: "Resume your saved task and check the page and account. This does not approve sending, publishing, deleting or purchases." });
    } catch { incomplete = true; }
  } else if ((object.type === "browser_click" || object.type === "browser_type") && approval.kind === "browser") {
    const parsed = browserControlApprovalSchema.safeParse(args);
    if (!parsed.success || (object.type === "browser_type" && (typeof args.value !== "string" || args.navigationAllowanceOffer !== undefined)) || (object.type === "browser_click" && args.value !== undefined)) incomplete = true;
    else {
      const target = parsed.data.targetReview;
      if (object.type === "browser_click" && parsed.data.navigationAllowanceOffer) preview.browserNavigationAllowance = parsed.data.navigationAllowanceOffer;
      preview.actionLabel = visible(`${object.type === "browser_click" ? "Click" : "Enter text in"} “${target.label}” on ${new URL(target.url).hostname}`);
      preview.fields.push({ label: "Website", value: visible(target.url) }, { label: "Private browser", value: `${approval.botName}’s existing profile. The website—not an API connection—determines the signed-in account.` }, { label: "Control", value: visible(`${target.label} (${target.control})`) });
      if (object.type === "browser_click" && target.disclosure) preview.fields.push({
        label: "Page state",
        value: "The website describes this as collapsed content. That description does not prove the click is read-only.",
      });
      if (object.type === "browser_click" && target.contextScope === "navigation") preview.fields.push({
        label: "Review scope",
        value: "Visible fields in this navigation area only. Unrelated page content is excluded; this click may still affect it.",
      });
      if (object.type === "browser_type") field("value", "Exact text to enter", true);
      for (const item of target.fields) preview.fields.push({ label: visible(`On the page: ${item.label}`), value: visible(item.value) || "Empty" });
      preview.fields.push({ label: "Effect", value: object.type === "browser_click" ? target.contextScope === "navigation"
        ? "Click this exact control once. It may run website code or affect content outside this navigation area. The URL, control and displayed navigation fields are checked again; excluded page content is not. This does not approve later clicks."
        : target.disclosure
        ? "Click this exact control once. It may still run website code, navigate, or change data. The page and control are checked again first; a change requires fresh review. Later clicks need separate review."
        : "Click this one control. It may submit these visible form values or change information. Review the page in Agent Computer when needed. The page, control and visible field values are checked again before the click; a change requires a fresh review. This does not approve later clicks."
        : "Replace this field with the exact text shown. Websites may autosave typed content. The page and visible field values are checked again before typing. This does not approve a later send or submit." });
    }
  } else if (object.type === "gmail_reply") {
    if (!gmailReplyReviewSchema.safeParse(args).success || args.account !== accountLabel?.toLowerCase()) incomplete = true;
    field("from", "Original sender", true);
    field("sourcePreview", "Original message excerpt", true);
    field("to", "Reply to", true);
    field("subject", "Subject", true);
    field("body", "Your reply", true);
    field("threadId", "Gmail conversation", true);
    preview.fields.push({ label: "Effect", value: "Send one plain-text reply in the original conversation. The recipient follows the original message's Reply-To header when present. This is not reply-all: no Cc, Bcc or attachments. OpenBot checks for intervening messages before sending, then checks the sent copy. It will not resend automatically if the result is uncertain." });
  } else if (object.type === "gmail_send") {
    field("to", "To", true);
    field("cc", "Cc");
    field("subject", "Subject", true);
    field("body", "Message", true);
    // buildRawEmail currently supports exactly these four message inputs. It
    // creates a new plain-text message, never Bcc, attachments or reply headers.
    preview.fields.push({
      label: "Email format",
      value: "New plain-text message. No Bcc, attachments or reply headers.",
    });
    if (
      typeof args.subject === "string" &&
      (args.subject.length > 200 || /[\r\n]/.test(args.subject))
    )
      incomplete = true;
  } else if (object.type === "google_drive_create") {
    field("name", "File name", true);
    field("content", "File content", true);
    preview.fields.push({
      label: "Format",
      value: args.mimeType === "text/markdown" ? "Markdown" : "Plain text",
    });
  } else if (object.type === "slack_post") {
    field("channelId", "Channel ID", true);
    field("threadTimestamp", "Reply to thread");
    field("text", "Message", true);
  } else if (object.type === "github_issue_create") {
    const identity = args.publicationIdentity && typeof args.publicationIdentity === "object" && !Array.isArray(args.publicationIdentity) ? args.publicationIdentity as Record<string, unknown> : {};
    if (typeof identity.host !== "string" || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(identity.host) || typeof identity.accountLogin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(identity.accountLogin) || identity.accountLogin.toLowerCase() !== accountLabel?.toLowerCase()) incomplete = true;
    preview.fields.push({ label: "GitHub host", value: typeof identity.host === "string" ? visible(identity.host) : "Unavailable" });
    field("repository", "Repository", true);
    field("title", "Issue title", true);
    field("body", "Issue description", true);
  } else if (object.type === "code_publish_pr") {
    const parsed = codePublicationReviewSchema.safeParse(args.publicationReview);
    const identity = args.publicationIdentity && typeof args.publicationIdentity === "object" && !Array.isArray(args.publicationIdentity) ? args.publicationIdentity as Record<string, unknown> : {};
    if (!parsed.success || identity.host !== "github.com" || typeof identity.accountLogin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(identity.accountLogin) || identity.accountLogin.toLowerCase() !== accountLabel?.toLowerCase()) incomplete = true;
    if (parsed.success) {
      const snapshot = parsed.data;
      if (snapshot.runId !== approval.runId || snapshot.botId !== approval.botId || snapshot.projectId !== args.projectId || snapshot.runId !== args.workspaceRunId || snapshot.headCommit !== args.expectedHeadCommit || snapshot.title !== args.title || snapshot.body !== args.body || snapshot.base !== args.base || snapshot.draft !== args.draft || snapshot.remoteUrl !== `https://github.com/${snapshot.repository}.git` || snapshot.commits.at(-1) !== snapshot.headCommit || snapshot.review.headCommit !== snapshot.headCommit || snapshot.checks.some((check) => check.headCommit !== snapshot.headCommit) || !snapshot.grant.canWrite || !snapshot.grant.canRun || snapshot.review.reviewerBotId === snapshot.botId) incomplete = true;
      const show = (label: string, value: string) => preview.fields.push({ label, value: visible(value) });
      show("GitHub host", String(identity.host || "Unavailable"));
      show("Repository", `https://github.com/${snapshot.repository}`);
      show("Project", snapshot.projectName);
      show("Publish branch", snapshot.branch);
      show("Into branch", snapshot.base);
      show("Exact code commit", snapshot.headCommit);
      show("Required base commit", snapshot.baseCommit);
      show("Pull request title", snapshot.title);
      show("Pull request description", snapshot.body);
      show("Pull request state", snapshot.draft ? "Draft" : "Ready for review");
      show("Files in outgoing history", snapshot.files.join("\n"));
      show("Commits to upload", snapshot.commits.join("\n"));
      show("Complete outgoing patch history", snapshot.diff);
      for (const [index, check] of snapshot.checks.entries()) {
        show(`Check ${index + 1}`, `${check.command}\nExit: ${check.exitCode}\nFinished: ${check.finishedAt}\n${check.detail}`);
      }
      show("Independent reviewer", snapshot.review.reviewerBotName);
      show("Review of this commit", `${snapshot.review.summary}\nReviewed: ${snapshot.review.createdAt}`);
      show("Review findings", snapshot.review.findings.join("\n") || "No findings recorded");
      show("Access", "This teammate has project read, write and command access. The independent reviewer has project read access. Both permissions are checked again before publishing.");
      show("Effect", "Upload this exact commit to a new branch and create one pull request. Existing branches and pull requests are not updated. OpenBot does not merge or deploy; the repository's own automations may run. GitHub readback must confirm the result; uncertain writes are not automatically retried.");
    }
  } else if (object.type === "notion_update") {
    boundedText("pageId", "Page ID or link", 200, true);
    boundedText("heading", "Heading", 200, false, true);
    boundedText("content", "Content to append", 8_000, true);
    preview.fields.push({ label: "Change", value: "Append plain-text paragraphs and the optional heading to this page. Existing content is not replaced." });
  } else if (object.type === "todoist_task_create") {
    boundedText("content", "Task title", 500, true);
    boundedText("description", "Description", 4_000);
    boundedText("projectId", "Project ID", 200, false, false, "No project specified; Todoist uses its default inbox.");
    boundedText("dueString", "Due-date phrase", 200);
    if (args.priority !== undefined && (typeof args.priority !== "number" || !Number.isInteger(args.priority) || args.priority < 1 || args.priority > 4)) incomplete = true;
    else preview.fields.push({ label: "Priority", value: args.priority === undefined ? "Todoist default (normal)" : `${args.priority} — ${["Normal", "Medium", "High", "Urgent"][args.priority - 1]}` });
    preview.fields.push({ label: "Date interpretation", value: "Todoist interprets the due-date phrase using the connected account's settings. This review does not convert it into a verified date or time." });
  } else if (object.type === "skill_propose") {
    if (!authoredSkillSchema.safeParse(args).success) incomplete = true;
    field("name", "Skill name", true);
    field("description", "When to use it", true);
    field("instructions", "Instructions to save", true);
    if (args.startUrl) field("startUrl", "Starting website", true);
    preview.fields.push({ label: "Effect", value: "Save these instructions as a new draft skill for this teammate, available to both supported runtimes. Existing skills are not replaced. Nothing is run or scheduled; permissions do not change. Two distinct supervised checks are required before scheduling. You can edit or delete the skill in Skills." });
  } else if (object.type === "self_extend") {
    field("capability", "Missing capability", true);
    field("plan", "Plan for the new tool", true);
    field("toolName", "New tool file", true);
    preview.fields.push({ label: "Effect", value: "Approving restarts this same task with the studio's coding model and lets the teammate write exactly one new tool file in its own private workspace. The tool is self-contained and runs in OpenBot's control. Review or delete the file in Files any time." });
  } else if (object.type === "mac_organize") {    preview.fields.push({ label: "Computer", value: "The Mac running this OpenBot studio" });
    preview.fields.push({ label: "Path base", value: "Relative paths and ~/ start in the host user's home folder. Absolute paths are shown exactly as requested." });
    const moves = args.moves;
    if (!Array.isArray(moves) || moves.length < 1 || moves.length > 100) incomplete = true;
    else {
      for (const [index, move] of moves.entries()) {
        if (!move || typeof move !== "object" || Array.isArray(move)) { incomplete = true; continue; }
        const pair = move as Record<string, unknown>;
        for (const [key, label] of [["from", "From"], ["to", "To"]] as const) {
          const value = pair[key];
          if (typeof value !== "string" || !value.trim() || value.length > 1_000 || /[\u0000-\u001f\u007f]/.test(value)) { incomplete = true; continue; }
          preview.fields.push({ label: `File ${index + 1} · ${label}`, value: visible(value) });
        }
      }
    }
    preview.fields.push({ label: "Effect", value: "Move the listed regular files on the same filesystem and create missing destination folders. Existing destination files are never replaced. File access is checked again before execution. If a batch stops partway, completed moves remain in place and unfinished work needs a fresh review; it is not automatically replayed." });
  } else if (object.type === "google_calendar_create") {
    field("title", "Title", true);
    field("start", "Start (including offset)", true);
    field("end", "End (including offset)", true);
    field("description", "Description");
    field("location", "Location");
    if (
      args.attendees !== undefined &&
      (!Array.isArray(args.attendees) ||
        !args.attendees.every((value) => typeof value === "string"))
    )
      incomplete = true;
    else
      preview.fields.push({
        label: "Invitees",
        value: visible(
          (args.attendees as string[] | undefined)?.join("\n") || "None",
        ),
      });
    preview.fields.push({
      label: "Google Meet link",
      value: args.addGoogleMeet === true ? "Create" : "No",
    });
    preview.fields.push({
      label: "Calendar",
      value: "Primary calendar of the connected Google account",
    });
    preview.fields.push({
      label: "Invitations",
      value:
        Array.isArray(args.attendees) &&
        args.attendees.some(
          (value) => typeof value === "string" && value.trim(),
        )
          ? "Send invitations to all listed invitees"
          : "No invitations",
    });
    // Without an offset the executor's Date parsing depends on the host zone.
    // A compact review must not pretend such a time is unambiguous.
    for (const key of ["start", "end"]) {
      const value = args[key];
      if (
        typeof value !== "string" ||
        !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
        !Number.isFinite(Date.parse(value))
      )
        incomplete = true;
    }
  } else supported = false;
  if (supported && object.type !== "task_tokens" && object.type !== "run" && object.type !== "mac_organize" && object.type !== "browser_sign_in" && object.type !== "browser_click" && object.type !== "browser_type" && object.type !== "self_extend" && object.type !== "skill_propose") {
    if (!accountLabel?.trim()) incomplete = true;
    preview.fields.unshift({
      label: "Connected account",
      value: accountLabel
        ? visible(accountLabel)
        : "Account identity is unavailable. Check the connection before asking for a new proposal.",
    });
  }
  if (!supported) {
    preview.fields = [];
    preview.limitation =
      "This action does not have a complete in-app review yet and cannot be approved here. Decline it, then ask for a supported action or complete the step yourself.";
  } else if (incomplete)
    preview.limitation =
      "Some content is hidden or could not be shown completely. Approval is unavailable. Decline this proposal and ask for a smaller, non-sensitive proposal with complete details, or complete the step yourself.";
  else if (approval.status !== "pending")
    preview.limitation = "This decision has already been recorded.";
  preview.canApprove =
    supported && !incomplete && approval.status === "pending";
  if (taskTokens?.limitation) { preview.canApprove = false; preview.limitation = taskTokens.limitation; }
  return preview;
}
