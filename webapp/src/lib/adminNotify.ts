/**
 * Admin invite notification sender.
 * Handles two channels simultaneously:
 *  1. Firestore `notifications` collection — real-time in-app bell badge
 *  2. EmailJS — sends an email to the invited address
 *
 * EmailJS setup:
 *  - Configurable in Admin -> Keys & Secrets (stored in Firestore settings/system)
 *  - Or via .env.local:
 *      VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
 *      VITE_EMAILJS_INVITE_TEMPLATE_ID=template_xxxxxxx (or VITE_EMAILJS_TEMPLATE_ID)
 *      VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx
 */

import { db } from "../firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, Timestamp } from "firebase/firestore";

/**
 * Retrieves EmailJS credentials from Firestore settings/system with fallback to environment variables.
 */
export async function getEmailCredentials(): Promise<{
  serviceId: string;
  templateId: string;
  publicKey: string;
}> {
  let serviceId =
    import.meta.env.VITE_EMAILJS_SERVICE_ID ||
    import.meta.env.PUBLIC_EMAILJS_SERVICE_ID ||
    "";
  let templateId =
    import.meta.env.VITE_EMAILJS_INVITE_TEMPLATE_ID ||
    import.meta.env.PUBLIC_EMAILJS_INVITE_TEMPLATE_ID ||
    import.meta.env.VITE_EMAILJS_TEMPLATE_ID ||
    import.meta.env.PUBLIC_EMAILJS_TEMPLATE_ID ||
    "";
  let publicKey =
    import.meta.env.VITE_EMAILJS_PUBLIC_KEY ||
    import.meta.env.PUBLIC_EMAILJS_PUBLIC_KEY ||
    "";

  // Check Firestore settings/system for dynamic runtime configuration
  try {
    const sysSnap = await getDoc(doc(db, "settings", "system"));
    if (sysSnap.exists()) {
      const data = sysSnap.data();
      if (data.emailjs_service_id) serviceId = data.emailjs_service_id;
      if (data.emailjs_invite_template_id) templateId = data.emailjs_invite_template_id;
      else if (!templateId && data.emailjs_template_id) templateId = data.emailjs_template_id;
      else if (!templateId && data.emailjs_ticket_template_id) templateId = data.emailjs_ticket_template_id;
      if (data.emailjs_public_key) publicKey = data.emailjs_public_key;
    }
  } catch (err) {
    console.warn("[AdminNotify] Could not check Firestore settings/system for email keys:", err);
  }

  return { serviceId, templateId, publicKey };
}

export const isEmailConfigured = () => {
  return Boolean(
    (import.meta.env.VITE_EMAILJS_SERVICE_ID || import.meta.env.PUBLIC_EMAILJS_SERVICE_ID) &&
    (import.meta.env.VITE_EMAILJS_PUBLIC_KEY || import.meta.env.PUBLIC_EMAILJS_PUBLIC_KEY)
  );
};

// ─── In-App Notification ──────────────────────────────────────────────────────

/**
 * Writes a `notifications` Firestore document for the invited email.
 * Any logged-in user whose email matches will see this in real-time via onSnapshot.
 */
export async function createAdminInviteNotification(
  email: string,
  role: string,
  invitedByName: string,
  expiresAt: Timestamp,
  inviteId?: string,
  inviterEmail?: string
): Promise<void> {
  const origin = typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://takeoutfix.pages.dev";
  const inviteLink = inviteId
    ? `${origin}/auth?invite=${inviteId}&email=${encodeURIComponent(email)}`
    : `${origin}/auth?email=${encodeURIComponent(email)}`;

  // 1. Target Account-specific invite notification
  await addDoc(collection(db, "notifications"), {
    recipientEmail: email.toLowerCase(),
    type:           "ADMIN_INVITE",
    title:          "You've been invited to the Admin Team",
    message:        `${invitedByName} has invited you to join TakeoutFix as ${role.replace("_", " ")}. Accept within 72 hours by signing in.`,
    role,
    invitedBy:      invitedByName,
    expiresAt,
    inviteId:       inviteId || null,
    inviteLink,
    href:           "/admin/team",
    adminLink:      "/admin/team",
    read:           false,
    createdAt:      Date.now(),
  });

  // 2. Account notification for the inviter
  if (inviterEmail && inviterEmail.toLowerCase() !== email.toLowerCase()) {
    try {
      await addDoc(collection(db, "notifications"), {
        recipientEmail: inviterEmail.toLowerCase(),
        type:           "INVITE_DISPATCHED",
        title:          "Team Invitation Sent",
        message:        `Invitation dispatched to ${email} for role ${role.replace("_", " ")}.`,
        role,
        targetEmail:    email.toLowerCase(),
        href:           "/admin/team",
        adminLink:      "/admin/team",
        read:           false,
        createdAt:      Date.now(),
      });
    } catch (e) {
      console.warn("[AdminNotify] Could not create inviter confirmation notification:", e);
    }
  }
}

// ─── Email Notification ───────────────────────────────────────────────────────

/**
 * Sends an invite email via EmailJS.
 * Checks Firestore settings/system first, then falls back to VITE_ env vars.
 */
export async function sendAdminInviteEmail(
  email: string,
  role: string,
  invitedByName: string,
  expiresAt: Timestamp,
  inviteId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { serviceId, templateId, publicKey } = await getEmailCredentials();

    if (!serviceId || !templateId || !publicKey) {
      const missing = [
        !serviceId && "Service ID",
        !templateId && "Template ID",
        !publicKey && "Public Key",
      ].filter(Boolean).join(", ");
      console.warn(
        `[AdminNotify] EmailJS credentials missing (${missing}). ` +
        `Configure in Admin -> Keys & Secrets or set VITE_EMAILJS_* in .env.`
      );
      return { success: false, error: `EmailJS not configured (missing ${missing})` };
    }

    const emailjsModule = await import("@emailjs/browser");
    const emailjs = emailjsModule.default || emailjsModule;

    const origin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://takeoutfix.pages.dev";
    const inviteLink = inviteId
      ? `${origin}/auth?invite=${inviteId}&email=${encodeURIComponent(email)}`
      : `${origin}/auth?email=${encodeURIComponent(email)}`;

    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email:    email,
        email:       email,
        recipient:   email,
        to_name:     email.split("@")[0],
        name:        email.split("@")[0],
        invited_by:  invitedByName,
        inviter_name: invitedByName,
        role:        role.replace("_", " "),
        invite_link: inviteLink,
        url:         inviteLink,
        expires_at:  new Date(expiresAt.toMillis()).toLocaleString(),
      },
      publicKey
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
