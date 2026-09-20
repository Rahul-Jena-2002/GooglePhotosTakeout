import React, { useState, useEffect, useCallback } from "react";
import { auth, googleProvider, db } from "../../firebase";
import {
  signInWithPopup,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { executeRecaptcha } from "../../lib/recaptcha";
import {
  Mail, Lock, User as UserIcon, Eye, EyeOff, ArrowRight,
  CheckCircle2, AlertCircle, ShieldCheck, RotateCw, X,
} from "lucide-react";

type Mode = "signin" | "signup" | "forgot";

export default function AuthModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const reset = useCallback(() => {
    setEmail(""); setPassword(""); setConfirmPassword("");
    setFullName(""); setShowPassword(false);
    setErrorMsg(""); setSuccessMsg(""); setMode("signin");
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
    document.body.style.overflow = "";
  }, [reset]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mode) setMode(detail.mode as Mode);
      setOpen(true);
      document.body.style.overflow = "hidden";
    };
    window.addEventListener("takeoutfix:open-auth-modal", handler);
    return () => window.removeEventListener("takeoutfix:open-auth-modal", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then(async (res) => {
        if (res?.user) {
          await syncUserDoc(res.user);
          handleSuccess();
        }
      })
      .catch((err) => {
        console.warn("[AuthModal] getRedirectResult error:", err);
      });
  }, []);

  const syncUserDoc = async (user: User, nameOverride?: string) => {
    try {
      if (!db) return;
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid, email: user.email,
          displayName: nameOverride || user.displayName || (user.email ? user.email.split("@")[0] : "User"),
          photoURL: user.photoURL || null, plan: "free",
          usedBytes: 0, usedFiles: 0, totalBytesProcessed: 0, totalFilesProcessed: 0,
          createdAt: Date.now(), suspended: false,
        });
      }
    } catch (err) { console.warn("[Auth] Failed to sync user doc:", err); }
  };

  const handleSuccess = () => {
    setSuccessMsg("Signed in! Welcome.");
    setTimeout(() => {
      close();
      window.dispatchEvent(new CustomEvent("takeoutfix:auth-success"));
    }, 600);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(""); setSuccessMsg(""); setGoogleLoading(true);
    try {
      const isTauri = typeof window !== "undefined" && (
        "__TAURI__" in window ||
        "__TAURI_INTERNALS__" in window ||
        "isTauri" in window ||
        navigator.userAgent.includes("TakeoutFix-Desktop")
      );
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
            setSuccessMsg("Signed in successfully! Welcome back.");
            handleSuccess();
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

      executeRecaptcha("GOOGLE_SIGNIN").catch(() => {});
      if (googleProvider) {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
      }

      const res = await signInWithPopup(auth, googleProvider);
      if (res && res.user) { await syncUserDoc(res.user); handleSuccess(); }
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
        return;
      }
      if (err?.code === "auth/popup-blocked") {
        setErrorMsg("Google Sign-In popup was blocked. Please use Email & Password below to sign in, or click 'Forgot?' to set a password.");
        return;
      }
      setErrorMsg(err.message || "Failed to sign in with Google.");
    } finally { setGoogleLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(""); setSuccessMsg("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) { setErrorMsg("Enter a valid email."); return; }
    if (mode === "forgot") {
      setLoading(true);
      try {
        await executeRecaptcha("FORGOT_PASSWORD");
        await sendPasswordResetEmail(auth, cleanEmail);
        setSuccessMsg("Reset link sent! Check your inbox.");
      } catch (err: any) { setErrorMsg(err.message || "Failed to send reset email."); }
      finally { setLoading(false); }
      return;
    }
    if (!password || password.length < 6) { setErrorMsg("Password must be at least 6 characters."); return; }
    if (mode === "signup" && password !== confirmPassword) { setErrorMsg("Passwords do not match."); return; }
    setLoading(true);
    try {
      await executeRecaptcha(mode === "signin" ? "EMAIL_SIGNIN" : "EMAIL_SIGNUP");
      if (mode === "signin") {
        const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
        if (res.user) { await syncUserDoc(res.user); handleSuccess(); }
      } else {
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (res.user) {
          if (fullName) await updateProfile(res.user, { displayName: fullName });
          await syncUserDoc(res.user, fullName);
          handleSuccess();
        }
      }
    } catch (err: any) {
      const msg = err.code === "auth/email-already-in-use" ? "An account with this email already exists."
        : err.code === "auth/wrong-password" ? "Incorrect password."
        : err.code === "auth/user-not-found" ? "No account found with this email."
        : err.code === "auth/too-many-requests" ? "Too many attempts. Please wait."
        : err.message || "Authentication failed.";
      setErrorMsg(msg);
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 z-10 overflow-y-auto max-h-[90vh]">
        <button onClick={close} className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer" aria-label="Close">
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {mode === "signin" ? "Welcome Back" : mode === "signup" ? "Create Account" : "Reset Password"}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {mode === "signin" ? "Sign in to your TakeoutFix account." : mode === "signup" ? "Join TakeoutFix — free forever." : "Enter your email for a reset link."}
          </p>
        </div>

        {mode !== "forgot" && (
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl mb-5">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setErrorMsg(""); setSuccessMsg(""); }}
                className={"flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer " + (mode === m ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white")}>
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        {mode !== "forgot" && (
          <>
            <button type="button" onClick={handleGoogleSignIn} disabled={googleLoading || loading}
              className="w-full py-2.5 px-4 bg-zinc-900 dark:bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-xs sm:text-sm font-semibold text-white transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 mb-1">
              {googleLoading ? <RotateCw className="w-4 h-4 animate-spin text-indigo-400" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              )}
              <span>Continue with Google</span>
            </button>
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800" /></div>
              <span className="relative px-3 bg-white dark:bg-zinc-900 text-[10px] uppercase tracking-wider font-bold text-zinc-400">Or with email</span>
            </div>
          </>
        )}

        {errorMsg && (<div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{errorMsg}</span></div>)}
        {successMsg && (<div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{successMsg}</span></div>)}

        <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors" />
            </div>
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Password</label>
                {mode === "signin" && (
                  <button type="button" onClick={() => { setMode("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">Forgot?</button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type={showPassword ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="Enter password"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type={showPassword ? "text" : "password"} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          )}
          {mode !== "forgot" && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 pt-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              <span>Protected by reCAPTCHA — <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">Privacy</a> &amp; <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline">Terms</a>.</span>
            </div>
          )}
          <button type="submit" disabled={loading || googleLoading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
            {loading
              ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Processing...</span></>
              : mode === "signin" ? <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
              : mode === "signup" ? <><span>Create Account</span><ArrowRight className="w-4 h-4" /></>
              : <><span>Send Reset Link</span><Mail className="w-4 h-4" /></>}
          </button>
          {mode === "forgot" && (
            <div className="text-center pt-1">
              <button type="button" onClick={() => { setMode("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer">
                Back to Sign In
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}