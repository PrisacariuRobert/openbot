import { useCurrentFrame } from "remotion";
import { Check, Code2, Circle } from "lucide-react";
import {
  checkParser,
  parseExpense,
  parseFirstDraft,
  expenseTotal,
  formatEuro,
} from "../demo/expense-fixture";
import {
  Button,
  Camera,
  Field,
  File,
  Message,
  Shell,
  Sheet,
  tween,
  WorkLine,
} from "./UI";

export function Build() {
  const f = useCurrentFrame();
  const repaired = f > 460;
  const tests = checkParser(repaired ? parseExpense : parseFirstDraft);
  return (
    <Camera zoom={tween(f, 0, 45, 1.05, 1.17)} x={-70} y={-8}>
      <Shell active>
        <Message>
          I can write a small tool to read these receipt formats, then use it to
          check the budget.
        </Message>
        <WorkLine>
          {f < 248
            ? "Waiting for your approval"
            : f < 390
              ? "Building the importer"
              : repaired
                ? "Checks complete"
                : "Checking the importer"}
        </WorkLine>
        {f > 570 && (
          <>
            <Message at={570}>
              The importer now handles all three receipts.
              <br />
              The checked total is {formatEuro(expenseTotal)}.
            </Message>
            <File
              title="receipt-importer.ts"
              meta="Saved in Nova’s workspace · reusable tool"
            />
            <File
              title="Budget.csv"
              meta="3 receipts · checked total €1,749.50"
            />
          </>
        )}
      </Shell>
      {f < 248 && (
        <Sheet
          title="Add a capability"
          footer={
            <>
              <span
                style={{ fontSize: 18, color: "#696969", marginRight: "auto" }}
              >
                Nothing changes until you approve.
              </span>
              <Button done={f > 213}>
                {f > 213 ? "Approved" : "Approve plan"}
              </Button>
            </>
          }
        >
          <Field label="Capability">Read mixed-format expense receipts.</Field>
          <Field label="Plan">
            Create an importer, check the formats, then use it on the selected
            receipts.
          </Field>
          <Field label="File effect">
            <code style={{ fontSize: 20 }}>tools/receipt-importer.ts</code>
            <div style={{ color: "#696969", fontSize: 18, marginTop: 5 }}>
              One new file in Nova’s workspace.
            </div>
          </Field>
          <Field label="Coding AI">Your selected coding model</Field>
        </Sheet>
      )}
      {f >= 248 && f < 568 && (
        <div
          style={{
            opacity: tween(f, 248, 271) * tween(f, 547, 568, 1, 0),
            position: "absolute",
            inset: 0,
            translate: `0 ${tween(f, 248, 278, 45, 0)}px`,
          }}
        >
          <Sheet
            title="Work updates"
            footer={
              <span style={{ fontSize: 20, color: "#696969" }}>
                {f < 370
                  ? "Writing the approved tool…"
                  : repaired
                    ? "4 checks passed. Ready to use."
                    : "Two formats need a correction."}
              </span>
            }
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 0 22px",
                fontSize: 23,
              }}
            >
              <Code2 size={25} />
              receipt-importer.ts
            </div>
            <div
              style={{
                background: "#191919",
                color: "#f5f5f5",
                padding: 24,
                borderRadius: 12,
                fontFamily: "monospace",
                fontSize: 21,
                lineHeight: 1.75,
                whiteSpace: "pre-wrap",
              }}
            >
              {repaired
                ? '"€ 1.240,00"  →  1240.00\n"420,00"      →   420.00\n"89.50"       →    89.50'
                : "read receipts\nnormalize number formats\ncheck expected amounts"}
            </div>
            <div style={{ marginTop: 15 }}>
              {tests.map((t) => (
                <div
                  key={t.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: "1px solid #e9e9e9",
                    fontSize: 20,
                  }}
                >
                  <span>{t.label}</span>
                  {f < 370 ? (
                    <Circle size={17} color="#aaa" />
                  ) : t.passed ? (
                    <Check size={20} />
                  ) : (
                    <span style={{ fontSize: 17, color: "#696969" }}>
                      Needs correction
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Sheet>
        </div>
      )}
    </Camera>
  );
}
