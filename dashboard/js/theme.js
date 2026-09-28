/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Theme Controller (Dark & Light Mode)
 * ==============================================================================
 */

(function () {
  const THEME_STORAGE_KEY = "hth_monitoring_theme";

  // Determine initial theme: saved preference or system preference (defaults to dark)
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    // Default to dark mode for high-tech industrial aesthetic
    return "dark";
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const body = document.body;
    
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme);

    // Update theme toggle icons/buttons in UI
    const themeBtn = document.getElementById("theme-toggle-btn");
    const themeIcon = document.getElementById("theme-icon");
    const themeLabel = document.getElementById("theme-label");

    if (themeIcon) {
      if (theme === "dark") {
        themeIcon.setAttribute("data-lucide", "sun");
      } else {
        themeIcon.setAttribute("data-lucide", "moon");
      }
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
      }
    }

    if (themeLabel) {
      themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    }

    // Dispatch custom event for Chart.js and other components to adjust palettes
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme } }));
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
  }

  // Initial immediate application
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  // Expose API
  window.ThemeManager = {
    get: getPreferredTheme,
    set: applyTheme,
    toggle: toggleTheme
  };

  // Wire up listener once DOM is loaded
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getPreferredTheme());
    const btn = document.getElementById("theme-toggle-btn");
    if (btn) {
      btn.addEventListener("click", toggleTheme);
    }
  });
})();
