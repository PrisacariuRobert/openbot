import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import {
  ArrowDownToLine,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  PanelRight,
  Plus,
  Search,
  Settings,
  SquarePen,
  Users,
  CircleAlert,
  Monitor,
  X,
} from "lucide-react";
import { Character, people, type Person } from "./Character";

export const ink = "#191919",
  muted = "#696969",
  line = "#e9e9e9";
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const tween = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], {
    ...clamp,
    easing: Easing.bezier(0.22, 0.85, 0.22, 1),
  });
export function Reveal({
  at = 0,
  children,
  style,
}: {
  at?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        opacity: tween(f, at, at + 20),
        translate: `0 ${tween(f, at, at + 26, 20, 0)}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function Camera({
  children,
  zoom = 1,
  x = 0,
  y = 0,
  rotate = 0,
}: {
  children: ReactNode;
  zoom?: number;
  x?: number;
  y?: number;
  rotate?: number;
}) {
  return (
    <AbsoluteFill
      style={{
        background: "#fafafa",
        color: ink,
        fontFamily: "Inter",
        overflow: "hidden",
        perspective: 2000,
      }}
    >
      <Interactive.Div
        name="Native app / camera rig"
        style={{
          position: "absolute",
          left: 160,
          top: 100,
          width: 1600,
          height: 880,
          scale: zoom,
          translate: `${x}px ${y}px`,
          rotate: `${rotate}deg`,
          transformOrigin: "50% 50%",
        }}
      >
        {children}
      </Interactive.Div>
    </AbsoluteFill>
  );
}
export function Shell({
  children,
  name = "Nova",
  team = true,
  inspector,
  draft = "",
  active = false,
}: {
  children: ReactNode;
  name?: Person;
  team?: boolean;
  inspector?: ReactNode;
  draft?: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: 1600,
        height: 880,
        background: "white",
        border: "1px solid #dedede",
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 30px 90px #00000016, 0 3px 8px #00000008",
      }}
    >
      <aside
        style={{
          width: 248,
          flexShrink: 0,
          borderRight: `1px solid ${line}`,
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", gap: 8, padding: "0 8px 25px" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#d3d3d3",
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0 9px 20px",
            fontSize: 22,
            fontWeight: 650,
          }}
        >
          OpenBot
          <SquarePen size={21} strokeWidth={1.7} />
        </div>
        <div
          style={{
            border: `1px solid ${line}`,
            borderRadius: 9,
            color: muted,
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "9px 10px",
            fontSize: 16,
            marginBottom: 15,
          }}
        >
          <Search size={16} />
          Search
        </div>
        {(team ? ["Nova", "Milo", "Fern"] : ["Nova"]).map((n, i) => (
          <div
            key={n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "11px 5px",
              borderRadius: 10,
              background: name === n ? "#f0f0f0" : "transparent",
            }}
          >
            <Character
              name={n as Person}
              size={45}
              busy={active && name === n}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 17,
                  fontWeight: 560,
                }}
              >
                {n}
                <span style={{ color: muted, fontSize: 12, fontWeight: 400 }}>
                  9:4{i}
                </span>
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: muted,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  marginTop: 4,
                }}
              >
                {n === "Nova"
                  ? active
                    ? "Working on your client review…"
                    : "Your Friday review is ready."
                  : n === "Milo"
                    ? "The deck is ready for review."
                    : "The numbers are checked."}
              </div>
            </div>
          </div>
        ))}
        <div
          style={{
            marginTop: "auto",
            padding: "18px 10px 2px",
            display: "grid",
            gap: 22,
            color: muted,
            fontSize: 16,
          }}
        >
          {[
            [CircleAlert, "Needs you"],
            [Users, "Your team"],
            [Settings, "Settings"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Settings;
            return (
              <div
                key={String(label)}
                style={{ display: "flex", gap: 12, alignItems: "center" }}
              >
                <I size={18} strokeWidth={1.6} />
                {String(label)}
              </div>
            );
          })}
        </div>
      </aside>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            height: 82,
            padding: "0 30px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${line}`,
            flexShrink: 0,
          }}
        >
          <Character name={name} size={44} busy={active} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{name}</div>
            <div style={{ color: muted, fontSize: 14, marginTop: 2 }}>
              {people[name].role}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 22 }}>
            <Ellipsis size={24} />
            <PanelRight size={23} strokeWidth={1.6} />
          </div>
        </header>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              position: "relative",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                maxWidth: 850,
                padding: "28px 40px 110px",
                margin: "auto",
                fontSize: 24,
                lineHeight: 1.55,
              }}
            >
              {children}
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                translate: "-50% 0",
                width: "calc(100% - 80px)",
                maxWidth: 780,
              }}
            >
              <Composer draft={draft} />
            </div>
          </div>
          {inspector && (
            <aside
              style={{
                width: 326,
                borderLeft: `1px solid ${line}`,
                flexShrink: 0,
                padding: 25,
                overflow: "hidden",
              }}
            >
              {inspector}
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}
export function Composer({ draft = "" }: { draft?: string }) {
  return (
    <div
      style={{
        border: "1px solid #dedede",
        borderRadius: 32,
        padding: "11px 12px 11px 18px",
        display: "flex",
        gap: 16,
        alignItems: "center",
        fontSize: 21,
        minHeight: 62,
        color: draft ? ink : "#999",
        background: "white",
      }}
    >
      <Plus size={24} strokeWidth={1.7} />
      <span style={{ flex: 1 }}>{draft || "Message Nova"}</span>
      <span
        style={{
          borderRadius: "50%",
          background: draft ? ink : "#e5e5e5",
          color: "white",
          width: 38,
          height: 38,
          display: "grid",
          placeItems: "center",
        }}
      >
        <ArrowUp size={23} />
      </span>
    </div>
  );
}
export function Message({
  children,
  user = false,
  at = 0,
}: {
  children: ReactNode;
  user?: boolean;
  at?: number;
}) {
  return (
    <Reveal
      at={at}
      style={{
        display: "flex",
        justifyContent: user ? "flex-end" : "flex-start",
        marginBottom: 28,
      }}
    >
      <div
        style={{
          maxWidth: user ? 650 : 740,
          padding: user ? "15px 21px" : "0",
          background: user ? ink : "transparent",
          color: user ? "white" : ink,
          borderRadius: 22,
        }}
      >
        {children}
      </div>
    </Reveal>
  );
}
export function File({
  title,
  meta,
  selected = false,
}: {
  title: string;
  meta: string;
  selected?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${selected ? "#999" : line}`,
        borderRadius: 12,
        padding: "17px 18px",
        display: "flex",
        gap: 15,
        alignItems: "center",
        marginTop: 12,
        background: "white",
      }}
    >
      <FileText size={28} strokeWidth={1.5} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 21, fontWeight: 550 }}>{title}</div>
        <div style={{ fontSize: 15, color: muted, marginTop: 3 }}>{meta}</div>
      </div>
      <ArrowDownToLine size={19} color={muted} />
    </div>
  );
}
export function Button({
  children,
  done = false,
}: {
  children: ReactNode;
  done?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 24,
        color: done ? ink : "white",
        background: done ? "#f0f0f0" : ink,
        padding: "10px 20px",
        fontSize: 19,
        fontWeight: 550,
        display: "inline-flex",
        gap: 9,
        alignItems: "center",
      }}
    >
      {done && <Check size={19} />}
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 25,
        padding: "18px 0",
        borderBottom: `1px solid ${line}`,
        fontSize: 22,
        lineHeight: 1.45,
      }}
    >
      <span style={{ color: muted, width: 145, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
export function Sheet({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#ffffff9c",
        backdropFilter: "blur(5px)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: 830,
          background: "white",
          border: "1px solid #dedede",
          borderRadius: 22,
          boxShadow: "0 24px 65px #00000020",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "26px 32px",
            display: "flex",
            justifyContent: "space-between",
            borderBottom: `1px solid ${line}`,
            fontSize: 26,
            fontWeight: 620,
          }}
        >
          {title}
          <X size={23} color={muted} />
        </div>
        <div style={{ padding: "15px 32px 28px" }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "20px 32px",
              borderTop: `1px solid ${line}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 16,
              alignItems: "center",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
export function Inspector() {
  return (
    <>
      <div style={{ textAlign: "center", padding: "5px 0 25px" }}>
        <Character size={75} />
        <div style={{ fontSize: 23, fontWeight: 600 }}>Nova</div>
        <div style={{ fontSize: 15, color: muted, marginTop: 5 }}>
          Research and planning
        </div>
      </div>
      <div
        style={{
          height: 139,
          borderRadius: 9,
          background: "#f4f4f4",
          display: "grid",
          placeItems: "center",
          color: muted,
        }}
      >
        <Monitor size={38} strokeWidth={1.2} />
      </div>
      <div
        style={{
          fontSize: 15,
          textAlign: "center",
          color: muted,
          margin: "12px 0 30px",
        }}
      >
        Nova’s computer
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 20,
          fontWeight: 550,
        }}
      >
        Routines
        <Plus size={21} />
      </div>
      <div style={{ padding: "18px 0 27px", fontSize: 18 }}>
        Friday client review
        <div style={{ color: muted, fontSize: 14, marginTop: 6 }}>
          Fridays at 9:00
        </div>
      </div>
      <div
        style={{
          fontSize: 18,
          borderBlock: `1px solid ${line}`,
          padding: "23px 0",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        Teammate preferences
        <ChevronRight size={19} />
      </div>
      <div style={{ paddingTop: 24, fontSize: 18, fontWeight: 550 }}>
        Shared here
      </div>
      {["Client review.pdf", "Budget.csv"].map((t) => (
        <div
          key={t}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontSize: 16,
            paddingTop: 21,
          }}
        >
          <FileText size={20} />
          {t}
        </div>
      ))}
    </>
  );
}
export function WorkLine({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: muted,
        display: "flex",
        gap: 9,
        alignItems: "center",
        fontSize: 18,
        margin: "14px 0 24px",
      }}
    >
      <ChevronDown size={17} />
      {children}
    </div>
  );
}
