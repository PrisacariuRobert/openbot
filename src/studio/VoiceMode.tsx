import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Mic, MicOff, X } from "lucide-react";
import type { Bot, Message, Run } from "../shared/types";
import { Character } from "./Character";
import { speakable } from "../shared/speakable";
import "./voice-mode.css";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type Phase = "listening" | "sending" | "thinking" | "speaking" | "paused" | "waiting";

function recognitionConstructor(): (new () => Recognition) | null {
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}
export const voiceModeSupported = () => typeof window !== "undefined" && recognitionConstructor() !== null && "speechSynthesis" in window;

const SILENCE_MS = 1_300;

/** Talk with a teammate hands-free: it listens, sends when you pause, reads
 * the answer aloud, then listens again. Messages go through the normal chat,
 * so everything is in the conversation afterwards; approvals stay in the app. */
export function VoiceMode({ bot, messages, runs, onSend, onClose }: {
  bot: Bot; messages: Message[]; runs: Run[];
  onSend: (text: string) => Promise<void>; onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const silence = useRef<number | null>(null);
  const closed = useRef(false);
  const phaseRef = useRef<Phase>("listening");
  const known = useRef(new Set(messages.filter((message) => message.senderType === "bot").map((message) => message.id)));
  const setBoth = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const sendRef = useRef(onSend);
  sendRef.current = onSend;

  const stopListening = () => {
    if (silence.current) window.clearTimeout(silence.current);
    silence.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onend = null; current.onresult = null; current.onerror = null; try { current.abort(); } catch { /* already stopped */ } }
  };

  const listen = useCallback(() => {
    if (closed.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    stopListening();
    setHeard(""); setNote("");
    const next = new Constructor();
    next.lang = navigator.language || "en-US";
    next.continuous = true;
    next.interimResults = true;
    let finalText = "";
    next.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      const text = `${finalText}${interim}`.replace(/\s+/g, " ").trim();
      setHeard(text);
      if (silence.current) window.clearTimeout(silence.current);
      // A short pause means "that's my message".
      silence.current = window.setTimeout(() => { if (text) void submitRef.current(text); }, SILENCE_MS);
    };
    next.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") { setNote("Allow microphone access to talk with your teammate."); setBoth("paused"); }
    };
    // Browsers end recognition after long quiet; keep listening while in this phase.
    next.onend = () => { if (!closed.current && phaseRef.current === "listening" && recognition.current === next) window.setTimeout(listen, 250); };
    recognition.current = next;
    setBoth("listening");
    try { next.start(); } catch { /* A start while one is ending retries on end. */ }
  }, []);

  const submit = async (text: string) => {
    stopListening();
    setBoth("sending");
    try { await sendRef.current(text); setBoth("thinking"); }
    catch (cause) { setNote(cause instanceof Error ? cause.message : "That didn't send. Try again."); setBoth("paused"); }
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;

  const speak = (text: string) => {
    if (closed.current) return;
    stopListening();
    window.speechSynthesis.cancel();
    const spoken = speakable(text) || "Done.";
    setCaption(spoken);
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = navigator.language || "en-US";
    utterance.onend = utterance.onerror = () => { if (!closed.current && phaseRef.current === "speaking") listen(); };
    setBoth("speaking");
    window.speechSynthesis.speak(utterance);
  };

  // A new reply from this teammate: read it, then listen again.
  useEffect(() => {
    const fresh = messages.filter((message) => message.senderType === "bot" && message.kind === "text" && !known.current.has(message.id));
    for (const message of messages) if (message.senderType === "bot") known.current.add(message.id);
    const reply = fresh.at(-1);
    if (reply && (phaseRef.current === "thinking" || phaseRef.current === "sending" || phaseRef.current === "waiting")) speak(reply.body);
  }, [messages]);

  // Approvals are never granted by voice.
  const needsOkay = runs.some((run) => run.botId === bot.id && run.status === "awaiting_approval");
  useEffect(() => {
    if (needsOkay && phaseRef.current === "thinking") {
      setBoth("waiting");
      const utterance = new SpeechSynthesisUtterance(`${bot.name} needs your okay in the app before continuing.`);
      window.speechSynthesis.speak(utterance);
    }
  }, [needsOkay]);

  useEffect(() => {
    closed.current = false;
    listen();
    return () => { closed.current = true; stopListening(); window.speechSynthesis.cancel(); };
  }, [listen]);

  const end = () => { closed.current = true; stopListening(); window.speechSynthesis.cancel(); onClose(); };
  const label = { listening: heard ? "Listening…" : `Go ahead, ${bot.name} is listening`, sending: "Sending…", thinking: `${bot.name} is thinking…`, speaking: `${bot.name} is speaking`, paused: "Paused", waiting: `${bot.name} needs your okay in the chat` }[phase];
  return <div className={`voice-mode is-${phase}`} role="dialog" aria-modal="true" aria-label={`Talking with ${bot.name}`}>
    <div className="voice-mode-stage">
      <div className="voice-mode-halo" aria-hidden="true" style={{ "--voice-color": bot.color } as CSSProperties} />
      <Character name={bot.name} color={bot.color} variant={bot.mascot} status={phase === "thinking" || phase === "sending" ? "working" : "ready"} size={148} />
    </div>
    <p className="voice-mode-status" role="status">{label}</p>
    <p className="voice-mode-transcript">{note || (phase === "listening" || phase === "sending" ? heard : phase === "speaking" ? caption : "")}</p>
    <div className="voice-mode-controls">
      <button type="button" className="voice-mode-button" aria-label={phase === "paused" ? "Resume listening" : "Pause"} onClick={() => {
        if (phase === "paused" || phase === "waiting") listen();
        else { stopListening(); window.speechSynthesis.cancel(); setBoth("paused"); }
      }}>{phase === "paused" || phase === "waiting" ? <Mic size={24} /> : <MicOff size={24} />}</button>
      <button type="button" className="voice-mode-button end" aria-label="End voice conversation" onClick={end}><X size={26} /></button>
    </div>
    <p className="voice-mode-foot">Everything you say appears in the chat. Anything that needs your okay stays in the app.</p>
  </div>;
}
