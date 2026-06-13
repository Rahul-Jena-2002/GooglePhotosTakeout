import { useEffect, useState } from "react"
import { useAuth, AuthProvider } from "../contexts/AuthContext"
import { Card, CardContent } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Star, MessageSquareQuote, Send, CornerDownRight } from "lucide-react"
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../firebase"
import { motion } from "framer-motion"
import AdUnit from "../components/AdUnit"

function ReviewsPageContent() {
  const { user, login } = useAuth()
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Submission Form State
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(5)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const handleWriteReviewClick = async () => {
    if (!user) {
      try {
        await login()
      } catch (err) {
        console.error("Login failed:", err)
      }
    } else {
      setShowForm(true)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  const fetchReviews = async () => {
    try {
      const q = query(
        collection(db, "reviews"),
        where("status", "==", "APPROVED")
      )
      const snap = await getDocs(q)
      const allApproved = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort in memory to avoid requiring a Firestore composite index
      allApproved.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      setReviews(allApproved)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
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
        status: "PENDING", // Needs admin approval
        createdAt: serverTimestamp()
      })
      setSubmitSuccess(true)
      setShowForm(false)
      setMessage("")
      setRating(5)
    } catch (err) {
      console.error("Error submitting review", err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-16 mt-16 relative min-h-[80vh]">
      <div className="text-center mb-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <MessageSquareQuote className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="text-4xl md:text-6xl font-bold tracking-tighter mb-6"
        >
          User Reviews
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="text-xl text-white/60 max-w-2xl mx-auto mb-8"
        >
          See what our community thinks about TakeoutFix. Real reviews from users who successfully restored their Google Takeout metadata.
        </motion.p>

        {/* Review Action */}
        {!showForm && !submitSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Button 
              onClick={handleWriteReviewClick}
              size="lg" 
              className="btn-monochrome-primary rounded-full px-8 py-3 font-semibold"
            >
              {user ? "Write a Review" : "Sign in to Write a Review"}
            </Button>
          </motion.div>
        )}

        {submitSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-3 rounded-full text-sm font-medium"
          >
            Thank you! Your review has been submitted and is pending approval.
          </motion.div>
        )}
      </div>

      {/* SUBMISSION FORM */}
      {showForm && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl mx-auto mb-16 relative z-10"
        >
          {!user ? (
            <div className="text-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl">
              <p className="text-zinc-400 mb-4">You must be signed in to submit a review.</p>
              <Button onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitReview} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl text-left">
              <h3 className="text-xl font-bold mb-6 text-white">Write your Review</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 focus:outline-none"
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
                  className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting || !message.trim()} className="btn-monochrome-primary">
                  {submitting ? "Submitting..." : <><Send className="w-4 h-4 mr-2" /> Submit Review</>}
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      )}

      {/* REVIEWS GRID */}
      {loading ? (
        <div className="text-center py-20 text-white/50">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10 relative z-10">
          <Star className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/50">No reviews have been published yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 items-start">
          {reviews.map((review, idx) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: Math.min(0.5, idx * 0.08), ease: "easeOut" }}
              className="h-full"
            >
              <Card className="review-card bg-black/60 backdrop-blur-xl border-white/10 hover:border-zinc-500/30 transition-colors group h-full flex flex-col justify-between">
                <CardContent className="pt-6 flex flex-col h-full justify-between">
                  <div>
                    <div className="flex text-amber-400 mb-4">
                      {[...Array(review.rating || 5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-white/80 text-sm leading-relaxed mb-6 italic">"{review.message}"</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      {review.photoURL ? (
                        <img src={review.photoURL} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold uppercase text-zinc-300">
                          {review.displayName?.charAt(0) || "U"}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-white group-hover:text-zinc-200 dark:group-hover:text-zinc-950 transition-colors">{review.displayName || "Anonymous User"}</div>
                        <div className="text-xs text-white/40">
                          {review.createdAt?.seconds ? new Date(review.createdAt.seconds * 1000).toLocaleDateString() : "Recently"}
                        </div>
                      </div>
                    </div>

                    {/* ADMIN REPLY SECTION */}
                    {review.adminReply && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-lg -mx-6 -mb-6 px-6 pb-6 text-left">
                        <div className="flex items-start gap-2">
                          <CornerDownRight className="w-4 h-4 text-zinc-400 mt-1 flex-shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-zinc-400 dark:text-zinc-300 uppercase tracking-wider mb-1">Developer Reply</div>
                            <p className="text-sm text-zinc-400 leading-relaxed">{review.adminReply}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto px-4 mt-12">
        <AdUnit type="horizontal" />
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  return (
    <AuthProvider>
      <ReviewsPageContent />
    </AuthProvider>
  )
}
