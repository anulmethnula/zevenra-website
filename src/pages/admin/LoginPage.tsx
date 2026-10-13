import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Seo } from "../../components/Seo";

export default function LoginPage() {
  const navigate = useNavigate(),
    [params] = useSearchParams(),
    [error, setError] = useState(""),
    [success,setSuccess]=useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [recoveryMode,setRecoveryMode]=useState(false),
    [showRecovery,setShowRecovery]=useState(false),
    [showConfirm,setShowConfirm]=useState(false),
    next = params.get("next"),
    safeNext =
      next && next.startsWith("/admin") && !next.startsWith("//")
        ? next
        : "/admin";
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === "true") return;
    let active = true;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => {
        if (active && response.ok) navigate(safeNext, { replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate, safeNext]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    setError("");
    setSuccess("");
    setBusy(true);
    const credentials = Object.fromEntries(new FormData(form));
    try {
      if (import.meta.env.VITE_DEMO_MODE === "true") {
        if (!credentials.username || !credentials.password)
          throw new Error("Enter your username and password.");
        sessionStorage.setItem("admin-demo", "1");
        navigate(safeNext);
        return;
      }
      const response = await fetch(recoveryMode?"/api/admin/recover":"/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        }),
        payload = (await response.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
      if (!response.ok)
        throw new Error(
          response.status >= 500
            ? payload.error || "Admin login is temporarily unavailable."
            : payload.error||(recoveryMode?"Recovery details could not be verified.":"Invalid credentials. Please try again."),
        );
      if(recoveryMode){setRecoveryMode(false);setSuccess("Password reset. Sign in with your new password.");form.reset();return;}
      navigate(safeNext, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Admin login is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-login">
      <Seo title="Admin sign in" noindex />
      <section className="admin-login__visual" aria-hidden="true">
        <img src="/brand/hero.jpg" alt="" />
        <div className="admin-login__visual-copy">
          <span>Private studio</span>
          <p className="display">
            The art of
            <br />
            <em>becoming.</em>
          </p>
        </div>
        <div className="admin-login__visual-foot">
          <span>EST. 2026</span>
          <span>ZEVENRA — LK</span>
        </div>
      </section>
      <section className="admin-login__content">
        <div className="admin-login__ambient" aria-hidden="true" />
        <header className="admin-login__top">
          <img src="/brand/logo-light.svg" alt="ZEVENRA" />
          <span>
            <i /> Secure portal
          </span>
        </header>
        <form onSubmit={submit} className="admin-login__form">
          <div className="admin-login__index">
            <span>OWNER ACCESS</span>
            <span>01 / 01</span>
          </div>
          <div className="admin-login__heading">
            <h1 className="display">
              {recoveryMode?"Recover":"Welcome"}
              <br />
              <em>{recoveryMode?"access.":"back."}</em>
            </h1>
            <p>{recoveryMode?"Enter your recovery details and choose a new password.":"Enter the private workspace for managing products, orders, and the ZEVENRA story."}</p>
          </div>
          <div className="admin-login__fields">
            <label>
              <span>Username</span>
              <div className="admin-login__field">
                <UserRound />
                <input
                  name="username"
                  autoComplete="username"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </label>
            {recoveryMode&&<label>
              <span>Recovery code</span>
              <div className="admin-login__field"><ShieldCheck/><input name="recoveryCode" type={showRecovery?"text":"password"} autoComplete="off" placeholder="Enter your recovery code" required/><button type="button" onClick={()=>setShowRecovery(value=>!value)} aria-label={showRecovery?"Hide recovery code":"Show recovery code"}>{showRecovery?<EyeOff/>:<Eye/>}</button></div>
            </label>}
            <label>
              <span>{recoveryMode?"New password":"Password"}</span>
              <div className="admin-login__field">
                <LockKeyhole />
                <input
                  name={recoveryMode?"newPassword":"password"}
                  type={showPassword ? "text" : "password"}
                  autoComplete={recoveryMode?"new-password":"current-password"}
                  placeholder={recoveryMode?"Choose your new password.":"Enter your password"}
                  maxLength={200}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {recoveryMode&&<label>
              <span>Confirm new password</span>
              <div className="admin-login__field"><LockKeyhole/><input name="confirmPassword" type={showConfirm?"text":"password"} autoComplete="new-password" placeholder="Repeat your new password" maxLength={200} required/><button type="button" onClick={()=>setShowConfirm(value=>!value)} aria-label={showConfirm?"Hide confirmed password":"Show confirmed password"}>{showConfirm?<EyeOff/>:<Eye/>}</button></div>
            </label>}
          </div>
          {!recoveryMode&&<button type="button" className="mt-3 text-[10px] text-white/45 underline-offset-4 hover:text-white hover:underline" onClick={()=>{setRecoveryMode(true);setError("");setSuccess("");}}>Forgot password?</button>}
          {error && (
            <p role="alert" className="admin-login__error">
              {error}
            </p>
          )}
          {success&&<p role="status" className="admin-login__error border-emerald-500/60 bg-emerald-500/10 text-emerald-200">{success}</p>}
          <button disabled={busy} className="admin-login__submit">
            <span>{busy?(recoveryMode?"Resetting…":"Signing in…"):(recoveryMode?"Reset password":"Enter control room")}</span>
            <ArrowUpRight />
          </button>
          {recoveryMode&&<button type="button" className="mt-4 w-full text-center text-[10px] uppercase tracking-[.16em] text-white/45 hover:text-white" onClick={()=>{setRecoveryMode(false);setError("");}}>Back to sign in</button>}
          <p className="admin-login__note">
            <ShieldCheck /> Protected by a secure server session
          </p>
        </form>
        <footer className="admin-login__footer">
          <span>© 2026 ZEVENRA</span>
          <span>AUTHORISED PERSONNEL ONLY</span>
        </footer>
      </section>
    </main>
  );
}
