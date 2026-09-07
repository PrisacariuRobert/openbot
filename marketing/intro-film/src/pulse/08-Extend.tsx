import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Check, Wrench } from "lucide-react";
import { Actor, Set, Title, Caption, smooth, clamp } from "./shared";

export const Extend = () => {
  const frame = useCurrentFrame();
  return (
    <Set>
      <Title size={145} y={110}>
        Missing a tool?
      </Title>
      <Interactive.Div
        name="The approved plan becomes an editable tool"
        style={{
          position: "absolute",
          left: 650,
          top: 345,
          width: 900,
          height: 470,
          scale: interpolate(
            frame,
            [0, 40, 175, 240],
            [0.85, 1, 1, 1.07],
            smooth,
          ),
          rotate: `y ${interpolate(frame, [0, 50, 127, 167], [-25, 0, 0, 180], smooth)}deg`,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            border: "1px solid #ccc",
            borderRadius: 28,
            background: "white",
            padding: 46,
          }}
        >
          <div style={{ fontSize: 27, color: "#777" }}>Proposed capability</div>
          <div
            style={{
              fontSize: 57,
              fontWeight: 580,
              letterSpacing: "-.045em",
              marginTop: 16,
            }}
          >
            Turn receipts into a workbook.
          </div>
          <div style={{ fontSize: 27, color: "#777", marginTop: 25 }}>
            Build with your chosen coding model.
          </div>
          <div
            style={{
              display: "inline-flex",
              gap: 14,
              alignItems: "center",
              background: "#111",
              color: "white",
              fontSize: 28,
              borderRadius: 60,
              padding: "18px 26px",
              marginTop: 32,
            }}
          >
            {frame > 113 ? <Check size={27} /> : null}
            {frame > 113 ? "Plan approved" : "Approve plan"}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            rotate: "y 180deg",
            borderRadius: 28,
            background: "#111",
            color: "white",
            padding: 48,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Wrench size={74} strokeWidth={1.3} />
          <div
            style={{
              fontSize: 58,
              fontWeight: 560,
              letterSpacing: "-.045em",
              marginTop: 26,
            }}
          >
            A tool of your own.
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 26,
              color: "#aaa",
              marginTop: 30,
            }}
          >
            tools/receipt-workbook.ts
          </div>
          <div style={{ fontSize: 24, color: "#aaa", marginTop: "auto" }}>
            In your workspace. Yours to inspect or remove.
          </div>
        </div>
      </Interactive.Div>
      <Actor
        kind={1}
        size={380}
        style={{
          left: 210,
          top: 460,
          rotate: `${interpolate(frame, [0, 60, 125, 180], [15, -6, 10, 0], smooth)}deg`,
          translate: `0 ${interpolate(frame, [0, 44], [400, 0], smooth)}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1190,
          top: 700,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "white",
          border: "3px solid #111",
          scale: interpolate(frame, [105, 113, 122], [1, 2, 0.4], smooth),
          opacity: interpolate(frame, [90, 105, 118, 128], [0, 1, 1, 0], clamp),
        }}
      />
      <Caption>
        Propose. Review. Build. Self-extension stays in your hands.
      </Caption>
    </Set>
  );
};
