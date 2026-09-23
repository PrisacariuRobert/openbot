export function createTeammatePayload(input: {
  name: string; role: string; instructions: string; color: string; mascot: string;
  providerInstanceId: string; model: string;
  /** Chosen on the create sheet; the private computer always starts off. */
  browserEnabled: boolean;
}) {
  return {
    ...input,
    instructions: input.instructions.trim() || input.role.trim(),
    emoji: "●",
    computerEnabled: false,
  };
}
