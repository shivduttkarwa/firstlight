import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Logo } from "../components/Shell";
import { Spinner } from "../components/ui";
import { ApiError, api, type User } from "../lib/api";
import { toast, useAuth } from "../store/useStore";

interface OtpResponse {
  detail: string;
  expires_in: number;
  dev_code?: string;
}

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signIn = useAuth((s) => s.signIn);
  const user = useAuth((s) => s.user);
  const next = params.get("next") ?? "/";

  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (phone.replace(/\D/g, "").length !== 10) {
      toast("Enter a 10 digit mobile number.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<OtpResponse>("/auth/otp/request/", { phone });
      setDevCode(res.dev_code ?? null);
      setStage("code");
      setSeconds(30);
      setTimeout(() => boxes.current[0]?.focus(), 80);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not send the code.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    try {
      const res = await api.post<{ user: User; tokens: { access: string; refresh: string }; is_new: boolean }>(
        "/auth/otp/verify/",
        { phone, code, full_name: name },
      );
      signIn(res.user, res.tokens);
      toast(res.is_new ? "Welcome to Firstlight." : `Welcome back${res.user.full_name ? `, ${res.user.full_name.split(" ")[0]}` : ""}.`);
      navigate(next, { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That code did not work.", "error");
      setDigits(["", "", "", "", "", ""]);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean && value) return;

    if (clean.length > 1) {
      const spread = clean.slice(0, 6).split("");
      const filled = [...digits];
      spread.forEach((d, i) => {
        if (index + i < 6) filled[index + i] = d;
      });
      setDigits(filled);
      const joined = filled.join("");
      if (joined.length === 6) void verify(joined);
      else boxes.current[Math.min(index + spread.length, 5)]?.focus();
      return;
    }

    const filled = [...digits];
    filled[index] = clean;
    setDigits(filled);
    if (clean && index < 5) boxes.current[index + 1]?.focus();
    const joined = filled.join("");
    if (joined.length === 6 && !joined.includes("")) void verify(joined);
  }

  return (
    <>
      <AppBar back="/" />
      <div className="shell" style={{ paddingTop: "var(--sp-6)" }}>
        <Logo className="" />
        <AnimatePresence mode="wait">
          {stage === "phone" ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="display mt-3">Sign in.</h1>
              <p className="lede mt-1">We send a six digit code. No password to remember.</p>

              <form onSubmit={requestCode} className="mt-3">
                <label className="field">
                  <span className="label">Mobile number</span>
                  <input
                    className="input num"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                  />
                </label>
                <label className="field">
                  <span className="label">Name (first time only)</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
                <button className="btn btn--primary btn--lg btn--block mt-3" disabled={busy}>
                  {busy ? <Spinner /> : null} Send code
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="display mt-3">Enter the code.</h1>
              <p className="lede mt-1">
                Sent to {phone}.{" "}
                <button className="linkish" onClick={() => setStage("phone")}>
                  Change
                </button>
              </p>

              <div className="otp mt-3">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      boxes.current[i] = el;
                    }}
                    value={d}
                    onChange={(e) => onDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                    }}
                    inputMode="numeric"
                    maxLength={6}
                    aria-label={`Digit ${i + 1}`}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                  />
                ))}
              </div>

              {devCode && (
                <div className="card card--pad mt-3" style={{ background: "var(--accent-soft)" }}>
                  <p className="sm" style={{ color: "var(--accent-ink)" }}>
                    No SMS gateway is connected yet, so here is your code:{" "}
                    <b className="num" style={{ fontSize: "1.1rem" }}>
                      {devCode}
                    </b>
                  </p>
                </div>
              )}

              <button className="btn btn--ghost btn--block mt-3" onClick={() => requestCode()} disabled={seconds > 0 || busy}>
                {seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="hint center mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          Farm staff? <Link to="/farm/login" className="linkish">Sign in here</Link>.
        </p>
      </div>
    </>
  );
}
