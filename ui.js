/**
 * ui.js – Handles theme modes (Dark/Light), Accent Color pickers, and horizontal scrolling marquee.
 */

const ACCENT_COLOR_MAP = {
  white: { accent: "#ffffff", hover: "#e0e0e0", glow: "rgba(255, 255, 255, 0.12)" },
  green: { accent: "#3ecf8e", hover: "#4de09e", glow: "rgba(62, 207, 142, 0.12)" },
  blue: { accent: "#1a73e8", hover: "#3b82f6", glow: "rgba(26, 115, 232, 0.12)" },
  purple: { accent: "#a855f7", hover: "#c084fc", glow: "rgba(168, 85, 247, 0.12)" },
  orange: { accent: "#f97316", hover: "#fb923c", glow: "rgba(249, 115, 22, 0.12)" }
};

export function applyAccentColor(colorName, dotsList) {
  const vars = ACCENT_COLOR_MAP[colorName] || ACCENT_COLOR_MAP.white;
  document.documentElement.style.setProperty("--accent", vars.accent);
  document.documentElement.style.setProperty("--accent-hover", vars.hover);
  document.documentElement.style.setProperty("--accent-glow", vars.glow);

  dotsList.forEach(dot => {
    if (dot.dataset.color === colorName) {
      dot.classList.add("color-dot--active");
    } else {
      dot.classList.remove("color-dot--active");
    }
  });
}

export function applyThemeMode(themeMode) {
  if (themeMode === "light") {
    document.body.classList.add("theme-light");
  } else {
    document.body.classList.remove("theme-light");
  }
}

/* ================================================================
   Horizontal Scroll on Hover for Long Texts
   ================================================================ */
let activeScrollIntervals = new Map();

export function startHorizontalScroll(element) {
  stopHorizontalScroll(element);
  const limit = element.scrollWidth - element.clientWidth;
  if (limit <= 0) return;

  let dir = 1;
  let pauseTicks = 0;

  const interval = setInterval(() => {
    if (pauseTicks > 0) {
      pauseTicks--;
      return;
    }

    if (dir === 1) {
      element.scrollLeft += 1;
      if (element.scrollLeft >= limit) {
        dir = -1;
        pauseTicks = 40; // Approx 1s pause
      }
    } else {
      element.scrollLeft -= 1;
      if (element.scrollLeft <= 0) {
        dir = 1;
        pauseTicks = 40;
      }
    }
  }, 25);

  activeScrollIntervals.set(element, interval);
}

export function stopHorizontalScroll(element) {
  if (activeScrollIntervals.has(element)) {
    clearInterval(activeScrollIntervals.get(element));
    activeScrollIntervals.delete(element);
  }
  element.scrollTo({ left: 0, behavior: "smooth" });
}
