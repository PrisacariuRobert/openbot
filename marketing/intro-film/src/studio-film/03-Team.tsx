import { Interactive, useCurrentFrame } from "remotion";
import { Character } from "./Character";
import { Camera, Message, Reveal, Shell, tween, WorkLine } from "./UI";

export function Team() {
  const f = useCurrentFrame();
  const flight = tween(f, 0, 55);
  return (
    <Camera
      zoom={tween(f, 0, 70, 1.45, 0.98) + tween(f, 195, 255, 0, 0.57)}
      x={tween(f, 0, 70, -200, 0) - tween(f, 195, 255, 0, 190)}
      y={tween(f, 0, 70, 40, 0) + tween(f, 195, 255, 0, 30)}
    >
      <Shell active>
        <Message user>Prepare Friday’s client review.</Message>
        <Message at={35}>
          Milo will shape the deck. Fern will check the costs.
          <br />
          I’ll bring you one finished answer.
        </Message>
        <Reveal at={210}>
          <WorkLine>Consulted with 2 teammates</WorkLine>
          <div
            style={{
              borderTop: "1px solid #e9e9e9",
              borderBottom: "1px solid #e9e9e9",
              padding: "16px 0",
              display: "grid",
              gap: 20,
            }}
          >
            {[
              ["Milo", "Deck outline ready. I’ve kept your concise style."],
              [
                "Fern",
                "The receipts use two number formats. We need a small importer.",
              ],
            ].map(([n, text], i) => (
              <Reveal
                key={n}
                at={220 + i * 70}
                style={{
                  display: "flex",
                  gap: 13,
                  alignItems: "center",
                  fontSize: 22,
                }}
              >
                <Character name={n as "Milo" | "Fern"} size={43} />
                <span>{text}</span>
              </Reveal>
            ))}
          </div>
        </Reveal>
        <Message at={395}>
          I can build that importer. Here’s exactly what I’d add.
        </Message>
      </Shell>
      {f < 210 && (
        <Interactive.Div
          name="Mascots / consultation handoff"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1600,
            height: 880,
            pointerEvents: "none",
          }}
        >
          {(["Milo", "Fern"] as const).map((name, i) => (
            <div
              key={name}
              style={{
                position: "absolute",
                left: tween(f, 90 + i * 15, 180 + i * 15, 600 + i * 255, 350),
                top: tween(
                  f,
                  90 + i * 15,
                  180 + i * 15,
                  440 - i * 20,
                  292 + i * 95,
                ),
                scale: tween(f, 90 + i * 15, 180 + i * 15, 1, 0.18),
                opacity: tween(f, 165, 208, 1, 0),
                translate: `${(1 - flight) * (i ? 900 : -900)}px 0`,
                rotate: `${tween(f, 0, 55, i ? 30 : -30, 0)}deg`,
              }}
            >
              <Character name={name} size={250} busy gaze={i ? -1.5 : 1.5} />
            </div>
          ))}
        </Interactive.Div>
      )}
    </Camera>
  );
}
