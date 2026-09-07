import { Interactive, interpolate } from "remotion";
import { Check, Plus, ArrowUp, FileText } from "lucide-react";
import { Mascot } from "../components";
import {
  MaskWords,
  Portal,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

export const Conversation = () => {
  const frame = useMotionFrame();
  return (
    <Sheet>
      <Interactive.Div
        name="Track into conversation"
        style={{
          position: "absolute",
          left: 280,
          top: 220,
          width: 1360,
          height: 690,
          transformOrigin: "1060px 530px",
          scale: interpolate(
            frame,
            [0, 55, 95, 148, 187, 210],
            [2.3, 1.02, 1.02, 1.12, 1.12, 1.7],
            curve,
          ),
          rotate: `${interpolate(frame, [0, 60, 148, 210], [-10, 0, 0, 4], curve)}deg`,
          translate: `${interpolate(frame, [0, 55, 150, 210], [-360, 0, 0, -240], curve)}px ${interpolate(frame, [0, 55, 165, 210], [-180, 0, 0, -140], curve)}px`,
          background: "#fff",
          border: "1px solid #dedede",
          borderRadius: 28,
          boxShadow: "0 35px 100px #0000000a",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 85,
            padding: "20px 35px",
            borderBottom: "1px solid #ececec",
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: 26,
            fontWeight: 590,
          }}
        >
          <Mascot size={47} />
          Nova<span style={{ marginLeft: "auto", fontWeight: 400 }}>···</span>
        </div>
        <Interactive.Div
          name="The ask moves from composer to message"
          style={{
            position: "absolute",
            left: interpolate(frame, [38, 63], [40, 540], curve),
            top: interpolate(frame, [38, 63], [575, 116], curve),
            width: interpolate(frame, [38, 63], [1280, 770], curve),
            height: 78,
            padding: "22px 30px",
            background: frame < 42 ? "#f6f6f6" : "#161616",
            color: frame < 42 ? "#161616" : "#fff",
            borderRadius: interpolate(frame, [38, 63], [45, 24], curve),
            fontSize: 28,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {"Get the launch ready. Bring the team in.".slice(
            0,
            Math.floor(interpolate(frame, [8, 33], [0, 43], settle)),
          )}
        </Interactive.Div>
        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: 40,
            right: 40,
            height: 72,
            borderRadius: 42,
            border: "1px solid #e5e5e5",
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "0 16px 0 25px",
            color: "#aaa",
            fontSize: 24,
            opacity: frame < 60 ? 0 : 1,
          }}
        >
          <Plus size={26} />
          Message Nova
          <div
            style={{
              marginLeft: "auto",
              borderRadius: 30,
              padding: 12,
              background: "#161616",
              color: "#fff",
            }}
          >
            <ArrowUp size={27} />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: 242,
            left: 65,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#777",
            fontSize: 23,
          }}
        >
          {[0, 1, 2].map((kind) => (
            <Interactive.Div
              key={kind}
              name={`Teammate joins consultation ${kind}`}
              style={{
                translate: `${interpolate(frame, [66 + 6 * kind, 92 + 6 * kind], [-90 - 35 * kind, 0], settle)}px 0`,
                scale: interpolate(
                  frame,
                  [66 + 6 * kind, 92 + 6 * kind],
                  [0, 1],
                  settle,
                ),
              }}
            >
              <Mascot kind={kind} size={50} />
            </Interactive.Div>
          ))}
          <span
            style={{ opacity: interpolate(frame, [92, 105], [0, 1], settle) }}
          >
            {frame < 135 ? "Comparing notes…" : "Milo and Fern consulted"}
          </span>
          {frame >= 135 && <Check size={22} />}
        </div>
        <Interactive.Div
          name="One answer assembles"
          style={{
            position: "absolute",
            left: 58,
            right: 180,
            top: 340,
            scale: interpolate(frame, [131, 155], [0.94, 1], settle),
            opacity: interpolate(frame, [131, 143], [0, 1], settle),
            transformOrigin: "left top",
          }}
        >
          <div style={{ fontSize: 31, letterSpacing: -0.7, lineHeight: 1.45 }}>
            The plan, copy and checklist. All together.
            <br />
            Ready for your review.
          </div>
          <div
            style={{
              border: "1px solid #ddd",
              marginTop: 25,
              borderRadius: 16,
              padding: "19px 25px",
              fontSize: 24,
              display: "flex",
              gap: 18,
              alignItems: "center",
            }}
          >
            <FileText size={30} />
            Launch pack
            <Check size={24} style={{ marginLeft: "auto" }} />
          </div>
        </Interactive.Div>
      </Interactive.Div>
      <MaskWords
        lines={["Ask once. Move together."]}
        at={33}
        size={92}
        style={{
          position: "absolute",
          top: 74,
          textAlign: "center",
          width: 1920,
          opacity: interpolate(frame, [118, 139], [1, 0], curve),
        }}
      />
      <Portal at={0} color="#101010" reverse />
      <Portal at={188} color="#101010" x={960} y={550} />
    </Sheet>
  );
};
