import { ConversationContents } from "./01-Conversation";
import { useCurrentFrame } from "remotion";
import { FileText, Users } from "lucide-react";
import { BrowserDetail, Bubble, Mascot, ProductWindow } from "./Product";
import { Appear, Caption, ContentHandoff, move, Rig, Stage } from "./Motion";
export function WorkingWorld() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 10, 155, 0.96, 1.21) - move(f, 505, 645, 0, 0.41)}
        x={move(f, 10, 155, 0, -215)}
        y={move(f, 505, 645, 0, -150)}
        tilt={move(f, 10, 155, 0, -4)}
      >
        <ProductWindow
          frame={f + 480}
          inspectorProgress={move(f, 130, 180) * move(f, 645, 700, 1, 0)}
          inspector={
            f > 130 ? (
              <Appear at={130}>
                <BrowserDetail />
              </Appear>
            ) : undefined
          }
        >
          <ContentHandoff
            previous={<ConversationContents />}
            previousFrame={479}
          >
            <WorkingWorldContents />
          </ContentHandoff>
        </ProductWindow>
      </Rig>
      <Caption from={560} until={720}>
        Your working world.
        <br />
        Right here.
      </Caption>
    </Stage>
  );
}

export function WorkingWorldContents() {
  const f = useCurrentFrame();
  return (
    <>
      <Bubble owner>
        Turn our launch notes into
        <br />
        something we can use.
      </Bubble>
      <Appear at={35}>
        <Bubble>
          I’ll read the notes you’ve shared,
          <br />
          then work through the next steps.
        </Bubble>
      </Appear>
      <Appear at={215}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 15,
            fontSize: 21,
            color: "#777",
            padding: "10px 0",
          }}
        >
          <FileText size={23} />
          Launch notes · connected workspace
        </div>
      </Appear>
      <Appear at={300}>
        <Bubble>
          Research, owners and open questions.
          <br />
          All in the same conversation.
        </Bubble>
      </Appear>
      <Appear at={435}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 18,
          }}
        >
          <Users size={22} />
          <Mascot name="Pixel" size={34} frame={f} id="consult-pixel" />
          Asking Pixel to check the build.
        </div>
      </Appear>
    </>
  );
}
