import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Actor, Set, smooth, clamp, Title, Caption } from "./shared";

export const Rhythm = () => {
  const frame = useCurrentFrame();
  const travel = interpolate(frame, [0, 240], [0, 1510], clamp);
  return (
    <Set>
      <Title y={105} size={146}>
        Give it a rhythm.
      </Title>
      <Interactive.Div
        name="Camera tracks the working week"
        style={{
          position: "absolute",
          left: 160,
          top: 400,
          display: "flex",
          gap: 24,
          translate: `${-travel}px 0`,
          rotate: `y ${interpolate(frame, [0, 70, 240], [18, 0, -8], smooth)}deg`,
        }}
      >
        {["MON", "TUE", "WED", "THU", "FRI", "MON", "TUE"].map((day, i) => (
          <div
            key={i}
            style={{
              width: 430,
              height: 390,
              flexShrink: 0,
              borderTop: "3px solid #111",
              padding: 30,
              background: i === 3 ? "#111" : "#f0f0f0",
              color: i === 3 ? "white" : "#111",
            }}
          >
            <div style={{ fontSize: 27, letterSpacing: ".05em" }}>
              {day}
              <span style={{ float: "right", fontSize: 22 }}>08:00</span>
            </div>
            <div
              style={{
                fontSize: 206,
                fontWeight: 500,
                letterSpacing: "-.085em",
                lineHeight: 1.2,
              }}
            >
              {[7, 8, 9, 10, 11, 14, 15][i]}
            </div>
            <div style={{ fontSize: 25, color: i === 3 ? "#bbb" : "#777" }}>
              Prepare the day
            </div>
          </div>
        ))}
      </Interactive.Div>
      <Actor
        kind={2}
        size={260}
        style={{
          left: 1320,
          top: 310 - Math.abs(Math.sin(frame / 30)) * 75,
          rotate: `${Math.sin(frame / 30) * 10}deg`,
        }}
      />
      <Caption>Routines that return to the conversation.</Caption>
    </Set>
  );
};
