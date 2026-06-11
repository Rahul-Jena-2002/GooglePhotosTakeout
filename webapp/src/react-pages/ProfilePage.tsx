import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
// No react-router-dom imports
import { collection, query, where, doc, updateDoc, getDocs } from "firebase/firestore"
import { db } from "../firebase"
import { ShieldAlert, User, Check, AlertCircle } from "lucide-react"
import { motion } from "framer-motion"

const PLAN_LABELS: Record<string, string> = {
  free: "Free Tier",
  recovery_pass: "Single Pass",
  pro: "Pro Tier",
  super: "Super Tier",
  family: "Family Tier",
}

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

function ProfilePageContent() {
  const { user, userData, loading, logout, refreshUserData } = useAuth()
  // No react-router-dom hooks

  // Profile Edit States
  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [saveLoading, setSaveLoading] = useState(false)

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
          Your account has been suspended. Please contact our support team.
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

  const plan = userData?.plan || 'free'

  return (
    <div className="max-w-xl mx-auto px-4 py-16 mt-16 relative min-h-[85vh]">
      <div className="relative z-10 space-y-8">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.4)] border border-white/10"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-white" />
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
          <Card className="bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-400" />
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">First Name</span>
                      <span className="text-sm font-semibold text-white">{userData?.firstName || "—"}</span>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Last Name</span>
                      <span className="text-sm font-semibold text-white">{userData?.lastName || "—"}</span>
                    </div>
                  </div>

                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Username Reference</span>
                      <span className="text-sm font-semibold font-mono text-indigo-400">@{userData?.username || "—"}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-white/45 block uppercase font-bold tracking-wider mb-1">Active Plan</span>
                      <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full inline-block">
                        {PLAN_LABELS[plan] || plan}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button onClick={() => setIsEditing(true)} className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 text-white font-semibold rounded-full shadow-[0_4px_15px_rgba(99,102,241,0.3)] border-0">
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase mb-1.5 ml-1">Last Name</label>
                      <input 
                        type="text" 
                        value={lastName} 
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" 
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition-all" 
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
                      className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-full"
                    >
                      {saveLoading ? "Saving Changes..." : "Save Credentials"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <a href="/dashboard" className="text-xs text-white/40 hover:text-indigo-400 transition-colors font-medium">
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
