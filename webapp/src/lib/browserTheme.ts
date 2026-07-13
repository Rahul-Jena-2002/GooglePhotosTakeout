export const initTheme = () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("takeoutfix_theme");
  const theme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
  
  if (theme === 'light') {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }
  localStorage.setItem("takeoutfix_theme", theme);

  const sunIcon = document.getElementById("theme-sun-icon");
  const moonIcon = document.getElementById("theme-moon-icon");
  const mobileText = document.getElementById("mobile-theme-text");
  const mobileSun = document.querySelector(".theme-sun-svg");
  const mobileMoon = document.querySelector(".theme-moon-svg");

  const toggleBtn = document.getElementById("theme-toggle-btn");
  const mobileToggleBtn = document.getElementById("mobile-theme-toggle-btn");

  if (theme === 'light') {
    sunIcon?.classList.remove("hidden");
    moonIcon?.classList.add("hidden");
    if (mobileText) mobileText.textContent = "Light Mode";
    mobileSun?.classList.remove("hidden");
    mobileMoon?.classList.add("hidden");

    if (toggleBtn) {
      toggleBtn.className = "btn-theme-toggle-navbar flex p-2 rounded-full bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 hover:scale-[1.02] focus:outline-none transition-all items-center justify-center text-zinc-800 hover:text-zinc-900";
    }
    if (mobileToggleBtn) {
      mobileToggleBtn.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-150 border border-zinc-200 hover:bg-zinc-200 text-xs font-semibold text-zinc-800 transition-all";
    }
  } else {
    sunIcon?.classList.add("hidden");
    moonIcon?.classList.remove("hidden");
    if (mobileText) mobileText.textContent = "Dark Mode";
    mobileSun?.classList.add("hidden");
    mobileMoon?.classList.remove("hidden");

    if (toggleBtn) {
      toggleBtn.className = "btn-theme-toggle-navbar flex p-2 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:scale-[1.02] focus:outline-none transition-all items-center justify-center text-white/80 hover:text-white";
    }
    if (mobileToggleBtn) {
      mobileToggleBtn.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-xs font-semibold text-white/80 transition-all";
    }
  }
};

export const setupThemeEvents = () => {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  const mobileToggleBtn = document.getElementById("mobile-theme-toggle-btn");

  const handleThemeToggle = () => {
    const isLight = document.documentElement.classList.contains("light");
    const nextTheme = isLight ? "dark" : "light";
    localStorage.setItem("takeoutfix_theme", nextTheme);
    initTheme();
    window.dispatchEvent(new CustomEvent("takeoutfix-theme-changed", { detail: nextTheme }));
  };

  toggleBtn?.addEventListener("click", handleThemeToggle);
  mobileToggleBtn?.addEventListener("click", handleThemeToggle);
};
