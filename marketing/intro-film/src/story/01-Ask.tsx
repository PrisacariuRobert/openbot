import { Interactive } from "remotion";
import { ArrowUp, Check } from "lucide-react";
import { Character, move, reveal, useTime, World } from "./shared";

export const Ask = () => {
  const t = useTime();
  const jobs = [
    ["Write the copy", -650, -70, -7],
    ["Build the page", 640, -70, 6],
    ["Pull the research", -650, 170, 5],
    ["Make the deck", 620, 160, -6],
    ["Check the details", -60, 340, 3],
    ["Keep everyone in sync", 50, -405, -3],
  ] as const;
  return (
    <World>
      <Interactive.Div
        name="An idea, not more work"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 365,
          textAlign: "center",
          fontWeight: 630,
          fontSize: 156,
          letterSpacing: "-0.045em",
          translate: `0 ${move(t, 1.4, 2.1, 0, -160)}px`,
          opacity: 1 - move(t, 2.3, 2.75),
        }}
      >
        <span
          style={{
            display: "inline-block",
            translate: `0 ${reveal(t, 0.12, 0.8, 100, 0)}px`,
            opacity: reveal(t, 0.12, 0.65),
          }}
        >
          You had an idea.
        </span>
        <div
          style={{
            fontSize: 42,
            fontWeight: 440,
            letterSpacing: "-0.035em",
            marginTop: 25,
            opacity: reveal(t, 1.45, 2.2),
          }}
        >
          Not a hundred little jobs.
        </div>
      </Interactive.Div>
      {jobs.map(([label, x, y, r], i) => (
        <Interactive.Div
          name={label}
          key={label}
          style={{
            position: "absolute",
            left: 960,
            top: 540,
            opacity:
              reveal(t, 1.7 + i * 0.045, 2.3 + i * 0.045) *
              (1 - move(t, 2.6 + i * 0.04, 3.1 + i * 0.04)),
            translate: `${move(t, 2.4 + i * 0.03, 3.2, x, 0)}px ${move(t, 2.4 + i * 0.03, 3.2, y, 0)}px`,
            rotate: `${move(t, 2.5, 3.2, r, 0)}deg`,
            scale: move(t, 2.7, 3.2, 1, 0.5),
            fontSize: 31,
            padding: "24px 30px",
            border: "1px solid #ddd",
            background: "white",
            borderRadius: 20,
            boxShadow: "0 16px 45px #00000006",
            whiteSpace: "nowrap",
            marginLeft: -150,
            marginTop: -40,
          }}
        >
          {label}
        </Interactive.Div>
      ))}
      <Interactive.Div
        name="The single request"
        style={{
          position: "absolute",
          left: 480,
          top: 462,
          width: 960,
          height: 156,
          background: "#111",
          color: "white",
          borderRadius: 90,
          display: "flex",
          alignItems: "center",
          padding: "0 37px 0 52px",
          gap: 30,
          scale: reveal(t, 2.72, 3.48, 0.07, 1),
          opacity: reveal(t, 2.7, 3.1),
          translate: `0 ${move(t, 5.5, 6, 0, -1)}px`,
          boxShadow: "0 24px 60px #0000000c",
        }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 460,
            flex: 1,
            opacity: reveal(t, 3.07, 3.45),
          }}
        >
          Help me launch this.
        </div>
        <div
          style={{
            width: 81,
            height: 81,
            borderRadius: "50%",
            background: "white",
            color: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: 1 - Math.sin(move(t, 4.55, 4.82) * Math.PI) * 0.17,
          }}
        >
          {t > 4.8 ? <Check size={39} /> : <ArrowUp size={42} />}
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="One conversation"
        style={{
          position: "absolute",
          top: 300,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 54,
          fontWeight: 540,
          opacity: reveal(t, 3.45, 4) * (1 - move(t, 5.1, 5.5)),
          translate: `0 ${reveal(t, 3.4, 4, 24, 0)}px`,
        }}
      >
        Start with one conversation.
      </Interactive.Div>
      <Interactive.Div
        name="Nova acknowledges the ask"
        style={{
          position: "absolute",
          left: 889,
          top: 662,
          opacity: reveal(t, 4.85, 5.3),
          translate: `0 ${reveal(t, 4.85, 5.4, 80, 0)}px`,
        }}
      >
        <Character size={142} />
      </Interactive.Div>
    </World>
  );
};
