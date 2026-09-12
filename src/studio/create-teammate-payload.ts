export function createTeammatePayload(input: {
  name: string; role: string; instructions: string; color: string; mascot: string;
  providerInstanceId: string; model: string;
}) {
  return {
    ...input,
    instructions: input.instructions.trim() || input.role.trim(),
    emoji: "●",
    browserEnabled: false,
    computerEnabled: false,
  };
}
