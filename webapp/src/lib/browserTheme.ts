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
  } else {
    sunIcon?.classList.add("hidden");
    moonIcon?.classList.remove("hidden");
    if (mobileText) mobileText.textContent = "Dark Mode";
    mobileSun?.classList.add("hidden");
    mobileMoon?.classList.remove("hidden");
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

  if (toggleBtn) {
    toggleBtn.onclick = handleThemeToggle;
  }
  if (mobileToggleBtn) {
    mobileToggleBtn.onclick = handleThemeToggle;
  }
};

