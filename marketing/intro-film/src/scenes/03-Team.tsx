import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Check } from "lucide-react";
import {
  Stage,
  AppWindow,
  Bubble,
  Composer,
  FileRow,
  Mascot,
  Reveal,
  ease,
} from "../components";

export const Team = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Teamwork headline"
        style={{
          position: "absolute",
          left: 0,
          top: 70,
          width: 1920,
          textAlign: "center",
          fontSize: 82,
          fontWeight: 600,
          letterSpacing: -4,
          opacity: interpolate(frame, [0, 18], [0, 1], ease),
        }}
      >
        One conversation. A whole team.
      </Interactive.Div>
      <Interactive.Div
        name="Conversation product reveal"
        style={{
          position: "absolute",
          left: 235,
          top: 236,
          scale: interpolate(frame, [0, 70], [0.94, 1], ease),
          translate: `0 ${interpolate(frame, [0, 60], [120, 0], ease)}px`,
        }}
      >
        <AppWindow>
          <Reveal
            at={22}
            name="Your request"
            style={{ position: "absolute", right: 38, top: 32, width: 585 }}
          >
            <Bubble user>
              Get the launch ready.
              <br />
              Bring Milo and Fern in where you need them.
            </Bubble>
          </Reveal>
          <Reveal
            at={78}
            name="Private collaboration"
            style={{
              position: "absolute",
              left: 54,
              top: 215,
              display: "flex",
              alignItems: "center",
              gap: 18,
              color: "#777",
              fontSize: 20,
            }}
          >
            <div style={{ display: "flex", gap: 2 }}>
              <Mascot size={38} />
              <Mascot kind={1} size={38} />
              <Mascot kind={2} size={38} />
            </div>
            {frame < 148
              ? "Working together on the details"
              : "Milo and Fern consulted"}
            {frame >= 148 && <Check size={19} />}
            {frame < 148 && (
              <span>{".".repeat(1 + (Math.floor(frame / 10) % 3))}</span>
            )}
          </Reveal>
          <Reveal
            at={151}
            name="One coordinated answer"
            style={{ position: "absolute", left: 45, right: 110, top: 293 }}
          >
            <Bubble>
              The plan, launch copy and review checklist are ready.
              <br />
              I’ve brought everything together for you.
            </Bubble>
          </Reveal>
          <Reveal
            at={198}
            name="Reviewable launch result"
            style={{ position: "absolute", left: 45, right: 110, top: 445 }}
          >
            <FileRow
              title="Launch pack"
              detail="Plan · Copy · Review checklist"
            />
          </Reveal>
          <Composer />
        </AppWindow>
      </Interactive.Div>
    </Stage>
  );
};
