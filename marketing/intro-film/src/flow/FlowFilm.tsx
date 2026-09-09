import { Easing, interpolate, useCurrentFrame } from "remotion";
import { Mascot, Wordmark } from "../launch/Product";
import { Rig, Stage, move } from "../launch/Motion";
import { FlowWindow } from "./FlowWindow";
import { FlowConversation } from "./FlowConversation";
import { FlowPanels } from "./FlowPanels";
import { events, targets } from "./timeline";

// Pointer coordinates are in the app's coordinate space, inside the same rig.
// The UI and its pointer therefore cannot drift apart during a camera move.
function Pointer({ frame: f }: { frame: number }) {
  let x = 380,
    y = 340;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const previous = events[i - 1];
    const start = Math.max(previous ? previous.at + 9 : 95, e.at - 37);
    const dest = targets[e.target];
    if (f >= e.at - 4) {
      x = dest[0];
      y = dest[1];
      continue;
    }
    if (f >= start) {
      const p = move(f, start, e.at - 4);
      x += (dest[0] - x) * p;
      y += (dest[1] - y) * p;
    }
    break;
  }
  const click = events.find((e) => f >= e.at && f < e.at + 21);
  const age = click ? f - click.at : 99;
  const press =
    age < 5 ? 1 - age * 0.023 : age < 15 ? 0.885 + (age - 5) * 0.0115 : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 30,
        opacity: move(f, 104, 125) * move(f, 3310, 3340, 1, 0),
        pointerEvents: "none",
      }}
    >
      {click && (
        <span
          style={{
            position: "absolute",
            left: -19,
            top: -19,
            width: 38,
            height: 38,
            border: "1.3px solid #222",
            borderRadius: "50%",
            scale: 0.45 + age * 0.035,
            opacity: (1 - age / 21) * 0.4,
          }}
        />
      )}
      <svg
        width="31"
        height="38"
        viewBox="0 0 31 38"
        style={{
          overflow: "visible",
          scale: press,
          transformOrigin: "0 0",
          filter: "drop-shadow(1px 2px 2px #00000030)",
        }}
      >
        <path
          d="M1 1 L3 28 L10 22 L17 35 L23 32 L16 20 L27 18 Z"
          fill="#202020"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const cameraKeys = [
  [0, 1.18, 0, 155],
  [120, 0.89, 0, -65],
  [325, 0.89, 0, -65],
  [452, 1.035, -170, -58],
  [653, 1.035, -170, -58],
  [748, 0.88, 0, -70],
  [940, 0.96, 45, -70],
  [1090, 0.96, 45, -70],
  [1145, 1.035, -170, -58],
  [1370, 1.035, -170, -58],
  [1465, 0.94, 0, -70],
  [1580, 1.035, -170, -58],
  [1715, 1.035, -170, -58],
  [1790, 0.88, 0, -70],
  [1940, 1.02, -160, -58],
  [2210, 1.02, -160, -58],
  [2280, 0.88, 0, -70],
  [2440, 1.035, -170, -58],
  [2690, 1.035, -170, -58],
  [2790, 0.88, 0, -70],
  [2890, 1.02, -160, -58],
  [3045, 1.02, -160, -58],
  [3120, 0.9, 0, -70],
  [3310, 0.9, 0, -70],
  [3455, 0.62, 0, -90],
] as const;
export function cameraAt(f: number) {
  const sample = (index: 1 | 2 | 3) =>
    interpolate(
      f,
      cameraKeys.map((k) => k[0]),
      cameraKeys.map((k) => k[index]),
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.42, 0, 0.2, 1),
      },
    );
  return { scale: sample(1), x: sample(2), y: sample(3) };
}
const captions = [
  [235, 405, "Start with a conversation."],
  [490, 715, "Open the world you work in."],
  [795, 1080, "One team. Working together."],
  [1170, 1430, "Approve the plan. Build the missing piece."],
  [1580, 1730, "Open the result. See the work."],
  [1940, 2240, "Make good work a routine."],
  [2410, 2710, "Bring your subscriptions. Choose your models."],
  [2850, 3310, "A teammate that’s yours to create."],
] as const;
export function FlowFilm() {
  const f = useCurrentFrame();
  const dark = move(f, 3370, 3480);
  const hero = move(f, 12, 67) * move(f, 88, 151, 1, 0);
  return (
    <Stage darkness={dark}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 38,
          textAlign: "center",
          fontSize: 13,
          letterSpacing: 2,
          color: "#999",
          opacity: move(f, 80, 135) * move(f, 3330, 3370, 1, 0),
        }}
      >
        OPENBOT · A LITTLE MORE POSSIBLE
      </div>
      <div style={{ opacity: move(f, 65, 120) * move(f, 3350, 3460, 1, 0) }}>
        <Rig {...cameraAt(f)}>
          <FlowWindow
            frame={f}
            panel={<FlowPanels frame={f} />}
            pointer={<Pointer frame={f} />}
          >
            <FlowConversation frame={f} />
          </FlowWindow>
        </Rig>
      </div>
      <div
        style={{
          position: "absolute",
          left: move(f, 70, 146, 717, 298),
          top: move(f, 70, 146, 176, 88),
          scale: move(f, 70, 146, 1, 0.065),
          transformOrigin: "0 0",
          opacity: hero,
        }}
      >
        <Mascot name="Nova" size={480} frame={f} id="flow-opening" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 665,
          textAlign: "center",
          fontSize: 79,
          fontWeight: 580,
          letterSpacing: "-.065em",
          opacity: move(f, 20, 60) * move(f, 76, 110, 1, 0),
          translate: `0 ${move(f, 20, 62, 28, 0)}px`,
        }}
      >
        A little more possible.
      </div>
      {captions.map(([start, end, text]) => (
        <div
          key={start}
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            bottom: 33,
            textAlign: "center",
            fontSize: 39,
            fontWeight: 550,
            letterSpacing: "-.035em",
            lineHeight: 1.15,
            opacity: move(f, start, start + 25) * move(f, end - 20, end, 1, 0),
            translate: `0 ${move(f, start, start + 30, 12, 0)}px`,
          }}
        >
          {text}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 214,
          display: "flex",
          justifyContent: "center",
          gap: 23,
          opacity: move(f, 3400, 3460),
          translate: `0 ${move(f, 3390, 3480, 65, 0)}px`,
        }}
      >
        {(["Nova", "Pixel", "Scout"] as const).map((name, i) => (
          <div
            key={name}
            style={{ translate: `0 ${Math.sin(f / 25 + i) * 6}px` }}
          >
            <Mascot
              name={name}
              frame={f + i * 40}
              size={216}
              id={`closing-${name}`}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 493,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "white",
          opacity: move(f, 3420, 3470),
        }}
      >
        <Wordmark size={91} />
        <p
          style={{
            fontSize: 32,
            margin: "26px 0 23px",
            letterSpacing: "-.02em",
            color: "#bcbcbc",
          }}
        >
          Your team. Your AI. Open source.
        </p>
        <div
          style={{ fontSize: 22, color: "#999", opacity: move(f, 3470, 3500) }}
        >
          github.com/PrisacariuRobert/openbot
        </div>
      </div>
    </Stage>
  );
}
