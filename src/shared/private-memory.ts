import { z } from "zod";

export interface PrivateMemory {
  key: string; content: string; updatedAt: string; revision: string;
  source: "owner" | "task" | "legacy"; sourceRunId: string | null;
  expiresAt: string | null; expired: boolean; conflict: boolean;
  /** Task T5: where it came from ("From an email"); null for memories saved before T5. */
  origin?: import("./memory-origin.js").MemoryOrigin | null;
}
export const memoryEdit = z.object({
  key: z.string().trim().min(1).max(80), content: z.string().trim().min(1).max(1200),
  expectedRevision: z.string().min(1).max(80).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
export const memoryKeyIdentity = (key: string) => key.normalize("NFKC").trim().toLocaleLowerCase("en-US");
