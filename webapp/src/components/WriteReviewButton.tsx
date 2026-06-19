import React, { useState, useEffect } from "react"
import { auth, db, googleProvider, signInWithPopup } from "../firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { Star, Send } from "lucide-react"
import { useToastStore } from "../store/useToastStore"

export default function WriteReviewButton() {
  const [user, setUser] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(5)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
    })
    return unsub
  }, [])

  const handleOpenForm = async () => {
    if (!user) {
      let loginSuccess = false;
      let toastShown = false;
      let popupRef: Window | null = null;
      let checkInterval: any = null;

      const originalOpen = window.open;
      // Override window.open to capture the popup window when Firebase opens it
      window.open = function(...args) {
        const win = originalOpen.apply(this, args);
        popupRef = win;
        // Restore window.open immediately upon capturing
        window.open = originalOpen;
        return win;
      };

      // Safe fallback to restore window.open if it's never called
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
              useToastStore.getState().addToast("Please check your credentials and try again.", "error", 4500, "Login Failed");
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

        console.error("Google Auth error:", err);
        if (!toastShown) {
          toastShown = true;
          const errMsg = err?.code || err?.message || String(err);
          const isCancelled = errMsg.includes("cancelled") || errMsg.includes("closed") || errMsg.includes("popup-closed-by-user");
          useToastStore.getState().addToast(
            isCancelled ? "Sign-in was cancelled." : `Sign-in failed: ${errMsg}`,
            "error",
            7000,
            "Login Failed"
          );
        }
        return;
      }
    }
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !message.trim()) return

    setSubmitting(true)
    try {
      await addDoc(collection(db, "reviews"), {
        uid: user.uid,
        displayName: user.displayName || "Anonymous User",
        photoURL: user.photoURL || null,
        rating,
        message,
        status: "PENDING",
        createdAt: serverTimestamp()
      })
      setSubmitSuccess(true)
      setShowForm(false)
      setMessage("")
      setRating(5)
    } catch (err) {
      console.error("Failed to submit review:", err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative z-10 flex flex-col items-center">
      {!showForm && !submitSuccess && (
        <button 
          onClick={handleOpenForm}
          className="btn-monochrome-primary rounded-full px-8 py-3 text-sm font-semibold transition-all cursor-pointer"
        >
          {user ? "Write a Review" : "Sign in to Write a Review"}
        </button>
      )}

      {submitSuccess && (
        <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-3 rounded-full text-sm font-medium">
          Thank you! Your review has been submitted and is pending approval.
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleSubmit} 
            className="bg-zinc-900 border border-zinc-850 rounded-2xl p-6 shadow-2xl text-left max-w-lg w-full relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-6 text-white">Write your Review</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 focus:outline-none cursor-pointer"
                  >
                    <Star className={`w-8 h-8 ${rating >= star ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Message</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How was your experience using TakeoutFix?"
                className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-zinc-500 resize-none"
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-800/50 pt-4">
              <button 
                type="button" 
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-zinc-450 hover:bg-white/5 text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting || !message.trim()}
                className="btn-monochrome-primary disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                {submitting ? "Submitting..." : <><Send className="w-4 h-4" /> Submit Review</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
