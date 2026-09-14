import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth, useSignedIn } from "../store/useStore";
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

const PARENTS: Record<string, string> = { "/shop": "Shop", "/packages": "Packages", "/account": "You" };

/** The section a deeper page sits under, for the desktop breadcrumb. */
function parentOf(pathname: string, back?: boolean | string): [string, string] | null {
  if (typeof back === "string" && PARENTS[back]) return [PARENTS[back], back];
  if (pathname.startsWith("/product/")) return ["Shop", "/shop"];
  if (pathname.startsWith("/packages/")) return ["Packages", "/packages"];
  return null;
}

/** Top bar. Shows the brand on root screens and a back arrow on deeper ones.
    On a desktop the site header takes over, and this becomes a breadcrumb. */
export function AppBar({
  title,
  crumb,
  back,
  right,
  over = false,
  transparentUntil = 8,
}: {
  title?: string;
  /** Breadcrumb label on a desktop, when the phone bar shows no title. */
  crumb?: string;
  back?: boolean | string;
  right?: ReactNode;
  /** The page starts with a full-bleed dark image, so go light until scrolled. */
  over?: boolean;
  transparentUntil?: number;
}) {
  const [solid, setSolid] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const site = !pathname.startsWith("/farm");
  const goBack = () => (typeof back === "string" ? navigate(back) : navigate(-1));
  const parent = parentOf(pathname, back);
  const current = crumb ?? title;

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > (over ? 120 : transparentUntil));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparentUntil, over]);

  return (
    <>
      <header
        className={`appbar${site ? " appbar--site" : ""}${solid ? " appbar--solid" : over ? " appbar--over" : ""}`}
      >
        <div className="appbar__phone">
          {back ? (
            <button className="iconbtn iconbtn--filled" onClick={goBack} aria-label="Back">
              <Icon.back />
            </button>
          ) : null}

          {title ? (
            <h1 className="appbar__title">{title}</h1>
          ) : back ? (
            <span className="appbar__spacer" />
          ) : (
            <Link to="/" className="brand">
              <Logo />
              Firstlight
            </Link>
          )}

          {right}
        </div>
      </header>

      {site && (parent || current || right) && (
        <div className="pagebar">
          {(parent || current) && (
            <nav className="pagebar__crumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              {parent && (
                <>
                  <span aria-hidden="true">/</span>
                  {current ? <Link to={parent[1]}>{parent[0]}</Link> : <span aria-current="page">{parent[0]}</span>}
                </>
              )}
              {current && (
                <>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{current}</span>
                </>
              )}
            </nav>
          )}
          {right && <span className="pagebar__end">{right}</span>}
        </div>
      )}
    </>
  );
}

/** The desktop header, mounted once by the shell so it survives navigation.
    Shown from 900px, where the bottom tabs are hidden. */
export function SiteHeader() {
  const { pathname } = useLocation();
  const signedIn = useSignedIn();
  const over = pathname === "/" && !signedIn;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > (over ? 120 : 8));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [over]);

  return (
    <header className={`sitehead${over && !scrolled ? " appbar--over" : ""}`}>
      <SiteNav />
    </header>
  );
}

const SITE_NAV: [string, string][] = [
  ["Home", "/"],
  ["Shop", "/shop"],
  ["Packages", "/packages"],
  ["How it works", "/how-it-works"],
  ["The farm", "/the-farm"],
];

function sectionOf(pathname: string) {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/product/")) return "/shop";
  return SITE_NAV.find(([, to]) => to !== "/" && pathname.startsWith(to))?.[1] ?? null;
}

function SiteNav() {
  const user = useAuth((s) => s.user);
  const count = useAuth((s) => s.baskets[0]?.item_count ?? 0);
  const first = user?.full_name?.split(" ")[0] || "Account";
  const section = sectionOf(useLocation().pathname);

  return (
    <div className="sitenav">
      <Link to="/" className="brand">
        <Logo />
        Firstlight
      </Link>

      <nav className="topnav" aria-label="Main">
        {SITE_NAV.map(([label, to]) => (
          <Link key={to} to={to} aria-current={section === to ? "page" : undefined}>
            {label}
            {section === to && (
              <motion.span
                layoutId="topnav-bar"
                className="topnav__bar"
                transition={{ type: "spring", damping: 34, stiffness: 420 }}
              />
            )}
          </Link>
        ))}
      </nav>

      <div className="sitenav__end">
        <NavLink to="/basket" className={({ isActive }) => `sitenav__btn${isActive ? " on" : ""}`}>
          <Icon.basket />
          Basket
          {count > 0 && <span className="sitenav__count num">{count}</span>}
        </NavLink>
        {user ? (
          <NavLink to="/account" className={({ isActive }) => `sitenav__btn${isActive ? " on" : ""}`}>
            <span className="sitenav__avatar">{first.slice(0, 1).toUpperCase()}</span>
            {first}
          </NavLink>
        ) : (
          <Link to="/login" className="btn btn--primary btn--sm">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

const FOOTER_LINKS: [string, [string, string][]][] = [
  [
    "Shop",
    [
      ["Milk", "/shop?kind=milk"],
      ["Ghee", "/shop?kind=ghee"],
      ["Curd", "/shop?kind=curd"],
      ["Chhach", "/shop?kind=chhach"],
      ["Packages", "/packages"],
    ],
  ],
  [
    "Firstlight",
    [
      ["How it works", "/how-it-works"],
      ["The farm", "/the-farm"],
    ],
  ],
  [
    "Your account",
    [
      ["My basket", "/basket"],
      ["Deliveries", "/account/deliveries"],
      ["Wallet", "/account/wallet"],
      ["Addresses", "/account/addresses"],
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="sitefoot">
      <div className="sitefoot__in">
        <div className="sitefoot__brand">
          <Link to="/" className="brand">
            <Logo />
            Firstlight
          </Link>
          <p>Cow and buffalo milk from one farm, at your gate before six.</p>
          <address>
            Village 11 SHPD, Post 8 SHPD
            <br />
            Tehsil Suratgarh, District Sriganganagar
            <br />
            Rajasthan, India
          </address>
        </div>

        {FOOTER_LINKS.map(([heading, links]) => (
          <nav key={heading} className="sitefoot__col" aria-label={heading}>
            <h2>{heading}</h2>
            {links.map(([label, to]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </nav>
        ))}

        <div className="sitefoot__col">
          <h2>Rounds</h2>
          <span>
            <Icon.sun /> Morning · 5.30 – 8.00 am
          </span>
          <span>
            <Icon.moon /> Evening · 5.00 – 7.30 pm
          </span>
        </div>
      </div>
      <div className="sitefoot__base">
        <span>© {new Date().getFullYear()} Firstlight</span>
        <span>Milked at 4.30. Never pooled, never standardised.</span>
      </div>
    </footer>
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
