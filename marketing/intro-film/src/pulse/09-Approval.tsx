import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ArrowUpRight, Check } from "lucide-react";
import { Set, smooth, clamp } from "./shared";

export const Approval = () => {
  const frame = useCurrentFrame();
  return (
    <Set dark>
      <Interactive.Div
        name="The film stops for the owner"
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: 250,
          fontWeight: 590,
          letterSpacing: "-.075em",
          opacity: interpolate(frame, [0, 12, 54, 77], [0, 1, 1, 0], clamp),
          scale: interpolate(frame, [0, 60], [1.12, 1], smooth),
        }}
      >
        Your call.
      </Interactive.Div>
      <Interactive.Div
        name="Review the actual destination and draft"
        style={{
          position: "absolute",
          left: 310,
          top: 230,
          width: 1300,
          height: 620,
          borderRadius: 30,
          background: "#fafafa",
          color: "#111",
          padding: 62,
          translate: `0 ${interpolate(frame, [65, 112], [850, 0], smooth)}px`,
          rotate: `x ${interpolate(frame, [65, 118], [27, 0], smooth)}deg`,
        }}
      >
        <div style={{ fontSize: 25, color: "#777" }}>READY FOR YOUR REVIEW</div>
        <div
          style={{
            fontSize: 57,
            fontWeight: 600,
            letterSpacing: "-.045em",
            marginTop: 25,
          }}
        >
          Send the launch pack?
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            gap: 35,
            marginTop: 40,
            paddingBottom: 25,
            borderBottom: "1px solid #ddd",
          }}
        >
          <span style={{ color: "#777" }}>To</span>team@example.test
        </div>
        <div style={{ fontSize: 31, lineHeight: 1.4, marginTop: 30 }}>
          The presentation, budget and launch page are ready.
          <br />
          Here’s everything for our review.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 40,
            fontSize: 25,
            color: "#777",
          }}
        >
          <span>{frame < 190 ? "Nothing sent yet." : "Sending approved."}</span>
          <div
            style={{
              background: "#111",
              color: "white",
              padding: "19px 28px",
              borderRadius: 60,
              display: "flex",
              alignItems: "center",
              gap: 18,
              scale: interpolate(frame, [183, 190, 205], [1, 0.94, 1], smooth),
            }}
          >
            {frame < 190 ? "Approve & send" : "Approved"}
            {frame < 190 ? <ArrowUpRight size={27} /> : <Check size={27} />}
          </div>
        </div>
      </Interactive.Div>
    </Set>
  );
};
