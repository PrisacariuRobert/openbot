import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { ArrowUp, Plus } from "lucide-react";
import { Mascot } from "../components";

export const RequestShot = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: "#fff",
        color: "#161616",
        fontFamily: "Inter",
        overflow: "hidden",
      }}
    >
      <Interactive.Div
        name="Follow the conversation"
        style={{
          position: "absolute",
          left: 260,
          top: 20,
          width: 1400,
          translate: interpolate(
            frame,
            [0, 25, 55, 88, 126],
            ["0px 340px", "0px 0px", "0px 0px", "0px -240px", "0px -255px"],
            {
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.55, 0, 0.2, 1),
            },
          ),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            height: 200,
            borderBottom: "2px solid #ededed",
          }}
        >
          <Mascot size={100} />
          <span style={{ fontSize: 48, fontWeight: 650 }}>Nova</span>
        </div>
        <Interactive.Div
          name="One request"
          style={{
            marginTop: 74,
            marginLeft: 190,
            background: "#151515",
            color: "#fff",
            borderRadius: 54,
            padding: "46px 56px",
            fontSize: 65,
            lineHeight: 1.18,
            letterSpacing: "-.035em",
            clipPath: `inset(0 ${interpolate(
              frame,
              [0, 12],
              [100, 0],
              { extrapolateRight: "clamp" },
            )}% 0 0 round 54px)`,
          }}
        >
          Compare these two CSV files.
          <br />
          What changed?
        </Interactive.Div>
        <div
          style={{
            display: "flex",
            gap: 20,
            justifyContent: "flex-end",
            marginTop: 20,
            fontSize: 27,
            color: "#696969",
          }}
        >
          <span>last-month.csv</span>
          <span>·</span>
          <span>this-month.csv</span>
        </div>
        <Interactive.Div
          name="A proposal, not a dead end"
          style={{
            marginTop: 100,
            display: "flex",
            gap: 24,
            alignItems: "flex-start",
            opacity: interpolate(frame, [50, 58], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [50, 76], ["0px 65px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.2, 0.8, 0.3, 1),
            }),
          }}
        >
          <Mascot size={96} />
          <div
            style={{
              fontSize: 63,
              lineHeight: 1.19,
              letterSpacing: "-.035em",
              maxWidth: 1040,
            }}
          >
            I can build a small tool for that.
            <div
              style={{
                fontSize: 38,
                color: "#717171",
                marginTop: 24,
                letterSpacing: "-.02em",
              }}
            >
              Here’s the plan.
            </div>
          </div>
        </Interactive.Div>
        <div
          style={{
            marginTop: 110,
            borderTop: "2px solid #ededed",
            paddingTop: 30,
            display: "flex",
            alignItems: "center",
            gap: 25,
            color: "#a3a3a3",
            fontSize: 34,
          }}
        >
          <Plus size={40} />
          Message Nova
          <ArrowUp size={42} style={{ marginLeft: "auto" }} />
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
