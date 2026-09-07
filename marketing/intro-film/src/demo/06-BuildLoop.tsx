import { useCurrentFrame } from "remotion";
import { Check, ArrowRight, RotateCcw, X, FileCode2 } from "lucide-react";
import { Bubble, Reveal, Split, Status } from "./shared";
import {
  checkParser,
  parseFirstDraft,
  parseExpense,
  formatEuro,
  expenseTotal,
} from "./expense-fixture";

export const BuildLoopDemo = () => {
  const frame = useCurrentFrame();
  const state =
    frame < 168 ? 0 : frame < 336 ? 1 : frame < 477 ? 2 : frame < 627 ? 3 : 4;
  const states = ["Build", "Test", "Improve", "Re-test", "Use"];
  const tests = checkParser(state < 3 ? parseFirstDraft : parseExpense);
  return (
    <Split
      title="import_expenses.ts"
      subtitle="Coding model · continuing Friday client review"
      dark
      left={
        <>
          <Bubble>
            I’m building the importer and checking it against the receipt
            formats.
          </Bubble>
          <Bubble at={3.3}>
            The first checks caught a decimal-format issue. I’m fixing it.
          </Bubble>
          <Bubble at={8.35}>
            All four checks pass. Now I can use it to finish your budget.
          </Bubble>
          <Reveal at={10.4}>
            <Status done>Tool saved in Files for next time.</Status>
          </Reveal>
        </>
      }
      right={
        <>
          <div
            style={{
              display: "flex",
              gap: 13,
              alignItems: "center",
              fontSize: 21,
              color: "#999",
              marginBottom: 27,
            }}
          >
            <FileCode2 size={22} />
            Nova’s workspace / tools
          </div>
          {(state === 0 || state === 2) && (
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 23,
                lineHeight: 1.65,
                color: "#aaa",
              }}
            >
              <div style={{ color: "white", marginBottom: 24 }}>
                function parseExpense(input) {"{"}
              </div>
              <div> const clean = stripCurrency(input);</div>
              <div
                style={{
                  background: state === 2 ? "#303030" : "transparent",
                  color: "white",
                  padding: "15px 0",
                  margin: "12px 0",
                }}
              >
                {state === 2 ? (
                  <>
                    {" "}
                    const normalized = clean.includes(",")
                    <br /> ? clean.replaceAll(".", "")
                    <br /> .replace(",", ".")
                    <br /> : clean;
                  </>
                ) : (
                  <> return checkedNumber(clean);</>
                )}
              </div>
              {state === 2 && <div> return checkedNumber(normalized);</div>}
              <div>{"}"}</div>
              <div
                style={{
                  fontFamily: "Inter",
                  fontSize: 23,
                  color: "#888",
                  marginTop: 42,
                }}
              >
                {state === 2
                  ? "Handle European decimal formatting."
                  : "Draft 1 · normalize the expense exports"}
              </div>
            </div>
          )}
          {(state === 1 || state === 3) && (
            <>
              <div style={{ fontSize: 33, fontWeight: 530, marginBottom: 22 }}>
                {state === 1 ? "2 checks need a fix" : "4 checks passed"}
              </div>
              {tests.map((test) => (
                <div
                  key={test.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 15,
                    padding: "21px 0",
                    borderBottom: "1px solid #333",
                    fontSize: 26,
                    color: test.passed ? "#eee" : "#aaa",
                  }}
                >
                  {test.passed ? <Check size={26} /> : <X size={26} />}
                  <span>{test.label}</span>
                </div>
              ))}
              {state === 1 ? (
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 24,
                    marginTop: 27,
                    color: "#aaa",
                  }}
                >
                  "€ 1.240,00" → expected 1240
                  <br />
                  Draft returned an error.
                </div>
              ) : (
                <div style={{ fontSize: 24, marginTop: 28, color: "#aaa" }}>
                  Run on the selected receipts next.
                </div>
              )}
            </>
          )}
          {state === 4 && (
            <div>
              <div style={{ fontSize: 24, color: "#aaa" }}>
                Using import_expenses
              </div>
              <div
                style={{
                  fontSize: 46,
                  fontWeight: 560,
                  letterSpacing: "-.04em",
                  marginTop: 25,
                }}
              >
                3 files. One clean table.
              </div>
              <div
                style={{
                  fontSize: 76,
                  fontWeight: 520,
                  letterSpacing: "-.04em",
                  marginTop: 60,
                }}
              >
                {formatEuro(expenseTotal)}
              </div>
              <div style={{ fontSize: 25, color: "#999", marginTop: 20 }}>
                Total from the selected receipts
              </div>
              <div
                style={{
                  fontSize: 24,
                  marginTop: 40,
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                }}
              >
                <Check size={27} />
                Continuing the review pack
              </div>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: 32,
              right: 32,
              bottom: 33,
              borderTop: "1px solid #444",
              paddingTop: 24,
              display: "flex",
              alignItems: "center",
              gap: 13,
              fontSize: 23,
            }}
          >
            {states.map((label, i) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  color: state === i ? "white" : "#777",
                  fontWeight: state === i ? 650 : 400,
                }}
              >
                {state === i && i === 2 && <RotateCcw size={21} />}
                <span>{label}</span>
                {i < 4 && <ArrowRight size={20} />}
              </div>
            ))}
          </div>
        </>
      }
    />
  );
};
