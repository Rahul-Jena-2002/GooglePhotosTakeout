import { useEffect, useState } from "react"
import { collection, query, orderBy, getDocs, updateDoc, doc, where, addDoc, onSnapshot } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { Search, AlertCircle, X, Mail, CheckCircle2, Clock, Inbox } from "lucide-react"

export default function AdminSupport() {
  const { adminData } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  
  // Drawer states
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [ticketUser, setTicketUser] = useState<any | null>(null)
  const [adminsList, setAdminsList] = useState<any[]>([])

  // Gemini AI Helpers for Admin Support Responses
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStatus, setAiStatus] = useState("")
  const GEMINI_API_KEY = "AQ.Ab8RN6JtQeU9jqNtuDtITBy0sxzP05-uHcdxaNOWvrFSt9Bi-Q"

  const callGemini = async (promptText: string): Promise<string> => {
    setAiLoading(true)
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API returned error status: ${response.status}`)
      }

      const data = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      return text.trim()
    } catch (err: any) {
      console.error("Gemini API Error:", err)
      alert(`AI Assistant Error: ${err.message || 'Failed to communicate with Gemini.'}`)
      return ""
    } finally {
      setAiLoading(false)
      setAiStatus("")
    }
  }

  const handleAIDraft = async () => {
    if (!selectedTicket) return
    setAiStatus("Drafting AI response...")
    
    const historyText = selectedTicket.replies && selectedTicket.replies.length > 0
      ? selectedTicket.replies.map((r: any) => `${r.sender === 'user' ? 'User' : 'Support'}: "${r.message}"`).join("\n")
      : ""

    const prompt = `You are the TakeoutFix Customer Support Agent. Write a professional, polite, and helpful reply resolving the following support ticket.
    Keep the tone friendly, reassuring, and clear. Do not use quotes or introductory phrases. Provide only the response text.

Ticket Subject: ${selectedTicket.subject}
Ticket Message: ${selectedTicket.message}
${historyText ? `Previous Messages:\n${historyText}\n` : ""}

Draft response:`

    const draft = await callGemini(prompt)
    if (draft) {
      setReplyBody(draft)
    }
  }

  const handleAIPolish = async () => {
    if (!replyBody.trim()) return
    setAiStatus("Polishing response...")

    const prompt = `You are a professional editor. Rewrite and polish the following support reply to make it polite, professional, grammatically perfect, and clear. Maintain the original message's intent. Do not use quotes or introductory phrases. Provide only the polished text.

Draft:
${replyBody.trim()}

Polished response:`

    const polished = await callGemini(prompt)
    if (polished) {
      setReplyBody(polished)
    }
  }

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"))
    const unsubTickets = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTickets(list)
      setLoading(false)
      
      // Keep selected ticket in sync in real time
      setSelectedTicket((prev: any) => {
        if (!prev) return null
        const found = list.find(t => t.id === prev.id)
        return found || null
      })
    }, (err) => {
      console.error("Tickets listener error:", err)
      setLoading(false)
    })

    // Load admin list for assignment dropdown
    const unsubAdmins = onSnapshot(collection(db, "admins"), (snap) => {
      setAdminsList(snap.docs.map(d => d.data()))
    })

    return () => {
      unsubTickets()
      unsubAdmins()
    }
  }, [])

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "tickets", id), { status: newStatus })
    } catch (err) {
      console.error(err)
    }
  }

  const openTicketDetails = async (ticket: any) => {
    setSelectedTicket(ticket)
    setReplyBody("")
    setTicketUser(null)
    
    // Look up user details in real-time
    try {
      const qUser = query(collection(db, "users"), where("email", "==", ticket.email))
      const userSnap = await getDocs(qUser)
      if (!userSnap.empty) {
        setTicketUser(userSnap.docs[0].data())
      }
    } catch (err) {
      console.error("Failed to load user document for ticket:", err)
    }
  }

  const handleAssign = async (adminUid: string) => {
    if (!selectedTicket) return
    try {
      const updates: any = { assignedTo: adminUid }
      // Auto-transition OPEN status to IN_PROGRESS on assignment
      if (selectedTicket.status === "OPEN" && adminUid) {
        updates.status = "IN_PROGRESS"
      }
      await updateDoc(doc(db, "tickets", selectedTicket.id), updates)
    } catch (err) {
      console.error(err)
    }
  }

  const handleClaimTicket = async () => {
    if (!selectedTicket || !adminData) return
    try {
      const updates: any = { assignedTo: adminData.uid }
      // Auto-transition OPEN status to IN_PROGRESS on claim
      if (selectedTicket.status === "OPEN") {
        updates.status = "IN_PROGRESS"
      }
      await updateDoc(doc(db, "tickets", selectedTicket.id), updates)
      
      // Log activity
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData.uid,
        actorName: adminData.displayName || "Support",
        actorRole: adminData.role || "SUPPORT",
        action: "TICKET_CLAIM",
        target: selectedTicket.id,
        description: `Claimed ticket: "${selectedTicket.subject}"`,
        timestamp: Date.now()
      })
    } catch (err) {
      console.error("Failed to claim ticket:", err)
    }
  }

  const handleReply = async () => {
    if (!selectedTicket || !replyBody.trim()) return
    try {
      const newReply = {
        sender: 'admin',
        message: replyBody.trim(),
        timestamp: Date.now(),
        senderName: adminData?.displayName || "Support"
      }
      
      const updatedReplies = [...(selectedTicket.replies || []), newReply]

      await updateDoc(doc(db, "tickets", selectedTicket.id), {
        status: "RESOLVED",
        adminReply: replyBody.trim(),
        repliedAt: Date.now(),
        repliedBy: adminData?.displayName || "Support",
        replies: updatedReplies
      })

      // Log activity
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Support",
        actorRole: adminData?.role || "SUPPORT",
        action: "TICKET_REPLY",
        target: selectedTicket.id,
        description: `Replied and resolved ticket: "${selectedTicket.subject}"`,
        timestamp: Date.now()
      })

      setReplyBody("")
      alert("Reply sent and ticket resolved.")
    } catch (err) {
      console.error(err)
      alert("Failed to submit reply.")
    }
  }

  const filteredTickets = tickets.filter(t => {
    if (filter !== "all" && t.status !== filter) return false
    if (search && !(t.email?.toLowerCase().includes(search.toLowerCase()) || t.subject?.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  // Priority calculations
  const getTicketPriority = (plan: string) => {
    if (plan === "super") return { label: "High Priority", color: "bg-red-500/10 text-red-400 border-red-500/20" }
    if (plan === "pro") return { label: "Medium Priority", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" }
    if (plan === "recovery_pass") return { label: "Normal Priority", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" }
    return { label: "Low Priority", color: "bg-zinc-800 text-zinc-500 border-zinc-700" }
  }

  const activePriority = ticketUser ? getTicketPriority(ticketUser.plan || "free") : getTicketPriority("free")

  return (
    <div className="relative font-sans text-zinc-100">
      
      {/* HEADER SECTION */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Inbox className="w-6 h-6 text-indigo-400" /> Support Queue
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Manage user support tickets, prioritize claims, and assign cases.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search subject or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-indigo-500 w-64 focus:bg-zinc-950 transition-colors"
            />
          </div>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* TICKETS TABLE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="px-6 py-3.5 font-medium">Ticket / Subject</th>
              <th className="px-6 py-3.5 font-medium">User Email</th>
              <th className="px-6 py-3.5 font-medium">Created At</th>
              <th className="px-6 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Loading tickets...</td>
              </tr>
            ) : filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                  <AlertCircle className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  No tickets found in the queue.
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => (
                <tr 
                  key={t.id} 
                  onClick={() => openTicketDetails(t)}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-zinc-200 mb-0.5 max-w-[300px] truncate" title={t.subject}>
                      {t.subject}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono font-bold">{t.ticketId || `#${t.id.slice(0, 8)}`}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-zinc-300 font-medium">{t.email}</div>
                  </td>
                  <td className="px-6 py-4 text-zinc-400 text-xs">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      t.status === 'OPEN' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      t.status === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      t.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <select 
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded text-xs px-2.5 py-1 text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="RESOLVED">Resolve</option>
                      <option value="CLOSED">Close</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* SLIDING DETAILS DRAWER PANEL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop blur clickoff */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedTicket(null)}
          />

          {/* Sliding Content Card */}
          <div className="relative w-full max-w-lg bg-zinc-950 border-l border-zinc-800/80 h-full flex flex-col z-10 shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-6 border-b border-zinc-900 bg-zinc-950 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Ticket Details ({selectedTicket.ticketId || `#${selectedTicket.id.slice(0, 8)}`})
                </h3>
                <span className="font-mono text-[9px] text-zinc-500">Firestore Doc ID: {selectedTicket.id}</span>
              </div>
              <button 
                onClick={() => setSelectedTicket(null)}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-900 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable details */}
            <div className="flex-grow p-6 overflow-y-auto space-y-6">
              
              {/* Profile card & Priority */}
              <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 uppercase">Submitter</h4>
                    <div className="text-sm font-bold text-zinc-200 mt-0.5 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-zinc-500" /> {selectedTicket.email}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${activePriority.color}`}>
                    {activePriority.label}
                  </span>
                </div>
                
                {ticketUser && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500">
                    <div>User Plan: <span className="text-zinc-300 font-bold uppercase">{ticketUser.plan || "free"}</span></div>
                    <div>Files Restored: <span className="text-zinc-300 font-bold">{(ticketUser.totalFilesProcessed || 0).toLocaleString()}</span></div>
                    {ticketUser.username && (
                      <div className="col-span-2">Username: <span className="text-zinc-300 font-semibold font-mono">@{ticketUser.username}</span></div>
                    )}
                    {(ticketUser.firstName || ticketUser.lastName) && (
                      <div className="col-span-2">Name: <span className="text-zinc-300 font-semibold">{ticketUser.firstName} {ticketUser.lastName}</span></div>
                    )}
                  </div>
                )}
              </div>

              {/* Message Details */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 uppercase">Subject & Description</h4>
                <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
                  <div className="font-bold text-white text-sm mb-2 leading-snug">{selectedTicket.subject}</div>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans italic">
                    "{selectedTicket.message || "No description provided."}"
                  </p>
                  <div className="text-[10px] text-zinc-500 mt-4 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-600" /> Raised at: {new Date(selectedTicket.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Support Team Assignee */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 uppercase">Assigned Agent</h4>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <select
                      value={selectedTicket.assignedTo || ""}
                      onChange={(e) => handleAssign(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Unassigned --</option>
                      {adminsList
                        .filter(a => ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(a.role))
                        .map(a => (
                          <option key={a.uid} value={a.uid}>{a.displayName} ({a.role.replace("_", " ")})</option>
                        ))
                      }
                    </select>
                  </div>
                  {(!selectedTicket.assignedTo || selectedTicket.assignedTo !== adminData?.uid) && adminData && (
                    <button
                      onClick={handleClaimTicket}
                      className="px-3.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded-lg transition-all"
                    >
                      Claim
                    </button>
                  )}
                </div>
              </div>

              {/* Conversation History / Thread */}
              {((selectedTicket.adminReply && (!selectedTicket.replies || selectedTicket.replies.length === 0)) || (selectedTicket.replies && selectedTicket.replies.length > 0)) && (
                <div className="space-y-3 pt-4 border-t border-zinc-900">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase">Conversation History</h4>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {selectedTicket.adminReply && (!selectedTicket.replies || selectedTicket.replies.length === 0) && (
                      <div className="bg-indigo-500/5 border border-indigo-500/20 p-3.5 rounded-xl ml-6">
                        <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Developer Reply Sent (Legacy)</div>
                        <p className="text-xs text-zinc-300 leading-relaxed font-sans">{selectedTicket.adminReply}</p>
                        <div className="text-[9px] text-zinc-500 mt-2 font-mono">Replied by {selectedTicket.repliedBy || "Support"}</div>
                      </div>
                    )}

                    {selectedTicket.replies && selectedTicket.replies.map((reply: any, rIdx: number) => {
                      const isUserReply = reply.sender === 'user'
                      return (
                        <div 
                          key={rIdx} 
                          className={`p-3.5 rounded-xl ${
                            isUserReply 
                              ? 'bg-zinc-900 border border-zinc-800/80 mr-6' 
                              : 'bg-indigo-500/5 border border-indigo-500/20 ml-6'
                          }`}
                        >
                          <div className={`text-[10px] font-bold uppercase mb-1 ${isUserReply ? 'text-zinc-500' : 'text-indigo-400'}`}>
                            {isUserReply ? `${reply.senderName || 'User'} (User)` : `${reply.senderName || 'Support'} (Support)`}
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap">{reply.message}</p>
                          <div className="text-[9px] text-zinc-500 mt-2 font-mono">
                            {new Date(reply.timestamp).toLocaleString()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Developer Response Area */}
              <div className="space-y-2 pt-4 border-t border-zinc-900">
                <h4 className="text-xs font-bold text-zinc-400 uppercase">developer reply</h4>
                
                {selectedTicket.status === 'CLOSED' ? (
                  <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-xs text-zinc-500 font-bold uppercase tracking-wider">
                    Ticket closed. No further replies can be sent.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea 
                        placeholder="Write response that resolves user's issue..."
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={5}
                        disabled={aiLoading}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500/80 focus:bg-zinc-950 transition-all font-sans leading-relaxed resize-none disabled:opacity-50"
                      />
                      {aiLoading && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                          <span className="text-xs font-bold text-indigo-400 animate-pulse">{aiStatus || 'Thinking...'}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Gemini AI helper buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAIDraft}
                        disabled={aiLoading}
                        className="flex-1 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        ✨ AI Draft Reply
                      </button>
                      <button
                        type="button"
                        onClick={handleAIPolish}
                        disabled={aiLoading || !replyBody.trim()}
                        className="flex-1 py-1.5 px-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        ✨ AI Polish & Refine
                      </button>
                    </div>
                    <button
                      onClick={handleReply}
                      disabled={!replyBody.trim()}
                      className="w-full h-10 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-lg border-0 shadow-lg text-xs transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Send Reply & Resolve Ticket
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
