/**
 * Admin invite notification sender.
 * Handles two channels simultaneously:
 *  1. Firestore `notifications` collection — real-time in-app bell badge
 *  2. EmailJS — sends an email to the invited address
 *
 * EmailJS setup (free tier):
 *  - Create account at https://emailjs.com
 *  - Add a Gmail service → copy Service ID
 *  - Create an email template with variables:
 *      {{to_email}}, {{to_name}}, {{invited_by}}, {{role}}, {{invite_link}}, {{expires_at}}
 *  - Copy Template ID and Public Key
 *  - Add to .env.local:
 *      VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
 *      VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
 *      VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx
 */

import { db } from "../firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp } from "firebase/firestore";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || "";

const emailjsConfigured = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY;

// ─── In-App Notification ──────────────────────────────────────────────────────

/**
 * Writes a `notifications` Firestore document for the invited email.
 * Any logged-in user whose email matches will see this in real-time via onSnapshot.
 */
export async function createAdminInviteNotification(
  email: string,
  role: string,
  invitedByName: string,
  expiresAt: Timestamp
): Promise<void> {
  await addDoc(collection(db, "notifications"), {
    recipientEmail:  email.toLowerCase(),
    type:            "ADMIN_INVITE",
    title:           "You've been invited to the Admin Team",
    message:         `${invitedByName} has invited you to join as ${role.replace("_", " ")}. Accept within 72 hours by signing in.`,
    role,
    invitedBy:       invitedByName,
    expiresAt,
    read:            false,
    createdAt:       serverTimestamp(),
  });
}

// ─── Email Notification ───────────────────────────────────────────────────────

/**
 * Sends an invite email via EmailJS.
 * Falls back gracefully (console.warn) if env vars are not configured.
 */
export async function sendAdminInviteEmail(
  email: string,
  role: string,
  invitedByName: string,
  expiresAt: Timestamp
): Promise<{ success: boolean; error?: string }> {
  if (!emailjsConfigured) {
    console.warn(
      "[AdminNotify] EmailJS not configured. Set VITE_EMAILJS_SERVICE_ID, " +
      "VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY in .env.local to enable email delivery."
    );
    return { success: false, error: "EmailJS not configured" };
  }

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email:   email,
        to_name:    email.split("@")[0],
        invited_by: invitedByName,
        role:       role.replace("_", " "),
        invite_link: `${window.location.origin}/tool`,
        expires_at:  new Date(expiresAt.toMillis()).toLocaleString(),
      },
      EMAILJS_PUBLIC_KEY
    );
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AdminNotify] EmailJS send failed:", msg);
    return { success: false, error: msg };
  }
}

// ─── Fetch notifications for a user (by email) ───────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | null;
  expiresAt?: Timestamp | null;
}

export async function fetchUnreadNotifications(email: string): Promise<AppNotification[]> {
  try {
    const q = query(
      collection(db, "notifications"),
      where("recipientEmail", "==", email.toLowerCase()),
      where("read", "==", false)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
  } catch {
    return [];
  }
}
