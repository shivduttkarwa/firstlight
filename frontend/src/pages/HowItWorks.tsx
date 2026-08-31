import { Link } from "react-router-dom";
import { AppBar } from "../components/Shell";
import { Icon, Reveal } from "../components/ui";

const STEPS = [
  {
    n: "01",
    title: "Pick a package, or build your own",
    body: "A ready-made basket takes two taps. Or add items one at a time and set the rhythm for each.",
  },
  {
    n: "02",
    title: "Choose a round",
    body: "Morning between 5.30 and 8.00, evening between 5.00 and 7.30. Some households take both.",
  },
  {
    n: "03",
    title: "Set the rhythm",
    body: "Every day, every other day, chosen weekdays, or once a month for ghee. Change it whenever you like.",
  },
  {
    n: "04",
    title: "Top up your wallet",
    body: "Each delivery is drawn from your balance on the day it goes out. No cash at the gate.",
  },
];

const RULES = [
  ["Morning round", "5.30 – 8.00 am", "Change it before 9 pm the night before."],
  ["Evening round", "5.00 – 7.30 pm", "Change it before 1 pm the same day."],
  ["One day at a time", "Any day", "Tap the day in your calendar and set a different amount, or none at all."],
  ["Going away", "Any length", "Pause the whole basket and resume when you are back."],
];

export function HowItWorks() {
  return (
    <>
      <AppBar back title="How it works" />
      <div className="shell">
        <Reveal>
          <span className="eyebrow">How it works</span>
          <h1 className="display mt-1">Set it once. Forget about milk.</h1>
          <p className="lede mt-2">
            A Firstlight basket is a standing instruction to our morning and evening rounds. You stay in control of
            every single day of it.
          </p>
        </Reveal>

        <div className="stack flow-sm mt-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.05}>
              <div className="card card--pad">
                <span
                  className="num"
                  style={{ fontFamily: "var(--font-display)", color: "var(--brand)", fontSize: "0.8rem" }}
                >
                  {step.n}
                </span>
                <h3 className="h3 mt-1">{step.title}</h3>
                <p className="sm muted mt-1">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <h2 className="h3 mt-4 mb-2">The rules, plainly</h2>
        <div className="card card--pad">
          {RULES.map(([label, when, detail], i) => (
            <div
              key={label}
              style={{
                paddingBlock: "var(--sp-3)",
                borderTop: i ? "1px solid var(--line-2)" : undefined,
              }}
            >
              <div className="between">
                <b className="sm">{label}</b>
                <span className="tiny muted num">{when}</span>
              </div>
              <p className="tiny muted mt-1">{detail}</p>
            </div>
          ))}
        </div>

        <Reveal>
          <div
            className="card card--pad mt-3 center"
            style={{ background: "var(--panel)", color: "var(--on-panel)", marginBottom: "var(--sp-8)" }}
          >
            <h2 className="h3">Ready when you are.</h2>
            <Link to="/packages" className="btn btn--primary mt-3">
              See the packages <Icon.arrow />
            </Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}
