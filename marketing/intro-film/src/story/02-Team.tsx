import { Interactive } from "remotion";
import { Check, FileText } from "lucide-react";
import { Brand } from "../components";
import { Character, move, reveal, useTime, World, Checkmark } from "./shared";

export const TeamStory = () => {
  const t = useTime();
  const converge = move(t, 5.05, 5.95);
  const names = ["Nova", "Milo", "Fern"];
  const roles = ["Finds the context", "Makes it real", "Checks the details"];
  return (
    <World>
      <Interactive.Div
        name="Request hands off to teammates"
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
          paddingLeft: 52,
          paddingRight: 37,
          gap: 30,
          fontSize: 46,
          scale: move(t, 0, 0.9, 1, 0.48),
          translate: `0 ${move(t, 0, 0.9, 0, -308)}px`,
          opacity: 1 - move(t, 1.3, 1.8),
        }}
      >
        <span style={{ flex: 1 }}>Help me launch this.</span>
        <span
          style={{
            width: 81,
            height: 81,
            borderRadius: "50%",
            background: "white",
            color: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 1 - move(t, 0, 0.5),
          }}
        >
          <Check size={39} />
        </span>
      </Interactive.Div>
      <Interactive.Div
        name="They work it out together"
        style={{
          position: "absolute",
          top: 130,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 82,
          fontWeight: 620,
          letterSpacing: "-0.04em",
          opacity: reveal(t, 1.5, 2.1) * (1 - move(t, 4.9, 5.5)),
          translate: `0 ${reveal(t, 1.5, 2.2, 35, 0)}px`,
        }}
      >
        They work it out. Together.
      </Interactive.Div>
      <svg
        width="1920"
        height="1080"
        style={{
          position: "absolute",
          opacity: reveal(t, 1.2, 2.1) * (1 - converge),
        }}
      >
        <path
          d="M540 496 C660 400 780 400 910 496 M1010 496 C1140 592 1260 592 1380 496"
          fill="none"
          stroke="#d4d4d4"
          strokeWidth="2"
          strokeDasharray="4 9"
        />
        {[0, 1, 2].map((i) => {
          const p = (Math.max(0, t - 2.1) * 0.35 + i / 3) % 1;
          return (
            <circle
              key={i}
              cx={540 + p * 840}
              cy={496 - Math.sin(p * Math.PI * 2) * 65}
              r="7"
              fill="#171717"
              opacity={t > 2.1 ? 1 : 0}
            />
          );
        })}
      </svg>
      {[0, 1].map((i) => (
        <Interactive.Div
          name={`A contribution travels ${i + 1}`}
          key={i}
          style={{
            position: "absolute",
            left: 657 + i * 450,
            top: 419,
            width: 74,
            height: 88,
            borderRadius: 12,
            border: "1px solid #d3d3d3",
            background: "white",
            boxShadow: "0 10px 25px #0000000a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity:
              reveal(t, 2.4 + i * 0.7, 2.7 + i * 0.7) *
              (1 - move(t, 4.5 + i * 0.3, 5 + i * 0.3)),
            translate: `${move(t, 2.4 + i * 0.7, 4.5 + i * 0.3, -95, 115)}px ${Math.sin(move(t, 2.4 + i * 0.7, 4.5 + i * 0.3) * Math.PI) * -50}px`,
            rotate: `${move(t, 2.4 + i * 0.7, 4.5 + i * 0.3, -12, 12)}deg`,
          }}
        >
          <FileText size={31} strokeWidth={1.4} />
        </Interactive.Div>
      ))}
      {[0, 1, 2].map((kind) => (
        <Interactive.Div
          name={`${names[kind]} contribution`}
          key={kind}
          style={{
            position: "absolute",
            left:
              380 +
              kind * 450 +
              (1 - kind) * 340 * converge +
              76 * converge +
              (kind === 0 ? reveal(t, 0, 1.65, 509, 0) : 0),
            top:
              360 +
              reveal(
                t,
                kind === 0 ? 0 : 0.45 + kind * 0.2,
                1.65 + kind * 0.18,
                kind === 0 ? 302 : 450,
                0,
              ) -
              converge * 110,
            opacity:
              kind === 0 ? 1 : reveal(t, 0.7 + kind * 0.2, 1.45 + kind * 0.2),
            scale:
              (kind === 0 ? reveal(t, 0, 1.65, 142 / 260, 1) : 1) *
              (1 - converge * 0.58),
            transformOrigin: "0 0",
          }}
        >
          <div
            style={{
              rotate: `${Math.sin(t * 2.2 + kind * 1.6) * 3 * (1 - converge)}deg`,
              translate: `0 ${Math.sin(t * 2.2 + kind * 2) * 7 * (1 - converge)}px`,
            }}
          >
            <Character kind={kind} size={260} shadow />
          </div>
          <div
            style={{
              textAlign: "center",
              opacity: reveal(t, 1, 1.8) * (1 - converge),
              marginTop: 30,
            }}
          >
            <div style={{ fontSize: 39, fontWeight: 600 }}>{names[kind]}</div>
            <div style={{ fontSize: 29, color: "#747474", marginTop: 10 }}>
              {roles[kind]}
            </div>
          </div>
        </Interactive.Div>
      ))}
      <Interactive.Div
        name="Signed-in sources entering the work"
        style={{
          position: "absolute",
          left: 525,
          top: 820,
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: reveal(t, 2.2, 2.7) * (1 - move(t, 4.5, 5.2)),
          translate: `0 ${reveal(t, 2.2, 2.8, 55, 0)}px`,
        }}
      >
        {[
          "gmail",
          "googlecalendar",
          "slack",
          "notion",
          "googledrive",
          "github",
        ].map((id, i) => (
          <div
            key={id}
            style={{
              translate: `0 ${Math.sin(t * 2 - i * 0.6) * 5}px`,
              width: 80,
              height: 80,
              border: "1px solid #e3e3e3",
              borderRadius: 20,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Brand id={id} size={36} />
          </div>
        ))}
        <div
          style={{
            fontSize: 28,
            color: "#666",
            marginLeft: 14,
            lineHeight: 1.3,
          }}
        >
          Your apps.
          <br />
          Your signed-in browser.
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="One coordinated response"
        style={{
          position: "absolute",
          left: 375,
          top: 480,
          width: 1170,
          opacity: reveal(t, 5.45, 6.1),
          translate: `0 ${reveal(t, 5.45, 6.1, 100, 0)}px`,
          scale: move(t, 7.3, 8, 1, 1.08),
        }}
      >
        <div
          style={{
            fontSize: 105,
            lineHeight: 1.08,
            fontWeight: 620,
            letterSpacing: "-0.045em",
            textAlign: "center",
          }}
        >
          One answer.
          <br />
          All the work behind it.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
            marginTop: 40,
            fontSize: 28,
            color: "#777",
          }}
        >
          <Checkmark size={27} /> Ready for your review
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Paper match cut into the work"
        style={{
          position: "absolute",
          left: 220,
          top: 180,
          width: 1480,
          height: 830,
          borderRadius: 12,
          background: "#101010",
          translate: `0 ${move(t, 7.65, 8, 1050, 0)}px`,
          rotate: `${move(t, 7.65, 8, -5, 0)}deg`,
        }}
      />
    </World>
  );
};
