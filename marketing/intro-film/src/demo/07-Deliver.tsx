import { useCurrentFrame, interpolate } from "remotion";
import { Bubble, File, Pointer, Split, Status, eased } from "./shared";
import { expenseRows, expenseTotal, formatEuro } from "./expense-fixture";

export const DeliverDemo = () => {
  const frame = useCurrentFrame();
  const deck = frame > 308;
  return (
    <Split
      title={deck ? "client-review.pdf" : "review-budget.xlsx"}
      subtitle="Shared by Nova · Friday client review"
      left={
        <>
          <Bubble>
            Your review is ready: the deck, a checked budget and an email draft.
          </Bubble>
          <File
            name="client-review.pdf"
            detail="Review deck · 6 pages"
            at={0.6}
            active={deck}
          />
          <File
            name="review-budget.xlsx"
            detail="3 expenses · totals checked"
            at={1.05}
            active={!deck}
          />
          <File
            name="client-update.eml"
            detail="Email draft · not sent"
            at={1.5}
          />
          <Status done>The importer is saved for future reviews.</Status>
        </>
      }
      right={
        <>
          <div
            style={{
              display: "flex",
              gap: 30,
              fontSize: 24,
              borderBottom: "1px solid #ddd",
              paddingBottom: 18,
              color: "#777",
            }}
          >
            <span
              style={{
                color: !deck ? "#111" : "#999",
                fontWeight: !deck ? 600 : 400,
              }}
            >
              Budget
            </span>
            <span
              style={{
                color: deck ? "#111" : "#999",
                fontWeight: deck ? 600 : 400,
              }}
            >
              Review deck
            </span>
          </div>
          {!deck ? (
            <div
              style={{
                translate: `0 ${interpolate(frame, [0, 40], [25, 0], eased)}px`,
              }}
            >
              <h2
                style={{
                  fontSize: 39,
                  fontWeight: 570,
                  letterSpacing: "-.035em",
                  marginTop: 33,
                }}
              >
                Project costs
              </h2>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 22,
                  color: "#888",
                  paddingBottom: 17,
                }}
              >
                <span>Expense</span>
                <span>Amount · EUR</span>
              </div>
              {expenseRows.map((row) => (
                <div
                  key={row.file}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 30,
                    padding: "24px 0",
                    borderTop: "1px solid #ddd",
                  }}
                >
                  <span>{row.category}</span>
                  <span>{formatEuro(row.value)}</span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 34,
                  fontWeight: 600,
                  padding: "27px 0",
                  borderTop: "2px solid #222",
                }}
              >
                <span>Total</span>
                <span>{formatEuro(expenseTotal)}</span>
              </div>
              <div style={{ fontSize: 22, color: "#888", lineHeight: 1.4 }}>
                Source files are linked to each row.
                <br />
                European formats normalized and checked.
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 38,
                background: "#181818",
                color: "white",
                height: 490,
                marginTop: 27,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{ fontSize: 20, color: "#aaa", letterSpacing: ".04em" }}
              >
                FIELD NOTES · CLIENT REVIEW
              </div>
              <div
                style={{
                  fontSize: 68,
                  letterSpacing: "-.05em",
                  lineHeight: 1.02,
                  fontWeight: 560,
                  marginTop: 54,
                }}
              >
                Ready for
                <br />
                Friday.
              </div>
              <div style={{ fontSize: 24, color: "#aaa", marginTop: 33 }}>
                Progress. Timeline. Next decisions.
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 37,
                  left: 38,
                  right: 38,
                  borderTop: "1px solid #444",
                  paddingTop: 23,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 25,
                }}
              >
                <span>Project spend</span>
                <span>{formatEuro(expenseTotal)}</span>
              </div>
            </div>
          )}
          <Pointer from={[605, 470]} to={[209, 148]} at={4.5} click={5.15} />
        </>
      }
    />
  );
};
