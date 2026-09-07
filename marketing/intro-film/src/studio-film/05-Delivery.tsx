import { useCurrentFrame } from "remotion";
import { Check } from "lucide-react";
import { expenseRows, expenseTotal, formatEuro } from "../demo/expense-fixture";
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

export function Delivery() {
  const f = useCurrentFrame();
  const preview = f > 95 && f < 330;
  return (
    <Camera
      zoom={
        1.55 -
        tween(f, 85, 135, 0, 0.32) +
        tween(f, 315, 342, 0, 0.32) -
        tween(f, 350, 390, 0, 0.37)
      }
      x={
        -210 +
        tween(f, 85, 135, 0, 210) -
        tween(f, 315, 342, 0, 210) +
        tween(f, 350, 390, 0, 210)
      }
      y={
        30 -
        tween(f, 85, 135, 0, 30) +
        tween(f, 315, 342, 0, 30) -
        tween(f, 350, 390, 0, 30)
      }
    >
      <Shell>
        <Message>Your Friday review is ready.</Message>
        <Message>
          I’ve updated the deck, reconciled the receipts and prepared the email.
          Nothing has been sent.
        </Message>
        <File
          title="Client review.pdf"
          meta="6 pages · ready to review"
          selected={preview}
        />
        <File
          title="Budget.csv"
          meta={`3 receipts · ${formatEuro(expenseTotal)}`}
        />
        <WorkLine>Work checked · source links included</WorkLine>
        {f >= 647 && (
          <Message at={647}>
            Sent to Jamie with the two files you approved.
          </Message>
        )}
      </Shell>
      {preview && (
        <div style={{ opacity: tween(f, 95, 115) * tween(f, 310, 330, 1, 0) }}>
          <Sheet title={f < 215 ? "Client review.pdf" : "Budget.csv"}>
            <div
              style={{
                height: 455,
                padding: "38px 22px",
                background: "#fafafa",
                marginTop: 15,
              }}
            >
              {f < 215 ? (
                <>
                  <div style={{ fontSize: 17, color: "#696969" }}>
                    NORTHSTAR / FRIDAY REVIEW
                  </div>
                  <div
                    style={{
                      fontSize: 59,
                      fontWeight: 640,
                      letterSpacing: -2.5,
                      lineHeight: 1.06,
                      marginTop: 26,
                    }}
                  >
                    Ready for
                    <br />
                    what’s next.
                  </div>
                  <div
                    style={{
                      marginTop: 32,
                      display: "flex",
                      gap: 40,
                      borderTop: "1px solid #ddd",
                      paddingTop: 25,
                    }}
                  >
                    {["01  Progress", "02  Budget", "03  Next steps"].map(
                      (t) => (
                        <div key={t} style={{ fontSize: 18 }}>
                          {t}
                        </div>
                      ),
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{ fontSize: 27, fontWeight: 600, marginBottom: 18 }}
                  >
                    Project expenses
                  </div>
                  {expenseRows.map((r) => (
                    <div
                      key={r.file}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderBottom: "1px solid #e9e9e9",
                        padding: "16px 0",
                        fontSize: 23,
                      }}
                    >
                      <span>{r.category}</span>
                      <span>{formatEuro(r.value)}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 31,
                      fontWeight: 600,
                      paddingTop: 24,
                    }}
                  >
                    Total<span>{formatEuro(expenseTotal)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: "#696969",
                      display: "flex",
                      gap: 7,
                      alignItems: "center",
                      marginTop: 22,
                    }}
                  >
                    <Check size={17} />
                    Checked against 3 source receipts
                  </div>
                </>
              )}
            </div>
          </Sheet>
        </div>
      )}
      {f >= 355 && f < 647 && (
        <div style={{ opacity: tween(f, 355, 380) * tween(f, 628, 647, 1, 0) }}>
          <Sheet
            title="Review before sending"
            footer={
              <>
                <span
                  style={{
                    fontSize: 18,
                    color: "#696969",
                    marginRight: "auto",
                  }}
                >
                  Only this email and these files.
                </span>
                <Button done={f > 604}>
                  {f > 604 ? "Sent" : "Approve & send"}
                </Button>
              </>
            }
          >
            <Field label="From">alex@example.test</Field>
            <Field label="To">jamie@example.test</Field>
            <Field label="Subject">Friday’s client review</Field>
            <div
              style={{ padding: "24px 0 10px", fontSize: 23, lineHeight: 1.6 }}
            >
              Hi Jamie,
              <br />
              Here’s the updated review deck and checked budget. Everything is
              ready for Friday.
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <File title="Client review.pdf" meta="6 pages" />
              <File title="Budget.csv" meta="3 receipts" />
            </div>
          </Sheet>
        </div>
      )}
    </Camera>
  );
}
