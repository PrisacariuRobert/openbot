import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Globe2, RotateCw } from "lucide-react";
import type { Bot } from "../shared/types";
import {
  browserAccessMatchesRequest,
  browserServiceLabel,
  type BrowserAccessPresentation,
} from "./browser-access-presentation.mjs";

type BrowserAccessState = {
  botId: string;
  requestedBrowserEnabled: boolean;
  access: BrowserAccessPresentation | null;
  error: string;
};

export function BrowserAccessCard({
  bot,
  onTakeover,
}: {
  bot: Bot;
  onTakeover?: (bot: Bot) => void;
}) {
  const [state, setState] = useState<BrowserAccessState | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

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
        .then(async response => {
          if (!response.ok) throw new Error("Browser access request failed");
          const payload: unknown = await response.json();
          if (!browserAccessMatchesRequest(payload, bot.id)) {
            throw new Error("Browser access response did not match this teammate");
          }
          if (!disposed && active === request && !request.signal.aborted) {
            setState({ ...scope, access: payload, error: "" });
          }
        })
        .catch(() => {
          if (!disposed && active === request && !request.signal.aborted) {
            setState({
              ...scope,
              access: null,
              error: "Couldn’t check browser access. Your permissions haven’t changed.",
            });
          }
        });
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
      active?.abort();
    };
  }, [bot.id, bot.browserEnabled, refreshVersion]);

  const current =
    state?.botId === bot.id &&
    state.requestedBrowserEnabled === bot.browserEnabled
      ? state
      : null;
  const access = current?.access;
  const error = current?.error;

  return (
    <details className="browser-access-card">
      <summary>
        <Globe2 size={17} aria-hidden="true" />
        <span>Apps through the browser</span>
        <ChevronDown className="browser-access-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="browser-access-content">
        <p>
          Sign in yourself in {bot.name}’s browser. Saved website sessions can be
          reused; you don’t have to connect an API for every task.
        </p>
        {error ? (
          <div className="browser-access-retry">
            <p role="status">{error}</p>
            <button
              type="button"
              className="text-action"
              onClick={() => setRefreshVersion(value => value + 1)}
            >
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : !access ? (
          <p className="browser-access-loading" role="status">
            Checking available paths…
          </p>
        ) : (
          <>
            <div className="browser-paths">
              {access.services.map(service => (
                <div key={service.service}>
                  <span>{service.label}</span>
                  <small>{browserServiceLabel(service, access)}</small>
                </div>
              ))}
            </div>
            <p className="boundary-note">
              Website sign-ins have not been verified here. They can expire and
              aren’t shared with other teammates. A denied permission still applies.
            </p>
            {onTakeover && (
              <button
                type="button"
                className="text-action"
                onClick={() => onTakeover(bot)}
              >
                {access.browserEnabled
                  ? "Open browser controls"
                  : "Review browser access"}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        <p>
          A connector is still useful for precise searches and dependable scheduled
          work. Enter passwords and verification codes only in the secure sign-in
          flow, never in chat.
        </p>
      </div>
    </details>
  );
}
