import { useEffect, useLayoutEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";

/** Each page fades in as it rises (the page-in animation on .page). The scroll
    resets before the new page paints, so the swap never shows a jump. */
export function PageOutlet() {
  const { pathname } = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div key={pathname} className="page">
      {outlet}
    </div>
  );
}
