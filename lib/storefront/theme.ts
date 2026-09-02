// Light/dark for the storefront. The admin tree never imports any of this and
// stays light — its wireframes are drawn light-only, so a dark admin would be
// invented rather than specified.
//
// The whole mechanism is one class on <html>. `.dark` is what @heroui/styles
// keys its own dark variables on, and app/globals.css points Tailwind's `dark:`
// variant at the same class, so adding it repaints the app's semantic tokens
// and HeroUI's components in one step. Nothing else needs to know the theme —
// components paint from tokens, not from a value threaded through React.

export type ThemeChoice = "light" | "dark";

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
)});var d=c?c==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/** What the document is showing right now, read off the element that decides it. */
export function readAppliedTheme(): ThemeChoice {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Applies a choice and remembers it. Storing on every toggle rather than only
 * on the first is what keeps a second tab, or the next visit, in step; a write
 * that throws still leaves the current page correctly painted, which is the
 * half that matters to the person who just clicked.
 */
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.classList.toggle("dark", choice === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode, or storage disabled. The class is already set.
  }
}
