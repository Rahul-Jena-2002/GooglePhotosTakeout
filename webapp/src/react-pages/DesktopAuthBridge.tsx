import { useState, useEffect, useRef } from "react";
import { useAuth, AuthProvider } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ToastContainer } from "../components/ui/toast";
import { CheckCircle2, AlertCircle, Laptop, RefreshCw, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function DesktopAuthBridgeContent() {
  const { user, userData, loading, login, logout } = useAuth();
  const [port, setPort] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [manualUrl, setManualUrl] = useState<string>("");
  const attemptedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const portParam = searchParams.get("port");
      if (portParam && !Number.isNaN(Number(portParam))) {
        setPort(portParam);
      } else {
        setStatus("error");
        setErrorMessage("Missing or invalid 'port' parameter in URL. Please launch sign-in directly from TakeoutFix Desktop.");
      }
    }
  }, []);

  // When user is authenticated and port is valid, automatically send auth payload to desktop
  useEffect(() => {
    if (!port || loading) return;

    if (user && !attemptedRef.current) {
      attemptedRef.current = true;
      dispatchAuthToDesktop();
    }
  }, [user, userData, port, loading]);

  const dispatchAuthToDesktop = async () => {
    if (!port || !user) return;
    setStatus("connecting");
    setErrorMessage("");

    try {
      const token = await user.getIdToken().catch(() => "");
      const plan = userData?.plan || "free";
      const displayName = user.displayName || userData?.firstName || user.email?.split("@")[0] || "User";
      const email = user.email || "";
      const usedFiles = userData?.usedFiles || 0;
      const usedBytes = userData?.usedBytes || 0;

      const payload = {
        email,
        displayName,
        plan,
        usedFiles,
        usedBytes,
        token,
        photoUrl: user.photoURL || ""
      };

      // Build manual fallback URL
      const queryParams = new URLSearchParams({
        email,
        displayName,
        plan,
        usedFiles: String(usedFiles),
        usedBytes: String(usedBytes),
        token
      });
      const callbackUrl = `http://127.0.0.1:${port}/callback?${queryParams.toString()}`;
      setManualUrl(callbackUrl);

      // Attempt 1: POST fetch
      try {
        const response = await fetch(`http://127.0.0.1:${port}/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          setStatus("success");
          return;
        }
      } catch (postErr) {
        console.warn("[DesktopAuthBridge] POST attempt failed, trying GET...", postErr);
      }

      // Attempt 2: GET fetch fallback
      try {
        const getRes = await fetch(callbackUrl, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        if (getRes.ok) {
          setStatus("success");
          return;
        }
      } catch (getErr) {
        console.warn("[DesktopAuthBridge] GET attempt failed:", getErr);
      }

      // If both background fetches failed (e.g. browser mixed-content / private network block)
      setStatus("error");
      setErrorMessage("Could not reach TakeoutFix Desktop on local port " + port + ". Your browser may block automatic localhost connections.");
    } catch (err: any) {
      console.error("[DesktopAuthBridge] Auth dispatch error:", err);
      setStatus("error");
      setErrorMessage(err?.message || "Failed to complete authentication with desktop client.");
    }
  };

  const handleSignIn = async () => {
    try {
      attemptedRef.current = false;
      await login();
    } catch (err: any) {
      console.error("Sign-in failed:", err);
      setErrorMessage(err?.message || "Sign-in failed. Please try again.");
    }
  };

  const handleSwitchAccount = async () => {
    attemptedRef.current = false;
    await logout();
    await login();
  };

  const planLabel = (userData?.plan || "free").toUpperCase();

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-950/80 backdrop-blur-xl shadow-2xl overflow-hidden relative border">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

        <CardHeader className="text-center pb-4 pt-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg mb-4 text-emerald-400">
            <Laptop className="w-7 h-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">
            TakeoutFix Desktop
          </CardTitle>
          <CardDescription className="text-zinc-400 text-sm mt-1">
            Secure Authentication Bridge
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-2 pb-8 px-6">
          <AnimatePresence mode="wait">
            {/* Case 1: Missing port */}
            {!port && (
              <motion.div
                key="no-port"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="font-semibold mb-1">No Local Desktop Port Detected</p>
                  <p className="text-amber-200/80 text-xs leading-relaxed">
                    This page is meant to be opened by the TakeoutFix Desktop application. Please open TakeoutFix on your computer and click <strong>"Sign in with Google"</strong>.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Case 2: Port present, user NOT logged in */}
            {port && !user && !loading && (
              <motion.div
                key="needs-login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                <div className="text-center text-sm text-zinc-300">
                  <p>Sign in with your Google account to connect TakeoutFix Desktop and activate your license.</p>
                </div>

                <Button
                  onClick={handleSignIn}
                  className="w-full h-12 bg-white text-zinc-950 hover:bg-zinc-100 font-semibold flex items-center justify-center gap-3 rounded-xl shadow-lg transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                  <span>Sign in with Google</span>
                </Button>

                <p className="text-center text-xs text-zinc-500">
                  Ready to link with desktop on port <span className="text-zinc-400 font-mono">{port}</span>
                </p>
              </motion.div>
            )}

            {/* Case 3: Connecting state */}
            {port && (status === "connecting" || (loading && !user)) && (
              <motion.div
                key="connecting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                  <p className="text-white font-medium">Connecting to TakeoutFix Desktop...</p>
                  <p className="text-zinc-400 text-xs mt-1">Transmitting session token to port {port}</p>
                </div>
              </motion.div>
            )}

            {/* Case 4: Success state */}
            {port && status === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-white">Successfully Connected!</h3>
                  <p className="text-zinc-400 text-sm">
                    TakeoutFix Desktop is now authenticated and ready to use.
                  </p>
                </div>

                {/* Account card */}
                {user && (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex items-center justify-between text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt="Avatar"
                          className="w-10 h-10 rounded-full border border-zinc-700 flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold flex-shrink-0">
                          {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">
                          {user.displayName || "TakeoutFix User"}
                        </p>
                        <p className="text-zinc-400 text-xs truncate">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold px-2.5 py-1 text-xs">
                      {planLabel}
                    </Badge>
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    onClick={() => window.close()}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl h-11"
                  >
                    You can close this tab now
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Case 5: Error or connection fallback */}
            {port && status === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="font-semibold mb-1">Local Connection Blocked</p>
                    <p className="text-red-200/80 text-xs leading-relaxed">
                      {errorMessage || "Your browser or firewall prevented the web page from communicating directly with the desktop app."}
                    </p>
                  </div>
                </div>

                {manualUrl && (
                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <p className="text-xs text-zinc-300">
                      Click the direct link below to finish authenticating in TakeoutFix Desktop:
                    </p>
                    <a
                      href={manualUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl gap-2 transition-all shadow-md"
                    >
                      <span>Complete Connection Manually</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={dispatchAuthToDesktop}
                    variant="outline"
                    className="flex-1 border-zinc-800 hover:bg-zinc-900 text-zinc-300 rounded-xl h-10 text-xs gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </Button>
                  {user && (
                    <Button
                      onClick={handleSwitchAccount}
                      variant="ghost"
                      className="text-zinc-400 hover:text-white rounded-xl h-10 text-xs"
                    >
                      Switch Account
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DesktopAuthBridge() {
  return (
    <AuthProvider>
      <DesktopAuthBridgeContent />
      <ToastContainer />
    </AuthProvider>
  );
}
