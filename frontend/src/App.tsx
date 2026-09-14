import { Suspense, lazy, useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ConfirmHost } from "./components/Confirm";
import { PageOutlet } from "./components/PageTransition";
import { CUSTOMER_TABS, FARM_TABS, FarmNav, SiteFooter, SiteHeader, TabBar } from "./components/Shell";
import { Skeletons, Toaster } from "./components/ui";
import { Account, Addresses, Deliveries, WalletPage } from "./pages/Account";
import { Basket } from "./pages/Basket";
import { Home } from "./pages/Home";
import { HowItWorks } from "./pages/HowItWorks";
import { Login } from "./pages/Login";
import { PackageDetail, Packages } from "./pages/Packages";
import { ProductDetail } from "./pages/ProductDetail";
import { Shop } from "./pages/Shop";
import { TheFarm } from "./pages/TheFarm";
import { useAuth } from "./store/useStore";

// The farm desk is its own download: shoppers never load the office's pages.
const farm = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const FarmCustomers = farm(() => import("./pages/farm/Customers"), "FarmCustomers");
const FarmCustomerDetail = farm(() => import("./pages/farm/Customers"), "FarmCustomerDetail");
const FarmLogin = farm(() => import("./pages/farm/Login"), "FarmLogin");
const FarmMore = farm(() => import("./pages/farm/More"), "FarmMore");
const FarmWebsite = farm(() => import("./pages/farm/More"), "FarmWebsite");
const FarmProducts = farm(() => import("./pages/farm/Products"), "FarmProducts");
const FarmProductForm = farm(() => import("./pages/farm/ProductForm"), "FarmProductForm");
const FarmRound = farm(() => import("./pages/farm/Round"), "FarmRound");

const Loading = () => (
  <div className="shell" style={{ paddingTop: "var(--sp-8)" }}>
    <Skeletons count={4} height={80} />
  </div>
);

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

/** Customer app: bottom tabs, storefront routes. */
function CustomerShell() {
  return (
    <>
      <SiteHeader />
      <PageOutlet />
      <SiteFooter />
      <TabBar tabs={CUSTOMER_TABS} />
    </>
  );
}

/** Sign-in: the site header, but no tabs or footer. */
function AuthShell() {
  return (
    <>
      <SiteHeader />
      <PageOutlet />
    </>
  );
}

/** Farm desk: staff only, its own tabs. */
function FarmShell() {
  const staff = useAuth((s) => s.staff);
  const ready = useAuth((s) => s.ready);

  if (!ready) {
    return <Loading />;
  }
  if (!staff) return <Navigate to="/farm/login" replace />;

  return (
    <>
      <FarmNav />
      <Suspense fallback={<Loading />}>
        <PageOutlet />
      </Suspense>
      <TabBar tabs={FARM_TABS} />
    </>
  );
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

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
        <Routes>
          {/* Farm desk */}
          <Route
            path="/farm/login"
            element={
              <Suspense fallback={<Loading />}>
                <FarmLogin />
              </Suspense>
            }
          />
          <Route path="/farm" element={<FarmShell />}>
            <Route index element={<FarmRound />} />
            <Route path="customers" element={<FarmCustomers />} />
            <Route path="customers/:id" element={<FarmCustomerDetail />} />
            <Route path="products" element={<FarmProducts />} />
            <Route path="products/new" element={<FarmProductForm />} />
            <Route path="products/:slug" element={<FarmProductForm />} />
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

          <Route element={<AuthShell />}>
            <Route path="/login" element={<Login />} />
          </Route>
        </Routes>
      </main>

      <ConfirmHost />
      <Toaster />
    </div>
  );
}
