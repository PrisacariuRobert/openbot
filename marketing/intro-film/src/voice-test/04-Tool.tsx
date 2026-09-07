import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Braces, ChevronRight, FileCode2, Search, Trash2 } from "lucide-react";
import { Mascot } from "../components";

export const ToolShot = () => {
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
        name="From task to file"
        style={{
          position: "absolute",
          left: 210,
          top: 130,
          width: 1500,
          translate: interpolate(
            frame,
            [0, 20, 72, 96],
            ["0px 190px", "0px 0px", "0px 0px", "0px -190px"],
            {
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.5, 0, 0.25, 1),
            },
          ),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            fontSize: 30,
            color: "#777",
          }}
        >
          <Mascot size={74} />
          <span>Nova</span>
          <ChevronRight size={26} />
          <span>Compare CSV files</span>
        </div>
        <Interactive.Div
          name="Same request continues"
          style={{
            fontSize: 69,
            letterSpacing: "-.04em",
            fontWeight: 550,
            margin: "42px 0 55px",
          }}
        >
          Building your new tool.
        </Interactive.Div>
        <Interactive.Div
          name="Tool emerges"
          style={{
            position: "relative",
            height: 340,
            borderTop: "2px solid #e8e8e8",
            borderBottom: "2px solid #e8e8e8",
            display: "flex",
            alignItems: "center",
            gap: 46,
            clipPath: `inset(0 ${interpolate(
              frame,
              [4, 28],
              [100, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.2, 0.8, 0.3, 1),
              },
            )}% 0 0)`,
          }}
        >
          <div
            style={{
              height: 206,
              width: 165,
              border: "3px solid #181818",
              borderRadius: 17,
              display: "grid",
              placeItems: "center",
              background: "#fff",
            }}
          >
            <Braces size={88} strokeWidth={1.4} />
          </div>
          <div>
            <div style={{ fontSize: 66, letterSpacing: "-.045em" }}>
              compare_csv.ts
            </div>
            <div style={{ fontSize: 32, color: "#777", marginTop: 20 }}>
              Nova’s workspace
            </div>
          </div>
        </Interactive.Div>
        <Interactive.Div
          name="Files, under your control"
          style={{
            marginTop: 66,
            opacity: interpolate(frame, [74, 90], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 36,
              fontWeight: 650,
              paddingBottom: 26,
            }}
          >
            Files
            <Search size={34} />
          </div>
          <div
            style={{
              borderTop: "2px solid #e8e8e8",
              borderBottom: "2px solid #e8e8e8",
              padding: "28px 0",
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontSize: 36,
            }}
          >
            <FileCode2 size={42} />
            <span>compare_csv.ts</span>
            <span style={{ marginLeft: "auto", fontSize: 29 }}>Inspect</span>
            <ChevronRight size={29} />
            <Trash2 size={32} style={{ marginLeft: 44 }} />
          </div>
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
