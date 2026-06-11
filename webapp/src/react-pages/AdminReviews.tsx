import { useEffect, useState } from "react"
import { collection, query, orderBy, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore"
import { db } from "../firebase"
import { MessageSquareQuote, Check, X, Send, Trash2, Star } from "lucide-react"

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({})

  const handleToggleFeatured = async (id: string, featured: boolean) => {
    try {
      await updateDoc(doc(db, "reviews", id), { featured })
      fetchReviews()
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  const fetchReviews = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"))
      const snap = await getDocs(q)
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "reviews", id), { status: newStatus })
      fetchReviews()
    } catch (err) {
      console.error(err)
    }
  }

  const handleReplySubmit = async (id: string) => {
    const text = replyText[id]?.trim()
    if (!text) return
    try {
      await updateDoc(doc(db, "reviews", id), { adminReply: text })
      setReplyText({ ...replyText, [id]: "" }) // clear
      fetchReviews()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this review?")) return
    try {
      await deleteDoc(doc(db, "reviews", id))
      fetchReviews()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Review Moderation</h1>
        <p className="text-zinc-400 text-sm">Approve community reviews and post developer replies.</p>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="text-zinc-500 animate-pulse">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 border border-zinc-800 rounded-lg bg-zinc-900/50">
            <MessageSquareQuote className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <div className="text-zinc-500">No reviews have been submitted yet.</div>
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-lg text-white">
                    {r.displayName?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {r.displayName || "Anonymous User"}
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${r.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {r.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleString() : 'Unknown Date'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {r.status === 'APPROVED' && (
                    <button 
                      onClick={() => handleToggleFeatured(r.id, !r.featured)} 
                      className={`p-2 rounded-md border transition-all ${r.featured ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-zinc-800 border-zinc-700/60 text-zinc-500 hover:text-zinc-300'}`}
                      title={r.featured ? "Remove from Homepage" : "Feature on Homepage"}
                    >
                      <Star className={`w-4 h-4 ${r.featured ? 'fill-current' : ''}`} />
                    </button>
                  )}
                  {r.status !== 'APPROVED' && (
                    <button onClick={() => handleStatusChange(r.id, 'APPROVED')} className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-md transition-colors" title="Approve">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {r.status !== 'REJECTED' && (
                    <button onClick={() => handleStatusChange(r.id, 'REJECTED')} className="p-2 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-md transition-colors" title="Reject">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-md transition-colors" title="Delete permanently">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex text-amber-400 mb-2">
                  {'★'.repeat(r.rating || 5)}{'☆'.repeat(5 - (r.rating || 5))}
                </div>
                <p className="text-zinc-300 italic">"{r.message}"</p>
              </div>

              {/* Developer Reply Section */}
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {r.adminReply ? (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-4 relative group">
                    <div className="text-xs font-bold text-indigo-400 uppercase mb-1">Your Reply</div>
                    <p className="text-sm text-zinc-300">{r.adminReply}</p>
                    <button 
                      onClick={() => handleReplySubmit(r.id)} // Submitting empty effectively removes it from UI visually, but we need an actual delete logic if we want to remove. For now, we can just replace.
                      className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit reply (Not implemented in this snippet, but you can over-write below)"
                    >
                      {/* Optional: Add an edit/delete reply button */}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Write a public developer reply..."
                      value={replyText[r.id] || ""}
                      onChange={(e) => setReplyText({...replyText, [r.id]: e.target.value})}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                      onClick={() => handleReplySubmit(r.id)}
                      disabled={!replyText[r.id]?.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                      <Send className="w-4 h-4" /> Reply
                    </button>
                  </div>
                )}
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  )
}
