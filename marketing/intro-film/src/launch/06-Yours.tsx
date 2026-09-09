import { YourAIContents } from "./YourAIChoice";
import { Interactive, useCurrentFrame } from "remotion";
import { Mascot, ProductWindow, Wordmark } from "./Product";
import { ContentHandoff, move, Rig, Stage } from "./Motion";
export function Yours() {
  const f = useCurrentFrame();
  return (
    <Stage dark darkness={move(f, 0, 120)}>
      <Rig
        scale={move(f, 0, 150, 0.88, 0.7)}
        x={move(f, 0, 150, -70, 0)}
        y={move(f, 0, 150, -125, -150)}
        tilt={move(f, 0, 150, 0, -5)}
      >
        <div style={{ opacity: move(f, 180, 240, 1, 0) }}>
          <ProductWindow frame={f + 3720}>
            <ContentHandoff previous={<YourAIContents />} previousFrame={479}>
              <YoursContents />
            </ContentHandoff>
          </ProductWindow>
        </div>
      </Rig>
      <Interactive.Div
        name="Closing / own your AI"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 720,
          fontSize: 83,
          textAlign: "center",
          letterSpacing: "-.06em",
          fontWeight: 540,
          opacity: move(f, 60, 100) * move(f, 175, 230, 1, 0),
          translate: `0 ${move(f, 60, 100, 30, 0)}px`,
        }}
      >
        Your team. Your AI. Your rules.
      </Interactive.Div>
      <Interactive.Div
        name="Closing / source invitation"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 825,
          textAlign: "center",
          fontSize: 25,
          color: "#dedede",
          letterSpacing: "-.015em",
          opacity: move(f, 405, 435),
        }}
      >
        Explore the project · github.com/PrisacariuRobert/openbot
      </Interactive.Div>
      <Interactive.Div
        name="Closing / original characters"
        style={{
          position: "absolute",
          left: 555,
          top: 225,
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: move(f, 210, 260),
          scale: move(f, 210, 335, 0.72, 1),
          translate: `0 ${move(f, 210, 300, 80, 0)}px`,
        }}
      >
        <Mascot name="Nova" size={270} frame={f} id="end-nova" />
        <Mascot name="Pixel" size={270} frame={f + 40} id="end-pixel" />
        <Mascot name="Scout" size={270} frame={f + 80} id="end-scout" />
      </Interactive.Div>
      <Interactive.Div
        name="Closing / wordmark"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 545,
          textAlign: "center",
          opacity: move(f, 255, 295),
        }}
      >
        <Wordmark size={108} />
      </Interactive.Div>
      <Interactive.Div
        name="Closing / open invitation"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 710,
          textAlign: "center",
          fontSize: 39,
          letterSpacing: "-.025em",
          color: "#aaa",
          opacity: move(f, 300, 345),
        }}
      >
        Open source. A little more possible.
      </Interactive.Div>
    </Stage>
  );
}

export function YoursContents() {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 60,
        padding: "25px 35px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 260,
          height: 260,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: move(f, 90, 112, 1, 0),
            scale: move(f, 90, 112, 1, 0.9),
          }}
        >
          <Mascot
            size={260}
            frame={f}
            shape="nova"
            color="#528ed1"
            label="Iris"
            id="custom-film-before"
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: move(f, 90, 112),
            scale: move(f, 90, 125, 0.9, 1),
          }}
        >
          <Mascot
            size={260}
            frame={f}
            shape="orbit"
            color="#528ed1"
            label="Iris"
            id="custom-film-after"
          />
        </div>
      </div>
      <div>
        <h2
          style={{
            fontSize: 50,
            letterSpacing: -2,
            lineHeight: 1.1,
            margin: "0 0 25px",
          }}
        >
          Create your teammate.
        </h2>
        <p style={{ fontSize: 30, margin: "0 0 18px" }}>Iris</p>
        <p style={{ fontSize: 22, color: "#777", margin: 0 }}>
          A name. A role. A personality.
        </p>
        <div style={{ display: "flex", gap: 18, marginTop: 35 }}>
          {["#6757d9", "#ee6c98", "#299575", "#528ed1", "#c28735"].map(
            (color) => (
              <span
                key={color}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: color,
                }}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
