import { auth, db, googleProvider, signInWithPopup, signOut } from "../firebase";
import { setAdFree, setUserInteracted, checkAdBlock, hideBanner } from "./browserAdblock";
import { bindNotificationFetch } from "./browserNotifications";

const SUPER_ADMIN_EMAILS = ['rahuljena.dev@gmail.com', 'rahuljenasonu@gmail.com'];
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
      
      let planLabel = "Free Tier";
      if (cachedUser.plan === "pro") planLabel = "Pro Tier";
      else if (cachedUser.plan === "super") planLabel = "Super Tier";
      else if (cachedUser.plan === "recovery_pass") planLabel = "Single Pass";
      if (dropdownPlan) dropdownPlan.innerText = planLabel;
      
      const isAdmin = cachedUser.isAdmin === true || (cachedUser.email && SUPER_ADMIN_EMAILS.includes(cachedUser.email));
      if (isAdmin) {
        desktopDashboardLink?.classList.add("hidden");
        mobileDashboardLink?.classList.add("hidden");
        desktopAdminLink?.classList.remove("hidden");
        mobileAdminLink?.classList.remove("hidden");
      } else {
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
      
      // Bind on-demand notifications
      bindNotificationFetch(user.uid);

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
      setAdFree(false);
      setUserInteracted(false);
      hideBanner();
      syncUserUI();
    }
  });
};

export const setupAuthEvents = () => {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  loginBtn?.addEventListener("click", async () => {
    let loginSuccess = false;
    let toastShown = false;
    let popupRef: Window | null = null;
    let checkInterval: any = null;

    const originalOpen = window.open;
    window.open = function(...args) {
      const win = originalOpen.apply(this, args);
      popupRef = win;
      window.open = originalOpen;
      return win;
    };

    const restoreTimeout = setTimeout(() => {
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
    }, 5000);

    try {
      checkInterval = setInterval(() => {
        if (popupRef && popupRef.closed) {
          clearInterval(checkInterval);
          clearTimeout(restoreTimeout);
          if (window.open !== originalOpen) {
            window.open = originalOpen;
          }
          if (!loginSuccess && !toastShown) {
            toastShown = true;
            (window as any).showVanillaToast("Please check your credentials and try again.", "error", "Login Failed");
          }
        }
      }, 100);

      await signInWithPopup(auth, googleProvider);
      loginSuccess = true;
      clearInterval(checkInterval);
      clearTimeout(restoreTimeout);
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
    } catch (err: any) {
      clearInterval(checkInterval);
      clearTimeout(restoreTimeout);
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
      if (loginSuccess) return;

      console.error("Login failed:", err);
      if (!toastShown) {
        toastShown = true;
        const errMsg = err?.code || err?.message || String(err);
        const isCancelled = errMsg.includes("cancelled") || errMsg.includes("closed") || errMsg.includes("popup-closed-by-user");
        (window as any).showVanillaToast(
          isCancelled ? "Sign-in was cancelled." : `Sign-in failed: ${errMsg}`,
          "error",
          "Login Failed"
        );
      }
    }
  });

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
