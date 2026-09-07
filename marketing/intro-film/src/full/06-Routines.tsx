import { Interactive, interpolate } from "remotion";
import { BookOpen, Check, Hand, Plug, Repeat2 } from "lucide-react";
import { Mascot } from "../components";
import { Shell, curve, enter, useShot } from "./shared";

export const Routines = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="Work across the week"
        style={{
          position: "absolute",
          left: 165,
          top: 155,
          width: 1590,
          translate: `0 ${interpolate(p, [0.18, 0.26], [0, -160], curve)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
            fontSize: 37,
            color: "#777",
            opacity: 1 - enter(p, 0.18, 0.26),
          }}
        >
          <Mascot size={74} kind={2} />
          Fern · Launch check-in
        </div>
        <div
          style={{
            fontSize: 78,
            letterSpacing: "-.04em",
            fontWeight: 580,
            margin: "30px 0 50px",
          }}
        >
          Every weekday. Taken care of.
        </div>
        <div
          style={{
            display: "flex",
            borderTop: "2px solid #e5e5e5",
            borderBottom: "2px solid #e5e5e5",
          }}
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => (
            <div
              key={day}
              style={{
                width: 318,
                padding: "34px 34px",
                borderRight: i < 4 ? "1px solid #e5e5e5" : undefined,
              }}
            >
              <div style={{ fontSize: 27, color: "#777" }}>{day}</div>
              <div
                style={{ fontSize: 69, marginTop: 15, letterSpacing: "-.04em" }}
              >
                {7 + i}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 15,
                  marginTop: 20,
                  fontSize: 29,
                  alignItems: "center",
                }}
              >
                {p > 0.12 + i * 0.04 ? (
                  <Check size={29} />
                ) : (
                  <Repeat2 size={29} />
                )}
                09:00
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 64, marginTop: 75 }}>
          {[
            {
              Icon: BookOpen,
              title: "Remember",
              body: "Your preferences, kept in context.",
            },
            {
              Icon: Hand,
              title: "Teach",
              body: "A workflow becomes a saved skill.",
            },
            { Icon: Plug, title: "Connect", body: "More tools with MCP." },
          ].map(({ Icon, title, body }, i) => (
            <Interactive.Div
              name={title}
              key={title}
              style={{
                width: 480,
                opacity: enter(p, 0.2 + i * 0.18, 0.27 + i * 0.18),
                translate: `0 ${interpolate(p, [0.2 + i * 0.18, 0.29 + i * 0.18], [80, 0], curve)}px`,
              }}
            >
              <Icon size={55} strokeWidth={1.6} />
              <div style={{ fontSize: 46, fontWeight: 570, marginTop: 24 }}>
                {title}
              </div>
              <div
                style={{
                  fontSize: 30,
                  color: "#777",
                  lineHeight: 1.35,
                  marginTop: 17,
                  maxWidth: 410,
                }}
              >
                {body}
              </div>
            </Interactive.Div>
          ))}
        </div>
      </Interactive.Div>
    </Shell>
  );
};
