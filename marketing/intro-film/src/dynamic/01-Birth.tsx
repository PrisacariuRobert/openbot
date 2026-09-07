import { Interactive, interpolate } from "remotion";
import {
  Actor,
  MaskWords,
  Portal,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Birth = () => {
  const frame = useMotionFrame();
  return (
    <Sheet>
      <Interactive.Div
        name="Macro to mascot pull-back"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "960px 560px",
          scale: interpolate(
            frame,
            [0, 12, 49, 90, 123],
            [12, 12, 1, 1, 0.9],
            curve,
          ),
          rotate: `${interpolate(frame, [0, 49, 100, 129], [-17, 0, 0, 5], curve)}deg`,
          translate: `0 ${interpolate(frame, [70, 107], [0, 156], curve)}px`,
        }}
      >
        <Actor
          x={960}
          y={540}
          size={420}
          rotate={interpolate(frame, [15, 33, 48, 63], [0, -10, 6, 0], settle)}
        />
        {[1, 2].map((kind) => (
          <Actor
            key={kind}
            kind={kind}
            x={interpolate(
              frame,
              [67 + kind * 6, 106 + kind * 6],
              [960, kind === 1 ? 610 : 1310],
              settle,
            )}
            y={
              540 +
              Math.sin(
                Math.min(1, Math.max(0, (frame - 67 - kind * 6) / 40)) *
                  Math.PI,
              ) *
                -150
            }
            size={330}
            scale={interpolate(
              frame,
              [66 + kind * 6, 81 + kind * 6],
              [0, 1],
              settle,
            )}
            rotate={interpolate(
              frame,
              [67 + kind * 6, 108 + kind * 6],
              [kind === 1 ? -55 : 55, 0],
              settle,
            )}
          />
        ))}
      </Interactive.Div>
      <MaskWords
        lines={["A little more life."]}
        at={56}
        size={146}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          top: 160,
          translate: `0 ${interpolate(frame, [113, 137], [0, -360], curve)}px`,
        }}
      />
      <Portal at={127} color="#101010" />
    </Sheet>
  );
};
