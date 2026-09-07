import { Interactive, interpolate, useCurrentFrame } from "remotion";
import {
  FileText,
  Presentation,
  Table2,
  GitPullRequest,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { Stage, ease } from "../components";

export const Delivery = () => {
  const frame = useCurrentFrame();
  const icons = [FileText, Presentation, Table2, GitPullRequest];
  return (
    <Stage dark>
      <Interactive.Div
        name="Delivered work headline"
        style={{
          position: "absolute",
          left: 160,
          top: 125,
          fontSize: 129,
          fontWeight: 600,
          letterSpacing: -6,
          lineHeight: 1.13,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
        }}
      >
        From “can you?”
        <br />
        to “done.”
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 518,
          display: "flex",
          gap: 24,
        }}
      >
        {[
          "Launch plan",
          "Pitch deck",
          "Project budget",
          "Tested pull request",
        ].map((title, i) => {
          const Icon = icons[i];
          return (
            <Interactive.Div
              key={title}
              name={title}
              style={{
                width: 382,
                height: 370,
                padding: 31,
                borderRadius: 23,
                background: "#fdfdfd",
                color: "#151515",
                opacity: interpolate(
                  frame,
                  [22 + 13 * i, 50 + 13 * i],
                  [0, 1],
                  ease,
                ),
                translate: `0 ${interpolate(frame, [22 + 13 * i, 78 + 13 * i], [240, 0], ease)}px`,
                rotate: `${interpolate(frame, [22 + 13 * i, 78 + 13 * i], [i % 2 ? 5 : -5, 0], ease)}deg`,
              }}
            >
              <Icon size={44} strokeWidth={1.5} />
              <div
                style={{
                  height: 137,
                  marginTop: 22,
                  border: "1px solid #e9e9e9",
                  borderRadius: 10,
                  padding: 17,
                }}
              >
                {i === 2 ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-end",
                      height: 100,
                    }}
                  >
                    {[36, 56, 48, 78, 94, 69].map((height, k) => (
                      <div
                        key={k}
                        style={{
                          width: 27,
                          height:
                            height *
                            interpolate(frame, [70, 140], [0, 1], ease),
                          background: "#222",
                          borderRadius: "3px 3px 0 0",
                        }}
                      />
                    ))}
                  </div>
                ) : i === 3 ? (
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 16,
                      lineHeight: 1.7,
                    }}
                  >
                    ✓ build
                    <br />✓ test suite
                    <br />✓ ready for review
                  </div>
                ) : i === 1 ? (
                  <>
                    <div
                      style={{
                        height: 24,
                        background: "#202020",
                        width: "64%",
                        borderRadius: 3,
                        marginBottom: 17,
                      }}
                    />
                    {[80, 70, 90].map((w) => (
                      <div
                        key={w}
                        style={{
                          height: 6,
                          width: `${w}%`,
                          background: "#ddd",
                          marginBottom: 9,
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <>
                    {[70, 94, 91, 85, 60, 89].map((w, k) => (
                      <div
                        key={k}
                        style={{
                          height: k ? 5 : 11,
                          width: `${w}%`,
                          background: k ? "#dedede" : "#222",
                          marginBottom: 11,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
              <div style={{ fontSize: 25, fontWeight: 550, marginTop: 22 }}>
                {title}
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: "#777",
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                }}
              >
                <Check size={19} />
                Ready to review
                <ArrowUpRight size={18} style={{ marginLeft: "auto" }} />
              </div>
            </Interactive.Div>
          );
        })}
      </div>
      <Interactive.Div
        name="Output principle"
        style={{
          position: "absolute",
          bottom: 83,
          left: 160,
          fontSize: 28,
          color: "#aaa",
          opacity: interpolate(frame, [150, 175], [0, 1], ease),
        }}
      >
        Real files. Working code. A result you can use.
      </Interactive.Div>
    </Stage>
  );
};
