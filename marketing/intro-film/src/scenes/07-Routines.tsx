import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import { Stage, Mascot, Pill, ease } from "../components";

export const Routines = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Routines benefit"
        style={{
          position: "absolute",
          left: 156,
          top: 223,
          fontSize: 132,
          fontWeight: 600,
          lineHeight: 1.08,
          letterSpacing: -6,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
        }}
      >
        Less on
        <br />
        your mind.
      </Interactive.Div>
      <Interactive.Div
        name="Routines subtitle"
        style={{
          position: "absolute",
          left: 161,
          top: 566,
          width: 580,
          fontSize: 32,
          lineHeight: 1.5,
          color: "#777",
          opacity: interpolate(frame, [25, 48], [0, 1], ease),
        }}
      >
        Turn good work into a routine.
        <br />
        Keep the important things moving.
      </Interactive.Div>
      <div style={{ position: "absolute", left: 170, top: 763 }}>
        <Mascot kind={2} size={164} />
      </div>
      <Interactive.Div
        name="Routine editor — refined native direction"
        style={{
          position: "absolute",
          left: 1070,
          top: 152,
          width: 640,
          background: "#fff",
          padding: 42,
          border: "1px solid #dedede",
          borderRadius: 26,
          translate: `0 ${interpolate(frame, [15, 65], [150, 0], ease)}px`,
          opacity: interpolate(frame, [15, 40], [0, 1], ease),
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>
          Make it a routine
        </div>
        <div style={{ fontSize: 21, color: "#777", marginTop: 12 }}>
          A little work, taken care of regularly.
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            marginTop: 39,
            marginBottom: 13,
          }}
        >
          What should happen?
        </div>
        <div
          style={{
            padding: "21px 20px",
            border: "1px solid #e3e3e3",
            borderRadius: 13,
            height: 133,
            fontSize: 23,
            lineHeight: 1.4,
          }}
        >
          Review our launch tasks and prepare
          <br />
          the next steps for the team.
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 27 }}>
          {["When", "At · 24-hour"].map((label, i) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 19, marginBottom: 13, fontWeight: 550 }}>
                {label}
              </div>
              <div
                style={{
                  padding: 18,
                  border: "1px solid #e3e3e3",
                  borderRadius: 12,
                  fontSize: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                {i ? "09:00" : "Every weekday"}
                {i ? <Clock3 size={21} /> : <ChevronDown size={20} />}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 19, color: "#777", marginTop: 22 }}>
          Next · Monday at 09:00
        </div>
        <div style={{ fontSize: 20, marginTop: 32 }}>
          › &nbsp; Name & teammate
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 38 }}
        >
          <Pill primary>
            {frame > 140 ? (
              <>
                <Check size={22} />
                Routine created
              </>
            ) : (
              "Create routine"
            )}
          </Pill>
        </div>
      </Interactive.Div>
    </Stage>
  );
};
