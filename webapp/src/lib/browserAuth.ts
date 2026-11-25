import { auth, db, signOut } from "../firebase";
import type { User } from "firebase/auth";
import { bindNotificationFetch, stopNotificationListeners } from "./browserNotifications";

import { isVerifiedSuperAdmin } from "./adminAuth";
import { renderAvatar } from "./renderAvatar";
import { acquireRestoreLock } from "./restoreLock";
let unsubUserDoc: any = null;
let unsubAdminDoc: (() => void) | null = null;
let isAuthListenerInitialized = false;
let verifiedAdmin: { uid: string; role: string } | null = null;
let authGeneration = 0;
const boundSignoutButtons = new WeakSet<Element>();
let signoutInProgress = false;
let usageRecoveryRunning = false;
let usageRecoveryRequested = false;
let usageRecoveryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleUsageRecovery() {
  if (usageRecoveryTimer) return;
  usageRecoveryTimer = setTimeout(() => {
    usageRecoveryTimer = undefined;
    void retryAccountUsage();
  }, 30000);
}

async function retryAccountUsage() {
  const uid = auth?.currentUser?.uid;
  if (!uid || !navigator.onLine) return;
  if (usageRecoveryRunning) {
    usageRecoveryRequested = true;
    return;
  }
  usageRecoveryRunning = true;
  let release: (() => void) | undefined;
  try {
    try {
      release = await acquireRestoreLock(navigator.locks);
    } catch {
      // An active restore owns the journal; retry after it releases the lock.
      if (navigator.locks) scheduleUsageRecovery();
      return;
    }
    const [{ indexedDbService }, { recoverAccountBatches }, { applyUsageBatch }] = await Promise.all([
      import('./indexedDbService'), import('../tool-workspace/pendingUsage'), import('../tool-workspace/usageBatch')
    ]);
    const isCurrent = () => auth?.currentUser?.uid === uid;
    const keys = await indexedDbService.getAllKeys('telemetry');
    await recoverAccountBatches(uid, keys, isCurrent,
      key => indexedDbService.get('telemetry', key),
      batch => applyUsageBatch(db, uid, batch.batchId, batch.bytes, batch.files),
      key => indexedDbService.remove('telemetry', key));
  } catch (error) {
    console.warn('Pending usage could not be synced; it remains on this device.', error);
    scheduleUsageRecovery();
  } finally {
    release?.();
    usageRecoveryRunning = false;
    if (usageRecoveryRequested) {
      usageRecoveryRequested = false;
      void retryAccountUsage();
    }
  }
}

