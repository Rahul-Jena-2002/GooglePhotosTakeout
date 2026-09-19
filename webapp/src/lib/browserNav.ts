export const initMobileMenu = () => {
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const hamburgerIcon = document.getElementById("hamburger-icon");
  const closeIcon = document.getElementById("close-icon");
  const mobileMenu = document.getElementById("mobile-menu");

  if (hamburgerBtn && mobileMenu) {
    const newBtn = hamburgerBtn.cloneNode(true) as HTMLButtonElement;
    hamburgerBtn.parentNode?.replaceChild(newBtn, hamburgerBtn);
    
    newBtn.addEventListener("click", () => {
      const isOpen = !mobileMenu.classList.contains("hidden");
      if (isOpen) {
        mobileMenu.classList.add("hidden");
        hamburgerIcon?.classList.remove("hidden");
        closeIcon?.classList.add("hidden");
      } else {
        mobileMenu.classList.remove("hidden");
        hamburgerIcon?.classList.add("hidden");
        closeIcon?.classList.remove("hidden");
      }
    });
  }
};

export const highlightActiveLinks = () => {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const navLinks = document.querySelectorAll(".nav-link");
  const mobileLinks = document.querySelectorAll(".mobile-nav-link");
  const desktopLoggedInLinks = [
    document.getElementById("desktop-dashboard-link"),
    document.getElementById("desktop-tool-link"),
    document.getElementById("desktop-admin-link"),
  ].filter(Boolean);

  const mobileLoggedInLinks = [
    document.getElementById("mobile-dashboard-link"),
    document.getElementById("mobile-tool-link"),
    document.getElementById("mobile-admin-link"),
  ].filter(Boolean);

  navLinks.forEach((link: any) => {
    const href = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
    const isActive = href === "/" ? path === "/" : (path === href || path.startsWith(href + "/"));
    if (isActive) {
      link.classList.add("active", "text-[#8170CC]", "font-bold");
      link.classList.remove("text-purple-600", "dark:text-purple-400", "text-zinc-600", "dark:text-zinc-400", "text-zinc-400", "text-white", "text-zinc-900");
    } else {
      link.classList.remove("active", "text-[#8170CC]", "text-purple-600", "dark:text-purple-400", "font-bold");
      link.classList.add("text-zinc-600", "dark:text-zinc-400");
    }
  });

  mobileLinks.forEach((link: any) => {
    const href = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
    const isActive = href === "/" ? path === "/" : (path === href || path.startsWith(href + "/"));
    if (isActive) {
      link.classList.add("active", "text-[#8170CC]", "font-bold", "bg-[#8170CC]/10", "dark:bg-[#8170CC]/15");
      link.classList.remove("text-purple-600", "dark:text-purple-400", "text-white/70", "text-zinc-700", "text-indigo-600", "dark:text-indigo-400", "bg-zinc-100", "dark:bg-white/5");
    } else {
      link.classList.remove("active", "text-[#8170CC]", "text-purple-600", "dark:text-purple-400", "font-bold", "bg-[#8170CC]/10", "dark:bg-[#8170CC]/15", "bg-purple-500/10", "dark:bg-purple-500/15");
      link.classList.add("text-zinc-700", "dark:text-white/70");
    }
  });

  desktopLoggedInLinks.forEach((link: any) => {
    const href = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
    const isActive = href === "/" ? path === "/" : (path === href || path.startsWith(href + "/"));
    if (isActive) {
      link.classList.add("active", "text-[#8170CC]", "font-bold");
      link.classList.remove("text-purple-600", "dark:text-purple-400", "text-zinc-600", "dark:text-zinc-400", "text-zinc-400", "text-white", "text-zinc-900");
    } else {
      link.classList.remove("active", "text-[#8170CC]", "text-purple-600", "dark:text-purple-400", "font-bold");
      link.classList.add("text-zinc-600", "dark:text-zinc-400");
    }
  });

  mobileLoggedInLinks.forEach((link: any) => {
    const href = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
    const isActive = href === "/" ? path === "/" : (path === href || path.startsWith(href + "/"));
    if (isActive) {
      link.classList.add("active", "text-[#8170CC]", "font-bold", "bg-[#8170CC]/10", "dark:bg-[#8170CC]/15");
      link.classList.remove("text-purple-600", "dark:text-purple-400", "text-white/70", "text-zinc-700", "text-indigo-600", "dark:text-indigo-400", "bg-zinc-100", "dark:bg-white/5");
    } else {
      link.classList.remove("active", "text-[#8170CC]", "text-purple-600", "dark:text-purple-400", "font-bold", "bg-[#8170CC]/10", "dark:bg-[#8170CC]/15", "bg-purple-500/10", "dark:bg-purple-500/15");
      link.classList.add("text-zinc-700", "dark:text-white/70");
    }
  });
};

export const setupNavDropdowns = () => {
  const profileTriggerBtn = document.getElementById("profile-trigger-btn");
  const profileDropdown = document.getElementById("profile-dropdown");
  const notificationBtn = document.getElementById("notification-btn");
  const notificationDropdown = document.getElementById("notification-dropdown");

  profileTriggerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown?.classList.toggle("hidden");
    notificationDropdown?.classList.add("hidden");
  });

  notificationBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    notificationDropdown?.classList.toggle("hidden");
    profileDropdown?.classList.add("hidden");
  });

  document.addEventListener("click", () => {
    profileDropdown?.classList.add("hidden");
    notificationDropdown?.classList.add("hidden");
  });
};
