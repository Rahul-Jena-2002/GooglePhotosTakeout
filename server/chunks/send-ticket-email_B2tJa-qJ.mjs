globalThis.process ??= {};
globalThis.process.env ??= {};
const prerender = false;
const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const { ticketId, userEmail, userName, subject, message, recipients, fromEmail = "takeoutfix.support@gmail.com" } = body;
    if (!ticketId || !userEmail) {
      return new Response(JSON.stringify({ error: "Missing required ticket fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.log(`[API /send-ticket-email] Ticket alert received for ${ticketId} from ${userEmail}. Recipients:`, recipients);
    const emailjsServiceId = process.env.VITE_EMAILJS_SERVICE_ID || process.env.PUBLIC_EMAILJS_SERVICE_ID || "";
    const emailjsTemplateId = process.env.VITE_EMAILJS_TICKET_TEMPLATE_ID || process.env.VITE_EMAILJS_TEMPLATE_ID || "";
    const emailjsPublicKey = process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.PUBLIC_EMAILJS_PUBLIC_KEY || "";
    let serverDispatched = false;
    if (emailjsServiceId && emailjsTemplateId && emailjsPublicKey && Array.isArray(recipients)) {
      const emailResults = await Promise.allSettled(
        recipients.map(async (toEmail) => {
          const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              service_id: emailjsServiceId,
              template_id: emailjsTemplateId,
              user_id: emailjsPublicKey,
              template_params: {
                from_name: "TakeoutFix Support Desk",
                from_email: fromEmail,
                to_email: toEmail,
                email: toEmail,
                ticket_id: ticketId,
                user_email: userEmail,
                user_name: userName,
                subject: `[New Ticket ${ticketId}] ${subject}`,
                message,
                ticket_message: message,
                created_at: (/* @__PURE__ */ new Date()).toLocaleString()
              }
            })
          });
          return res.ok;
        })
      );
      serverDispatched = emailResults.some((r) => r.status === "fulfilled");
    }
    return new Response(JSON.stringify({
      success: true,
      ticketId,
      serverDispatched,
      recipientCount: Array.isArray(recipients) ? recipients.length : 0
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[API /send-ticket-email] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
