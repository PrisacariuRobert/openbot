import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Stage, Mascot, ease } from "../components";

export const Matters = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Human benefit"
        style={{
          position: "absolute",
          left: 180,
          top: 185,
          fontSize: 139,
          fontWeight: 600,
          letterSpacing: -7,
          lineHeight: 1.08,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
          translate: `0 ${interpolate(frame, [0, 45], [60, 0], ease)}px`,
        }}
      >
        For the work
        <br />
        that matters.
      </Interactive.Div>
      {[0, 1, 2, 3, 4, 5].map((kind) => (
        <Interactive.Div
          name={`Meet teammate ${kind + 1}`}
          key={kind}
          style={{
            position: "absolute",
            left: 177 + kind * 266,
            top: 650,
            translate: `0 ${interpolate(frame, [20 + kind * 7, 63 + kind * 7], [280, 0], ease) + Math.sin((frame + kind * 18) / 30) * 7}px`,
            rotate: `${interpolate(frame, [20 + kind * 7, 70 + kind * 7], [kind % 2 ? -12 : 12, 0], ease)}deg`,
          }}
        >
          <Mascot kind={kind} phase={kind * 17} size={205} />
        </Interactive.Div>
      ))}
    </Stage>
  );
};
