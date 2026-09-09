import { TeamContents } from "./03-Team";
import { useCurrentFrame } from "remotion";
import { Code2, Check, MousePointer2 } from "lucide-react";
import { Bubble, ProductWindow, ReviewCard, Mascot } from "./Product";
import { Appear, Caption, ContentHandoff, move, Rig, Stage } from "./Motion";
export function Extend() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 0, 90, 0.83, 1.08) - move(f, 480, 560, 0, 0.3)}
        y={move(f, 0, 90, -120, 0) - move(f, 480, 560, 0, 160)}
        x={move(f, 0, 90, 0, -110)}
      >
        <ProductWindow frame={f + 1800}>
          <ContentHandoff
            previous={<TeamContents />}
            previousFrame={599}
          >
            <ExtendContents />
          </ContentHandoff>
        </ProductWindow>
      </Rig>
      <div
        style={{
          position: "absolute",
          left: move(f, 150, 230, 1700, 1260),
          top: 260,
          scale: 0.94,
          rotate: `${move(f, 150, 260, 8, 0)}deg`,
          opacity: move(f, 140, 190) * move(f, 430, 470, 1, 0),
        }}
      >
        <ReviewCard approved={f > 330} />
        <div
          style={{
            position: "absolute",
            left: move(f, 265, 322, 530, 305),
            bottom: move(f, 265, 322, -65, 39),
            opacity: move(f, 260, 280) * move(f, 350, 380, 1, 0),
            scale: move(f, 322, 330, 1, 0.83) + move(f, 330, 344, 0, 0.17),
            filter: "drop-shadow(0 2px 3px #0005)",
          }}
        >
          <MousePointer2
            size={30}
            fill="white"
            color="#202020"
            strokeWidth={1.5}
          />
        </div>
      </div>
      <Caption from={540} until={720}>
        A missing piece?
        <br />
        Make it yours.
      </Caption>
    </Stage>
  );
}

export function ExtendContents() {
  const f = useCurrentFrame();
  return (
    <>
      <Bubble owner>Can we turn that checklist into a tool?</Bubble>
      <Appear at={60}>
        <Bubble>
          I can build a small tool for that.
          <br />
          Here’s the plan for your approval.
        </Bubble>
      </Appear>
      <Appear at={390}>
        <div
          style={{
            border: "1px solid #e4e4e4",
            borderRadius: 15,
            padding: 24,
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Code2 size={25} />
            launch-checklist.ts
          </div>
          <div
            style={{
              display: "flex",
              gap: 9,
              color: "#707070",
              fontSize: 17,
              marginTop: 20,
            }}
          >
            <Mascot name="Pixel" size={26} frame={f} id="coding-model" />
            Your chosen coding model
          </div>
          <pre
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: "#626262",
              margin: "25px 0 0",
              whiteSpace: "pre-wrap",
            }}
          >
            Read the launch notes.
            <br />
            Check owners and dates.
            <br />
            Write a reusable checklist.
          </pre>
        </div>
      </Appear>
      <Appear at={575}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#777",
            fontSize: 21,
          }}
        >
          <Check size={24} />
          Saved in Pixel’s workspace. Yours to review.
        </div>
      </Appear>
    </>
  );
}
