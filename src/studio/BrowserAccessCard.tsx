import { useEffect, useState } from "react";
import { ArrowRight, Globe2 } from "lucide-react";
import type { Bot } from "../shared/types";

type Access = {
  botId: string;
  browserEnabled: boolean;
  runtimeAvailable: boolean | null;
  services: {
    service: string;
    label: string;
    connectorState: string;
    browserState: string;
    preferred: string;
  }[];
};

export function BrowserAccessCard({ bot, onTakeover }: { bot: Bot; onTakeover?: (bot: Bot) => void }) {
  const [state, setState] = useState<{
    botId: string;
    requestedBrowserEnabled: boolean;
    access: Access | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    let active: AbortController | null = null;
    let disposed = false;
    const refresh = () => {
      active?.abort();
      const request = new AbortController();
      active = request;
      const scope = {
        botId: bot.id,
        requestedBrowserEnabled: bot.browserEnabled,
      };
      setState({ ...scope, access: null, error: "" });
      void fetch(`/api/bots/${encodeURIComponent(bot.id)}/browser-access`, {
        signal: request.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              "Couldn’t check these options. Reopen this pane to try again.",
            );
          const result: Access = await response.json();
          if (result.botId !== bot.id)
            throw new Error("Couldn’t check this teammate’s browser access.");
          if (!disposed && active === request && !request.signal.aborted)
            setState({ ...scope, access: result, error: "" });
        })
        .catch((reason: Error) => {
          if (!disposed && active === request && !request.signal.aborted)
            setState({ ...scope, access: null, error: reason.message });
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
      active?.abort();
    };
  }, [bot.id, bot.browserEnabled]);
  const current =
    state?.botId === bot.id &&
    state.requestedBrowserEnabled === bot.browserEnabled
      ? state
      : null;
  const access = current?.access,
    error = current?.error;
  return (
    <details className="browser-access-card">
      <summary>
        <Globe2 size={15} /> Apps through the browser
      </summary>
      <p>
        Sign in yourself in {bot.name}’s browser. Saved website sessions can be
        reused; you don’t have to connect an API for every task.
      </p>
      {error ? (
        <p role="status">{error}</p>
      ) : !access ? (
        <p>Checking available paths…</p>
      ) : (
        <>
          <div className="browser-paths">
            {access.services.map((service) => (
              <div key={service.service}>
                <span>{service.label}</span>
                <small>
                  {service.connectorState === "read-denied"
                    ? "Reading turned off"
                    : service.preferred === "connector"
                      ? "Connection available"
                      : service.preferred === "browser"
                        ? "Browser option"
                        : !access.browserEnabled
                          ? "Browser off"
                          : access.runtimeAvailable === false
                            ? "Browser needs setup"
                            : "Needs setup"}
                </small>
              </div>
            ))}
          </div>
          <p className="boundary-note">
            Website sign-ins have not been verified here. They can expire and
            aren’t shared with other teammates. A denied permission still
            applies.
          </p>
          {onTakeover && (
            <button className="text-action" onClick={() => onTakeover(bot)}>
              {access.browserEnabled
                ? "Open browser controls"
                : "Review browser access"}
              <ArrowRight size={14} />
            </button>
          )}
        </>
      )}
      <p>
        A connector is still useful for precise searches and dependable
        scheduled work. Enter passwords and verification codes only in the
        secure sign-in flow, never in chat.
      </p>
    </details>
  );
}
