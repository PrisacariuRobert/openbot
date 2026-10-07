import type { Express } from "express";
import { z } from "zod";
import { SetupSharingUnavailable, type SetupTimeline } from "./setup-timeline.js";

/** Settings → Your setup. The timeline stays on this Mac; these routes only read it and note studio visits. */
export function registerSetupRoutes(app: Express, timeline: SetupTimeline) {
  app.get("/api/setup", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(timeline.view());
  });

  app.post("/api/setup/visit", (_request, response) => {
    timeline.noteVisit();
    response.sendStatus(204);
  });

  app.patch("/api/setup/sharing", (request, response) => {
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose whether to share setup counts." });
    try {
      timeline.setSharing(parsed.data.enabled);
      response.json(timeline.view());
    } catch (error) {
      if (error instanceof SetupSharingUnavailable) return response.status(409).json({ error: error.message });
      throw error;
    }
  });
}
