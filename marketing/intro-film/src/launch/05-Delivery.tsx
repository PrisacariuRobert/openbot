import { ExtendContents } from "./04-Extend";
import { useCurrentFrame } from "remotion";
import { Check, CalendarDays, ShieldCheck } from "lucide-react";
import { Bubble, FileRow, ProductWindow } from "./Product";
import { Appear, Caption, ContentHandoff, move, Rig, Stage } from "./Motion";
export function Delivery() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 0, 160, 0.78, 1.18) - move(f, 415, 555, 0, 0.4)}
        x={move(f, 0, 160, -110, -245)}
        y={move(f, 0, 160, -160, -55) - move(f, 415, 555, 0, 110)}
      >
        <ProductWindow frame={f + 2520}>
          <ContentHandoff previous={<ExtendContents />} previousFrame={719}>
            <DeliveryContents />
          </ContentHandoff>
        </ProductWindow>
      </Rig>
      {f > 455 && (
        <div
          style={{
            position: "absolute",
            width: 630,
            left: move(f, 455, 535, 1860, 1130),
            top: 570,
            background: "white",
            border: "1px solid #e3e3e3",
            borderRadius: 23,
            padding: 34,
            boxShadow: "0 25px 70px #00000018",
            rotate: `${move(f, 455, 555, 7, 0)}deg`,
            opacity: move(f, 665, 715, 1, 0),
            translate: `0 ${move(f, 665, 715, 0, 20)}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 15,
              alignItems: "center",
              fontSize: 30,
              fontWeight: 550,
            }}
          >
            <CalendarDays size={30} />
            Launch check-in
          </div>
          <p style={{ margin: "19px 0", fontSize: 23, color: "#777" }}>
            Monday · 09:00 · your time zone
          </p>
          <div
            style={{
              borderTop: "1px solid #e7e7e7",
              paddingTop: 25,
              fontSize: 22,
              display: "flex",
              gap: 12,
            }}
          >
            <Check size={25} />
            Routine ready for review
          </div>
        </div>
      )}
      <Caption from={565} until={720}>
        Good work.
        <br />
        Worth repeating.
      </Caption>
    </Stage>
  );
}

export function DeliveryContents() {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        translate: `0 ${move(f, 410, 475, 0, -108)}px`,
      }}
    >
      <Bubble>The work, ready for your review.</Bubble>
      <Appear at={50}>
        <FileRow
          name="Launch plan.md"
          meta="Decisions, owners and next steps"
        />
      </Appear>
      <Appear at={140}>
        <FileRow name="Project changes.diff" meta="Changes and test evidence · ready to review" />
      </Appear>
      <Appear at={230}>
        <FileRow
          name="launch-checklist.ts"
          meta="Reusable tool · saved in your workspace"
        />
      </Appear>
      <Appear at={320}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            fontSize: 20,
            color: "#777",
          }}
        >
          <ShieldCheck size={24} />
          Open the work receipt. See what happened.
        </div>
      </Appear>
      {f > 410 && (
        <Appear at={415}>
          <Bubble owner>And check in with me every Monday.</Bubble>
        </Appear>
      )}
    </div>
  );
}
