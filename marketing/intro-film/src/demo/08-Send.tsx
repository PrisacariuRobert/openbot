import { useCurrentFrame } from "remotion";
import { Check, ArrowUpRight, Paperclip } from "lucide-react";
import { Bubble, Button, Pointer, Reveal, Split, Status } from "./shared";
import { expenseTotal, formatEuro } from "./expense-fixture";

export const SendDemo = () => {
  const frame = useCurrentFrame();
  const approved = frame >= 372;
  return (
    <Split
      title={approved ? "Sent · client review pack" : "Review before sending"}
      subtitle="The destination and content stay visible"
      left={
        <>
          <Bubble>
            I drafted Alex’s update with both files attached. Please review it
            before I send.
          </Bubble>
          <Bubble user at={1.8}>
            Looks good. Send it.
          </Bubble>
          <Reveal at={4}>
            <Status>The exact email still waits for your approval.</Status>
          </Reveal>
          <Bubble at={6.6}>
            Sent to Alex with the deck and budget attached.
          </Bubble>
        </>
      }
      right={
        <>
          <div
            style={{
              fontSize: 24,
              color: "#777",
              padding: "10px 0 18px",
              borderBottom: "1px solid #ddd",
            }}
          >
            From{" "}
            <span style={{ color: "#111", marginLeft: 23 }}>
              owner@example.test
            </span>
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#777",
              padding: "18px 0",
              borderBottom: "1px solid #ddd",
            }}
          >
            To{" "}
            <span style={{ color: "#111", marginLeft: 52 }}>
              alex@example.test
            </span>
          </div>
          <div style={{ fontSize: 31, fontWeight: 560, marginTop: 26 }}>
            Friday’s client review
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.45, marginTop: 28 }}>
            Hi Alex,
            <br />
            <br />
            Here’s the review pack for Friday. The project costs total{" "}
            {formatEuro(expenseTotal)}.<br />
            <br />
            The deck and budget are attached.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 21,
              color: "#777",
              marginTop: 27,
            }}
          >
            <Paperclip size={22} />
            client-review.pdf + review-budget.xlsx
          </div>
          <div
            style={{
              marginTop: 31,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 21, color: "#777" }}>
              {approved ? "Approval recorded" : "Nothing sent yet"}
            </span>
            <Button>
              {approved ? (
                <>
                  <Check size={24} />
                  Sent
                </>
              ) : (
                <>
                  Approve & send
                  <ArrowUpRight size={24} />
                </>
              )}
            </Button>
          </div>
          <Pointer from={[620, 488]} to={[548, 680]} at={5.4} click={6.2} />
        </>
      }
    />
  );
};
