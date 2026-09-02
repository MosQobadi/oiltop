"use client";

import { useEffect, useLayoutEffect } from "react";
import { ensureThemeApplied } from "@/lib/storefront/theme";

// Renders nothing. Its whole job is to put the theme back on <html> after a
// locale switch, which is a soft navigation into a different `[locale]` root
// layout — and React resets <html> to exactly the props it renders on the way
// through, taking the theme attribute with it. See `ensureThemeApplied`.
//
// A *layout* effect, not a plain one: it has to run in the same frame React
// committed the reset, before the browser paints, or the page flashes light on
// every language change. Falls back to useEffect on the server only to silence
// React's "useLayoutEffect does nothing on the server" warning — this component
// does nothing during SSR either way, because the inline script in the layout
// is what covers the first paint.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ThemeGuard() {
  // No dependency array on purpose. There is nothing to depend on — the
  // question is only ever "is the attribute still there", and the render that
  // follows a reset is exactly when it needs asking.
  useIsomorphicLayoutEffect(() => {
    ensureThemeApplied();
  });

  return null;
}
