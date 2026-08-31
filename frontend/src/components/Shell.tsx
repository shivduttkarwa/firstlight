import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../store/useStore";
import { Icon } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={38} height={38} className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#071310" />
      <path d="M6 21h20" stroke="#C6F24B" strokeWidth="2.4" strokeLinecap="square" />
      <path d="M10 21a6 6 0 0 1 12 0" fill="#C6F24B" />
      <path d="M6 26h20" stroke="#C6F24B" strokeWidth="2.4" strokeLinecap="square" opacity=".45" />
    </svg>
  );
}

/** Top bar. Shows the brand on root screens and a back arrow on deeper ones. */
export function AppBar({
  title,
  back,
  right,
  over = false,
  transparentUntil = 8,
}: {
  title?: string;
  back?: boolean | string;
  right?: ReactNode;
  /** The page starts with a full-bleed dark image, so go light until scrolled. */
  over?: boolean;
  transparentUntil?: number;
}) {
  const [solid, setSolid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > (over ? 120 : transparentUntil));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparentUntil, over]);

  return (
    <header className={`appbar${solid ? " appbar--solid" : over ? " appbar--over" : ""}`}>
      {back ? (
        <button
          className="iconbtn iconbtn--filled"
          onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          aria-label="Back"
        >
          <Icon.back />
        </button>
      ) : null}

      {title ? (
        <h1 className="appbar__title">{title}</h1>
      ) : back ? (
        <span className="appbar__spacer" />
      ) : (
        <>
          <Link to="/" className="brand">
            <Logo />
            Firstlight
          </Link>
          <CustomerTopNav />
        </>
      )}

      {right}
    </header>
  );
}

function CustomerTopNav() {
  const user = useAuth((s) => s.user);
  return (
    <nav className="topnav" aria-label="Main">
      <NavLink to="/shop" className={({ isActive }) => (isActive ? "on" : "")}>
        Shop
      </NavLink>
      <NavLink to="/packages" className={({ isActive }) => (isActive ? "on" : "")}>
        Packages
      </NavLink>
      <NavLink to="/basket" className={({ isActive }) => (isActive ? "on" : "")}>
        My basket
      </NavLink>
      <NavLink to={user ? "/account" : "/login"} className={({ isActive }) => (isActive ? "on" : "")}>
        {user ? user.full_name?.split(" ")[0] || "Account" : "Sign in"}
      </NavLink>
    </nav>
  );
}

interface Tab {
  to: string;
  label: string;
  icon: () => ReactNode;
  end?: boolean;
  badge?: number;
}

export function TabBar({ tabs }: { tabs: Tab[] }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `tab${isActive ? " tab--on" : ""}`}>
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="tab-dot"
                  className="tab__dot"
                  transition={{ type: "spring", damping: 30, stiffness: 420 }}
                />
              )}
              {tab.icon()}
              {tab.label}
              {tab.badge ? <span className="tab__badge">{tab.badge}</span> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export const CUSTOMER_TABS: Tab[] = [
  { to: "/", label: "Home", icon: () => <Icon.home />, end: true },
  { to: "/shop", label: "Shop", icon: () => <Icon.shop /> },
  { to: "/basket", label: "Basket", icon: () => <Icon.basket /> },
  { to: "/account", label: "You", icon: () => <Icon.user /> },
];

export const FARM_TABS: Tab[] = [
  { to: "/farm", label: "Round", icon: () => <Icon.route />, end: true },
  { to: "/farm/customers", label: "Customers", icon: () => <Icon.people /> },
  { to: "/farm/products", label: "Products", icon: () => <Icon.box /> },
  { to: "/farm/more", label: "More", icon: () => <Icon.more /> },
];

/** The farm desk on a desktop: the bottom tabs are hidden there, so give
    the office a proper nav row instead of leaving it with none. */
export function FarmNav() {
  return (
    <nav className="farmnav" aria-label="Farm desk">
      {FARM_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? "on" : "")}>
          {tab.icon()}
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
