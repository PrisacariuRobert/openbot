export function createTeammatePayload(input: {
  name: string; role: string; instructions: string; color: string; mascot: string;
  /** "automatic" lets Sidemates pick the AI before each job. */
  providerInstanceId: string; model: string;
  /** Chosen on the create sheet; the private computer always starts off. */
  browserEnabled: boolean;
}) {
  const automatic = input.providerInstanceId === "automatic";
  return {
    ...input,
    ...(automatic ? { providerInstanceId: null, model: undefined, aiMode: "automatic" as const } : { aiMode: "chosen" as const }),
    instructions: input.instructions.trim() || input.role.trim(),
    emoji: "●",
    computerEnabled: false,
  };
}
