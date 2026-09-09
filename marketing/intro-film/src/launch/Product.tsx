import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Ellipsis,
  FileText,
  Globe,
  Layers,
  MessageCircle,
  Monitor,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

// Product artwork adapted from src/studio/Character.tsx and mascot-catalog.ts.
// Fictional demonstration only. No personal account data or product-side effects.
export type Identity = "Nova" | "Pixel" | "Scout";
const bodies = {
  Nova: "M38 27H62Q82 27 82 48V66Q82 85 61 85H39Q18 85 18 66V48Q18 27 38 27Z",
  Pixel:
    "M51 22C73 22 86 38 85 58C84 78 71 88 49 87C27 89 14 74 16 55C16 37 31 24 51 22Z",
  Scout:
    "M50 29C70 29 83 41 83 62C83 80 72 88 50 88C28 88 17 80 17 62C17 41 30 29 50 29Z",
};
export type MascotShape =
  | "nova"
  | "blob"
  | "sprout"
  | "orbit"
  | "pebble"
  | "sunny";
const shapes = {
  nova: bodies.Nova,
  blob: bodies.Pixel,
  sprout: bodies.Scout,
  orbit: "M50 23A32 32 0 1 1 49.99 23Z",
  pebble:
    "M58 29C74 29 85 42 84 61C83 80 71 87 47 87C28 87 14 79 15 64C15 51 27 47 31 38C36 28 46 24 58 29Z",
  sunny: "M50 28A28 28 0 1 1 49.99 28Z",
};
const colors = { Nova: "#6757d9", Pixel: "#ee6c98", Scout: "#299575" };
export function Mascot({
  name = "Nova",
  size = 48,
  frame = 0,
  id = "mascot",
  label,
  shape,
  color,
}: {
  name?: Identity;
  size?: number;
  frame?: number;
  id?: string;
  label?: string;
  shape?: MascotShape;
  color?: string;
}) {
  const blink = frame % 240 > 229;
  const kind =
    shape || ({ Nova: "nova", Pixel: "blob", Scout: "sprout" } as const)[name];
  const fill = color && /^#[0-9a-f]{6}$/i.test(color) ? color : colors[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label={label || name}
      style={{ flexShrink: 0, overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="white" stopOpacity=".26" />
          <stop offset=".52" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity=".13" />
        </linearGradient>
      </defs>
      <g transform={`translate(0 ${Math.sin(frame / 32) * 1.4})`}>
        <g fill={fill}>
          {kind === "nova" && (
            <>
              <path d="M48 29V17h4v12Z" />
              <circle cx="50" cy="13" r="5" />
              <rect x="9" y="45" width="12" height="22" rx="6" />
              <rect x="79" y="45" width="12" height="22" rx="6" />
            </>
          )}
          {kind === "sprout" && (
            <>
              <path d="M49 30C24 29 22 6 29 7C42 9 49 19 49 30Z" />
              <path d="M51 30C76 28 78 7 70 8C58 10 51 20 51 30Z" />
            </>
          )}
          <path d={shapes[kind]} />
          {kind === "orbit" && (
            <ellipse
              cx="50"
              cy="56"
              rx="43"
              ry="14"
              transform="rotate(-24 50 56)"
              fill="none"
              stroke={fill}
              strokeWidth="6"
              opacity=".75"
            />
          )}
          {kind === "sunny" &&
            Array.from({ length: 8 }, (_, n) => (
              <path
                key={n}
                d="M50 12v7"
                transform={`rotate(${n * 45} 50 56)`}
                stroke={fill}
                strokeWidth="6"
                strokeLinecap="round"
              />
            ))}
        </g>
        <path
          d={shapes[kind]}
          fill={`url(#${id}-${name})`}
          stroke="black"
          strokeOpacity=".09"
        />
        <path
          d="M30 40q9-10 22-9"
          stroke="white"
          strokeOpacity=".33"
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="#24242b">
          <ellipse cx="40" cy="54" rx="3.3" ry={blink ? 1 : 4.7} />
          <ellipse cx="61" cy="54" rx="3.3" ry={blink ? 1 : 4.7} />
        </g>
        <path
          d="M45 65q6 5 12-1"
          fill="none"
          stroke="#24242b"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <ellipse cx="30" cy="64" rx="4" ry="2" fill="white" opacity=".17" />
        <ellipse cx="71" cy="64" rx="4" ry="2" fill="white" opacity=".17" />
      </g>
    </svg>
  );
}
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        fontSize: size,
        fontWeight: 650,
        letterSpacing: "-.06em",
        color: "inherit",
      }}
    >
      <span
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: size * 0.82,
          height: size * 0.94,
          border: "1.8px solid currentColor",
          borderRadius: size * 0.29,
          transform: "rotate(-9deg)",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "block",
            width: "60%",
            height: "60%",
          }}
        >
          <i
            style={{
              position: "absolute",
              width: "12%",
              height: "29%",
              background: "currentColor",
              borderRadius: 3,
              left: "17%",
              top: "20%",
            }}
          />
          <i
            style={{
              position: "absolute",
              width: "12%",
              height: "29%",
              background: "currentColor",
              borderRadius: 3,
              right: "17%",
              top: "20%",
            }}
          />
          <i
            style={{
              position: "absolute",
              width: "35%",
              height: "20%",
              borderBottom: "1px solid currentColor",
              borderRadius: "50%",
              left: "33%",
              top: "48%",
            }}
          />
        </span>
      </span>
      openbot
    </span>
  );
}
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
export function Bubble({
  children,
  owner = false,
  style,
}: {
  children: ReactNode;
  owner?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        maxWidth: owner ? 570 : 640,
        alignSelf: owner ? "flex-end" : "flex-start",
        background: owner ? "#202020" : "#f2f2f2",
        color: owner ? "white" : "#202020",
        padding: "22px 26px",
        borderRadius: owner ? "23px 23px 5px 23px" : "5px 23px 23px 23px",
        fontSize: 25,
        lineHeight: 1.45,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function FileRow({
  name,
  meta = "Checked · ready to use",
  compact = false,
}: {
  name: string;
  meta?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...row,
        gap: 18,
        padding: compact ? "18px 0" : "24px 20px",
        borderBottom: "1px solid #e9e9e9",
        fontSize: 21,
        background: "white",
        borderRadius: compact ? 0 : 13,
      }}
    >
      <FileText size={27} strokeWidth={1.5} />
      <span style={{ flex: 1 }}>
        <b style={{ fontWeight: 570 }}>{name}</b>
        <small
          style={{
            display: "block",
            color: "#707070",
            fontSize: 17,
            marginTop: 5,
          }}
        >
          {meta}
        </small>
      </span>
      <ArrowDownToLine size={22} />
    </div>
  );
}
export function ProductWindow({
  children,
  frame = 0,
  mode = "conversation",
  inspector,
  inspectorProgress = 1,
  draft = "Message the studio…",
}: {
  children?: ReactNode;
  frame?: number;
  mode?: "conversation" | "library" | "code";
  inspector?: ReactNode;
  inspectorProgress?: number;
  draft?: string;
}) {
  return (
    <div
      style={{
        width: 1440,
        height: 890,
        overflow: "hidden",
        background: "white",
        border: "1px solid #dedede",
        borderRadius: 20,
        color: "#202020",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        textAlign: "left",
        boxShadow: "0 35px 100px #00000015, 0 4px 15px #00000005",
      }}
    >
      <div
        style={{
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 15,
          borderBottom: "1px solid #ededed",
          fontSize: 12,
          color: "#aaa",
        }}
      >
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: "#d5d5d5",
            }}
          />
        ))}
        <span style={{ marginLeft: 9 }}>OpenBot</span>
      </div>
      <div style={{ display: "flex", height: 860 }}>
        <aside
          style={{
            width: 274,
            flexShrink: 0,
            background: "#f7f7f7",
            borderRight: "1px solid #e9e9e9",
            padding: "30px 15px 20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "0 13px 27px" }}>
            <Wordmark size={26} />
          </div>
          <div
            style={{
              ...row,
              color: "#7a7a7a",
              background: "#efefef",
              borderRadius: 11,
              padding: "13px 14px",
              fontSize: 17,
            }}
          >
            <Search size={17} />
            Search
          </div>
          <div
            style={{
              ...row,
              justifyContent: "space-between",
              fontSize: 15,
              color: "#797979",
              margin: "27px 9px 15px",
            }}
          >
            Conversations{" "}
            <span style={row}>
              <Users size={17} />
              <Plus size={18} />
            </span>
          </div>
          <div
            style={{
              ...row,
              background: "#eaeaea",
              borderRadius: 11,
              padding: "17px 12px",
              marginBottom: 8,
            }}
          >
            <MessageCircle size={31} strokeWidth={1.3} />
            <span style={{ fontSize: 18, fontWeight: 550 }}>
              The studio
              <small
                style={{
                  display: "block",
                  fontSize: 14,
                  color: "#737373",
                  marginTop: 6,
                  fontWeight: 400,
                }}
              >
                A launch, coming together.
              </small>
            </span>
          </div>
          {(["Pixel", "Nova", "Scout"] as Identity[]).map((name, n) => (
            <div key={name} style={{ ...row, padding: "16px 8px" }}>
              <Mascot
                name={name}
                size={47}
                frame={frame + n * 45}
                id={`sidebar-${name}`}
              />
              <span style={{ fontSize: 18, fontWeight: 550 }}>
                {name}
                <small
                  style={{
                    display: "block",
                    fontSize: 14,
                    color: "#777",
                    marginTop: 6,
                    fontWeight: 400,
                  }}
                >
                  {
                    [
                      "Making the missing piece.",
                      "Working through the details.",
                      "Keeping things moving.",
                    ][n]
                  }
                </small>
              </span>
            </div>
          ))}
          <div
            style={{
              marginTop: "auto",
              borderTop: "1px solid #e2e2e2",
              paddingTop: 20,
            }}
          >
            <span style={{ ...row, padding: "0 8px", fontSize: 17 }}>
              <Layers size={20} />
              Workspace
            </span>
            <span
              style={{
                ...row,
                justifyContent: "space-between",
                color: "#777",
                fontSize: 14,
                padding: "25px 8px 0",
              }}
            >
              • Studio connected
              <Settings2 size={18} />
            </span>
          </div>
        </aside>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <header
            style={{
              ...row,
              height: 67,
              flexShrink: 0,
              borderBottom: "1px solid #ececec",
              padding: "0 28px",
              fontSize: 18,
            }}
          >
            <Mascot frame={frame} size={36} id="header" />{" "}
            {mode === "library"
              ? "Library"
              : mode === "code"
                ? "Code projects"
                : "The studio"}
            <ChevronDown size={16} />
            <span
              style={{ ...row, gap: 24, marginLeft: "auto", color: "#777" }}
            >
              <Plus size={20} />
              <Monitor size={21} />
              <Ellipsis size={23} />
            </span>
          </header>
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                  padding: `${44 - (inspector ? 2 * inspectorProgress : 0)}px ${80 - (inspector ? 50 * inspectorProgress : 0)}px`,
                  flex: 1,
                  overflow: "hidden",
                }}
              >
                {children || (
                  <>
                    <Bubble owner>
                      Turn our launch notes into something we can use.
                    </Bubble>
                    <div style={{ ...row, fontSize: 17, color: "#727272" }}>
                      <Mascot size={28} id="answer" />
                      Nova · just now
                    </div>
                    <Bubble>
                      I’ll pull the research together, ask Pixel to check the
                      build, and bring back one clear plan.
                    </Bubble>
                    <FileRow name="Launch plan.md" />
                    <span style={{ ...row, color: "#737373", fontSize: 18 }}>
                      <Users size={19} />3 teammates · one conversation
                      <ChevronRight size={18} />
                    </span>
                  </>
                )}
              </div>
              {mode === "conversation" && (
                <div style={{ padding: "0 40px 25px" }}>
                  <div
                    style={{
                      border: "1px solid #e6e6e6",
                      borderRadius: 22,
                      padding: "21px 22px 17px",
                      fontSize: 20,
                      color: "#8a8a8a",
                    }}
                  >
                    {draft}
                    <div style={{ ...row, fontSize: 16, marginTop: 24 }}>
                      <Plus size={21} />
                      <Mascot size={26} id="composer" />
                      The studio
                      <ChevronDown size={14} />
                      <span
                        style={{
                          marginLeft: "auto",
                          width: 35,
                          height: 35,
                          borderRadius: "50%",
                          background: "#202020",
                          color: "white",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <ArrowUp size={21} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {inspector && (
              <aside
                style={{
                  width: 340 * inspectorProgress,
                  flexShrink: 0,
                  overflow: "hidden",
                  borderLeft:
                    inspectorProgress > 0 ? "1px solid #e9e9e9" : "none",
                  background: "#fdfdfd",
                }}
              >
                <div style={{ width: 340, padding: 25 }}>{inspector}</div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export function ReviewCard({ approved = false }: { approved?: boolean }) {
  return (
    <div
      style={{
        width: 470,
        background: "white",
        color: "#202020",
        border: "1px solid #e2e2e2",
        borderRadius: 22,
        padding: 30,
        boxShadow: "0 20px 60px #00000014",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <span style={{ ...row, fontSize: 16, color: "#707070" }}>
        <ShieldCheck size={20} />
        Your approval
      </span>
      <h3
        style={{
          fontSize: 31,
          letterSpacing: -1,
          lineHeight: 1.12,
          margin: "22px 0 18px",
        }}
      >
        A small tool.
        <br />A clear boundary.
      </h3>
      <p style={{ fontSize: 19, lineHeight: 1.5, color: "#696969", margin: 0 }}>
        Create one launch-checklist tool in Pixel’s workspace.
      </p>
      <div
        style={{
          ...row,
          fontSize: 17,
          borderTop: "1px solid #e9e9e9",
          marginTop: 25,
          paddingTop: 22,
        }}
      >
        <Code2 size={21} />
        launch-checklist.ts
      </div>
      <div
        style={{
          background: "#202020",
          color: "white",
          borderRadius: 24,
          padding: 13,
          marginTop: 25,
          textAlign: "center",
          fontSize: 19,
        }}
      >
        {approved ? (
          <span style={{ ...row, justifyContent: "center" }}>
            <Check size={18} />
            Approved
          </span>
        ) : (
          "Approve plan"
        )}
      </div>
    </div>
  );
}
export function BrowserDetail() {
  return (
    <>
      <span style={{ ...row, fontSize: 17 }}>
        <Globe size={20} />
        Nova’s browser
      </span>
      <div
        style={{
          marginTop: 25,
          border: "1px solid #dedede",
          borderRadius: 13,
          background: "white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#f3f3f3",
            padding: 14,
            color: "#777",
            fontSize: 14,
          }}
        >
          Launch notes · example workspace
        </div>
        <div style={{ padding: 22, fontSize: 18, lineHeight: 1.6 }}>
          <b style={{ fontSize: 27, letterSpacing: -1 }}>A better launch.</b>
          <p>
            Research. Owners.
            <br />A plan everyone can use.
          </p>
          <hr style={{ border: 0, borderTop: "1px solid #e8e8e8" }} />
          <p>
            One place to pick up
            <br />
            where we left off.
          </p>
        </div>
      </div>
      <p
        style={{ color: "#777", fontSize: 16, lineHeight: 1.5, marginTop: 20 }}
      >
        Sign in when asked.
        <br />
        Stay in control.
      </p>
    </>
  );
}
