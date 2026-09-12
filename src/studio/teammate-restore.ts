export type TeammateRestoreState = {
  botId: string | null;
  error: string;
};

export function createTeammateRestoreCoordinator() {
  let activeBotId: string | null = null;

  return {
    async restore(
      bot: { id: string; name: string },
      onRestore: (id: string) => Promise<void>,
      onState: (state: TeammateRestoreState) => void,
    ): Promise<boolean> {
      if (activeBotId) return false;
      activeBotId = bot.id;
      onState({ botId: bot.id, error: "" });
      try {
        await onRestore(bot.id);
        onState({ botId: null, error: "" });
        return true;
      } catch (cause) {
        onState({
          botId: null,
          error: cause instanceof Error && cause.message
            ? cause.message
            : `Could not confirm restoring ${bot.name}. Check the team before trying again.`,
        });
        return false;
      } finally {
        activeBotId = null;
      }
    },
  };
}
