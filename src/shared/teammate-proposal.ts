import { z } from "zod";

/** What a teammate's proposal to add a specialist holds (task AU4), as the owner reviews it. */
export const teammateProposalSchema = z.object({
  templateId: z.literal("starter-team"),
  key: z.enum(["researcher", "writer"]),
  name: z.string().min(1).max(60),
  role: z.string().min(1).max(60),
  why: z.string().min(1).max(400),
  providerInstanceId: z.string().min(1).max(80),
  model: z.string().min(1).max(300),
  browserEnabled: z.boolean(),
}).strict();
export type TeammateProposal = z.infer<typeof teammateProposalSchema>;
