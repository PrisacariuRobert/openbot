import { Interactive, interpolate } from "remotion";
import { Check, FileCode2, MousePointer2, Trash2 } from "lucide-react";
import { Shell, curve, enter, useShot } from "./shared";

export const Extend = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="The missing piece, with permission"
        style={{
          position: "absolute",
          left: 210,
          top: 150,
          width: 1500,
          opacity: 1 - enter(p, 0.53, 0.57),
          translate: `0 ${interpolate(p, [0.5, 0.61], [0, -170], curve)}px`,
        }}
      >
        <div style={{ fontSize: 79, fontWeight: 590, letterSpacing: "-.04em" }}>
          “I can build a tool for that.”
        </div>
        <div
          style={{
            marginTop: 60,
            padding: "30px 0",
            borderTop: "2px solid #e5e5e5",
            borderBottom: "2px solid #e5e5e5",
            fontSize: 39,
            lineHeight: 1.65,
          }}
        >
          Compare the two feedback files.
          <br />
          <span style={{ color: "#777" }}>
            Plan: find added, removed and changed rows.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 31,
            marginTop: 35,
            color: "#777",
          }}
        >
          <span>compare_csv.ts</span>
          <span>Your chosen coding model</span>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 55 }}
        >
          <div
            style={{
              background: "#151515",
              color: "#fff",
              fontSize: 36,
              borderRadius: 60,
              padding: "26px 38px",
              display: "flex",
              alignItems: "center",
              gap: 17,
            }}
          >
            {p > 0.42 ? (
              <>
                <Check size={35} />
                Approved
              </>
            ) : (
              <>
                Approve & build
                <MousePointer2 size={35} />
              </>
            )}
          </div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="A tool you own"
        style={{
          position: "absolute",
          left: 240,
          top: 170,
          width: 1440,
          opacity: enter(p, 0.53, 0.57),
          translate: `${interpolate(p, [0.53, 0.66], [400, 0], curve)}px 0`,
        }}
      >
        <div style={{ fontSize: 29, color: "#777" }}>
          SAME TASK · CONTINUING WITH YOUR CODING MODEL
        </div>
        <div
          style={{
            marginTop: 65,
            display: "flex",
            alignItems: "center",
            gap: 50,
          }}
        >
          <div
            style={{
              height: 280,
              width: 220,
              border: "3px solid #151515",
              borderRadius: 22,
              display: "grid",
              placeItems: "center",
            }}
          >
            <FileCode2 size={115} strokeWidth={1.3} />
          </div>
          <div>
            <div style={{ fontSize: 79, letterSpacing: "-.045em" }}>
              compare_csv.ts
            </div>
            <div style={{ fontSize: 34, marginTop: 24, color: "#777" }}>
              Saved in your teammate’s workspace.
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 80,
            borderTop: "2px solid #e5e5e5",
            paddingTop: 38,
            display: "flex",
            alignItems: "center",
            gap: 34,
            fontSize: 37,
          }}
        >
          <span>Files</span>
          <span style={{ marginLeft: "auto" }}>Inspect</span>
          <span style={{ color: "#aaa" }}>·</span>
          <span>Keep</span>
          <Trash2 size={35} style={{ marginLeft: 55 }} />
        </div>
      </Interactive.Div>
    </Shell>
  );
};
