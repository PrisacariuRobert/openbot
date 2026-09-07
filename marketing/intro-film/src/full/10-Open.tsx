import { Interactive, interpolate } from "remotion";
import { Brand, Mascot } from "../components";
import { Shell, curve, enter, useShot } from "./shared";

export const OpenEnding = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="Open by design"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          opacity: 1 - enter(p, 0.35, 0.4),
          scale: interpolate(p, [0, 0.35], [1.05, 1], curve),
        }}
      >
        <Brand id="github" size={140} />
        <div>
          <div
            style={{ fontSize: 83, fontWeight: 600, letterSpacing: "-.04em" }}
          >
            Open source. Local first.
          </div>
          <div style={{ fontSize: 42, color: "#777", marginTop: 24 }}>
            Your computer. Your choices.
          </div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="The full product signature"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: enter(p, 0.37, 0.43),
          translate: `0 ${interpolate(p, [0.37, 0.5], [55, 0], curve)}px`,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <Mascot size={180} />
          <Mascot size={180} kind={1} phase={40} />
          <Mascot size={180} kind={2} phase={80} />
        </div>
        <div
          style={{
            fontSize: 113,
            letterSpacing: "-.045em",
            fontWeight: 630,
            marginTop: 38,
          }}
        >
          OpenBot
        </div>
        <div style={{ fontSize: 43, marginTop: 25, color: "#777" }}>
          A little team. A lot more possible.
        </div>
      </Interactive.Div>
    </Shell>
  );
};
