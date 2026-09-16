/**
 * Real-time notification system.
 * Listens to two Firestore sources:
 *  1. `tickets` collection (RESOLVED tickets for the user)
 *  2. `notifications` collection (admin invites, system alerts, etc.)
 *
 * Both are merged and displayed in the navbar bell dropdown.
 * An onSnapshot listener is used for real-time delivery — logged-in users see
 * admin invites the moment they are created, with no page refresh required.
 */

import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp } from "firebase/firestore";

interface NotificationItem {
  id: string;
  type: "ticket_resolved" | "admin_invite" | "system";
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: number; // ms timestamp for sorting
}

let unsubTickets: (() => void) | null = null;
let unsubNotifications: (() => void) | null = null;

let ticketItems: NotificationItem[] = [];
let notifItems: NotificationItem[] = [];

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderNotifications() {
  renderAll();
}

function renderAll() {
  const all = [...notifItems, ...ticketItems].sort((a, b) => b.createdAt - a.createdAt);
  const unread = all.filter(n => !n.read);

  const badge = document.getElementById("notification-badge");
  const label = document.getElementById("notification-count-label");
  const notifList = document.getElementById("notification-list");

  if (badge) {
    if (unread.length > 0) {
      badge.innerText = String(unread.length);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  if (label) label.innerText = unread.length > 0 ? `${unread.length} New` : "Notifications";

  if (notifList) {
    if (all.length === 0) {
      notifList.innerHTML = `<div class="px-4 py-6 text-center text-xs text-white/50">No notifications</div>`;
    } else {
      notifList.innerHTML = all.map(n => {
        const dot = !n.read ? `<span class="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"></span>` : "";
        const typeLabel = n.type === "admin_invite"
          ? `<span class="text-[9px] font-bold text-indigo-400 uppercase tracking-wide">Admin Invite</span>`
          : n.type === "ticket_resolved"
          ? `<span class="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">Ticket Resolved</span>`
          : `<span class="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">System</span>`;
        return `
          <a href="${n.href}" class="block px-4 py-2.5 hover:bg-white/5 text-left border-b border-white/5 last:border-0 transition-colors" data-notif-id="${n.id}" data-notif-type="${n.type}">
            <div class="flex items-start gap-2">
              ${dot}
              <div class="flex-1 min-w-0">
                ${typeLabel}
                <div class="text-[11px] font-bold text-white truncate mt-0.5">${n.title}</div>
                <p class="text-xs text-white/60 mt-0.5 line-clamp-2">${n.body}</p>
              </div>
            </div>
          </a>
        `;
      }).join("");

      // Mark as read on click
      notifList.querySelectorAll("[data-notif-id]").forEach(el => {
        el.addEventListener("click", async () => {
          const id = (el as HTMLElement).dataset.notifId!;
          const type = (el as HTMLElement).dataset.notifType!;
          if (type !== "ticket_resolved") {
            try {
              await updateDoc(doc(db, "notifications", id), { read: true });
            } catch { /* ignore */ }
          }
        });
      });
    }
  }
}

// ─── Start real-time listeners ─────────────────────────────────────────────────

export function startNotificationListeners(uid: string, email: string) {
  stopNotificationListeners();

  // 1. Resolved support tickets
  unsubTickets = onSnapshot(
    query(collection(db, "tickets"), where("uid", "==", uid), where("status", "==", "RESOLVED")),
    snap => {
      ticketItems = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          type: "ticket_resolved",
          title: `Ticket Resolved: ${data.ticketId || d.id.slice(0, 8)}`,
          body: data.subject || "Your support ticket has been resolved.",
          href: "/support?tab=tickets",
          read: true, // tickets are always shown as read (no mark-read logic needed)
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        } as NotificationItem;
      });
      renderAll();
    },
    () => {}
  );

  // 2. Real-time notifications (admin invites, system alerts, global promo announcements)
  unsubNotifications = onSnapshot(
    query(
      collection(db, "notifications"),
      where("recipientEmail", "in", [email.toLowerCase(), "all"]),
    ),
    snap => {
      notifItems = snap.docs.map(d => {
        const data = d.data();
        const isAdminInvite = data.type === "ADMIN_INVITE";
        return {
          id: d.id,
          type: isAdminInvite ? "admin_invite" : "system",
          title: data.title || "Notification",
          body: data.message || "",
          href: isAdminInvite ? "/tool" : "/",
          read: !!data.read,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        } as NotificationItem;
      });
      renderAll();
    },
    () => {}
  );
}

export function stopNotificationListeners() {
  unsubTickets?.();
  unsubNotifications?.();
  unsubTickets = null;
  unsubNotifications = null;
  ticketItems = [];
  notifItems = [];
}

// ─── Legacy bind helper (for Astro pages that use the old API) ─────────────────

export const bindNotificationFetch = (uid: string, email?: string) => {
  if (email) {
    startNotificationListeners(uid, email);
  }
  // Notification list opens on bell click — listeners already running
};

// Keep old fetchNotificationsOnDemand as a no-op for backwards compat
export const fetchNotificationsOnDemand = async () => {};
