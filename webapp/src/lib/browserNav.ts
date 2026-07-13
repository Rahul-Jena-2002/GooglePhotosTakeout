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
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll(".nav-link");
  const mobileLinks = document.querySelectorAll(".mobile-nav-link");

  navLinks.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href === path || (href !== "/" && path.startsWith(href))) {
      link.classList.remove("text-zinc-400");
      link.classList.add("text-white");
    } else {
      link.classList.add("text-zinc-400");
      link.classList.remove("text-white");
    }
  });

  mobileLinks.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href === path || (href !== "/" && path.startsWith(href))) {
      link.classList.add("text-indigo-400", "bg-white/5");
    } else {
      link.classList.remove("text-indigo-400", "bg-white/5");
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
