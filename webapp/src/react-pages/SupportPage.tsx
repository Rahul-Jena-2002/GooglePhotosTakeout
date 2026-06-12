import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
// No react-router-dom imports
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { LifeBuoy, FileText, History, PlusCircle, AlertCircle, CheckCircle2, MessageSquare } from "lucide-react"
import { collection, query, where, getDocs, addDoc, doc, updateDoc } from "firebase/firestore"
import { db } from "../firebase"
import { motion, AnimatePresence } from "framer-motion"
import AdUnit from "../components/AdUnit"

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

function SupportPageContent() {
  const { user, userData } = useAuth()
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "faq";
    }
    return "faq";
  })
  
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  
  const [newTicket, setNewTicket] = useState({ subject: "", message: "" })

  // Feedback Form State
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackCategory, setFeedbackCategory] = useState("general")
  const [feedbackMessage, setFeedbackMessage] = useState("")
  const [feedbackSubmitStatus, setFeedbackSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")

  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
  const [followUpText, setFollowUpText] = useState("")

  const toggleTicketExpand = (id: string) => {
    setExpandedTicketId(expandedTicketId === id ? null : id)
    setFollowUpText("")
  }

  const handleFollowUp = async (ticketId: string, currentReplies: any[]) => {
    if (!followUpText.trim()) return
    try {
      const newReply = {
        sender: 'user',
        message: followUpText.trim(),
        timestamp: Date.now(),
        senderName: userData?.firstName || user?.displayName?.split(" ")[0] || "User"
      }
      
      const ticketRef = doc(db, "tickets", ticketId)
      await updateDoc(ticketRef, {
        status: "IN_PROGRESS",
        replies: [...(currentReplies || []), newReply]
      })
      
      setFollowUpText("")
      loadTickets()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCloseTicket = async (ticketId: string) => {
    try {
      const ticketRef = doc(db, "tickets", ticketId)
      await updateDoc(ticketRef, {
        status: "CLOSED"
      })
      loadTickets()
    } catch (e) {
      console.error(e)
    }
  }

  const isPaid = userData?.plan && userData.plan !== "free"

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      window.history.replaceState({}, "", url.toString());
    }
    if (activeTab === "tickets" && user && isPaid) {
      loadTickets()
    }
  }, [activeTab, user, isPaid])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, "tickets"), 
        where("uid", "==", user?.uid)
      )
      const snap = await getDocs(q)
      const ticketList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      ticketList.sort((a: any, b: any) => b.createdAt - a.createdAt)
      setTickets(ticketList)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !isPaid) return
    if (!newTicket.subject.trim() || !newTicket.message.trim()) return
    
    setSubmitStatus("submitting")
    const ticketId = 'TKT-' + Math.floor(100000 + Math.random() * 900000)
    try {
      await addDoc(collection(db, "tickets"), {
        ticketId,
        uid: user.uid,
        email: user.email,
        subject: newTicket.subject,
        message: newTicket.message,
        status: "OPEN",
        createdAt: Date.now(),
        replies: []
      })
      setSubmitStatus("success")
      setNewTicket({ subject: "", message: "" })
      setTimeout(() => {
        setActiveTab("tickets")
        setSubmitStatus("idle")
      }, 2000)
    } catch (e) {
      setSubmitStatus("error")
    }
  }

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedbackMessage.trim()) return

    setFeedbackSubmitStatus("submitting")
    try {
      await addDoc(collection(db, "feedback"), {
        uid: user?.uid || "anonymous",
        email: user?.email || "anonymous",
        displayName: userData?.firstName || user?.displayName || "Anonymous User",
        rating: feedbackRating,
        category: feedbackCategory,
        message: feedbackMessage.trim(),
        createdAt: Date.now()
      })
      setFeedbackSubmitStatus("success")
      setFeedbackMessage("")
      setFeedbackRating(5)
      setFeedbackCategory("general")
      setTimeout(() => setFeedbackSubmitStatus("idle"), 3000)
    } catch (err) {
      console.error(err)
      setFeedbackSubmitStatus("error")
    }
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } }
  }

  const tabContentVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 mt-16 relative">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold tracking-tighter mb-8 flex items-center gap-3">
          <LifeBuoy className="w-8 h-8 text-indigo-400" />
          Help & Support
        </h1>
      </motion.div>

      <AdUnit type="horizontal" />

      <div className="flex flex-col md:flex-row gap-8">
        
        {/* SIDEBAR NAVIGATION */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="md:w-64 flex-shrink-0 space-y-2"
        >
          <button 
            onClick={() => setActiveTab("faq")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'faq' ? 'bg-indigo-500 text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
          >
            <FileText className="w-4 h-4" /> FAQ & Documentation
          </button>
          
          <button 
            onClick={() => setActiveTab("new")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'new' ? 'bg-indigo-500 text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
          >
            <PlusCircle className="w-4 h-4" /> Open New Ticket
          </button>
          
          <button 
            onClick={() => setActiveTab("tickets")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'tickets' ? 'bg-indigo-500 text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
          >
            <History className="w-4 h-4" /> My Tickets
          </button>

          <button 
            onClick={() => setActiveTab("feedback")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'feedback' ? 'bg-indigo-500 text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
          >
            <MessageSquare className="w-4 h-4" /> Give Feedback
          </button>
        </motion.div>

        {/* CONTENT AREA */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            >
              {/* FAQ CONTENT */}
              {activeTab === "faq" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>
                  <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                  >
                    {[
                      { q: "How do I download my Google Takeout?", a: "Go to takeout.google.com, select Google Photos, and create an export. Once finished, download and unzip the folder." },
                      { q: "Why are my photos missing dates?", a: "Google removes EXIF metadata when you download through Takeout. Instead, it places the data in separate JSON sidecar files. TakeoutFix merges these files back together." },
                      { q: "Does TakeoutFix upload my photos?", a: "No. Everything is processed 100% locally on your machine. Your photos never leave your device." },
                      { q: "Is there a limit on the free plan?", a: "Yes, the free plan processes up to 1GB or 1,000 files to let you test the tool. Upgrading removes this limit." },
                      { q: "What is your refund policy?", a: "We offer a Recovery Guarantee: we will issue a refund if our software fails to process your export due to a verified technical issue. To prevent abuse, refunds are subject to usage caps: Recovery Pass users are eligible for a full refund within 14 days of purchase if total usage is under 1 GB and 1,000 files; Pro and Super Lifetime users can request a full refund within 7 days if usage is under 1 GB, or a 50% refund if usage is under 20 GB. No refunds are available if usage exceeds 20 GB or after the specified duration." }
                    ].map((faq, idx) => (
                      <motion.div key={idx} variants={itemVariants}>
                        <Card className="bg-black/40 backdrop-blur-md border-white/10 hover:border-indigo-500/20 transition-all">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base text-white">{faq.q}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-white/60 text-sm leading-relaxed">{faq.a}</p>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}

              {/* NEW TICKET CONTENT */}
              {activeTab === "new" && (
                <div>
                  <h2 className="text-xl font-bold mb-6">Submit a Support Request</h2>
                  
                  {!user ? (
                    <Card className="bg-black/40 border-red-500/30 backdrop-blur-md">
                      <CardContent className="pt-6 text-center">
                        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                        <h3 className="text-lg font-bold mb-2">Sign In Required</h3>
                        <p className="text-white/60 mb-4">Please sign in to submit a support ticket.</p>
                      </CardContent>
                    </Card>
                  ) : !isPaid ? (
                    <Card className="bg-indigo-500/10 border-indigo-500/30 backdrop-blur-md">
                      <CardContent className="pt-6 text-center">
                        <LifeBuoy className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-bounce" />
                        <h3 className="text-lg font-bold mb-2">Premium Support Locked</h3>
                        <p className="text-indigo-200/60 mb-6">Direct ticket support is available for users on paid plans.</p>
                        <a href="/pricing">
                          <Button className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full px-6">Upgrade Plan</Button>
                        </a>
                      </CardContent>
                    </Card>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {submitStatus === "success" ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center"
                        >
                          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                          <h3 className="text-xl font-bold text-green-400 mb-2">Ticket Submitted!</h3>
                          <p className="text-green-200/60">We'll review your request and respond shortly.</p>
                        </motion.div>
                      ) : (
                        <Card className="bg-black/40 backdrop-blur-md border-white/10 shadow-lg">
                          <CardContent className="pt-6 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-white/70 mb-1">Subject</label>
                              <Input 
                                value={newTicket.subject}
                                onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})}
                                required
                                placeholder="Brief description of the issue"
                                className="bg-white/5 border-white/10 rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-white/70 mb-1">Message</label>
                              <Textarea 
                                value={newTicket.message}
                                onChange={(e) => setNewTicket({...newTicket, message: e.target.value})}
                                required
                                placeholder="Detailed explanation..."
                                className="bg-white/5 border-white/10 min-h-[150px] rounded-xl resize-none"
                              />
                            </div>
                            <Button 
                              type="submit" 
                              disabled={submitStatus === "submitting"}
                              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-full py-2.5 font-bold"
                            >
                              {submitStatus === "submitting" ? "Submitting..." : "Submit Ticket"}
                            </Button>
                          </CardContent>
                        </Card>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* MY TICKETS CONTENT */}
              {activeTab === "tickets" && (
                <div>
                  <h2 className="text-xl font-bold mb-6">Your Support Tickets</h2>
                  
                  {!user ? (
                    <Card className="bg-black/40 border-red-500/30 backdrop-blur-md">
                      <CardContent className="pt-6 text-center">
                        <p className="text-white/60">Please sign in to view your tickets.</p>
                      </CardContent>
                    </Card>
                  ) : !isPaid ? (
                    <Card className="bg-indigo-500/10 border-indigo-500/30 backdrop-blur-md">
                      <CardContent className="pt-6 text-center">
                        <p className="text-indigo-200/60">Direct ticket support is reserved for paid plans.</p>
                      </CardContent>
                    </Card>
                  ) : loading ? (
                    <div className="text-center py-12 text-white/50">Loading tickets...</div>
                  ) : tickets.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                      <History className="w-12 h-12 text-white/20 mx-auto mb-4" />
                      <p className="text-white/50">You have no support tickets.</p>
                    </div>
                  ) : (
                    <motion.div 
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="space-y-4"
                    >
                      {tickets.map((ticket) => (
                        <motion.div key={ticket.id} variants={itemVariants}>
                          <Card className="bg-black/40 backdrop-blur-md border-white/10 overflow-hidden transition-all duration-200">
                            <div 
                              className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5 cursor-pointer hover:bg-white/[0.08]"
                              onClick={() => toggleTicketExpand(ticket.id)}
                            >
                              <div className="font-medium flex items-center gap-2">
                                <span className="text-xs font-mono bg-white/10 text-white/70 px-2 py-0.5 rounded font-bold">
                                  {ticket.ticketId || `#${ticket.id.slice(0, 8)}`}
                                </span>
                                <span>{ticket.subject}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className={`text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold border ${
                                  ticket.status === 'OPEN' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                  ticket.status === 'CLOSED' ? 'bg-white/5 text-white/40 border-white/10' :
                                  ticket.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                }`}>
                                  {ticket.status === 'IN_PROGRESS' ? 'IN PROGRESS' : ticket.status}
                                </div>
                                <span className="text-zinc-500 text-xs">{expandedTicketId === ticket.id ? "▲" : "▼"}</span>
                              </div>
                            </div>
                            
                            {expandedTicketId === ticket.id && (
                              <CardContent className="pt-6 space-y-4">
                                <div className="bg-zinc-950 border border-zinc-900/50 p-4 rounded-xl">
                                  <p className="text-[10px] text-white/45 mb-1.5 uppercase tracking-wider font-bold">Initial Message</p>
                                  <p className="text-sm text-white/80 whitespace-pre-wrap">{ticket.message}</p>
                                </div>

                                {/* Legacy Admin Reply */}
                                {ticket.adminReply && (!ticket.replies || ticket.replies.length === 0) && (
                                  <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl ml-6">
                                    <p className="text-[10px] text-indigo-400 mb-1.5 uppercase tracking-wider font-bold">Support Response</p>
                                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{ticket.adminReply}</p>
                                    <span className="text-[9px] text-zinc-500 mt-2 block font-mono">Replied by: {ticket.repliedBy || "Support"}</span>
                                  </div>
                                )}

                                {/* Thread Replies */}
                                {ticket.replies && ticket.replies.map((reply: any, rIdx: number) => {
                                  const isAdminReply = reply.sender === 'admin'
                                  return (
                                    <div 
                                      key={rIdx} 
                                      className={`p-4 rounded-xl ${
                                        isAdminReply 
                                          ? 'bg-indigo-500/5 border border-indigo-500/20 ml-6' 
                                          : 'bg-zinc-950 border border-zinc-900/80 mr-6'
                                      }`}
                                    >
                                      <p className={`text-[10px] mb-1.5 uppercase tracking-wider font-bold ${
                                        isAdminReply ? 'text-indigo-400' : 'text-zinc-500'
                                      }`}>
                                        {isAdminReply ? `${reply.senderName || 'Support'} (Support)` : 'You'}
                                      </p>
                                      <p className="text-sm text-zinc-355 whitespace-pre-wrap">{reply.message}</p>
                                      <span className="text-[9px] text-zinc-500 mt-2 block font-mono">{new Date(reply.timestamp).toLocaleString()}</span>
                                    </div>
                                  )
                                })}

                                {/* Actions & Follow-up Input */}
                                {ticket.status !== 'CLOSED' ? (
                                  <div className="space-y-3 border-t border-white/5 pt-4">
                                    {ticket.status === 'RESOLVED' && (
                                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 mb-2">
                                        <span className="text-xs text-zinc-350 font-normal">Has the support response solved your query?</span>
                                        <Button 
                                          size="sm" 
                                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-full px-4"
                                          onClick={() => handleCloseTicket(ticket.id)}
                                        >
                                          Accept Solution & Close
                                        </Button>
                                      </div>
                                    )}

                                    <div>
                                      <label className="block text-xs font-bold text-white/50 uppercase mb-1.5 ml-1">Send Follow-up</label>
                                      <Textarea 
                                        value={followUpText}
                                        onChange={(e) => setFollowUpText(e.target.value)}
                                        placeholder="Type your follow-up message..."
                                        className="bg-white/5 border-white/10 min-h-[80px] text-sm rounded-xl resize-none"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button 
                                        className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-full px-4"
                                        onClick={() => handleFollowUp(ticket.id, ticket.replies)}
                                        disabled={!followUpText.trim()}
                                      >
                                        Send Message
                                      </Button>
                                      {ticket.status !== 'RESOLVED' && (
                                        <Button 
                                          variant="outline" 
                                          className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 text-xs rounded-full px-4"
                                          onClick={() => handleCloseTicket(ticket.id)}
                                        >
                                          Close Ticket
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-4 bg-zinc-900/20 border border-zinc-800/80 rounded-xl text-center text-xs text-zinc-500 font-bold uppercase tracking-wider">
                                    Ticket closed. No further replies can be sent.
                                  </div>
                                )}

                                <div className="pt-2 text-xs text-white/30 border-t border-white/5 font-mono">
                                  Created: {new Date(ticket.createdAt).toLocaleString()}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </div>
              )}

              {/* FEEDBACK CONTENT */}
              {activeTab === "feedback" && (
                <div>
                  <h2 className="text-xl font-bold mb-6">Give Us Your Feedback</h2>
                  
                  {feedbackSubmitStatus === "success" ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center"
                    >
                      <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-green-400 mb-2">Feedback Submitted!</h3>
                      <p className="text-green-200/60">Thank you for helping us improve TakeoutFix. We read every response!</p>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                      {feedbackSubmitStatus === "error" && (
                        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-xl">
                          Failed to submit feedback. Please try again.
                        </div>
                      )}
                      
                      <Card className="bg-black/40 backdrop-blur-md border-white/10 shadow-lg">
                        <CardContent className="pt-6 space-y-5">
                          {/* Rating Stars */}
                          <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">How would you rate your experience?</label>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setFeedbackRating(star)}
                                  className="p-1 focus:outline-none transition-transform active:scale-95 text-zinc-600"
                                >
                                  <svg 
                                    className={`w-8 h-8 ${feedbackRating >= star ? 'text-amber-400 fill-amber-400' : 'text-zinc-650'}`} 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                  >
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Category Selector */}
                          <div>
                            <label className="block text-sm font-medium text-white/70 mb-1.5">Feedback Category</label>
                            <select
                              value={feedbackCategory}
                              onChange={(e) => setFeedbackCategory(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="general" className="bg-zinc-950 text-white">General Feedback</option>
                              <option value="feature" className="bg-zinc-950 text-white">Feature Request</option>
                              <option value="bug" className="bg-zinc-950 text-white">Bug Report</option>
                              <option value="pricing" className="bg-zinc-950 text-white">Pricing / Billing</option>
                              <option value="praise" className="bg-zinc-950 text-white">Praise</option>
                            </select>
                          </div>

                          {/* Message */}
                          <div>
                            <label className="block text-sm font-medium text-white/70 mb-1.5">Your Message</label>
                            <Textarea 
                              value={feedbackMessage}
                              onChange={(e) => setFeedbackMessage(e.target.value)}
                              required
                              placeholder="What went well? What can we do better? Let us know..."
                              className="bg-white/5 border-white/10 min-h-[120px] rounded-xl resize-none"
                            />
                          </div>

                          <Button 
                            type="submit" 
                            disabled={feedbackSubmitStatus === "submitting"}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-full py-2.5 font-bold"
                          >
                            {feedbackSubmitStatus === "submitting" ? "Submitting..." : "Submit Feedback"}
                          </Button>
                        </CardContent>
                      </Card>
                    </form>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default function SupportPage() {
  return (
    <AuthProvider>
      <SupportPageContent />
      <ToastContainer />
    </AuthProvider>
  )
}
