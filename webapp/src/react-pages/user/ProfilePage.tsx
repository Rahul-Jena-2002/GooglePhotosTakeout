import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
// No react-router-dom imports
import { collection, query, where, doc, updateDoc, getDocs } from "firebase/firestore"
import { db } from "../../firebase"
import { ShieldAlert, User, Check, AlertCircle, Trash2 } from "lucide-react"
import { motion } from "framer-motion"


import { AuthProvider } from "../../contexts/AuthContext"
import { ToastContainer } from "../../components/ui/toast"

function ProfilePageContent() {
  const { user, userData, loading, logout, deleteAccount, refreshUserData } = useAuth()
  // No react-router-dom hooks

  // Profile Edit States
  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [saveLoading, setSaveLoading] = useState(false)
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")

  // Sync inputs with userData when loaded
  useEffect(() => {
    if (userData) {
      setFirstName(userData.firstName || "")
      setLastName(userData.lastName || "")
      setUsername(userData.username || "")
    }
  }, [userData])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setErrorMsg("");
    setSuccessMsg("");
    setSaveLoading(true);

    const cleanUsername = username.trim().toLowerCase();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    // Validations
    if (!cleanFirstName || !cleanLastName) {
      setErrorMsg("First name and Last name are required.");
      setSaveLoading(false);
      return;
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      setErrorMsg("Username must be between 3 and 20 characters.");
      setSaveLoading(false);
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(cleanUsername)) {
      setErrorMsg("Username can only contain letters, numbers, underscores, and dashes.");
      setSaveLoading(false);
      return;
    }

    try {
      // Check username uniqueness
      const q = query(collection(db, "users"), where("username", "==", cleanUsername));
      const snap = await getDocs(q);
      
      let isTaken = false;
      snap.forEach((doc) => {
        if (doc.id !== user.uid) {
          isTaken = true;
        }
      });

      if (isTaken) {
        setErrorMsg("Username is already taken by another user.");
        setSaveLoading(false);
        return;
      }

      // Update Firestore user document
      const userRef = doc(db, "users", user.uid);
      const updatedDisplayName = `${cleanFirstName} ${cleanLastName}`.trim();
      
      await updateDoc(userRef, {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        username: cleanUsername,
        displayName: updatedDisplayName
      });

      // Update Firebase Auth user profile
      const { updateProfile } = await import("firebase/auth");
      await updateProfile(user, {
        displayName: updatedDisplayName
      });

      // Refresh data
      await refreshUserData();
      setIsEditing(false);
      setSuccessMsg("Profile updated successfully!");
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to update profile. Please try again.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout()
    if (typeof window !== 'undefined') {
      window.location.href = "/"
    }
  }

  const usesGoogleSignIn = user?.providerData.some((provider) => provider.providerId === "google.com") ?? false
  const requiresPassword = !usesGoogleSignIn && (user?.providerData.some((provider) => provider.providerId === "password") ?? false)

  const handleDeleteAccount = () => {
    setErrorMsg("");
    setDeletePassword("");
    setShowDeleteConfirm(true);
  }

  const confirmDeleteAccount = async () => {
    setErrorMsg("");
    setDeleteLoading(true);
    try {
      await deleteAccount(deletePassword || undefined);
      window.location.href = "/";
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      setErrorMsg(err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential"
        ? "That password could not be verified. Check it and try again."
        : err?.code === "auth/requires-recent-login"
          ? "Please sign in again and retry account deletion."
          : "Account deletion could not be completed. Please try again or contact support.");
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-white/50 mt-16">Loading profile...</div>
  }
  
  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-32 p-6 bg-black/40 border border-white/10 rounded-xl text-center">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
        <p className="text-white/60 mb-6">You must be signed in to view your profile settings.</p>
        <a href="/">
          <Button className="w-full bg-white text-black hover:bg-white/90">Return Home</Button>
        </a>
      </div>
    )
  }

  if (userData?.suspended) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Account Suspended</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Your account has been suspended. Please contact our support team at{" "}
          <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">
            takeoutfix.support@gmail.com
          </a>.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all">
            Contact Support
          </a>
          <button onClick={handleSignOut} className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-all">
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  const photoUrl = user?.photoURL || userData?.photoURL
  const userInitial = (firstName || userData?.firstName || user?.displayName || user?.email || "U").charAt(0).toUpperCase()

  return (
    <div className="max-w-xl mx-auto px-4 py-16 mt-16 relative min-h-[85vh]">
      <div className="relative z-10 space-y-8">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="profile-avatar-mono w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center border shadow-sm overflow-hidden"
          >
            {photoUrl && failedPhotoUrl !== photoUrl ? (
              <img 
                key={photoUrl}
                src={photoUrl} 
                alt={user?.displayName || "Profile"} 
                referrerPolicy="no-referrer"
                onError={() => setFailedPhotoUrl(photoUrl)}
                className="w-full h-full rounded-full object-cover" 
              />
            ) : userInitial ? (
              <span className="text-2xl font-bold select-none">{userInitial}</span>
            ) : (
              <User className="w-10 h-10" />
            )}
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            className="text-3xl font-bold tracking-tighter"
          >
            Profile Settings
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
            className="text-sm text-white/50 mt-1"
          >
            Manage your personal credentials and identity on TakeoutFix.
          </motion.p>
        </div>

        {/* PROFILE CARD */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        >
          <Card className="profile-card-mono bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-400" />
                <span>Personal Account Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {successMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 p-3 rounded-lg flex items-center gap-2 font-medium"
                >
                  <Check className="w-4 h-4" />
                  {successMsg}
                </motion.div>
              )}

              {errorMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 text-xs text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-lg flex items-center gap-2 font-medium"
                >
                  <AlertCircle className="w-4 h-4" />
                  {errorMsg}
                </motion.div>
              )}

              {!isEditing ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">First Name</span>
                      <span className="text-sm font-semibold text-white">{userData?.firstName || "—"}</span>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Last Name</span>
                      <span className="text-sm font-semibold text-white">{userData?.lastName || "—"}</span>
                    </div>
                  </div>

                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                    <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Email address</span>
                    <span className="text-sm font-semibold text-white break-all">{user.email || "Not available"}</span>
                  </div>

                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Username Reference</span>
                      <span className="text-sm font-semibold font-mono text-zinc-450 dark:text-zinc-300">@{userData?.username || "—"}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Account Status</span>
                      <span className="text-xs font-bold text-emerald-400 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 capitalize">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Active · {(userData?.plan || "free").replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button onClick={() => setIsEditing(true)} className="btn-monochrome-secondary flex-1 font-semibold rounded-full border-0">
                      Edit Profile Credentials
                    </Button>
                    <Button onClick={handleSignOut} variant="outline" className="sm:w-32 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-full">
                      Sign Out
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase mb-1.5 ml-1">First Name</label>
                      <input 
                        type="text" 
                        value={firstName} 
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-505 transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase mb-1.5 ml-1">Last Name</label>
                      <input 
                        type="text" 
                        value={lastName} 
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-505 transition-all" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase mb-1.5 ml-1">Username handle</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">@</span>
                      <input 
                        type="text" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        placeholder="username"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-505 font-mono transition-all" 
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3 pt-4 border-t border-white/5 mt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsEditing(false);
                        setFirstName(userData?.firstName || "");
                        setLastName(userData?.lastName || "");
                        setUsername(userData?.username || "");
                        setErrorMsg("");
                      }} 
                      className="flex-1 border-white/10 text-white/70 hover:bg-white/5 rounded-full"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={saveLoading} 
                      className="btn-monochrome-secondary flex-1 font-semibold rounded-full"
                    >
                      {saveLoading ? "Saving Changes..." : "Save Credentials"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <section className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-5 sm:p-6" aria-labelledby="delete-account-heading">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
            <div>
              <h2 id="delete-account-heading" className="text-sm font-semibold text-red-300">Danger zone · Delete account</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Permanently remove your account and associated TakeoutFix cloud records. This cannot be undone. Photos and files processed locally are not uploaded and remain on your device.</p>
              <a href="/privacy#account-deletion" className="mt-2 inline-block text-xs text-white/60 underline underline-offset-2 hover:text-white">Review what account deletion removes</a>
            </div>
          </div>
          <Button onClick={handleDeleteAccount} disabled={deleteLoading} variant="outline" className="mt-4 border-red-500/30 text-red-300 hover:bg-red-500/10">
            <Trash2 className="mr-2 h-4 w-4" />{deleteLoading ? "Deleting account..." : "Delete my account"}
          </Button>
        </section>

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
              <h2 id="delete-confirm-title" className="text-lg font-bold text-white">Permanently delete your account?</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">Your TakeoutFix account and associated cloud records will be removed. This cannot be undone. Your local files are not uploaded and will remain on your device.</p>
              {requiresPassword && (
                <label className="mt-5 block text-sm font-medium text-zinc-200">
                  Confirm with your password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none focus:border-zinc-400"
                  />
                </label>
              )}
              {usesGoogleSignIn && <p className="mt-4 text-xs text-zinc-400">Google will ask you to confirm your sign-in before deletion.</p>}
              {errorMsg && <p className="mt-4 text-sm text-red-300" role="alert">{errorMsg}</p>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={deleteLoading} onClick={() => setShowDeleteConfirm(false)} className="border-white/10 text-zinc-200 hover:bg-white/5">Cancel</Button>
                <Button disabled={deleteLoading || (requiresPassword && !deletePassword)} onClick={confirmDeleteAccount} className="border border-red-500/30 bg-red-600 text-white hover:bg-red-700">
                  {deleteLoading ? "Deleting account…" : "Permanently delete"}
                </Button>
              </div>
            </section>
          </div>
        )}
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <a href="/dashboard" className="text-xs text-white/40 hover:text-zinc-200 dark:hover:text-zinc-950 transition-colors font-medium">
            &larr; Back to Account Dashboard
          </a>
        </motion.div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <AuthProvider>
      <ProfilePageContent />
      <ToastContainer />
    </AuthProvider>
  )
}
