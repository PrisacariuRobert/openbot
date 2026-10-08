import { randomUUID } from "node:crypto";
import {
  INSTALL_METHODS, SETUP_AI_KINDS, SETUP_MILESTONES, calendarDaysBetween, setupAiKind, setupCountsPayload,
  type InstallMethod, type SetupAiKind, type SetupCountsPayload, type SetupMilestoneName, type SetupTimelineView,
} from "../shared/setup-timeline.js";
import type { ProviderInstance } from "../shared/types.js";

/** Where anonymous setup counts would be sent. Null until the owner decides to
 * collect them, so nothing can be sent and the switch stays hidden. */
export const SETUP_COUNTS_ENDPOINT: string | null = null;

/** Times the studio's own records already prove (first start, first teammate, first answer, first job). */
export interface SetupMilestoneTimes {
  installedAt: string | null;
  firstTeammateAt: string | null;
  firstAnswerAt: string | null;
  firstJobAt: string | null;
}

export interface SetupTimelineStore {
  extensionRecord<T>(kind: string, id: string): T | null;
  saveExtensionRecord(kind: string, id: string, value: unknown): void;
  setupMilestoneTimes(): SetupMilestoneTimes;
}

type Reached = { at: string; kind?: SetupAiKind; method?: InstallMethod };
interface Stored {
  startedAt: string;
  olderThanTimeline: boolean;
  milestones: Partial<Record<SetupMilestoneName, Reached>>;
  sharing: { enabled: boolean; id: string | null };
}

const RECORD_KIND = "setup-timeline";
const RECORD_ID = "owner";
/** Milestones the studio's own records prove, so they can be filled in later. */
const PROVEN = ["installed", "first_teammate", "first_answer", "first_job"] as const satisfies ReadonlyArray<SetupMilestoneName>;
/** A studio that ran this long before the timeline existed is treated as older than it. */
const OLDER_AFTER_MS = 60 * 60 * 1000;

export class SetupSharingUnavailable extends Error {
  constructor() { super("Sharing setup counts isn't available in this version of Sidemates."); }
}

/** Records each milestone once, the first time it happens. Later deletions
 * (a removed teammate, a cleared conversation) don't move a milestone. */
export class SetupTimeline {
  private cached: Stored | null = null;

  constructor(
    private readonly store: SetupTimelineStore,
    private readonly now: () => Date = () => new Date(),
    private readonly endpoint: string | null = SETUP_COUNTS_ENDPOINT,
    /** How this copy was installed, from the installer (OPENBOT_INSTALL_METHOD); noted with "Installed". */
    private readonly installMethod: InstallMethod | null = null,
  ) {}

  view(): SetupTimelineView {
    const state = this.refresh();
    return {
      milestones: SETUP_MILESTONES.map(({ name, label }) => {
        const reached = state.milestones[name];
        return { name, label, at: reached?.at ?? null, detail: reached?.kind ? SETUP_AI_KINDS[reached.kind] : reached?.method ? INSTALL_METHODS[reached.method] : null };
      }),
      startedAt: state.startedAt,
      olderThanTimeline: state.olderThanTimeline,
      sharing: { available: Boolean(this.endpoint), enabled: Boolean(this.endpoint) && state.sharing.enabled },
    };
  }

  /** The studio was opened or came back into view. */
  noteVisit() {
    const state = this.refresh();
    if (state.olderThanTimeline) return;
    const at = this.now();
    const first = state.milestones.studio_opened;
    if (!first) return this.save({ ...state, milestones: { ...state.milestones, studio_opened: { at: at.toISOString() } } });
    const days = calendarDaysBetween(new Date(first.at), at);
    const next = { ...state.milestones };
    if (days === 1 && !next.returned_next_day) next.returned_next_day = { at: at.toISOString() };
    if (days >= 1 && days <= 7 && !next.returned_within_week) next.returned_within_week = { at: at.toISOString() };
    if (next.returned_next_day !== state.milestones.returned_next_day || next.returned_within_week !== state.milestones.returned_within_week) this.save({ ...state, milestones: next });
  }

  /** Called with every provider status read: the first working connection marks "Connected an AI". */
  noteConnections(connections: ReadonlyArray<Pick<ProviderInstance, "id" | "provider" | "apiConfig" | "connected">>) {
    if (this.cached && (this.cached.olderThanTimeline || this.cached.milestones.ai_connected)) return;
    const connection = connections.find((entry) => entry.connected);
    if (!connection) return;
    const state = this.refresh();
    if (state.olderThanTimeline || state.milestones.ai_connected) return;
    this.save({ ...state, milestones: { ...state.milestones, ai_connected: { at: this.now().toISOString(), kind: setupAiKind(connection) } } });
  }

  setSharing(enabled: boolean) {
    if (enabled && !this.endpoint) throw new SetupSharingUnavailable();
    const state = this.refresh();
    this.save({ ...state, sharing: { enabled, id: enabled ? state.sharing.id ?? randomUUID() : state.sharing.id } });
  }

  /** The counts to send now, or null: sharing is off, or there is nowhere to send them. */
  countsToSend(meta: { appVersion: string; macosMajor: number | null }): SetupCountsPayload | null {
    const state = this.refresh();
    if (!this.endpoint || !state.sharing.enabled || !state.sharing.id) return null;
    return setupCountsPayload({ id: state.sharing.id, ...meta, milestones: state.milestones });
  }

  /** Loads the timeline, starting it if needed, and copies in milestones the records now prove. */
  private refresh(): Stored {
    let state = this.cached ?? this.store.extensionRecord<Stored>(RECORD_KIND, RECORD_ID);
    // Once every milestone the records can prove is kept, there is nothing left to look up.
    if (state && PROVEN.every((name) => state!.milestones[name])) { this.cached = state; return state; }
    const times = this.store.setupMilestoneTimes();
    let changed = false;
    if (!state) {
      const startedAt = this.now();
      const installed = Date.parse(times.installedAt ?? "");
      const olderThanTimeline = Boolean(times.firstTeammateAt) || (Number.isFinite(installed) && startedAt.getTime() - installed > OLDER_AFTER_MS);
      state = { startedAt: startedAt.toISOString(), olderThanTimeline, milestones: {}, sharing: { enabled: false, id: null } };
      changed = true;
    }
    const provenAt: Record<typeof PROVEN[number], string | null> = {
      installed: times.installedAt, first_teammate: times.firstTeammateAt, first_answer: times.firstAnswerAt, first_job: times.firstJobAt,
    };
    const milestones = { ...state.milestones };
    for (const name of PROVEN) {
      const at = provenAt[name];
      if (at && !milestones[name]) { milestones[name] = { at, ...(name === "installed" && this.installMethod && !state.olderThanTimeline ? { method: this.installMethod } : {}) }; changed = true; }
    }
    state = { ...state, milestones };
    if (changed) this.save(state);
    else this.cached = state;
    return state;
  }

  private save(state: Stored) {
    this.store.saveExtensionRecord(RECORD_KIND, RECORD_ID, state);
    this.cached = state;
  }
}
