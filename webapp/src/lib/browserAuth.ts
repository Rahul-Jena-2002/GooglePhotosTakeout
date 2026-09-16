import { auth, db, googleProvider, signInWithPopup, signOut } from "../firebase";
import { setAdFree, setUserInteracted, checkAdBlock, hideBanner } from "./browserAdblock";
import { bindNotificationFetch, stopNotificationListeners } from "./browserNotifications";

import { isSuperAdminEmail } from "./adminAuth";
import { getFriendlyAuthMessage } from "./authErrors";
let unsubUserDoc: any = null;
let isAuthListenerInitialized = false;

export const syncUserUI = () => {
  const authLoading = document.getElementById("auth-loading");
  const loginBtn = document.getElementById("login-btn");
  const profileContainer = document.getElementById("profile-container");
  
  const profileNameSpan = document.getElementById("profile-name-span");
  const profileAvatarCircle = document.getElementById("profile-avatar-circle");
  const dropdownFullName = document.getElementById("dropdown-fullname");
  const dropdownUsername = document.getElementById("dropdown-username");
  const dropdownPlan = document.getElementById("dropdown-plan");
  
  const mobileAuthSection = document.getElementById("mobile-auth-section");
  const mobileToolLink = document.getElementById("mobile-tool-link") as HTMLAnchorElement;
  const desktopToolLink = document.getElementById("desktop-tool-link") as HTMLAnchorElement;
  
  const desktopDashboardLink = document.getElementById("desktop-dashboard-link");
  const mobileDashboardLink = document.getElementById("mobile-dashboard-link");
  const desktopAdminLink = document.getElementById("desktop-admin-link");
  const mobileAdminLink = document.getElementById("mobile-admin-link");
  
  const notificationContainer = document.getElementById("notification-container");
  const desktopMarketingLinks = document.getElementById("desktop-marketing-links");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  const cachedUserStr = localStorage.getItem("takeoutfix_user_data");
  if (cachedUserStr) {
    try {
      const cachedUser = JSON.parse(cachedUserStr);
      const firstName = cachedUser.firstName || cachedUser.displayName?.split(" ")[0] || "User";
      
      loginBtn?.classList.add("hidden");
      profileContainer?.classList.remove("hidden");
      mobileAuthSection?.classList.remove("hidden");
      notificationContainer?.classList.remove("hidden");
      authLoading?.classList.add("hidden");
      
      desktopMarketingLinks?.classList.add("xl:flex", "lg:hidden");
      desktopMarketingLinks?.classList.remove("lg:flex");
      
      hamburgerBtn?.classList.add("xl:hidden");
      hamburgerBtn?.classList.remove("lg:hidden");
      
      mobileMenu?.classList.add("xl:hidden");
      mobileMenu?.classList.remove("lg:hidden");
      
      if (profileNameSpan) profileNameSpan.innerText = `Hi, ${firstName}`;
      if (profileAvatarCircle) {
        const initial = firstName.charAt(0).toUpperCase();
        const photo = cachedUser.photoURL;
        if (photo) {
          profileAvatarCircle.innerHTML = `<img src="${photo}" class="w-full h-full rounded-full object-cover" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.parentElement.innerText='${initial}'" />`;
        } else {
          profileAvatarCircle.innerText = initial;
        }
      }
      if (dropdownFullName) dropdownFullName.innerText = cachedUser.displayName || "User";
      
      if (cachedUser.username && dropdownUsername) {
        dropdownUsername.innerText = `@${cachedUser.username}`;
        dropdownUsername.classList.remove("hidden");
      } else {
        dropdownUsername?.classList.add("hidden");
      }
      
      // Auto-revert expired recovery pass to free tier by default
      if (cachedUser.plan === "recovery_pass") {
        const passExpires = cachedUser.expiresAt || (cachedUser.startedAt ? cachedUser.startedAt + 24*3600*1000 : null);
        if (passExpires && Date.now() >= passExpires) {
          cachedUser.plan = "free";
          cachedUser.expiresAt = null;
          cachedUser.passExpiredAt = passExpires;
          try {
            localStorage.setItem("takeoutfix_user_data", JSON.stringify(cachedUser));
          } catch (_) {}
        }
      }

      let planLabel = "Free Tier";
      if (cachedUser.plan === "pro") planLabel = "Pro Tier";
      else if (cachedUser.plan === "super") planLabel = "Super Tier";
      else if (cachedUser.plan === "recovery_pass") planLabel = "Single Pass";
      if (dropdownPlan) dropdownPlan.innerText = planLabel;
      
      // Floating 24h Pass Timer on Home Page only for Single Pass users
      const homePassBadge = document.getElementById("home-pass-timer-floating");
      const homePassVal = document.getElementById("home-pass-timer-val");
      const isHomePage = window.location.pathname === "/" || window.location.pathname === "";
      if (isHomePage && cachedUser.plan === "recovery_pass" && homePassBadge && homePassVal) {
        homePassBadge.classList.remove("hidden");
        homePassBadge.classList.add("flex");
        const expiresAt = cachedUser.expiresAt || (cachedUser.startedAt ? cachedUser.startedAt + 24*3600*1000 : Date.now() + 24*3600*1000);
        const updateTimer = () => {
          const remainingMs = Math.max(0, expiresAt - Date.now());
          if (remainingMs <= 0) {
            homePassBadge.classList.add("hidden");
            homePassBadge.classList.remove("flex");
            return;
          }
          const totalSecs = Math.floor(remainingMs / 1000);
          const days = Math.floor(totalSecs / 86400);
          const hrs = Math.floor((totalSecs % 86400) / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          const pad = (n: number) => n.toString().padStart(2, '0');
          homePassVal.innerText = `${pad(days)}d : ${pad(hrs)}h : ${pad(mins)}m`;
        };
        updateTimer();
        if ((window as any).__homePassTimerInterval) clearInterval((window as any).__homePassTimerInterval);
        (window as any).__homePassTimerInterval = setInterval(updateTimer, 1000);
      } else {
        if (homePassBadge) {
          homePassBadge.classList.add("hidden");
          homePassBadge.classList.remove("flex");
        }
      }
      
      const isAdmin = cachedUser.isAdmin === true || isSuperAdminEmail(cachedUser.email);
      if (isAdmin) {
        desktopDashboardLink?.classList.add("hidden");
        mobileDashboardLink?.classList.add("hidden");
        desktopAdminLink?.classList.remove("hidden");
        mobileAdminLink?.classList.remove("hidden");
        try {
          const isSuper = isSuperAdminEmail(cachedUser.email);
          sessionStorage.setItem("takeoutfix_admin_session", JSON.stringify({
            uid: cachedUser.uid || auth.currentUser?.uid || "",
            email: cachedUser.email || auth.currentUser?.email || "",
            displayName: cachedUser.displayName || auth.currentUser?.displayName || "Admin",
            photoURL: cachedUser.photoURL || auth.currentUser?.photoURL || "",
            role: isSuper ? "SUPER_ADMIN" : (cachedUser.role || "ADMIN"),
            isAdmin: true,
            timestamp: Date.now()
          }));
        } catch (_) {}
      } else {
        try { sessionStorage.removeItem("takeoutfix_admin_session"); } catch (_) {}
        desktopDashboardLink?.classList.remove("hidden");
        mobileDashboardLink?.classList.remove("hidden");
        desktopAdminLink?.classList.add("hidden");
        mobileAdminLink?.classList.add("hidden");
      }
      if (mobileToolLink) {
        mobileToolLink.href = "/tool";
        mobileToolLink.innerText = "Restore My Data";
      }
      if (desktopToolLink) {
        desktopToolLink.href = "/tool";
        desktopToolLink.innerText = "Restore My Data";
      }
    } catch (_) {}
  } else {
    loginBtn?.classList.remove("hidden");
    profileContainer?.classList.add("hidden");
    mobileAuthSection?.classList.add("hidden");
    notificationContainer?.classList.add("hidden");
    authLoading?.classList.add("hidden");
    
    desktopMarketingLinks?.classList.add("lg:flex");
    desktopMarketingLinks?.classList.remove("xl:flex", "lg:hidden");
    
    hamburgerBtn?.classList.add("lg:hidden");
    hamburgerBtn?.classList.remove("xl:hidden");
    
    mobileMenu?.classList.add("lg:hidden");
    mobileMenu?.classList.remove("xl:hidden");
  }
};

export const setupAuthListeners = () => {
  if (isAuthListenerInitialized) return;
  isAuthListenerInitialized = true;

  auth.onAuthStateChanged((user) => {
    if (unsubUserDoc) unsubUserDoc();
    
    if (user) {
      const previewData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        plan: "free"
      };
      localStorage.setItem("takeoutfix_user_data", JSON.stringify(previewData));
      syncUserUI();
      
      // Bind on-demand notifications with email
      bindNotificationFetch(user.uid, user.email || undefined);

      // Lazy load firestore
      import("firebase/firestore").then(({ doc, onSnapshot }) => {
        if (!auth.currentUser) return; 

        unsubUserDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const fullData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              ...data
            };
            localStorage.setItem("takeoutfix_user_data", JSON.stringify(fullData));
            
            setAdFree(data.plan === "super" && !data.supportWithAds);
            checkAdBlock();
            syncUserUI();
          }
        });
      }).catch(err => {
        console.error("Failed to load firestore dynamically:", err);
      });
    } else {
      localStorage.removeItem("takeoutfix_user_data");
      stopNotificationListeners();
      setAdFree(false);
      setUserInteracted(false);
      hideBanner();
      syncUserUI();
    }
  });
};

export const setupAuthEvents = () => {
  const logoutBtn = document.getElementById("logout-btn");

  // Sign-in is now handled by the AuthModal React component.
  // The navbar "Sign In / Sign Up" button dispatches 'takeoutfix:open-auth-modal'
  // which AuthModal listens to and renders the sign-in/sign-up overlay.

  logoutBtn?.addEventListener("click", async () => {
    try {
      localStorage.removeItem("takeoutfix_user_data");
      localStorage.removeItem("takeoutfix_admin_data");
      localStorage.removeItem("takeoutfix_device_session_id");
      await signOut(auth);
      window.location.href = "/";
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  });
};
