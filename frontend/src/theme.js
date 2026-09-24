/*
 * Palettes.
 *
 * A teacher picks one and we remember it for them. The choice is stored
 * against their faculty id, so two teachers sharing a computer do not end up
 * with each other's colours.
 */
export const THEMES = [
  { id: "archive",  name: "Archive",  note: "Warm cream",       swatches: ["#f2efe7", "#1a1814", "#2c5a4a"] },
  { id: "oxford",   name: "Oxford",   note: "Cool grey, navy",  swatches: ["#eceef1", "#17212e", "#1f5a52"] },
  { id: "claret",   name: "Claret",   note: "Warm blush",       swatches: ["#f3ece8", "#241a18", "#8e2f33"] },
  { id: "sage",     name: "Sage",     note: "Pale green-grey",  swatches: ["#ecefe8", "#1c2219", "#2b5b46"] },
  { id: "graphite", name: "Graphite", note: "Neutral",          swatches: ["#edecea", "#17181a", "#2f5a4e"] },
  { id: "nocturne", name: "Nocturne", note: "Dark",             swatches: ["#14151a", "#eceadf", "#74b49c"] },
];

const DEFAULT = "archive";

function keyFor() {
  const id = localStorage.getItem("myFacultyId");
  return id ? "theme:" + id : "theme:guest";
}

export function getTheme() {
  try {
    return localStorage.getItem(keyFor()) || DEFAULT;
  } catch {
    return DEFAULT;   // private windows can throw on read
  }
}

export function applyTheme(id, animate = false) {
  const root = document.documentElement;

  // A brief transition class makes the whole interface cross-fade to the new
  // palette in one move, instead of flickering element by element.
  if (animate) {
    root.classList.add("theme-shifting");
    window.setTimeout(() => root.classList.remove("theme-shifting"), 500);
  }

  root.setAttribute("data-theme", id);
  try {
    localStorage.setItem(keyFor(), id);
  } catch {
    /* nothing we can do, the colour just will not be remembered */
  }
}
