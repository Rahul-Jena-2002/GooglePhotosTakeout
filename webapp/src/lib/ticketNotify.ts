import { db } from "../firebase";
import { collection, addDoc, getDocs, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { getSuperAdminEmail } from "./adminAuth";

export const SUPPORT_EMAIL = "takeoutfix.support@gmail.com";

export interface TicketNotificationPayload {
  ticketId: string;
  userEmail: string;
  userName?: string;
  subject: string;
  message: string;
  ticketDocId?: string;
}

export interface TicketNotifyResult {
  success: boolean;
  recipients: string[];
  emailSent: boolean;
  inAppNotificationsCount: number;
  errors?: string[];
}

/**
 * Retrieves EmailJS credentials from Firestore settings/system with fallback to environment variables.
 */
async function getEmailCredentials(): Promise<{
  serviceId: string;
  templateId: string;
  publicKey: string;
}> {
  let serviceId =
    import.meta.env.VITE_EMAILJS_SERVICE_ID ||
    import.meta.env.PUBLIC_EMAILJS_SERVICE_ID ||
    "";
  let templateId =
    import.meta.env.VITE_EMAILJS_TICKET_TEMPLATE_ID ||
    import.meta.env.PUBLIC_EMAILJS_TICKET_TEMPLATE_ID ||
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
      if (data.emailjs_ticket_template_id) templateId = data.emailjs_ticket_template_id;
      else if (!templateId && data.emailjs_template_id) templateId = data.emailjs_template_id;
      if (data.emailjs_public_key) publicKey = data.emailjs_public_key;
    }
  } catch (err) {
    console.warn("[TicketNotify] Could not check Firestore settings/system for email keys:", err);
  }

  return { serviceId, templateId, publicKey };
}

/**
 * Dispatches email and in-app notifications whenever a support ticket is raised:
 * 1. Collects all registered admin emails from Firestore `admins` collection.
 * 2. Appends super admin email (`rahuljena.dev@gmail.com`).
 * 3. Appends `takeoutfix.support@gmail.com` ("and to itself too").
 * 4. Deduplicates into a single target recipient list.
 * 5. Sends emails from `takeoutfix.support@gmail.com` via EmailJS to all recipients.
 * 6. Creates Firestore in-app notifications for admins.
 * 7. Records an audit log entry in `admin_activity`.
 */
