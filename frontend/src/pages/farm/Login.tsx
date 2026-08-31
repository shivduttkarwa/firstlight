import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppBar, Logo } from "../../components/Shell";
import { Spinner } from "../../components/ui";
import { ApiError, api, type StaffUser } from "../../lib/api";
import { toast, useAuth } from "../../store/useStore";

export function FarmLogin() {
  const navigate = useNavigate();
  const staff = useAuth((s) => s.staff);
  const signInStaff = useAuth((s) => s.signInStaff);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (staff) navigate("/farm", { replace: true });
  }, [staff, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ user: StaffUser; tokens: { access: string; refresh: string } }>(
        "/auth/staff/login/",
        { username: username.trim(), password },
      );
      signInStaff(res.user, res.tokens);
      toast(`Welcome, ${res.user.full_name || res.user.username}.`);
      navigate("/farm", { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not sign in.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar back="/" />
      <div className="shell" style={{ paddingTop: "var(--sp-6)" }}>
        <Logo className="" />
        <h1 className="display mt-3">Farm desk.</h1>
        <p className="lede mt-1">For the people who run Firstlight.</p>

        <form onSubmit={submit} className="mt-3">
          <label className="field">
            <span className="label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn btn--primary btn--lg btn--block mt-3" disabled={busy || !username || !password}>
            {busy ? <Spinner /> : null} Sign in
          </button>
        </form>

        <p className="hint center mt-3">
          Are you a customer? <Link to="/login" className="linkish">Sign in with your phone</Link>.
        </p>
      </div>
    </>
  );
}
