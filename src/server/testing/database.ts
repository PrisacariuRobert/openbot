import { OpenBotDatabase as ApplicationDatabase } from "../database.js";

/** Explicit historical fixture roster. Never imported by the application server. */
export class OpenBotDatabase extends ApplicationDatabase {
  constructor(root: string, options: { dataDir?: string } = {}) {
    super(root, { ...options, seedStarterBots: true });
  }
}
