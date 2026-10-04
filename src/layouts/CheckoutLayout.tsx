import { LockKeyhole } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
export function CheckoutLayout() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-black/10 bg-paper/95">
        <div className="container flex h-[76px] items-center justify-between sm:h-24">
          <Link to="/" aria-label="ZEVENRA home">
            <img src="/brand/logo.svg" alt="ZEVENRA" className="w-36 sm:w-48" />
          </Link>
          <span className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.18em] text-ink/55">
            <LockKeyhole size={13} strokeWidth={1.5} />
            Secure checkout
          </span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
