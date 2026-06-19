import React, { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, onSnapshot, collection, addDoc } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Shield, Settings, MessageSquare, ChevronUp, ChevronDown, Plus, Trash2, X } from "lucide-react"
import { useToastStore } from "../store/useToastStore"

export default function AdminSettings() {
  const { adminData } = useAuth()

  // ─── FAQ ──────────────────────────────────────────────────────────────────
  interface FaqItem { id: string; question: string; answer: string; tag: string; }
  const FAQ_TAGS = ["Guide","Metadata","Privacy","Pricing","Billing","Formats","About","Problem","Limits","Feature","Technical","General"] as const;
  const DEFAULT_FAQS: FaqItem[] = [
    { id: "download-takeout", tag: "Guide",    question: "How do I download my Google Takeout?",                                                        answer: "Go to takeout.google.com, select Google Photos, and create an export. Once finished, download and unzip the folder." },
    { id: "missing-dates",   tag: "Metadata", question: "Why are my photos missing dates?",                                                              answer: "Google removes EXIF metadata when you download through Takeout. Instead, it places the data in separate JSON sidecar files. TakeoutFix merges these files back together." },
    { id: "upload-privacy",  tag: "Privacy",  question: "Does TakeoutFix upload my photos?",                                                             answer: "No. Everything is processed 100% locally on your machine. Your photos never leave your device." },
    { id: "free-limit",      tag: "Pricing",  question: "Is there a limit on the free plan?",                                                            answer: "Yes, the free plan processes up to 500 MB or 250 files to let you test the tool. Upgrading removes this limit." },
    { id: "refund-policy",   tag: "Billing",  question: "What is your refund policy?",                                                                   answer: "We want you to have a great experience with Takeout Fix. If you experience a genuine technical issue that prevents the software from working as described, and our support team is unable to resolve it, you may request a refund within 7 days of purchase. See our Refund Policy page for full details." },
    { id: "server-upload",   tag: "Privacy",  question: "Are my photos uploaded to your servers?",                                                       answer: "No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos and metadata never leave your computer." },
    { id: "offline-work",    tag: "Privacy",  question: "Does this work completely offline?",                                                            answer: "Once the web app has loaded in your browser, you can disconnect from the internet and it will still process all your files locally." },
    { id: "out-of-order",    tag: "Metadata", question: "Why are my photos showing today's date or out of order after exporting from Google Takeout?",   answer: "When you export your photos, Google Photos separates the EXIF metadata into separate JSON sidecar files. Without this metadata, your phone or computer defaults to showing today's date (the file modification date), causing your gallery to be completely out of order. TakeoutFix fixes this by merging the JSON sidecars back into your images." },
    { id: "metadata-types",  tag: "Metadata", question: "What metadata can be recovered?",                                                               answer: "We recover original creation dates (timestamps), GPS coordinates (latitude, longitude, altitude), and camera device information if it exists in the Google JSON sidecars." },
    { id: "video-support",   tag: "Formats",  question: "Does it support videos?",                                                                       answer: "Yes! We support .mp4 and .mov files alongside standard image formats like .jpg, .heic, and .png." },
    { id: "no-install",      tag: "About",    question: "Can I fix Google Takeout metadata online without downloading any software?",                     answer: "Yes! TakeoutFix is a browser-based, no-install Google Takeout fixer tool. It does not require any software downloads or CLI commands like ExifTool. Everything runs directly inside your web browser 100% offline." },
  ];
  const [faqItems, setFaqItems] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [savingFaqs, setSavingFaqs] = useState(false);
  const [maintenance, setMaintenance] = useState(false)
  const [reviewAutoApprove, setReviewAutoApprove] = useState(true)
  const [ticketSlaHours, setTicketSlaHours] = useState("24")
  const [freeQuotaMB, setFreeQuotaMB] = useState("500")

  const [savingGlobal, setSavingGlobal] = useState(false)
  const role = adminData?.role || "ADMIN"

  // Load global settings and FAQs in real-time
  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMaintenance(data.maintenance ?? false)
        setReviewAutoApprove(data.reviewAutoApprove ?? true)
        setTicketSlaHours(String(data.ticketSlaHours ?? "24"))
        setFreeQuotaMB(String(data.freeQuotaMB ?? "500"))
      }
    }, (err) => {
      console.error("Settings listener error:", err)
    })

    const unsubFaqs = onSnapshot(doc(db, "settings", "faqs"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.items) && data.items.length > 0) {
          setFaqItems(data.items);
        }
      }
    });

    return () => {
      unsubGlobal()
      unsubFaqs()
    }
  }, [])

  // ─── FAQ handlers ─────────────────────────────────────────────────────────
  const handleSaveFaqs = async () => {
    setSavingFaqs(true);
    try {
      await setDoc(doc(db, "settings", "faqs"), { items: faqItems }, { merge: true });
      useToastStore.getState().addToast("FAQs saved successfully!", "success");
    } catch (e: any) {
      useToastStore.getState().addToast("Failed to save FAQs: " + e.message, "error");
    } finally {
      setSavingFaqs(false);
    }
  };

  const moveFaq = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= faqItems.length) return;
    setFaqItems(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  };

  const updateFaq = (idx: number, field: keyof { id:string; question:string; answer:string; tag:string }, value: string) =>
    setFaqItems(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));

  const deleteFaq = (idx: number) =>
    setFaqItems(prev => prev.filter((_, i) => i !== idx));

  const addFaq = () =>
    setFaqItems(prev => [...prev, { id: `faq-${Date.now()}`, tag: "General", question: "", answer: "" }]);

  // Ctrl+B / Cmd+B → Bold, Ctrl+I → Italic, Ctrl+U → Underline
  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;

    let wrapStart = "";
    let wrapEnd = "";

    if (e.key === "b" || e.key === "B") {
      wrapStart = "**";
      wrapEnd = "**";
    } else if (e.key === "i" || e.key === "I") {
      wrapStart = "*";
      wrapEnd = "*";
    } else if (e.key === "u" || e.key === "U") {
      wrapStart = "<u>";
      wrapEnd = "</u>";
    } else {
      return;
    }

    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end   = el.selectionEnd   ?? 0;
    const val   = el.value;
    const selection = val.slice(start, end);
    const newValue = val.slice(0, start) + wrapStart + selection + wrapEnd + val.slice(end);

    updateFaq(idx, 'answer', newValue);
    setTimeout(() => {
      el.selectionStart = start + wrapStart.length;
      el.selectionEnd   = start + wrapStart.length + selection.length;
      el.focus();
    }, 0);
  };

  const handleSaveGlobalSettings = async () => {
    setSavingGlobal(true);
    try {
      await setDoc(doc(db, "settings", "global"), {
        maintenance,
        reviewAutoApprove,
        ticketSlaHours: Number(ticketSlaHours),
        freeQuotaMB: Number(freeQuotaMB),
      }, { merge: true });

      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "GLOBAL_SETTINGS_CHANGE",
        description: `Updated global settings: Maintenance=${maintenance}, AutoApprove=${reviewAutoApprove}, SLA=${ticketSlaHours}h, FreeQuota=${freeQuotaMB}MB.`,
        timestamp: Date.now()
      });

      useToastStore.getState().addToast("System settings updated successfully.", "success");
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast("Failed to save system settings: " + err.message, "error");
    } finally {
      setSavingGlobal(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8 font-sans transition-all duration-300">
      
      {/* Heading */}
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2 text-white">
          <Settings className="w-6 h-6 text-indigo-400" /> System Settings
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Configure global maintenance toggles, auto-approve reviews, and FAQ landing list.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Maintenance & Rules */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Shield className="w-4 h-4 text-indigo-400" /> Platform Maintenance
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Temporarily gate public actions or toggle debug behaviors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Global Maintenance Mode</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Locks all public tool workspace routes for updates.</div>
              </div>
              <button 
                onClick={() => setMaintenance(!maintenance)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${maintenance ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${maintenance ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Auto-Approve Star Reviews</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Automatically publish 5-star submissions on landing section.</div>
              </div>
              <button 
                onClick={() => setReviewAutoApprove(!reviewAutoApprove)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${reviewAutoApprove ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${reviewAutoApprove ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ─── FAQ Manager ────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
            <MessageSquare className="w-4 h-4 text-cyan-400" /> FAQ Manager
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Add, edit, reorder, or remove FAQ cards shown on the landing page. Saved independently — click <strong className="text-zinc-400">Save FAQs</strong> below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1 custom-faq-scroll">
          {faqItems.map((faq, idx) => (
            <div key={faq.id} className="bg-zinc-950/40 border border-zinc-800/70 rounded-xl p-4 space-y-3">

              {/* Row header: reorder + index + tag + delete */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" onClick={() => moveFaq(idx, -1)} disabled={idx === 0}
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-all">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => moveFaq(idx, 1)} disabled={idx === faqItems.length - 1}
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-all">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                <span className="text-[10px] text-zinc-600 font-mono w-5 shrink-0 text-center">#{idx + 1}</span>

                <select value={faq.tag} onChange={(e) => updateFaq(idx, 'tag', e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer">
                  {FAQ_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <button type="button" onClick={() => deleteFaq(idx)}
                  className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Question */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block mb-1">Question</label>
                <input type="text" value={faq.question}
                  onChange={(e) => updateFaq(idx, 'question', e.target.value)}
                  placeholder="e.g. Why are my JSON metadata files missing?"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors" />
              </div>

              {/* Answer */}
              <div>
                 <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Answer</label>
                  <span className="text-[9px] text-zinc-650 bg-zinc-950 border border-zinc-850 rounded px-1.5 py-0.5 font-mono select-none">
                    Ctrl+B = <strong>bold</strong> | Ctrl+I = <em>italic</em> | Ctrl+U = <u>underline</u>
                  </span>
                </div>
                <textarea value={faq.answer}
                  onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                  onKeyDown={(e) => handleAnswerKeyDown(e, idx)}
                  placeholder="Write answer... Use Ctrl+B/I/U to format selection."
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-zinc-300 leading-relaxed focus:outline-none focus:border-cyan-500 transition-colors resize-y" />
              </div>
            </div>
          ))}
          </div>

          <button type="button" onClick={addFaq}
            className="flex items-center gap-2 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition-colors mt-1">
            <Plus className="w-3.5 h-3.5" /> Add FAQ
          </button>
        </CardContent>
      </Card>

      {/* FAQ save footer */}
      <div className="flex justify-end gap-3 border-t border-cyan-900/30 pt-4">
        <Button type="button" onClick={handleSaveFaqs} disabled={savingFaqs}
          className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-6 h-10 text-xs font-semibold rounded-xl">
          {savingFaqs ? "Saving FAQs…" : "Save FAQs"}
        </Button>
      </div>

      {/* Global save footer */}
      <div className="flex justify-end gap-3 border-t border-zinc-800 pt-6 mt-4">
        <Button 
          type="button"
          onClick={handleSaveGlobalSettings} 
          disabled={savingGlobal}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 h-10 text-xs font-semibold rounded-xl"
        >
          {savingGlobal ? "Saving System Settings..." : "Save System Settings"}
        </Button>
      </div>
    </div>
  )
}
