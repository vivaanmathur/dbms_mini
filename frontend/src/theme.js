/*
 * Palettes. Each person picks one and it is remembered for them — keyed by
 * their account, so two people sharing a computer keep their own.
 */
export const THEMES = [
  { id: "archive",  name: "Archive",  note: "Warm cream",      swatches: ["#f2efe7", "#1a1814", "#2c5a4a"] },
  { id: "oxford",   name: "Oxford",   note: "Cool grey, navy", swatches: ["#eceef1", "#17212e", "#1f5a52"] },
  { id: "claret",   name: "Claret",   note: "Warm blush",      swatches: ["#f3ece8", "#241a18", "#8e2f33"] },
  { id: "sage",     name: "Sage",     note: "Pale green-grey", swatches: ["#ecefe8", "#1c2219", "#2b5b46"] },
  { id: "graphite", name: "Graphite", note: "Neutral",         swatches: ["#edecea", "#17181a", "#2f5a4e"] },
  { id: "nocturne", name: "Nocturne", note: "Dark",            swatches: ["#14151a", "#eceadf", "#74b49c"] },
];

const DEFAULT = "archive";
let currentUser = "guest";

function key(userId) {
  return "continuity.theme." + (userId ?? currentUser);
}

export function getTheme(userId) {
  if (userId !== undefined) currentUser = userId;
  try {
    return localStorage.getItem(key(userId)) || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function applyTheme(id, animate = false) {
  const root = document.documentElement;
  // one considered cross-fade to the new palette, not a flicker element by element
  if (animate) {
    root.classList.add("theme-shifting");
    window.setTimeout(() => root.classList.remove("theme-shifting"), 500);
  }
  root.setAttribute("data-theme", id);
  try {
    localStorage.setItem(key(), id);
  } catch {
    /* private window: the palette just is not remembered */
  }
}
