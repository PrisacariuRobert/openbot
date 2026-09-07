import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ArrowUp } from "lucide-react";
import { Actor, Set, clamp, smooth } from "./shared";

export const Spark = () => {
  const frame = useCurrentFrame();
  return (
    <Set dark>
      <Interactive.Div
        name="Question becomes conversation"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "960px 540px",
          scale: interpolate(
            frame,
            [0, 28, 120, 168],
            [1.2, 1, 1, 0.62],
            smooth,
          ),
          rotate: `${interpolate(frame, [130, 180], [0, -8], smooth)}deg`,
          translate: `0 ${interpolate(frame, [155, 220], [0, -90], smooth)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 155,
            top: 160,
            fontSize: 236,
            lineHeight: 0.96,
            fontWeight: 630,
            letterSpacing: "-.075em",
            opacity: interpolate(frame, [0, 14, 74, 90], [0, 1, 1, 0], clamp),
          }}
        >
          What if
          <br />
          work moved?
        </div>
        <Interactive.Div
          name="The request enters"
          style={{
            position: "absolute",
            left: 170,
            top: 320,
            width: 1570,
            height: 270,
            borderRadius: 150,
            background: "#f7f7f7",
            color: "#111",
            display: "flex",
            alignItems: "center",
            padding: "0 78px",
            fontSize: 91,
            fontWeight: 500,
            letterSpacing: "-.055em",
            scale: interpolate(frame, [78, 109], [0.5, 1], smooth),
            opacity: interpolate(frame, [78, 89], [0, 1], clamp),
          }}
        >
          Take care of the launch.
          <div
            style={{
              marginLeft: "auto",
              width: 108,
              height: 108,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "#111",
              color: "white",
              scale: interpolate(frame, [122, 131, 147], [1, 0.83, 1], smooth),
            }}
          >
            <ArrowUp size={66} />
          </div>
        </Interactive.Div>
      </Interactive.Div>
      <Interactive.Div
        name="Nova catches the message"
        style={{
          position: "absolute",
          left: 725,
          top: 430,
          scale: interpolate(frame, [150, 192, 220], [0, 1.1, 1], smooth),
          rotate: `${interpolate(frame, [150, 210], [40, 0], smooth)}deg`,
          translate: `0 ${interpolate(frame, [190, 240], [0, -15], smooth)}px`,
        }}
      >
        <Actor size={470} style={{ position: "relative" }} />
      </Interactive.Div>
    </Set>
  );
};
