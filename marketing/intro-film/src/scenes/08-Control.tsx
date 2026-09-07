import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ShieldCheck, Send, Check } from "lucide-react";
import { Stage, Pill, ease } from "../components";

export const Control = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Human control headline"
        style={{
          position: "absolute",
          left: 160,
          top: 205,
          fontSize: 137,
          fontWeight: 600,
          letterSpacing: -7,
          lineHeight: 1.07,
          opacity: interpolate(frame, [0, 22], [0, 1], ease),
        }}
      >
        Capable.
        <br />
        Accountable.
      </Interactive.Div>
      <Interactive.Div
        name="Control principle"
        style={{
          position: "absolute",
          left: 166,
          top: 563,
          fontSize: 32,
          lineHeight: 1.5,
          color: "#777",
          opacity: interpolate(frame, [28, 52], [0, 1], ease),
        }}
      >
        Local-first. Permissions you choose.
        <br />
        Sensitive actions wait for your okay.
      </Interactive.Div>
      <div style={{ position: "absolute", left: 164, top: 782 }}>
        <ShieldCheck size={90} strokeWidth={1.2} />
      </div>
      <Interactive.Div
        name="Destination-bound approval"
        style={{
          position: "absolute",
          left: 1060,
          top: 210,
          width: 685,
          borderRadius: 26,
          border: "1px solid #dedede",
          padding: 39,
          translate: `0 ${interpolate(frame, [12, 60], [150, 0], ease)}px`,
          opacity: interpolate(frame, [12, 35], [0, 1], ease),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            fontSize: 30,
            fontWeight: 600,
          }}
        >
          <Send size={29} />
          Ready when you are
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#777",
            margin: "25px 0 28px",
            paddingBottom: 25,
            borderBottom: "1px solid #e6e6e6",
          }}
        >
          To &nbsp; Launch team · 3 recipients
        </div>
        <div style={{ fontSize: 25, fontWeight: 600, marginBottom: 20 }}>
          Our launch is ready for review
        </div>
        <div style={{ fontSize: 24, lineHeight: 1.6, color: "#555" }}>
          Hi team,
          <br />
          <br />
          The plan, copy and checklist are ready.
          <br />
          Here’s everything we need for Monday.
        </div>
        <div
          style={{
            display: "flex",
            gap: 15,
            justifyContent: "flex-end",
            marginTop: 36,
          }}
        >
          <Pill>Keep draft</Pill>
          <Pill primary>
            {frame > 167 ? (
              <>
                <Check size={21} />
                Approved
              </>
            ) : (
              "Approve & send"
            )}
          </Pill>
        </div>
      </Interactive.Div>
    </Stage>
  );
};
