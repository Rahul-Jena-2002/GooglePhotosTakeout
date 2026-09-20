import React, { useState, useEffect } from "react";
import { auth, googleProvider, db } from "../../firebase";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { executeRecaptcha } from "../../lib/recaptcha";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCw,
  Sparkles,
  Key,
  ExternalLink,
} from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "signup") return "signup";
      if (params.get("mode") === "forgot") return "forgot";
    }
    return "signin";
  });

  const [inviteInfo] = useState<{ id: string; email: string } | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const inviteId = params.get("invite");
      const inviteEmail = params.get("email");
      if (inviteId || inviteEmail) {
        return { id: inviteId || "", email: inviteEmail || "" };
      }
    }
    return null;
  });

  const [email, setEmail] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("email") || "";
    }
    return "";
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  const [desktopPort] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("desktop_port") || params.get("port");
    }
    return null;
  });

  const generateStrongPassword = () => {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const specials = "!@#$%^&*()_+-=";
    const pwd = [
      uppers[Math.floor(Math.random() * uppers.length)],
      lowers[Math.floor(Math.random() * lowers.length)],
      digits[Math.floor(Math.random() * digits.length)],
      specials[Math.floor(Math.random() * specials.length)],
    ];
    const all = uppers + lowers + digits + specials;
    for (let i = 0; i < 8; i++) {
      pwd.push(all[Math.floor(Math.random() * all.length)]);
    }
    pwd.sort(() => Math.random() - 0.5);
    const result = pwd.join("");
    setPassword(result);
    setConfirmPassword(result);
    setShowPassword(true);
    setSuccessMsg("Strong password generated! Browser can now save it.");
  };

  // Handle redirect result from signInWithRedirect fallback
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then(async (res) => {
        if (res && res.user) {
          await syncUserDoc(res.user);
          setSuccessMsg("Signed in successfully! Connecting to Desktop...");
          handleSuccessRedirect(res.user);
        }
      })
      .catch((err) => {
        console.warn("[Auth] getRedirectResult error:", err);
      });
  }, []);

  // Sync auth state & auto-dispatch to desktop if already signed in
  useEffect(() => {
    if (!auth) return;
    const unsub = auth.onAuthStateChanged((u: User | null) => {
      setCurrentUser(u);
      if (u && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const port = params.get("desktop_port") || params.get("port");
        if (port) {
          handleSuccessRedirect(u);
        }
      }
    });
    return () => unsub();
  }, []);

  const getRedirectUrl = () => {
    if (typeof window === "undefined") return "/tool";
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect")) return params.get("redirect")!;
    if (inviteInfo || params.get("invite")) return "/admin/team";
    return "/tool";
  };

  const handleSuccessRedirect = async (userObj?: User | null) => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const port = params.get("desktop_port") || params.get("port");
      const targetUser = userObj || currentUser || auth?.currentUser;
      if (port && targetUser) {
        try {
          const token = await targetUser.getIdToken().catch(() => "");
          const callbackParams = new URLSearchParams({
            uid: targetUser.uid,
            googleId: targetUser.uid,
            email: targetUser.email || "",
            displayName: targetUser.displayName || targetUser.email?.split("@")[0] || "User",
            name: targetUser.displayName || targetUser.email?.split("@")[0] || "User",
            plan: "free",
            token: token
          });
          const callbackUrl = `http://127.0.0.1:${port}/callback?${callbackParams.toString()}`;

          // Attempt background POST fetch first
          try {
            fetch(`http://127.0.0.1:${port}/callback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: targetUser.uid,
                googleId: targetUser.uid,
                email: targetUser.email || "",
                displayName: targetUser.displayName || targetUser.email?.split("@")[0] || "User",
                name: targetUser.displayName || targetUser.email?.split("@")[0] || "User",
                plan: "free",
                token: token
              })
            }).catch(() => {});
          } catch (_) {}

          window.location.href = callbackUrl;
          return;
        } catch (e) {
          console.warn("Desktop bridge redirect error:", e);
        }
      }
    }
    setTimeout(() => {
      if (typeof window !== "undefined") {
        // Trigger Astro progress bar before navigation
        document.dispatchEvent(new Event("astro:before-preparation"));
        window.location.href = getRedirectUrl();
      }
    }, 600);
  };

  const syncUserDoc = async (user: User, nameOverride?: string) => {
    try {
      if (!db) return;
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: nameOverride || user.displayName || (user.email ? user.email.split("@")[0] : "User"),
          photoURL: user.photoURL || null,
          plan: "free",
          usedBytes: 0,
          usedFiles: 0,
          totalBytesProcessed: 0,
          totalFilesProcessed: 0,
          createdAt: Date.now(),
          suspended: false,
        });
      }
    } catch (err) {
      console.warn("[Auth] Failed to sync user doc:", err);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setGoogleLoading(true);

    try {
      const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
      if (isTauri) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const userData: any = await invoke("start_browser_login");
          if (userData && (userData.uid || userData.email)) {
            const cleanUid = userData.uid || userData.googleId || userData.email;
            const userObj: any = {
              uid: cleanUid,
              email: userData.email,
              displayName: userData.displayName || userData.name || userData.email?.split("@")[0] || "User",
              photoURL: userData.photoURL || null,
              plan: userData.plan || "free",
              token: userData.token || ""
            };
            if (db && cleanUid) {
              const userRef = doc(db, "users", cleanUid);
              const snap = await getDoc(userRef);
              if (!snap.exists()) {
                await setDoc(userRef, {
                  uid: cleanUid,
                  email: userObj.email,
                  displayName: userObj.displayName,
                  plan: "free",
                  createdAt: Date.now(),
                  suspended: false
                }, { merge: true });
              }
            }
            localStorage.setItem("takeoutfix_user_data", JSON.stringify(userObj));
            setSuccessMsg("Signed in successfully! Redirecting...");
            handleSuccessRedirect(userObj);
            return;
          } else {
            throw new Error("No user profile received from browser handshake.");
          }
        } catch (tauriErr: any) {
          console.error("[Tauri Auth] Browser loopback error:", tauriErr);
          setErrorMsg(tauriErr?.message || "Browser sign-in was cancelled or timed out.");
          return;
        } finally {
          setGoogleLoading(false);
        }
      }

      // IMPORTANT: signInWithPopup MUST be called synchronously within the click event.
      // Any await before it breaks the browser's trusted event chain → popup gets blocked.
      // reCAPTCHA runs in parallel (fire-and-forget) — it's a scoring signal, not a gate.
      executeRecaptcha("GOOGLE_SIGNIN").catch(() => {});

      try {
        const res = await signInWithPopup(auth, googleProvider);
        if (res.user) {
          await syncUserDoc(res.user);
          setSuccessMsg("Signed in successfully! Redirecting...");
          handleSuccessRedirect(res.user);
          return;
        }
      } catch (popupErr: any) {
        if (popupErr.code === "auth/popup-closed-by-user" || popupErr.code === "auth/cancelled-popup-request") {
          setErrorMsg("Sign-in cancelled. Please try again.");
          return;
        }
        if (popupErr.code === "auth/popup-blocked") {
          setErrorMsg("Google Sign-In popup was blocked. Please use Email & Password below to sign in, or click 'Forgot?' to set a password.");
          return;
        }
        throw popupErr;
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      setErrorMsg(err.message || "Failed to sign in with Google.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanEmail = email.trim().toLowerCase();
    const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!cleanEmail || !GMAIL_REGEX.test(cleanEmail)) {
      setErrorMsg("Only @gmail.com email addresses are allowed (e.g. yourname@gmail.com).");
      return;
    }

    // Forgot password flow
    if (mode === "forgot") {
      setLoading(true);
      try {
        await executeRecaptcha("FORGOT_PASSWORD");
        await sendPasswordResetEmail(auth, cleanEmail);
        setSuccessMsg("Password reset link sent! Check your inbox.");
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          setErrorMsg("No account found with this email address.");
        } else {
          setErrorMsg(err.message || "Failed to send reset email.");
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setErrorMsg("Please enter your password.");
      return;
    }

    try {
      if (auth) {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      }
    } catch (e) {
      console.warn("Persistence setup:", e);
    }

    // Sign up flow
    if (mode === "signup") {
      const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,16}$/;
      if (!PASSWORD_REGEX.test(password)) {
        setErrorMsg("Password must be 8-16 characters and contain uppercase, lowercase, numbers, and a special character.");
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match.");
        return;
      }

      setLoading(true);
      try {
        await executeRecaptcha("SIGNUP");
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (res.user) {
          const cleanName = fullName.trim() || cleanEmail.split("@")[0];
          await updateProfile(res.user, { displayName: cleanName });
          await syncUserDoc(res.user, cleanName);
          setSuccessMsg("Account created successfully! Redirecting...");
          handleSuccessRedirect(res.user);
        }
      } catch (err: any) {
        console.error("Sign up error:", err);
        if (err.code === "auth/email-already-in-use") {
          setErrorMsg("An account with this email already exists. Try signing in.");
        } else if (err.code === "auth/weak-password") {
          setErrorMsg("Password is too weak. Use a mix of letters and numbers.");
        } else {
          setErrorMsg(err.message || "Failed to create account.");
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // Sign in flow
    setLoading(true);
    try {
      await executeRecaptcha("LOGIN");
      const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (res.user) {
        await syncUserDoc(res.user);
        setSuccessMsg("Welcome back! Redirecting...");
        handleSuccessRedirect(res.user);
      }
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setErrorMsg("Invalid email or password. Please try again.");
      } else if (err.code === "auth/too-many-requests") {
        setErrorMsg("Too many attempts. Please try again in a few minutes.");
      } else {
        setErrorMsg(err.message || "Failed to sign in.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-4 py-12 relative">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 dark:bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Already Signed In Card */}
        {currentUser && (
          <div className="mb-6 p-4 rounded-2xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 shadow-xl backdrop-blur-md text-left transition-all">
            <div className="flex items-center gap-3 mb-3">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center">
                  {currentUser.displayName?.charAt(0) || currentUser.email?.charAt(0) || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Currently signed in as</p>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {currentUser.displayName || currentUser.email}
                </p>
              </div>
            </div>
            {desktopPort && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                <span>🖥️ TakeoutFix Desktop detected on port <strong>{desktopPort}</strong></span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handleSuccessRedirect(currentUser);
                }}
                className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <span>{desktopPort ? "Connect to TakeoutFix Desktop" : "Continue to App"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="py-2 px-3 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Main Auth Container */}
        <div className="bg-white dark:bg-zinc-900/95 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl transition-colors duration-200">
          
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {mode === "signin" && "Welcome Back"}
              {mode === "signup" && "Create Your Account"}
              {mode === "forgot" && "Reset Your Password"}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {mode === "signin" && "Sign in to access your restored files & preferences."}
              {mode === "signup" && "Join TakeoutFix to fix dates, GPS, and metadata."}
              {mode === "forgot" && "Enter your email to receive a password reset link."}
            </p>
          </div>

          {/* Admin Team Invitation Notice */}
          {inviteInfo && (
            <div className="mb-6 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-left flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Admin Team Invitation</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
                  You have been invited to join the TakeoutFix Admin Team.
                  {inviteInfo.email ? (
                    <span> Sign in with <strong>{inviteInfo.email}</strong> to activate your admin privileges.</span>
                  ) : (
                    " Sign in with your invited Google account to activate your admin privileges."
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Mode Switch Tabs (Sign In / Sign Up) */}
          {mode !== "forgot" && (
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => { setMode("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  mode === "signin"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode("signup"); setErrorMsg(""); setSuccessMsg(""); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  mode === "signup"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Google Sign In Button */}
          {mode !== "forgot" && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full py-2.5 px-4 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-750 rounded-2xl text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {googleLoading ? (
                  <RotateCw className="w-4 h-4 animate-spin text-indigo-500" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                </div>
                <span className="relative px-3 bg-white dark:bg-zinc-900 text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                  Or with email & password
                </span>
              </div>
            </>
          )}

          {/* Feedback Badges */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Email / Password Form */}
          <form method="post" action="#" onSubmit={handleEmailAuth} autoComplete="on" className="space-y-4 text-left">
            {/* Full Name field (Sign Up only) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="fullName"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Gmail Address (@gmail.com only)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  id="email"
                  name="username"
                  type="email"
                  required
                  autoComplete="username email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            {mode !== "forgot" && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {mode === "signup" ? "Password (8-16 chars, Aa1@)" : "Password"}
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                  {mode === "signup" && (
                    <button
                      type="button"
                      onClick={generateStrongPassword}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1 font-medium"
                      title="Auto-generate a compliant secure password"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate Strong Password</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    maxLength={mode === "signup" ? 16 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password (Sign Up only) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={16}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Save Password & Remember Me Option */}
            {mode !== "forgot" && (
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    name="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Save password & remember on this browser</span>
                </label>
              </div>
            )}

            {/* reCAPTCHA Notice — above submit button */}
            {mode !== "forgot" && (
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 py-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>Protected by Google reCAPTCHA — <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline hover:text-zinc-500">Privacy</a> & <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline hover:text-zinc-500">Terms</a> apply.</span>
              </div>
            )}

            {/* Action Submit Button */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : mode === "signin" ? (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === "signup" ? (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <Mail className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Return to Sign In when in forgot mode */}
            {mode === "forgot" && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setMode("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </form>


        </div>

      </div>
    </div>
  );
}
