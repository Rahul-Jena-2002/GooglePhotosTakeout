import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

let hasFetchedNotifications = false;

export const fetchNotificationsOnDemand = async (uid: string) => {
  if (hasFetchedNotifications) return;
  
  try {
    const q = query(
      collection(db, "tickets"),
      where("uid", "==", uid),
      where("status", "==", "RESOLVED")
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    
    const badge = document.getElementById("notification-badge");
    const label = document.getElementById("notification-count-label");
    const notifList = document.getElementById("notification-list");

    if (list.length > 0) {
      if (badge) {
        badge.innerText = String(list.length);
        badge.classList.remove("hidden");
      }
      if (label) label.innerText = `${list.length} Alert${list.length > 1 ? 's' : ''}`;
    } else {
      badge?.classList.add("hidden");
      if (label) label.innerText = "0 Alerts";
    }

    if (notifList) {
      if (list.length === 0) {
        notifList.innerHTML = `<div class="px-4 py-6 text-center text-xs text-white/50">No new notifications</div>`;
      } else {
        notifList.innerHTML = list.map(n => `
          <a href="/support?tab=tickets" class="block px-4 py-2.5 hover:bg-white/5 text-left border-b border-white/5 last:border-0 transition-colors">
            <div class="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Ticket Resolved: ${n.ticketId || n.id.slice(0, 8)}
            </div>
            <p class="text-xs text-white/60 truncate mt-0.5">${n.subject || 'resolved support ticket'}</p>
            <span class="text-[9px] text-white/30 block mt-1">Click to view resolution</span>
          </a>
        `).join("");
      }
    }
    
    hasFetchedNotifications = true;
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
};

export const bindNotificationFetch = (uid: string) => {
  const notificationBtn = document.getElementById("notification-btn");
  notificationBtn?.addEventListener("click", () => {
    fetchNotificationsOnDemand(uid);
  });
};