export const syncUserUI = () => {
  const authLoading = document.getElementById("auth-loading");
  const loginBtn = document.getElementById("login-btn");
  const profileContainer = document.getElementById("profile-container");
  
  const profileNameSpan = document.getElementById("profile-name-span");
  const profileAvatarCircle = document.getElementById("profile-avatar-circle");
  const dropdownFullName = document.getElementById("dropdown-fullname");
  const dropdownUsername = document.getElementById("dropdown-username");
  const dropdownPlan = document.getElementById("dropdown-plan");
  
  const mobileAuthSection = document.getElementById("mobile-auth-section") || document.getElementById("mobile-auth-links");
  const mobileProfileInfo = document.getElementById("mobile-profile-info");
  const mobileLoginBtn = document.getElementById("mobile-login-btn");
  const mobileUserName = document.getElementById("mobile-user-name");
  const mobileUserPlan = document.getElementById("mobile-user-plan");
  const mobileAvatarCircle = document.getElementById("mobile-avatar-circle");

  const mobileToolLink = document.getElementById("mobile-tool-link") as HTMLAnchorElement;
  const desktopToolLink = document.getElementById("desktop-tool-link") as HTMLAnchorElement;
  
  const desktopDashboardLink = document.getElementById("desktop-dashboard-link");
  const mobileDashboardLink = document.getElementById("mobile-dashboard-link");
  const desktopAdminLink = document.getElementById("desktop-admin-link");
  const mobileAdminLink = document.getElementById("mobile-admin-link");
  const dropdownAdminLink = document.getElementById("dropdown-admin-link");
  
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
      mobileProfileInfo?.classList.remove("hidden");
      mobileProfileInfo?.classList.add("flex");
      mobileLoginBtn?.classList.add("hidden");
      notificationContainer?.classList.remove("hidden");
      authLoading?.classList.add("hidden");
      
      desktopMarketingLinks?.classList.add("xl:flex", "lg:hidden");
      desktopMarketingLinks?.classList.remove("lg:flex");
      
      hamburgerBtn?.classList.add("xl:hidden");
      hamburgerBtn?.classList.remove("lg:hidden");
      
      mobileMenu?.classList.add("xl:hidden");
      mobileMenu?.classList.remove("lg:hidden");
      
      if (profileNameSpan) profileNameSpan.innerText = `Hi, ${firstName}`;
      if (mobileUserName) mobileUserName.innerText = cachedUser.displayName || firstName;
      
      if (profileAvatarCircle) {
        renderAvatar(profileAvatarCircle, firstName, cachedUser.photoURL);
      }

      if (mobileAvatarCircle) {
        renderAvatar(mobileAvatarCircle, firstName, cachedUser.photoURL);
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

      let planLabel = cachedUser.plan === "free" ? "Free plan" : cachedUser.plan === "recovery_pass" ? "Recovery Pass" : "Account plan";
      if (dropdownPlan) dropdownPlan.innerText = planLabel;
      if (mobileUserPlan) mobileUserPlan.innerText = planLabel;
      
      const cachedAdminRole = verifiedAdmin?.uid === cachedUser.uid ? verifiedAdmin?.role ?? null : null;
      const verifiedRoot = auth?.currentUser?.uid === cachedUser.uid && isVerifiedSuperAdmin(auth.currentUser);
      const isAdmin = Boolean((auth?.currentUser?.uid === cachedUser.uid && cachedAdminRole) || verifiedRoot);
      if (isAdmin) {
        desktopDashboardLink?.classList.add("hidden");
        mobileDashboardLink?.classList.add("hidden");
        desktopAdminLink?.classList.remove("hidden");
        mobileAdminLink?.classList.remove("hidden");
        dropdownAdminLink?.classList.remove("hidden");
        try {
          const isSuper = verifiedRoot || cachedAdminRole === "SUPER_ADMIN";
          sessionStorage.setItem("takeoutfix_admin_session", JSON.stringify({
            uid: cachedUser.uid || auth.currentUser?.uid || "",
            email: cachedUser.email || auth.currentUser?.email || "",
            displayName: cachedUser.displayName || auth.currentUser?.displayName || "Admin",
            photoURL: cachedUser.photoURL || auth.currentUser?.photoURL || "",
            role: isSuper ? "SUPER_ADMIN" : cachedAdminRole,
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
        dropdownAdminLink?.classList.add("hidden");
      }
      if (mobileToolLink) {
        mobileToolLink.href = "/tool";
        const badge = mobileToolLink.querySelector("span:last-child");
        if (badge) {
          badge.textContent = "Active";
          badge.className = "text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold";
        }
      }
      if (desktopToolLink) {
        desktopToolLink.href = "/tool";
      }
    } catch (_) {}
  } else {
    loginBtn?.classList.remove("hidden");
    profileContainer?.classList.add("hidden");
    mobileProfileInfo?.classList.add("hidden");
    mobileProfileInfo?.classList.remove("flex");
    mobileLoginBtn?.classList.remove("hidden");
    mobileDashboardLink?.classList.add("hidden");
    mobileAdminLink?.classList.add("hidden");
    notificationContainer?.classList.add("hidden");
    authLoading?.classList.add("hidden");

    if (mobileToolLink) {
      mobileToolLink.href = "/tool";
      const badge = mobileToolLink.querySelector("span:last-child");
      if (badge) {
        badge.textContent = "Free Trial";
        badge.className = "text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold";
      }
    }
    if (desktopToolLink) {
      desktopToolLink.href = "/tool";
    }
    
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

  // The public site and guest tool remain usable without local Firebase config.
  if (!auth) {
    syncUserUI();
    return;
  }

  window.addEventListener('online', () => { void retryAccountUsage(); });

  auth.onAuthStateChanged((user: User | null) => {
    const generation = ++authGeneration;
    if (unsubUserDoc) unsubUserDoc();
    if (unsubAdminDoc) unsubAdminDoc();
    verifiedAdmin = null;
    localStorage.removeItem("takeoutfix_admin_data");
    sessionStorage.removeItem("takeoutfix_admin_session");
    
    if (user) {
      void retryAccountUsage();
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
      bindNotificationFetch(user.uid, user.email || undefined, user.emailVerified);

      // Lazy load firestore
      import("firebase/firestore").then(({ doc, onSnapshot }) => {
        if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;

        // 1. Listen to user document
        unsubUserDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
          if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;
          if (snap.exists()) {
            const data = snap.data();
            const saved = JSON.parse(localStorage.getItem("takeoutfix_user_data") || "{}");
            const fullData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              ...saved,
              ...data
            };
            localStorage.setItem("takeoutfix_user_data", JSON.stringify(fullData));
            
            syncUserUI();
          }
        });

        // 2. ALSO query admins doc directly so admin navbar enables instantly!
        unsubAdminDoc = onSnapshot(doc(db, "admins", user.uid), { includeMetadataChanges: true }, (adminSnap) => {
          if (generation !== authGeneration || auth.currentUser?.uid !== user.uid || adminSnap.metadata.fromCache || adminSnap.metadata.hasPendingWrites) return;
          if (adminSnap.exists()) {
            const adminDoc = adminSnap.data();
            verifiedAdmin = typeof adminDoc.role === "string" && adminDoc.role ? { uid: user.uid, role: adminDoc.role } : null;
            localStorage.setItem("takeoutfix_admin_data", JSON.stringify({ ...adminDoc, uid: user.uid }));
          } else {
            verifiedAdmin = null;
            localStorage.removeItem("takeoutfix_admin_data");
            sessionStorage.removeItem("takeoutfix_admin_session");
          }
          syncUserUI();
        }, (error) => {
          if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;
          verifiedAdmin = null;
          localStorage.removeItem("takeoutfix_admin_data");
          sessionStorage.removeItem("takeoutfix_admin_session");
          syncUserUI();
          console.warn("Admin status unavailable:", error);
        });
      }).catch(err => {
        console.error("Failed to load firestore dynamically:", err);
      });
    } else {
      localStorage.removeItem("takeoutfix_user_data");
      stopNotificationListeners();
      syncUserUI();
    }
  });
};

export const setupAuthEvents = () => {
  const signoutButtons = document.querySelectorAll(".btn-profile-signout, #logout-btn, #profile-signout-btn, #mobile-signout-btn");

  // Sign-in is now handled by the AuthModal React component.
  // The navbar "Sign In / Sign Up" button dispatches 'takeoutfix:open-auth-modal'
  // which AuthModal listens to and renders the sign-in/sign-up overlay.

  signoutButtons.forEach((btn) => {
    if (boundSignoutButtons.has(btn)) return;
    boundSignoutButtons.add(btn);
    btn.addEventListener("click", async () => {
      if (signoutInProgress) return;
      signoutInProgress = true;
      let releaseRestoreLock: (() => void) | null = null;
      try {
        if (navigator.locks) releaseRestoreLock = await acquireRestoreLock(navigator.locks);
        await signOut(auth);
        localStorage.removeItem("takeoutfix_user_data");
        localStorage.removeItem("takeoutfix_admin_data");
        localStorage.removeItem("takeoutfix_device_session_id");
        sessionStorage.removeItem("takeoutfix_admin_session");
        window.location.href = "/";
      } catch (err) {
        console.error("Sign out failed:", err);
        const message = err instanceof Error && err.message.includes("restore is already open")
          ? "Finish or cancel the active restore before signing out."
          : "Could not sign out. Please try again.";
        (window as any).showVanillaToast?.(message, "error");
      } finally {
        releaseRestoreLock?.();
        signoutInProgress = false;
      }
    });
  });
};