export async function notifyAdminsOnTicketRaised(
  payload: TicketNotificationPayload
): Promise<TicketNotifyResult> {
  const { ticketId, userEmail, userName = "Valued Customer", subject, message, ticketDocId } = payload;
  const errors: string[] = [];

  // 1. Gather all admin emails
  const adminEmails: string[] = [];
  try {
    const adminsSnap = await getDocs(collection(db, "admins"));
    adminsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.email && typeof data.email === "string") {
        adminEmails.push(data.email.trim().toLowerCase());
      }
    });
  } catch (err) {
    console.warn("[TicketNotify] Error querying admins collection:", err);
  }

  // 2. Add Super Admin and official support email
  const superAdminEmail = getSuperAdminEmail();
  const rawList = [
    SUPPORT_EMAIL.toLowerCase(),
    superAdminEmail.toLowerCase(),
    ...adminEmails,
  ];

  // Deduplicate and filter out empty
  const recipients = Array.from(new Set(rawList.filter((e) => Boolean(e) && e.includes("@"))));

  console.log(`[TicketNotify] Dispatching ticket alerts for ${ticketId} to:`, recipients);

  // 3. Create In-App Notifications for all admin recipients
  let inAppCount = 0;
  await Promise.allSettled(
    recipients.map(async (email) => {
      try {
        await addDoc(collection(db, "notifications"), {
          recipientEmail: email,
          type: "NEW_TICKET",
          title: `New Ticket: ${ticketId}`,
          message: `${userEmail} submitted: "${subject}"`,
          ticketId,
          ticketDocId: ticketDocId || "",
          userEmail,
          read: false,
          createdAt: serverTimestamp(),
          adminLink: "/admin/support",
        });
        inAppCount++;
      } catch (e: any) {
        console.warn(`[TicketNotify] Failed creating in-app notification for ${email}:`, e);
      }
    })
  );

  // 4. Log to admin_activity (Audit Logs)
  try {
    await addDoc(collection(db, "admin_activity"), {
      actorUid: "ticket_system",
      actorName: userName,
      actorRole: "USER",
      action: "TICKET_RAISED",
      target: ticketId,
      description: `New support ticket raised by ${userEmail}: "${subject}"`,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn("[TicketNotify] Failed to log admin activity:", err);
  }

  // 5. Send Emails via EmailJS
  let emailSent = false;
  try {
    const { serviceId, templateId, publicKey } = await getEmailCredentials();

    if (!serviceId || !templateId || !publicKey) {
      const missing = [
        !serviceId && "Service ID",
        !templateId && "Template ID",
        !publicKey && "Public Key",
      ]
        .filter(Boolean)
        .join(", ");
      console.info(
        `[TicketNotify] EmailJS not fully configured (missing: ${missing}). ` +
          `Set VITE_EMAILJS_* in .env or configure in Admin -> Keys & Secrets.`
      );
    } else {
      const emailjsModule = await import("@emailjs/browser");
      const emailjs = emailjsModule.default || emailjsModule;

      const adminOrigin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://takeoutfix.com";
      const adminLink = `${adminOrigin}/admin/support`;

      // Send an email to every recipient (all admins + takeoutfix.support@gmail.com itself)
      const sendResults = await Promise.allSettled(
        recipients.map(async (recipientEmail) => {
          const isSupportSelf = recipientEmail === SUPPORT_EMAIL.toLowerCase();
          const recipientName = isSupportSelf
            ? "TakeoutFix Support Desk"
            : recipientEmail.split("@")[0] || "Admin";

          return emailjs.send(
            serviceId,
            templateId,
            {
              from_name: "TakeoutFix Support Desk",
              from_email: SUPPORT_EMAIL,
              reply_to: userEmail,
              to_email: recipientEmail,
              email: recipientEmail, // alias
              recipient: recipientEmail, // alias
              to_name: recipientName,
              name: recipientName, // alias
              ticket_id: ticketId,
              ticketId: ticketId, // alias
              user_email: userEmail,
              user_name: userName,
              subject: `[New Ticket ${ticketId}] ${subject}`,
              ticket_subject: subject,
              message: message,
              ticket_message: message,
              ticket_url: adminLink,
              admin_link: adminLink,
              created_at: new Date().toLocaleString(),
            },
            publicKey
          );
        })
      );

      const successfulSends = sendResults.filter((r) => r.status === "fulfilled");
      if (successfulSends.length > 0) {
        emailSent = true;
        console.log(
          `[TicketNotify] Successfully sent ${successfulSends.length}/${recipients.length} ticket notification emails.`
        );
      }

      sendResults.forEach((res, idx) => {
        if (res.status === "rejected") {
          const errMsg = `Failed sending email to ${recipients[idx]}: ${res.reason?.message || res.reason}`;
          console.warn("[TicketNotify]", errMsg);
          errors.push(errMsg);
        }
      });
    }
  } catch (err: any) {
    const msg = `Email dispatch exception: ${err.message || String(err)}`;
    console.error("[TicketNotify]", msg);
    errors.push(msg);
  }

  // Also notify server endpoint if running
  try {
    if (typeof window !== "undefined" && window.fetch) {
      fetch("/api/send-ticket-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          userEmail,
          userName,
          subject,
          message,
          recipients,
          fromEmail: SUPPORT_EMAIL,
        }),
      }).catch(() => {
        // Non-blocking server dispatch fallback
      });
    }
  } catch {
    // Ignore server dispatch errors
  }

  return {
    success: true,
    recipients,
    emailSent,
    inAppNotificationsCount: inAppCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Dispatches real-time in-app notifications to all team members when a customer posts a follow-up reply.
 */
export async function notifyAdminsOnTicketReply(payload: {
  ticketId: string;
  userEmail: string;
  userName?: string;
  replyMessage: string;
}): Promise<void> {
  const { ticketId, userEmail, userName = "User", replyMessage } = payload;
  const adminEmails: string[] = [];

  try {
    const adminsSnap = await getDocs(collection(db, "admins"));
    adminsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.email && typeof data.email === "string") {
        adminEmails.push(data.email.trim().toLowerCase());
      }
    });
  } catch (err) {
    console.warn("[TicketNotify] Error querying admins collection:", err);
  }

  const superAdminEmail = getSuperAdminEmail();
  const rawList = [
    SUPPORT_EMAIL.toLowerCase(),
    superAdminEmail.toLowerCase(),
    ...adminEmails,
  ];
  const recipients = Array.from(new Set(rawList.filter((e) => Boolean(e) && e.includes("@"))));

  await Promise.allSettled(
    recipients.map(async (email) => {
      try {
        await addDoc(collection(db, "notifications"), {
          recipientEmail: email,
          type: "TICKET_REPLY",
          title: `Reply on Ticket ${ticketId}`,
          message: `${userName} (${userEmail}): "${replyMessage.slice(0, 100)}${replyMessage.length > 100 ? '...' : ''}"`,
          ticketId,
          userEmail,
          read: false,
          createdAt: Date.now(),
          adminLink: "/admin/support",
          href: "/admin/support",
        });
      } catch (e) {
        console.warn(`[TicketNotify] Failed creating reply notification for ${email}:`, e);
      }
    })
  );
}

/**
 * Dispatches real-time in-app notifications to all team members when user feedback is received.
 */
export async function notifyAdminsOnFeedback(payload: {
  rating: number;
  category: string;
  message: string;
  userEmail: string;
  displayName: string;
}): Promise<void> {
  const { rating, category, message, userEmail, displayName } = payload;
  const adminEmails: string[] = [];

  try {
    const adminsSnap = await getDocs(collection(db, "admins"));
    adminsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.email && typeof data.email === "string") {
        adminEmails.push(data.email.trim().toLowerCase());
      }
    });
  } catch (err) {
    console.warn("[TicketNotify] Error querying admins collection for feedback:", err);
  }

  const superAdminEmail = getSuperAdminEmail();
  const rawList = [
    SUPPORT_EMAIL.toLowerCase(),
    superAdminEmail.toLowerCase(),
    ...adminEmails,
  ];
  const recipients = Array.from(new Set(rawList.filter((e) => Boolean(e) && e.includes("@"))));

  await Promise.allSettled(
    recipients.map(async (email) => {
      try {
        await addDoc(collection(db, "notifications"), {
          recipientEmail: email,
          type: "NEW_FEEDBACK",
          title: `New Feedback (${rating}/5★ - ${category})`,
          message: `${displayName} (${userEmail}): "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
          category,
          rating,
          userEmail,
          read: false,
          createdAt: Date.now(),
          adminLink: "/admin/support",
          href: "/admin/support",
        });
      } catch (e) {
        console.warn(`[TicketNotify] Failed creating feedback notification for ${email}:`, e);
      }
    })
  );

  try {
    await addDoc(collection(db, "admin_activity"), {
      actorUid: "feedback_system",
      actorName: displayName,
      actorRole: "USER",
      action: "FEEDBACK_SUBMITTED",
      target: userEmail,
      description: `User submitted ${rating}★ feedback [${category}]: "${message.slice(0, 80)}"`,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn("[TicketNotify] Failed to log admin activity for feedback:", err);
  }
}

