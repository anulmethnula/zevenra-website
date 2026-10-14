/* eslint-disable react-hooks/exhaustive-deps -- loadAdmin is stable in the store provider. */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Boxes,
  FolderKanban,
  Gauge,
  Home,
  Inbox,
  LogOut,
  Menu,
  Search,
  Settings,
  Wallet,
  Truck,
  X,
} from "lucide-react";
import { useStore } from "../features/store/StoreContext";
import { AdminToasts } from "../components/admin/AdminToasts";
import { Seo } from "../components/Seo";
import { adminApi } from "../services/adminApi";

type AdminNotification={id:string;title:string;description:string;href:string;readAt:string;createdAt:string};

const links = [
  ["/admin", Gauge, "Dashboard"],
  ["/admin/products", Boxes, "Products"],
  ["/admin/categories", FolderKanban, "Categories"],
  ["/admin/collections", FolderKanban, "Collections"],
  ["/admin/preorders", Inbox, "Pre-orders"],
  ["/admin/orders", BarChart3, "Orders"],
  ["/admin/finance", Wallet, "Finance"],
  ["/admin/homepage", Home, "Homepage"],
  ["/admin/delivery", Truck, "Couriers & Delivery"],
  ["/admin/settings", Settings, "Settings"],
] as const;

export function AdminLayout() {
  const [open, setOpen] = useState(false),
    [checking, setChecking] = useState(true),
    [authorized, setAuthorized] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [commandQuery, setCommandQuery] = useState(""),
    [notifications,setNotifications]=useState<AdminNotification[]>([]),
    [notificationsOpen,setNotificationsOpen]=useState(false),
    [sessionError, setSessionError] = useState(""),
    navigate = useNavigate(),
    location = useLocation(),
    store = useStore();
  useEffect(() => {
    let active = true;
    async function validate() {
      setSessionError("");
      if (!store.live) {
        if (active) { setAuthorized(true); setChecking(false); }
        return;
      }
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        if (response.status === 401) {
          navigate(
            "/admin/login?next=" +
              encodeURIComponent(location.pathname + location.search),
            { replace: true },
          );
          return;
        }
        if (!response.ok)
          throw new Error("Admin session service is temporarily unavailable.");
        if (active) setAuthorized(true);
      } catch (reason) {
        if (active)
          setSessionError(
            reason instanceof Error
              ? reason.message
              : "Admin session unavailable.",
          );
      } finally {
        if (active) setChecking(false);
      }
    }
    void validate();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (authorized) void store.loadAdmin(location.pathname);
  }, [authorized, location.pathname, store.loadAdmin]);
  useEffect(()=>{if(!authorized||!store.live)return;const controller=new AbortController();void adminApi.get<AdminNotification[]>("listNotifications",{},controller.signal).then(setNotifications).catch(()=>undefined);return()=>controller.abort();},[authorized,store.live]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setCommandOpen(true);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function logout() {
    if (store.live)
      await fetch("/api/admin/logout", { method: "POST" }).catch(
        () => undefined,
      );
    sessionStorage.removeItem("admin-demo");
    navigate("/admin/login", { replace: true });
  }
  if (checking)
    return (
      <div className="grid min-h-dvh place-content-center bg-[#e9e4dc] text-center">
        <Seo title="Admin" noindex />
        <span className="mx-auto mb-5 h-6 w-6 animate-spin rounded-full border border-black/15 border-t-black" />
        <p className="eyebrow text-black/45">Checking secure admin session…</p>
      </div>
    );
  if (sessionError)
    return (
      <div className="grid min-h-dvh place-content-center bg-[#e9e4dc] px-6 text-center">
        <Seo title="Admin unavailable" noindex />
        <h1 className="display text-4xl">Admin unavailable.</h1>
        <p className="mt-3 max-w-md text-sm text-black/55">{sessionError}</p>
        <button
          className="btn btn-dark mx-auto mt-6"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  const sidebar = (
    <>
      <div className="admin-sidebar__brand flex items-center justify-between border-b border-white/10 pb-6">
        <img src="/brand/logo-light.svg" alt="ZEVENRA" className="w-36" />
        <button
          className="grid min-h-11 min-w-11 place-items-center text-white/70 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>
      </div>
      <p className="admin-sidebar__label mt-7">CONTROL ROOM</p>
      <nav className="admin-nav mt-5 grid gap-1 overflow-y-auto">
        {links.map(([to, Icon, label]) => (
          <NavLink
            end={to === "/admin"}
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `admin-nav-link group flex min-h-12 items-center gap-3 px-4 transition ${isActive ? "is-active" : ""}`
            }
          >
            <Icon size={16} strokeWidth={1.6} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <button
        onClick={() => void logout()}
        className="admin-signout mt-auto flex min-h-12 items-center gap-3 border-t border-white/10 px-4 pt-5 transition"
      >
        <LogOut size={16} /> Sign out
      </button>
    </>
  );
  const pageLabel = links.find(([to]) => to === location.pathname || (to !== "/admin" && location.pathname.startsWith(to)))?.[2] || "Operations";
  const commands = links.filter(([, , label]) => label.toLowerCase().includes(commandQuery.trim().toLowerCase()));
  const runCommand = (to: string) => { setCommandOpen(false); setCommandQuery(""); navigate(to); };
  const unread=notifications.filter(item=>!item.readAt).length;
  async function openNotification(item:AdminNotification){setNotificationsOpen(false);if(!item.readAt){setNotifications(current=>current.map(value=>value.id===item.id?{...value,readAt:new Date().toISOString()}:value));await adminApi.post("markNotificationRead",{id:item.id}).catch(()=>undefined);}navigate(item.href);}
  async function readAll(){setNotifications(current=>current.map(item=>({...item,readAt:item.readAt||new Date().toISOString()})));await adminApi.post("markAllNotificationsRead",{}).catch(()=>undefined);}
  return (
    <div className="admin-shell min-h-dvh">
      <Seo title={pageLabel} noindex />
      <AdminToasts />
      <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col p-6 md:flex">
        {sidebar}
      </aside>
      {open && (
        <aside className="admin-sidebar fixed inset-0 z-50 flex flex-col p-6 md:hidden">
          {sidebar}
        </aside>
      )}
      <div className="admin-content md:pl-64">
        <header className="admin-topbar sticky top-0 z-30 flex h-16 items-center justify-between px-4 sm:px-7">
          <button
            className="grid min-h-11 min-w-11 place-items-center md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={19} />
          </button>
          <div className="admin-topbar__brand hidden items-center gap-3 sm:flex">
            <span />
            <p>ZEVENRA / {pageLabel.toUpperCase()}</p>
          </div>
          <button type="button" className="admin-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open admin command bar"><Search size={15}/><span>Search admin</span><kbd>⌘K</kbd></button>
          <div className="relative ml-auto"><button type="button" className="relative grid min-h-11 min-w-11 place-items-center" aria-label={`Notifications${unread?` (${unread} unread)`:""}`} aria-expanded={notificationsOpen} onClick={()=>setNotificationsOpen(value=>!value)}><Bell size={18}/>{unread?<span className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-800 px-1 text-[9px] text-white">{unread>99?"99+":unread}</span>:null}</button>{notificationsOpen?<div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] border border-black/10 bg-[#f6f3ed] p-3 shadow-2xl"><div className="flex items-center justify-between border-b border-black/10 pb-3"><b className="text-sm">Notifications</b><button type="button" className="text-[10px] uppercase tracking-wider underline" onClick={()=>void readAll()}>Mark all as read</button></div><div className="max-h-96 overflow-y-auto">{notifications.length?notifications.map(item=><button type="button" key={item.id} onClick={()=>void openNotification(item)} className={`block w-full border-b border-black/10 p-3 text-left last:border-0 ${item.readAt?"opacity-55":"bg-white/40"}`}><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-xs text-black/55">{item.description}</span><span className="mt-2 block text-[10px] text-black/40">{new Date(item.createdAt).toLocaleString("en-LK",{timeZone:"Asia/Colombo"})}</span></button>):<p className="p-6 text-center text-xs text-black/45">No notifications yet.</p>}</div></div>:null}</div>
          <span
            className={`admin-live-badge ${store.live ? "is-live" : "is-demo"}`}
          >
            {store.live ? "LIVE DATA" : "DEMO MODE"}
          </span>
        </header>
        <main className="admin-main p-4 sm:p-8 lg:p-12 xl:p-14">
          {store.adminLoading && !store.adminReady ? (
            <div className="grid min-h-[65vh] place-content-center text-center">
              <span className="mx-auto mb-5 h-6 w-6 animate-spin rounded-full border border-black/15 border-t-black" />
              <p className="eyebrow text-black/45">Loading control room…</p>
            </div>
          ) : (
            <>
              {store.adminLoading && <div className="mb-5 h-1 overflow-hidden rounded-full bg-black/[.06]" role="status" aria-label={`Loading ${pageLabel}`}><div className="h-full w-1/3 animate-pulse rounded-full bg-black/35" /></div>}
              {store.adminError && (
                <div
                  className="mb-6 border border-amber-900/15 bg-amber-950/[.07] p-4 text-sm text-amber-950"
                  role="alert"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span>{store.adminError}</span>
                    <button
                      className="border-b border-current pb-1 text-[10px] tracking-[.18em]"
                      onClick={() => void store.loadAdmin()}
                    >
                      RETRY ALL
                    </button>
                  </div>
                </div>
              )}
              <Outlet />
            </>
          )}
        </main>
      </div>
      {commandOpen && <div className="admin-command-backdrop" role="presentation" onMouseDown={() => setCommandOpen(false)}><section className="admin-command" role="dialog" aria-modal="true" aria-label="Admin navigation" onMouseDown={event => event.stopPropagation()}><div className="admin-command__search"><Search size={18}/><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Go to products, orders, categories…" aria-label="Search admin pages"/><kbd>ESC</kbd></div><div className="admin-command__results"><p>Navigate</p>{commands.length ? commands.map(([to,Icon,label])=><button key={to} type="button" onClick={() => runCommand(to)}><Icon size={17}/><span>{label}</span></button>) : <div className="admin-command__empty">No matching results</div>}</div></section></div>}
    </div>
  );
}
