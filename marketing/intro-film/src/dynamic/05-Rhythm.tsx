import { Interactive, interpolate } from "remotion";
import { Repeat2, Check, Hand } from "lucide-react";
import {
  Actor,
  MaskWords,
  Portal,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Rhythm = () => {
  const frame = useMotionFrame();
  return (
    <Sheet>
      <MaskWords
        lines={["Good work.", "On repeat."]}
        at={3}
        size={129}
        style={{
          position: "absolute",
          left: 145,
          top: 125,
          translate: `0 ${interpolate(frame, [137, 173], [0, -540], curve)}px`,
        }}
      />
      <Interactive.Div
        name="Camera tracks along the week"
        style={{
          position: "absolute",
          top: 490,
          left: 710,
          display: "flex",
          gap: 26,
          translate: `${interpolate(frame, [0, 35, 75, 110, 144], [800, 0, -210, -445, -660], curve)}px 0`,
          rotate: `${interpolate(frame, [0, 45, 120, 162], [14, -4, -4, 0], curve)}deg`,
        }}
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Mon"].map((day, i) => (
          <div
            key={i}
            style={{
              width: 255,
              height: 295,
              padding: 30,
              borderRadius: 25,
              background: "#fff",
              border: "1px solid #e0e0e0",
              boxShadow: "0 25px 65px #0000000b",
            }}
          >
            <div style={{ fontSize: 25, color: "#777" }}>{day}</div>
            <div
              style={{
                fontSize: 99,
                fontWeight: 570,
                letterSpacing: -6,
                marginTop: 16,
              }}
            >
              {[7, 8, 9, 10, 11, 14][i]}
            </div>
            <div
              style={{
                fontSize: 22,
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {frame > 36 + i * 22 ? (
                <Check size={24} />
              ) : (
                <Repeat2 size={24} />
              )}
              09:00
            </div>
          </div>
        ))}
      </Interactive.Div>
      <Actor
        kind={2}
        size={177}
        x={interpolate(frame, [20, 75, 135], [280, 645, 1005], curve)}
        y={interpolate(
          frame,
          [20, 46, 74, 102, 135],
          [832, 744, 832, 734, 832],
          curve,
        )}
        rotate={Math.sin(frame / 15) * 9}
      />
      <Interactive.Div
        name="Learning becomes a reusable skill"
        style={{
          position: "absolute",
          left: 137,
          top: 908,
          fontSize: 29,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: interpolate(frame, [52, 70, 139, 158], [0, 1, 1, 0], settle),
        }}
      >
        <Hand size={30} />
        Teach once. Build on it tomorrow.
      </Interactive.Div>
      <Portal at={158} color="#101010" x={1050} y={635} />
    </Sheet>
  );
};
