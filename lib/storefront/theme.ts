// Light/dark for the storefront. The admin tree never imports any of this and
// stays light — its wireframes are drawn light-only, so a dark admin would be
// invented rather than specified.
//
// The whole mechanism is one attribute on <html>. `[data-theme="dark"]` is one
// of the selectors @heroui/styles keys its own dark variables on, and
// app/globals.css points Tailwind's `dark:` variant at the same attribute, so
// setting it repaints the app's semantic tokens and HeroUI's components in one
// step. Nothing else needs to know the theme — components paint from tokens,
// not from a value threaded through React.
//
// It is an attribute rather than the `dark` *class* HeroUI documents first, and
// that is not cosmetic. React owns `<html className>` — the locale layout sets
// the font variable there — so it rewrites that attribute on any client-side
// navigation that changes it. Switching language does exactly that, and a class
// added by the script below is not in React's vdom, so it was being wiped on
// the way from /en to /fa: dark theme in, light theme out, with localStorage
// still saying dark. React never touches `data-theme`, so it survives.

export type ThemeChoice = "light" | "dark";

/** What the theme is written as, on <html>. */
export const THEME_ATTRIBUTE = "data-theme";

export const THEME_STORAGE_KEY = "topoil-theme";

/**
 * Runs before first paint, inlined into the document head — see the storefront
 * layout. Without it the page renders light, then flips once React hydrates,
 * which is a white flash on every navigation for anyone using the dark theme.
 *
 * Deliberately tiny and dependency-free: it blocks parsing while it runs.
 * Everything it touches can throw (Safari in private mode makes localStorage
 * itself throw on read, not just return null), so the whole body is wrapped and
 * a failure simply leaves the page in its default light state.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=c?c==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},d?"dark":"light");}catch(e){}})();`;

/** What the document is showing right now, read off the element that decides it. */
export function readAppliedTheme(): ThemeChoice {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "dark" ? "dark" : "light";
}

/** The stored choice, or the system's preference if nothing has been chosen. */
function preferredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Private mode, or storage disabled. Fall through to the system.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Puts the theme back on <html> if it has gone missing, and does nothing if it
 * hasn't. Called from a layout effect, so it runs after React has committed but
 * before the browser paints — which is the only reason this is not a flicker.
 *
 * It has to exist because switching locale is a *soft* navigation into a
 * different `[locale]` root layout, and React resets <html> and <body> to
 * exactly the props it renders: lang, dir and class, and nothing else. Anything
 * a script put there is gone, and the inline script that would have restored it
 * does not re-run on a client-side navigation. Probing this with a marker
 * attribute of my own confirmed it — both <html> and <body> came back stripped.
 *
 * The obvious alternative is to let React own the value so it survives by being
 * re-rendered, which means the server must know it, which means a cookie — and
 * a `cookies()` read in the layout would opt the whole storefront out of the
 * 300-second static cache it has today. Not worth it for one attribute.
 */
export function ensureThemeApplied(): void {
  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  if (applied === "dark" || applied === "light") return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, preferredTheme());
}

/**
 * Applies a choice and remembers it. Storing on every toggle rather than only
 * on the first is what keeps a second tab, or the next visit, in step; a write
 * that throws still leaves the current page correctly painted, which is the
 * half that matters to the person who just clicked.
 */
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, choice);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode, or storage disabled. The attribute is already set.
  }
}
