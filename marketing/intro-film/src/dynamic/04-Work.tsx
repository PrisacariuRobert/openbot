import { Interactive, interpolate } from "remotion";
import { LockKeyhole } from "lucide-react";
import { Brand } from "../components";
import {
  Actor,
  MaskWords,
  Sheet,
  WorkFile,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Work = () => {
  const frame = useMotionFrame();
  return (
    <Sheet>
      <Interactive.Div
        name="Apps converge into work"
        style={{
          position: "absolute",
          inset: 0,
          scale: interpolate(
            frame,
            [0, 35, 85, 120],
            [1.35, 1, 1, 0.65],
            curve,
          ),
          translate: `0 ${interpolate(frame, [85, 126], [0, -650], curve)}px`,
        }}
      >
        <Actor
          x={960}
          y={500}
          size={220}
          rotate={interpolate(frame, [0, 40, 65, 100], [10, -5, 0, -12], curve)}
        />
        {[
          "gmail",
          "googlecalendar",
          "googledrive",
          "slack",
          "notion",
          "github",
        ].map((id, i) => {
          const angle = (i * Math.PI) / 3 + frame / 220;
          const radius = interpolate(
            frame,
            [0, 33, 65, 104],
            [870, 375, 375, 90],
            curve,
          );
          return (
            <Interactive.Div
              key={id}
              name={`${id} enters the workflow`}
              style={{
                position: "absolute",
                left: 960 + Math.cos(angle) * radius - 62,
                top: 500 + Math.sin(angle) * radius * 0.66 - 62,
                width: 124,
                height: 124,
                borderRadius: 30,
                background: "#fff",
                border: "1px solid #e4e4e4",
                display: "grid",
                placeItems: "center",
                scale: interpolate(frame, [84, 111], [1, 0.15], curve),
                opacity: interpolate(frame, [94, 114], [1, 0], curve),
              }}
            >
              <Brand id={id} size={55} />
            </Interactive.Div>
          );
        })}
        <div
          style={{
            position: "absolute",
            top: 884,
            left: 0,
            width: 1920,
            textAlign: "center",
            fontSize: 28,
            color: "#777",
            opacity: interpolate(
              frame,
              [24, 43, 80, 105],
              [0, 1, 1, 0],
              settle,
            ),
          }}
        >
          <LockKeyhole
            size={23}
            style={{ verticalAlign: "middle", marginRight: 10 }}
          />
          You sign in. Your teammate gets to work.
        </div>
      </Interactive.Div>
      <MaskWords
        lines={["In your world."]}
        at={10}
        size={102}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          top: 83,
          translate: `0 ${interpolate(frame, [85, 117], [0, -250], curve)}px`,
        }}
      />
      <MaskWords
        lines={["Real work. Delivered."]}
        at={115}
        size={104}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          top: 95,
        }}
      />
      <Interactive.Div
        name="Deliverables fan out in depth"
        style={{
          position: "absolute",
          inset: 0,
          perspective: 1400,
          scale: interpolate(
            frame,
            [114, 160, 201, 239],
            [0.86, 1, 1, 1.04],
            curve,
          ),
          translate: `0 ${interpolate(frame, [114, 160, 220, 240], [460, 0, 0, -60], curve)}px`,
        }}
      >
        {[0, 1, 2, 3].map((kind) => (
          <Interactive.Div
            key={kind}
            name={`Delivered artifact ${kind}`}
            style={{
              position: "absolute",
              left: interpolate(
                frame,
                [108 + kind * 7, 157 + kind * 7],
                [775, 148 + kind * 406],
                settle,
              ),
              top: 388 + Math.sin((frame + kind * 22) / 60) * 7,
              opacity: interpolate(
                frame,
                [108 + kind * 7, 124 + kind * 7],
                [0, 1],
                settle,
              ),
              transform: `rotateY(${interpolate(frame, [108 + kind * 7, 160 + kind * 7, 215, 240], [70 - kind * 45, 0, 0, -5], curve)}deg)`,
              rotate: `${interpolate(frame, [108 + kind * 7, 166 + kind * 7], [25 - kind * 16, 0], settle)}deg`,
            }}
          >
            <WorkFile kind={kind} />
          </Interactive.Div>
        ))}
      </Interactive.Div>
      <Interactive.Div
        name="Artifact lifts into next scene"
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          clipPath: `inset(${interpolate(frame, [224, 240], [100, 0], curve)}% 0 0 0)`,
        }}
      />
    </Sheet>
  );
};
