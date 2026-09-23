import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start: () => void; stop: () => void;
};

function recognitionConstructor(): (new () => Recognition) | null {
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

/** Speak instead of typing. Uses the browser's own speech recognition
 * (Safari and Chrome); hidden where the browser has none. Words appear in
 * the message box as you speak and nothing is sent until you press Send. */
export function DictationButton({ draft, setDraft, disabled }: { draft: string; setDraft: (value: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const base = useRef("");
  const Constructor = typeof window === "undefined" ? null : recognitionConstructor();
  useEffect(() => () => recognition.current?.stop(), []);
  if (!Constructor) return null;
  function start() {
    setError("");
    const next = new Constructor!();
    next.lang = navigator.language || "en-US";
    next.continuous = true;
    next.interimResults = true;
    base.current = draft.trim() ? `${draft.trim()} ` : "";
    let finalText = "";
    next.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setDraft(`${base.current}${finalText}${interim}`.replace(/\s+/g, " ").trimStart());
    };
    next.onerror = (event) => { if (event.error !== "aborted" && event.error !== "no-speech") setError(event.error === "not-allowed" ? "Allow microphone access to dictate." : "Dictation stopped."); };
    next.onend = () => setListening(false);
    recognition.current = next;
    next.start();
    setListening(true);
  }
  return <>
    <button type="button" className={`dictation${listening ? " is-listening" : ""}`} aria-label={listening ? "Stop dictation" : "Dictate a message"} aria-pressed={listening}
      title={error || (listening ? "Stop dictation" : "Dictate")} disabled={disabled} onClick={() => listening ? recognition.current?.stop() : start()}>
      {listening ? <Square size={15} /> : <Mic size={17} />}
    </button>
    {error && <span className="sr-only" role="status">{error}</span>}
  </>;
}

/** Read a reply aloud with the system voice; tap again to stop. */
export function ReadAloudButton({ text, className = "read-aloud" }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#>]/g, "").trim();
  return <button type="button" className={className} title={speaking ? "Stop reading" : "Read aloud"} aria-label={speaking ? "Stop reading" : "Read aloud"} aria-pressed={speaking} onClick={() => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = navigator.language || "en-US";
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }}><Volume2 size={15} /></button>;
}
