import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Logo } from "../components/Shell";
import { PhoneSignIn } from "../components/SignIn";
import { safeNext } from "../lib/nav";
import { photo } from "../lib/photos";
import { useAuth } from "../store/useStore";

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  return (
    <>
      <AppBar back="/" />
      <div className="shell auth">
        <aside className="auth__panel">
          <img {...photo("pour", 640, 780, "(min-width: 900px) 620px, 1px")} />
          <div className="auth__over">
            <span className="eyebrow">Firstlight</span>
            <h2 className="h2 mt-1">Milk at your gate before six.</h2>
            <ul className="auth__points">
              <li>Milked at 4.30, on the road by 5.30</li>
              <li>Skip, change or pause any day</li>
              <li>One wallet, no cash at the gate</li>
            </ul>
          </div>
        </aside>

        <div className="auth__form">
          <Logo className="" />
          <PhoneSignIn page />
          <p className="hint center mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
            Farm staff? <Link to="/farm/login" className="linkish">Sign in here</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
