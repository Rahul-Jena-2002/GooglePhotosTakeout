import { useEffect } from "react";
import { auth, db } from "../../firebase";
import { GoogleAuthProvider, signInWithCredential, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

declare global {
  interface Window {
    google?: any;
  }
}

export default function GoogleOneTap() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || "1089411779683-ooa1g3ubga4lul3c3tu7mev12gobut3i.apps.googleusercontent.com";
    if (!clientId) return;

    // Check if user is already authenticated
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Already signed in — do not prompt One Tap
        return;
      }

      const scriptId = "google-gsi-client";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;

      const initOneTap = () => {
        if (!window.google?.accounts?.id) return;

        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              try {
                if (!response?.credential) return;
                const credential = GoogleAuthProvider.credential(response.credential);
                const userCredential = await signInWithCredential(auth, credential);
                const u = userCredential.user;

                // Sync profile into Firestore if not exists
                if (u && db) {
                  const userRef = doc(db, "users", u.uid);
                  const snap = await getDoc(userRef);
                  if (!snap.exists()) {
                    await setDoc(userRef, {
                      uid: u.uid,
                      email: u.email || "",
                      displayName: u.displayName || "",
                      photoURL: u.photoURL || "",
                      plan: "free",
                      createdAt: new Date().toISOString(),
                    }, { merge: true });
                  }
                }
              } catch (err) {
                console.warn("[GoogleOneTap] Sign-in error:", err);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true,
          });

          window.google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              // Notification skipped or suppressed
            }
          });
        } catch (err) {
          console.warn("[GoogleOneTap] Initialization failed:", err);
        }
      };

      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = initOneTap;
        document.head.appendChild(script);
      } else if (window.google?.accounts?.id) {
        initOneTap();
      }
    });

    return () => {
      unsubscribe();
      try {
        window.google?.accounts?.id?.cancel();
      } catch (_) {}
    };
  }, []);

  return null;
}
