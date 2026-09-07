import { Interactive, interpolate } from "remotion";
import { Laptop, Check } from "lucide-react";
import { Brand } from "../components";
import {
  Actor,
  MaskWords,
  Portal,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Orbit = () => {
  const frame = useMotionFrame();
  const rotation = interpolate(
    frame,
    [0, 90, 140, 210],
    [-1.4, 0.12, 0.2, 1.5],
    curve,
  );
  return (
    <Sheet dark>
      <MaskWords
        lines={["Your AI.", "Your call."]}
        at={8}
        size={141}
        style={{
          position: "absolute",
          left: 135,
          top: 240,
          opacity: interpolate(frame, [158, 180], [1, 0], curve),
        }}
      />
      <Interactive.Div
        name="Orbit camera"
        style={{
          position: "absolute",
          left: 1240,
          top: 535,
          scale: interpolate(
            frame,
            [0, 65, 142, 187],
            [0.42, 1, 1, 1.22],
            curve,
          ),
          rotate: `${interpolate(frame, [0, 90, 155, 195], [-18, 0, 0, 18], curve)}deg`,
        }}
      >
        <Actor x={0} y={0} size={240} rotate={Math.sin(frame / 30) * 5} />
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i * Math.PI * 2) / 5 + rotation;
          const x = Math.cos(angle) * 350,
            y = Math.sin(angle) * 295;
          return (
            <Interactive.Div
              key={i}
              name={`Orbiting provider ${i}`}
              style={{
                position: "absolute",
                left: x - 70,
                top: y - 70,
                width: 140,
                height: 140,
                borderRadius: 34,
                background: "#fff",
                color: "#111",
                display: "grid",
                placeItems: "center",
                scale: interpolate(
                  frame,
                  [9 + i * 4, 35 + i * 4],
                  [0, 1],
                  settle,
                ),
                rotate: `${-interpolate(frame, [0, 90, 155, 195], [-18, 0, 0, 18], curve)}deg`,
                boxShadow: "0 15px 40px #00000025",
              }}
            >
              {i < 4 ? (
                <Brand
                  id={["openai", "claude", "github", "opencode"][i]}
                  size={65}
                />
              ) : (
                <Laptop size={65} strokeWidth={1.5} />
              )}
            </Interactive.Div>
          );
        })}
      </Interactive.Div>
      <Interactive.Div
        name="Provider paths, not a setup list"
        style={{
          position: "absolute",
          left: 145,
          top: 687,
          display: "flex",
          gap: 26,
          fontSize: 25,
          color: "#aaa",
          opacity: interpolate(frame, [58, 85, 155, 180], [0, 1, 1, 0], settle),
        }}
      >
        <span>Subscription</span>
        <span>·</span>
        <span>API</span>
        <span>·</span>
        <span>Local</span>
      </Interactive.Div>
      <Interactive.Div
        name="Choice confirmed"
        style={{
          position: "absolute",
          left: 1150,
          top: 919,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 22,
          opacity: interpolate(
            frame,
            [122, 137, 159, 180],
            [0, 1, 1, 0],
            settle,
          ),
        }}
      >
        <Check size={24} />
        Chosen by you.
      </Interactive.Div>
      <Portal at={188} color="#fff" x={1240} y={540} />
    </Sheet>
  );
};
