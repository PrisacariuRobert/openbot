import { Interactive, interpolate } from "remotion";
import { Check, Laptop } from "lucide-react";
import { Brand, Mascot } from "../components";
import { Shell, curve, open, useShot } from "./shared";

export const YourTeam = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="Create the teammate, then choose its AI"
        style={{
          position: "absolute",
          left: 190,
          top: 110,
          width: 1540,
          translate: `0 ${interpolate(p, [0, 0.07, 0.42, 0.53], [140, 0, 0, -370], curve)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 65,
            height: 350,
            opacity: interpolate(p, [0.38, 0.47], [1, 0], curve),
          }}
        >
          <Interactive.Div
            name="A character of your own"
            style={{
              scale: interpolate(p, [0, 0.1], [0.6, 1], open),
              rotate: `${interpolate(p, [0, 0.15], [-14, 0], open)}deg`,
            }}
          >
            <Mascot size={270} kind={p < 0.19 ? 0 : p < 0.27 ? 1 : 2} />
          </Interactive.Div>
          <div>
            <div style={{ fontSize: 30, color: "#777", marginBottom: 18 }}>
              YOUR NEW TEAMMATE
            </div>
            <div
              style={{ fontSize: 92, fontWeight: 610, letterSpacing: "-.04em" }}
            >
              Fern
            </div>
            <div style={{ fontSize: 43, color: "#777", marginTop: 15 }}>
              Keep our launch on track.
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            padding: "18px 0 60px 42px",
            opacity: interpolate(p, [0.38, 0.47], [1, 0], curve),
          }}
        >
          {["#6c58de", "#e7658c", "#29a47d", "#5995d5", "#dba440"].map(
            (color, i) => (
              <div
                key={color}
                style={{
                  height: 30,
                  width: 30,
                  background: color,
                  borderRadius: 20,
                  outline: (p < 0.19 ? i === 0 : p < 0.27 ? i === 1 : i === 2)
                    ? "2px solid #151515"
                    : "none",
                  outlineOffset: 7,
                }}
              />
            ),
          )}
        </div>
        <div style={{ height: 2, background: "#e8e8e8", marginBottom: 42 }} />
        <div
          style={{
            fontSize: 60,
            fontWeight: 590,
            letterSpacing: "-.035em",
            marginBottom: 40,
          }}
        >
          Choose your AI.
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          {[
            ["openai", "OpenAI"],
            ["claude", "Claude"],
            ["", "Local model"],
          ].map(([id, label], i) => (
            <div
              key={label}
              style={{
                width: 485,
                height: 210,
                border: `2px solid ${i === 1 && p > 0.65 ? "#171717" : "#e4e4e4"}`,
                borderRadius: 28,
                padding: 32,
                position: "relative",
              }}
            >
              {id ? <Brand id={id} size={53} /> : <Laptop size={53} />}
              <div style={{ fontSize: 38, marginTop: 23 }}>{label}</div>
              {i === 1 && p > 0.65 && (
                <Check
                  size={34}
                  style={{ position: "absolute", right: 26, top: 28 }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 31, color: "#777", marginTop: 32 }}>
          Supported subscriptions · API keys · Local models
        </div>
      </Interactive.Div>
    </Shell>
  );
};
