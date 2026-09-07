import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Actor, Set, smooth, clamp } from "./shared";

export const Finale = () => {
  const frame = useCurrentFrame();
  return (
    <Set>
      <Interactive.Div
        name="Release of energy"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 115, 142], [1, 1, 0], clamp),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 110,
            top: 190,
            fontSize: 206,
            fontWeight: 640,
            lineHeight: 0.95,
            letterSpacing: "-.05em",
            translate: `${interpolate(frame, [0, 35, 105, 142], [850, 0, 0, -1000], smooth)}px 0`,
          }}
        >
          Less managing.
          <br />
          More making.
        </div>
        {[0, 1, 2, 3, 4, 5].map((kind) => (
          <Actor
            key={kind}
            kind={kind}
            size={kind % 2 ? 210 : 290}
            style={{
              left: interpolate(
                frame,
                [10 + kind * 7, 95 + kind * 5],
                [-350 + kind * 140, 230 + kind * 295],
                smooth,
              ),
              top: 655 + Math.sin((frame - kind * 11) / 24) * 70,
              rotate: `${interpolate(frame, [0, 145], [-35 + kind * 13, 15 - kind * 8], smooth)}deg`,
            }}
          />
        ))}
      </Interactive.Div>
      <Interactive.Div
        name="OpenBot signature landing"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [125, 150], [0, 1], clamp),
          scale: interpolate(frame, [128, 193, 310], [1.28, 1, 1.015], smooth),
        }}
      >
        {[0, 1, 2].map((kind) => (
          <Actor
            key={kind}
            kind={kind}
            size={kind === 0 ? 260 : 225}
            style={{
              left: 600 + kind * 230,
              top:
                150 +
                Math.abs(
                  Math.sin(
                    Math.max(0, Math.min(1, (frame - 143 - kind * 8) / 60)) *
                      Math.PI,
                  ),
                ) *
                  -95,
              rotate: `${interpolate(frame, [143 + kind * 8, 198 + kind * 8], [-20 + kind * 18, 0], smooth)}deg`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 470,
            width: "100%",
            textAlign: "center",
            fontSize: 191,
            fontWeight: 650,
            letterSpacing: "-.05em",
          }}
        >
          OpenBot
        </div>
        <div
          style={{
            position: "absolute",
            top: 703,
            width: "100%",
            textAlign: "center",
            fontSize: 49,
            letterSpacing: "-.035em",
            color: "#666",
          }}
        >
          Your AI. Your team. Your possibilities.
        </div>
        <div
          style={{
            position: "absolute",
            top: 862,
            width: "100%",
            textAlign: "center",
            fontSize: 27,
            letterSpacing: ".04em",
            color: "#777",
          }}
        >
          OPEN SOURCE
        </div>
      </Interactive.Div>
    </Set>
  );
};
