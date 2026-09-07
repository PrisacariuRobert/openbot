import { useCurrentFrame } from "remotion";
import { Calendar, Check, FileCode2, RotateCcw } from "lucide-react";
import { Bubble, File, Reveal, Row, Split, Status } from "./shared";

export const ReuseDemo = () => {
  const frame = useCurrentFrame();
  const next = frame >= 270;
  return (
    <Split
      title={next ? "Next Friday · same routine" : "Friday client review"}
      subtitle={
        next
          ? "A new run uses the tool you approved"
          : "Repeats weekly · Europe/Brussels"
      }
      left={
        <>
          <Bubble user>Do this every Friday. Keep the same format.</Bubble>
          <Bubble at={1.5}>
            I’ve saved the routine and your review format. I’ll reuse the
            expense importer.
          </Bubble>
          <Reveal at={3.15}>
            <Status done>
              Every Friday at 09:00 · email still needs approval
            </Status>
          </Reveal>
          <Bubble at={5.1}>
            The next review pack is ready. No tool rebuild needed.
          </Bubble>
        </>
      }
      right={
        <>
          {!next ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 17,
                  fontSize: 37,
                  fontWeight: 560,
                  marginBottom: 29,
                }}
              >
                <Calendar size={40} />
                Every Friday
              </div>
              <div style={{ display: "flex", gap: 15, marginTop: 36 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                  <div
                    key={i}
                    style={{
                      width: 75,
                      height: 79,
                      borderRadius: 17,
                      background: i === 4 ? "#161616" : "#eee",
                      color: i === 4 ? "white" : "#999",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 28,
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>
              <Row title="09:00" detail="Europe/Brussels" />
              <Row title="Review format" detail="Remembered for this routine" />
              <Row
                icon={<FileCode2 size={28} />}
                title="import_expenses"
                detail="Saved in Nova’s workspace"
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 24, color: "#888", marginBottom: 28 }}>
                FRIDAY · 09:00
              </div>
              <Row
                icon={<Check size={28} />}
                title="Gathered this week’s sources"
              />
              <Row
                icon={<RotateCcw size={28} />}
                title="Reused import_expenses"
                detail="Your approved tool · no new build"
              />
              <Row icon={<Check size={28} />} title="Checked the new totals" />
              <Reveal at={5.3}>
                <File
                  name="weekly-review-pack"
                  detail="Deck, budget and draft ready"
                />
                <Status>Waiting for email approval</Status>
              </Reveal>
            </>
          )}
        </>
      }
    />
  );
};
