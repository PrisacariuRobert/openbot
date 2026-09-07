import { Interactive, interpolate } from "remotion";
import { Check, ChevronDown, MousePointer2, ShieldCheck } from "lucide-react";
import { Shell, curve, enter, useShot } from "./shared";

export const Control = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell dark>
      <Interactive.Div
        name="An exact action to review"
        style={{
          position: "absolute",
          left: 215,
          top: 135,
          width: 1490,
          translate: `0 ${interpolate(p, [0, 0.12], [100, 0], curve)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            fontSize: 31,
            color: "#aaa",
          }}
        >
          <ShieldCheck size={37} />
          YOUR APPROVAL
        </div>
        <div
          style={{
            fontSize: 77,
            letterSpacing: "-.04em",
            fontWeight: 560,
            marginTop: 34,
          }}
        >
          Ready to send the launch update?
        </div>
        <div
          style={{
            display: "flex",
            gap: 25,
            fontSize: 30,
            color: "#bbb",
            marginTop: 53,
            paddingBottom: 28,
            borderBottom: "1px solid #444",
          }}
        >
          <span style={{ color: "#777" }}>To</span>
          <span>team@example.test</span>
        </div>
        <div
          style={{
            fontSize: 38,
            lineHeight: 1.45,
            marginTop: 33,
            maxWidth: 1250,
          }}
        >
          The presentation and product page are ready for review.
          <br />
          Please add your feedback before Thursday’s launch meeting.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 50,
            fontSize: 31,
          }}
        >
          <span style={{ color: "#aaa" }}>Nothing sent yet.</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "24px 32px",
              borderRadius: 50,
              background: "#fff",
              color: "#111",
            }}
          >
            Review & send
            <MousePointer2 size={34} />
          </div>
        </div>
        <Interactive.Div
          name="Evidence behind the result"
          style={{
            marginTop: 54,
            borderTop: "1px solid #444",
            paddingTop: 30,
            display: "flex",
            gap: 20,
            fontSize: 30,
            alignItems: "center",
            opacity: enter(p, 0.62, 0.73),
          }}
        >
          <Check size={34} />
          <span>Review sources, actions and files</span>
          <ChevronDown size={31} style={{ marginLeft: "auto" }} />
        </Interactive.Div>
      </Interactive.Div>
    </Shell>
  );
};
