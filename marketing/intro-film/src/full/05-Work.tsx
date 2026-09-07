import { Interactive, interpolate } from "remotion";
import { Check, GitPullRequest, Table2 } from "lucide-react";
import { LaunchDeck, LaunchSite } from "../story/03-Results";
import { Shell, curve, enter, useShot } from "./shared";

export const Work = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="From words to usable work"
        style={{
          position: "absolute",
          left: 210,
          top: 96,
          width: 1500,
          height: 888,
          scale: interpolate(p, [0, 0.09, 0.89, 1], [1.25, 1, 1, 1.04], curve),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 1 - enter(p, 0.34, 0.36),
          }}
        >
          <LaunchDeck />
        </div>
        <Interactive.Div
          name="The launch spreadsheet"
          style={{
            position: "absolute",
            inset: 0,
            background: "#fff",
            opacity: enter(p, 0.34, 0.36) * (1 - enter(p, 0.52, 0.54)),
            padding: "65px 55px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 25,
              alignItems: "center",
              fontSize: 51,
              fontWeight: 580,
              marginBottom: 60,
            }}
          >
            <Table2 size={52} />
            Launch tracker.xlsx
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              fontSize: 29,
              color: "#777",
              padding: "22px 10px",
              borderBottom: "2px solid #181818",
            }}
          >
            <span>DELIVERABLE</span>
            <span>OWNER</span>
            <span>STATUS</span>
          </div>
          {[
            ["Launch presentation", "Nova", "Ready"],
            ["Product page", "Milo", "In review"],
            ["Customer update", "Fern", "Draft ready"],
            ["Review meeting", "You", "Scheduled"],
          ].map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                fontSize: 33,
                padding: "32px 10px",
                borderBottom: "1px solid #ddd",
              }}
            >
              {row.map((x, j) => (
                <span key={j}>{x}</span>
              ))}
            </div>
          ))}
        </Interactive.Div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: enter(p, 0.52, 0.54) * (1 - enter(p, 0.65, 0.68)),
          }}
        >
          <LaunchSite />
        </div>
        <Interactive.Div
          name="Reviewable code and tests"
          style={{
            position: "absolute",
            inset: 0,
            background: "#121212",
            color: "#fff",
            padding: "80px 80px",
            opacity: enter(p, 0.65, 0.68),
          }}
        >
          <div style={{ fontSize: 29, color: "#9f9f9f" }}>
            LAUNCH PAGE / REVIEW
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 590,
              letterSpacing: "-.04em",
              marginTop: 35,
            }}
          >
            Ready for a real review.
          </div>
          <div
            style={{
              marginTop: 62,
              borderTop: "1px solid #555",
              paddingTop: 38,
              display: "flex",
              fontSize: 39,
              alignItems: "center",
              gap: 25,
            }}
          >
            <GitPullRequest size={45} />
            Improve the signup flow
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 29,
              lineHeight: 1.9,
              color: "#bbb",
              marginTop: 25,
            }}
          >
            <span style={{ color: "#777" }}>−</span> return submit(form);
            <br />
            <span style={{ color: "#fff" }}>+</span> validateEmail(form.email);
            <br />
            <span style={{ color: "#fff" }}>+</span> return await submit(form);
          </div>
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              fontSize: 32,
              marginTop: 43,
              opacity: enter(p, 0.79, 0.85),
            }}
          >
            <Check size={37} />
            Tests passed · Changes ready to inspect
          </div>
        </Interactive.Div>
      </Interactive.Div>
    </Shell>
  );
};
