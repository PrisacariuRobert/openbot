import { Interactive, interpolate } from "remotion";
import { Check, ArrowUpRight } from "lucide-react";
import { MaskWords, Sheet, curve, settle, useMotionFrame } from "./motion";

export const Approval = () => {
  const frame = useMotionFrame();
  return (
    <Sheet dark>
      <MaskWords
        lines={["Your move."]}
        at={10}
        size={153}
        style={{ position: "absolute", left: 118, top: 405 }}
      />
      <Interactive.Div
        name="Approval sweeps in and settles"
        style={{
          position: "absolute",
          left: 992,
          top: 198,
          width: 740,
          padding: 43,
          borderRadius: 27,
          background: "#fff",
          color: "#151515",
          translate: `${interpolate(frame, [0, 41], [900, 0], settle)}px ${interpolate(frame, [0, 41], [250, 0], settle)}px`,
          rotate: `${interpolate(frame, [0, 46], [17, 0], settle)}deg`,
          scale: interpolate(frame, [114, 150], [1, 0.71], curve),
          transformOrigin: "center center",
        }}
      >
        <div style={{ fontSize: 24, color: "#777" }}>
          Ready for your approval
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 620,
            letterSpacing: -1,
            marginTop: 20,
          }}
        >
          Send the launch pack?
        </div>
        <div
          style={{
            borderTop: "1px solid #e5e5e5",
            marginTop: 30,
            paddingTop: 26,
            fontSize: 24,
          }}
        >
          To &nbsp; Launch team · 3 recipients
        </div>
        <div
          style={{
            fontSize: 27,
            lineHeight: 1.5,
            color: "#555",
            marginTop: 28,
          }}
        >
          The plan, copy and checklist.
          <br />
          Everything ready for Monday.
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              borderRadius: 40,
              padding: "19px 24px",
              border: "1px solid #ddd",
              fontSize: 23,
            }}
          >
            Keep draft
          </div>
          <div
            style={{
              borderRadius: 40,
              padding: "19px 26px",
              background: "#161616",
              color: "#fff",
              fontSize: 23,
              display: "flex",
              alignItems: "center",
              gap: 10,
              scale: interpolate(frame, [90, 95, 101], [1, 0.94, 1], curve),
            }}
          >
            {frame < 101 ? (
              <>
                Approve & send
                <ArrowUpRight size={23} />
              </>
            ) : (
              <>
                <Check size={23} />
                Approved
              </>
            )}
          </div>
        </div>
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 132,
          top: 640,
          fontSize: 29,
          color: "#aaa",
          lineHeight: 1.4,
          opacity: interpolate(frame, [27, 48], [0, 1], settle),
        }}
      >
        Powerful help.
        <br />
        You stay in control.
      </div>
      <Interactive.Div
        name="Approval becomes the phone surface"
        style={{
          position: "absolute",
          left: 1050,
          top: 215,
          width: 460,
          height: 710,
          borderRadius: 50,
          background: "#fff",
          scale: interpolate(frame, [128, 150], [0, 7], curve),
        }}
      />
    </Sheet>
  );
};
