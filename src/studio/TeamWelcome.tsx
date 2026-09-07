import { useState } from "react";
import { ArrowUpRight, Check, MessageCircle, UsersRound } from "lucide-react";
import type { Bot } from "../shared/types";
import { Character } from "./Character";
import "./team-welcome.css";

export function TeamWelcome({ bots, composing, recipient, onMeet }: {
  bots: Bot[];
  composing: boolean;
  recipient: string;
  onMeet: (bot: Bot) => void;
}) {
  const [greeted, setGreeted] = useState<string | null>(null);
  return <section className="team-welcome" aria-label="Meet your AI team">
    <div className="team-introduction">
      <p className="overline">YOUR OWN AI TEAM</p>
      <h1>A little team.<br /><span>On your side.</span></h1>
      <p>For the work on your desk.<br />And the things on your mind.</p>
    </div>
    <div className="team-stage">
      <p className="stage-invitation">{greeted ? `Meet ${bots.find((bot) => bot.id === greeted)?.name || "your teammate"}` : "Different talents. Better together."}</p>
      <div className="team-characters">
        {bots.slice(0, 4).map((bot) => <button key={bot.id} className="teammate-intro" aria-label={`Meet ${bot.name}`} onMouseEnter={() => setGreeted(bot.id)} onMouseLeave={() => setGreeted(null)} onFocus={() => setGreeted(bot.id)} onBlur={() => setGreeted(null)} onClick={() => onMeet(bot)}>
          <Character name={bot.name} color={bot.color} variant={bot.mascot} status={bot.status} size={116} mood={bot.status === "working" ? "focused" : greeted === bot.id ? "happy" : composing && (!recipient || recipient === bot.id) ? "curious" : "calm"} />
          <span className="teammate-name">{bot.name}<ArrowUpRight size={12} /></span>
          <span className="teammate-role">{bot.role}</span>
        </button>)}
      </div>
      {!bots.length && <p className="quiet-copy">Your teammates will appear here once your studio is set up.</p>}
      <p className="stage-footnote">Select someone to get acquainted</p>
    </div>
  </section>;
}

export function TeamPromise() {
  return <ol className="team-promise" aria-label="How your team helps">
    <li><MessageCircle size={17} strokeWidth={1.5} /><span><strong>You ask</strong><small>Tell us what you need.</small></span></li>
    <li><UsersRound size={18} strokeWidth={1.5} /><span><strong>Your team works together</strong><small>One teammate brings you the reply.</small></span></li>
    <li><Check size={17} strokeWidth={1.5} /><span><strong>You stay in control</strong><small>Sensitive actions wait for your okay.</small></span></li>
  </ol>;
}
