import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation, useOutlet } from "react-router-dom";
import { CUSTOMER_TABS, FARM_TABS, FarmNav, TabBar } from "./components/Shell";
import { PageFade, Skeletons, Toaster } from "./components/ui";
import { Account, Addresses, Deliveries, WalletPage } from "./pages/Account";
import { Basket } from "./pages/Basket";
import { Home } from "./pages/Home";
import { HowItWorks } from "./pages/HowItWorks";
import { Login } from "./pages/Login";
import { PackageDetail, Packages } from "./pages/Packages";
import { ProductDetail } from "./pages/ProductDetail";
import { Shop } from "./pages/Shop";
import { TheFarm } from "./pages/TheFarm";
import { FarmCustomerDetail, FarmCustomers } from "./pages/farm/Customers";
import { FarmLogin } from "./pages/farm/Login";
import { FarmMore, FarmWebsite } from "./pages/farm/More";
import { FarmProducts } from "./pages/farm/Products";
import { FarmRound } from "./pages/farm/Round";
import { useAuth } from "./store/useStore";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="shell sect center">
      <h1 className="display">Nothing on this road.</h1>
      <p className="lede mt-2">The page you were after is not here. The milk, however, is.</p>
      <Link to="/" className="btn btn--primary mt-3">
        Back home
      </Link>
    </div>
  );
}

/** The page transition, wrapped around the outlet rather than around the whole
    route tree — anything outside it survives a navigation. */
function FadingOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageFade key={location.pathname}>{outlet}</PageFade>
    </AnimatePresence>
  );
}

/** Customer app: bottom tabs, storefront routes. */
function CustomerShell() {
  return (
    <>
      <FadingOutlet />
      <TabBar tabs={CUSTOMER_TABS} />
    </>
  );
}

/** Farm desk: staff only, its own tabs. */
function FarmShell() {
  const staff = useAuth((s) => s.staff);
  const ready = useAuth((s) => s.ready);

  if (!ready) {
    return (
      <div className="shell" style={{ paddingTop: "var(--sp-8)" }}>
        <Skeletons count={4} height={80} />
      </div>
    );
  }
  if (!staff) return <Navigate to="/farm/login" replace />;

  return (
    <>
      <FarmNav />
      <FadingOutlet />
      <TabBar tabs={FARM_TABS} />
    </>
  );
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const location = useLocation();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="mesh" aria-hidden="true" />

      <main id="main" className="appmain">
        <Routes location={location}>
          {/* Farm desk */}
          <Route path="/farm/login" element={<FarmLogin />} />
          <Route path="/farm" element={<FarmShell />}>
            <Route index element={<FarmRound />} />
            <Route path="customers" element={<FarmCustomers />} />
            <Route path="customers/:id" element={<FarmCustomerDetail />} />
            <Route path="products" element={<FarmProducts />} />
            <Route path="more" element={<FarmMore />} />
            <Route path="website" element={<FarmWebsite />} />
          </Route>

          {/* Storefront */}
          <Route element={<CustomerShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:slug" element={<ProductDetail />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/packages/:slug" element={<PackageDetail />} />
            <Route path="/basket" element={<Basket />} />
            <Route path="/account" element={<Account />} />
            <Route path="/account/wallet" element={<WalletPage />} />
            <Route path="/account/deliveries" element={<Deliveries />} />
            <Route path="/account/addresses" element={<Addresses />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/the-farm" element={<TheFarm />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/login" element={<Login />} />
        </Routes>
      </main>

      <ScrollToTop />
      <Toaster />
    </div>
  );
}
