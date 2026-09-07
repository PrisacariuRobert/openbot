import { Interactive, interpolate } from "remotion";
import { Check, Plus, Mic, ChevronLeft, FileText } from "lucide-react";
import { Mascot } from "../components";
import {
  MaskWords,
  Portal,
  Sheet,
  curve,
  settle,
  useMotionFrame,
} from "./motion";

const ConversationSurface = ({ phone = false }: { phone?: boolean }) => (
  <div
    style={{
      background: "#fff",
      height: "100%",
      position: "relative",
      overflow: "hidden",
      borderRadius: phone ? 47 : 23,
      color: "#161616",
    }}
  >
    {phone && (
      <div
        style={{
          height: 61,
          padding: "20px 29px",
          fontWeight: 600,
          fontSize: 18,
        }}
      >
        9:41
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 150,
            width: 100,
            height: 29,
            background: "#141414",
            borderRadius: 30,
          }}
        />
      </div>
    )}
    <div
      style={{
        padding: "21px 27px",
        display: "flex",
        gap: 13,
        borderBottom: "1px solid #e6e6e6",
        alignItems: "center",
        fontSize: 25,
        fontWeight: 600,
      }}
    >
      {phone && <ChevronLeft size={20} />}
      <Mascot size={37} />
      Nova
    </div>
    <div style={{ padding: 25 }}>
      <div
        style={{
          padding: "22px 24px",
          borderRadius: 25,
          background: "#f2f2f2",
          fontSize: phone ? 22 : 29,
          lineHeight: 1.45,
        }}
      >
        The launch pack is ready.
        <br />
        Everything is together.
      </div>
      <div
        style={{
          padding: "22px 20px",
          borderRadius: 16,
          border: "1px solid #e4e4e4",
          fontSize: phone ? 22 : 27,
          marginTop: 19,
          display: "flex",
          alignItems: "center",
          gap: 15,
        }}
      >
        <FileText size={27} />
        Launch pack
        <Check size={24} style={{ marginLeft: "auto" }} />
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 22,
        bottom: phone ? 35 : 24,
        right: 22,
        padding: 17,
        borderRadius: 34,
        border: "1px solid #dedede",
        color: "#999",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: phone ? 21 : 25,
      }}
    >
      <Plus size={23} />
      Message Nova
      <Mic size={24} style={{ marginLeft: "auto" }} />
    </div>
    {phone && (
      <div
        style={{
          position: "absolute",
          left: 146,
          width: 108,
          bottom: 13,
          height: 5,
          borderRadius: 5,
          background: "#111",
        }}
      />
    )}
  </div>
);

export const Continuity = () => {
  const frame = useMotionFrame();
  return (
    <Sheet>
      <MaskWords
        lines={["The same team.", "Wherever you are."]}
        at={43}
        size={92}
        style={{
          position: "absolute",
          left: 132,
          top: 85,
          lineHeight: 1.04,
          opacity: interpolate(frame, [174, 198], [1, 0], curve),
        }}
      />
      <Interactive.Div
        name="Mac glides into the shared conversation"
        style={{
          position: "absolute",
          left: 141,
          top: 366,
          width: 1210,
          height: 575,
          border: "1px solid #d7d7d7",
          borderRadius: 24,
          padding: 6,
          background: "#f8f8f8",
          boxShadow: "0 30px 70px #00000012",
          translate: `${interpolate(frame, [45, 101], [-950, 0], settle)}px 0`,
          transform: `rotateY(${interpolate(frame, [45, 111], [24, -3], curve)}deg)`,
          scale: interpolate(frame, [45, 100], [0.75, 1], settle),
        }}
      >
        <ConversationSurface />
      </Interactive.Div>
      <Interactive.Div
        name="Phone — macro pull-back then orbit"
        style={{
          position: "absolute",
          left: 1220,
          top: 197,
          width: 430,
          height: 810,
          border: "2px solid #737373",
          borderRadius: 59,
          padding: 10,
          background: "#191919",
          boxShadow: "0 40px 100px #0000001b",
          transformOrigin: "center",
          scale: interpolate(
            frame,
            [0, 48, 93, 162, 205],
            [3.7, 1.09, 1, 1, 1.17],
            curve,
          ),
          translate: `${interpolate(frame, [0, 48, 93, 172, 210], [-460, -40, 135, 135, 170], curve)}px ${interpolate(frame, [0, 48, 93], [-270, -25, 0], curve)}px`,
          rotate: `${interpolate(frame, [0, 55, 98, 167, 210], [-14, 4, 0, 0, 6], curve)}deg`,
          transform: `rotateY(${interpolate(frame, [0, 64, 140, 210], [-19, 7, -7, -18], curve)}deg)`,
        }}
      >
        <ConversationSurface phone />
        <Interactive.Div
          name="Reply continues on the phone"
          style={{
            position: "absolute",
            right: 31,
            top: 492,
            maxWidth: 320,
            padding: "19px 25px",
            background: "#151515",
            color: "#fff",
            borderRadius: "24px 24px 6px 24px",
            fontSize: 23,
            opacity: interpolate(frame, [119, 132], [0, 1], settle),
            translate: `0 ${interpolate(frame, [119, 145], [45, 0], settle)}px`,
          }}
        >
          Looks good. Let’s go.
        </Interactive.Div>
      </Interactive.Div>
      <Portal at={188} color="#101010" x={1530} y={570} />
    </Sheet>
  );
};
