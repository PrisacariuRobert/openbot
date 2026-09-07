import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Check, MousePointer2, FileCode2 } from "lucide-react";

export const ApprovalShot = () => {
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
        name="Move across the review"
        style={{
          position: "absolute",
          left: 210,
          top: 90,
          width: 1500,
          scale: interpolate(frame, [0, 16, 76, 130], [1.06, 1, 1, 1.08], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.2, 0.7, 0.2, 1),
          }),
          transformOrigin: "1100px 750px",
        }}
      >
        <div style={{ fontSize: 28, color: "#777", marginBottom: 24 }}>
          COMPARE CSV FILES
        </div>
        <Interactive.Div
          name="Review heading"
          style={{
            fontSize: 84,
            fontWeight: 630,
            letterSpacing: "-.045em",
            marginBottom: 60,
          }}
        >
          Build the missing tool?
        </Interactive.Div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "245px 1fr",
            fontSize: 37,
            gap: "30px 32px",
            alignItems: "baseline",
          }}
        >
          <span style={{ color: "#777" }}>Capability</span>
          <span>Compare two CSV files</span>
          <span style={{ color: "#777" }}>Plan</span>
          <span>Find added, removed and changed rows.</span>
          <span style={{ color: "#777" }}>New file</span>
          <span style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <FileCode2 size={35} />
            compare_csv.ts
          </span>
        </div>
        <div
          style={{ height: 2, background: "#e8e8e8", margin: "43px 0 30px" }}
        />
        <Interactive.Div
          name="Coding-model preference"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 32,
            opacity: interpolate(frame, [35, 48], [0.35, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ color: "#777" }}>Coding model</span>
          <span>Your selected coding model</span>
        </Interactive.Div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 68,
          }}
        >
          <span style={{ fontSize: 31, color: "#777" }}>
            Waiting for your approval
          </span>
          <Interactive.Div
            name="Approve deliberately"
            style={{
              height: 100,
              width: 380,
              borderRadius: 50,
              background: "#151515",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              fontSize: 37,
              fontWeight: 560,
              scale: interpolate(frame, [101, 105, 110], [1, 0.96, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {frame < 106 ? (
              "Approve & build"
            ) : (
              <>
                <Check size={40} />
                Approved
              </>
            )}
          </Interactive.Div>
        </div>
        <Interactive.Div
          name="Owner approves"
          style={{
            position: "absolute",
            left: 1260,
            top: 682,
            opacity: interpolate(frame, [76, 78], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [78, 100],
              ["270px 170px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.2, 0.7, 0.3, 1),
              },
            ),
          }}
        >
          <MousePointer2
            size={57}
            fill="#fff"
            color="#151515"
            strokeWidth={1.5}
          />
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
