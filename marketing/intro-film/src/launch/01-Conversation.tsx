import { Interactive, useCurrentFrame } from "remotion";
import { Bubble, Mascot, ProductWindow, Wordmark } from "./Product";
import { Appear, move, Rig, Stage } from "./Motion";
export function Conversation() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 135, 255, 1.45, 0.96)}
        y={move(f, 135, 255, 180, 0)}
        tilt={move(f, 135, 255, -8, 0)}
      >
        <div style={{ opacity: move(f, 130, 180) }}>
          <ProductWindow frame={f}>
            <ConversationContents />
          </ProductWindow>
        </div>
      </Rig>
      {f < 235 && (
        <Interactive.Div
          name="Nova / enter the conversation"
          style={{
            position: "absolute",
            left: move(f, 140, 230, 675, 270),
            top: move(f, 140, 230, 40, -130),
            width: 570,
            height: 570,
            scale: move(f, 140, 230, 1, 0.065),
            rotate: `${move(f, 0, 95, -20, 0)}deg`,
            opacity: move(f, 205, 235, 1, 0),
          }}
        >
          <Mascot size={570} frame={f} id="opening-hero" />
        </Interactive.Div>
      )}
      <Interactive.Div
        name="Opening / promise"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          top: 590,
          fontSize: 128,
          fontWeight: 560,
          letterSpacing: "-.07em",
          lineHeight: 1,
          opacity: move(f, 14, 48) * move(f, 125, 160, 1, 0),
          translate: `0 ${move(f, 14, 60, 35, 0)}px`,
        }}
      >
        A little more
        <br />
        <span style={{ color: "#777" }}>possible.</span>
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 70,
          opacity: move(f, 0, 30) * move(f, 130, 160, 1, 0),
        }}
      >
        <Wordmark size={28} />
      </div>
    </Stage>
  );
}

export function ConversationContents() {
  const f = useCurrentFrame();
  return (
    <>
      <Appear at={190}>
        <Bubble owner>
          Turn our launch notes into
          <br />
          something we can use.
        </Bubble>
      </Appear>
      <Appear at={285}>
        <div
          style={{
            display: "flex",
            gap: 13,
            alignItems: "center",
            margin: "0 0 16px",
            fontSize: 18,
            color: "#777",
          }}
        >
          <Mascot size={32} frame={f} id="scene-one" />
          Nova
        </div>
        <Bubble>Let’s make it happen.</Bubble>
      </Appear>
    </>
  );
}
