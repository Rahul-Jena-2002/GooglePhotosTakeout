const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const app = express();

// Enable CORS for all origins (useful when called from AI platforms or local test environments)
app.use(cors({ origin: true }));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

/**
 * Security Middleware: Validates API Key header to prevent abuse.
 * You should set the api key in firebase functions config:
 * firebase functions:config:set gemini.key="YOUR_CUSTOM_SECRET_KEY"
 * 
 * Or set it as an environment variable in GCP Secret Manager.
 * For ease of initial setup, it looks for:
 * 1. "x-api-key" header
 * 2. "Authorization: Bearer <key>" header
 */
const authenticateApiKey = (req, res, next) => {
  const customSecretKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key || "takeoutfix-gemini-secret-2026";
  
  const headerKey = req.headers["x-api-key"];
  let bearerKey = "";
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    bearerKey = req.headers.authorization.split("Bearer ")[1];
  }
  
  const providedKey = headerKey || bearerKey;
  
  if (!providedKey || providedKey !== customSecretKey) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing API key in headers. Provide 'x-api-key' or Bearer Token."
    });
  }

  next();
};

// Verification helper for Dodo Payments Webhooks (Standard Webhooks Specification)
const verifyDodoWebhook = (req, webhookSecret) => {
  const webhookId = req.headers["webhook-id"];
  const webhookTimestamp = req.headers["webhook-timestamp"];
  const webhookSignature = req.headers["webhook-signature"];

  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSecret) {
    return false;
  }

  // Remove "whsec_" prefix if present, and decode from base64
  let secretStr = webhookSecret;
  if (secretStr.startsWith("whsec_")) {
    secretStr = secretStr.substring(6);
  }
  
  let secretBuffer;
  try {
    secretBuffer = Buffer.from(secretStr, "base64");
  } catch (err) {
    console.error("Failed to decode webhook secret from base64:", err);
    return false;
  }

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  const crypto = require("crypto");
  const computedHash = crypto
    .createHmac("sha256", secretBuffer)
    .update(signedContent)
    .digest("base64");

  const signatures = webhookSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts.length === 2 && parts[0] === "v1") {
      const signatureHash = parts[1];
      const computedBuffer = Buffer.from(computedHash);
      const signatureBuffer = Buffer.from(signatureHash);
      if (computedBuffer.length === signatureBuffer.length && 
          crypto.timingSafeEqual(computedBuffer, signatureBuffer)) {
        return true;
      }
    }
  }

  return false;
};

// Dodo Payments Webhook handler
app.post("/dodo-webhook", async (req, res) => {
  let webhookSecret = process.env.DODO_WEBHOOK_KEY || functions.config().dodo?.webhook_key;
  
  if (!webhookSecret) {
    try {
      const secureSnap = await db.collection("settings").doc("secure").get();
      if (secureSnap.exists) {
        webhookSecret = secureSnap.data().dodo_webhook_key;
      }
    } catch (err) {
      console.error("Failed to read secure settings from Firestore:", err);
    }
  }
  
  if (!webhookSecret) {
    webhookSecret = "dodo-webhook-secret-placeholder";
  }
  
  // Verify signature unless in placeholder test mode
  if (webhookSecret !== "dodo-webhook-secret-placeholder") {
    if (!verifyDodoWebhook(req, webhookSecret)) {
      console.warn("Invalid Dodo webhook signature received.");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else {
    console.log("Placeholder secret detected. Skipping Dodo webhook signature verification (TEST MODE).");
  }

  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: "Missing type or data in payload." });
  }

  console.log(`Processing Dodo webhook event: ${type}`);

  if (type === "payment.succeeded") {
    const userId = data.metadata?.userId || data.metadata?.userid;
    const plan = data.metadata?.plan || data.metadata?.plankey;

    if (!userId || !plan) {
      console.error("Missing userId or plan in payment metadata:", data.metadata);
      return res.status(400).json({ error: "Missing metadata fields userId/plan in payload." });
    }

    try {
      const timestamp = Date.now();
      const txId = data.payment_id || `TXN-DODO-${timestamp}`;
      const userEmail = data.customer?.email || "";
      const amount = data.total_amount || 0;
      const currency = data.currency || "USD";

      // 1. Create Transaction Document
      await db.collection("transactions").doc(txId).set({
        txId,
        uid: userId,
        email: userEmail,
        displayName: userEmail.split("@")[0] || "Dodo Customer",
        plan: plan,
        amount: amount,
        currency: currency,
        displayAmount: `${currency === "INR" ? "₹" : "$"}${amount}`,
        status: "succeeded",
        timestamp,
        paymentMethod: "Dodo Payments",
        cardLast4: null
      });

      // 2. Update User Document plan details & reset usage
      const expiresAt = plan === "recovery_pass" ? timestamp + (24 * 60 * 60 * 1000) : null;
      await db.collection("users").doc(userId).set({
        plan: plan,
        usedBytes: 0,
        usedFiles: 0,
        expiresAt,
        updatedAt: timestamp
      }, { merge: true });

      // 3. Add Log in Admin Activity feed
      await db.collection("admin_activity").add({
        actorUid: userId,
        actorName: userEmail || "Dodo Customer",
        actorRole: "USER",
        action: "PURCHASE",
        target: plan,
        description: `Purchased ${plan} via Dodo Payments for ${currency} ${amount}`,
        timestamp
      });

      console.log(`User ${userId} successfully upgraded to ${plan} plan.`);
    } catch (err) {
      console.error("Failed to update user license in Firestore:", err);
      return res.status(500).json({ error: "Database update failure", message: err.message });
    }
  }

  return res.status(200).json({ received: true });
});

app.use(authenticateApiKey);

/**
 * Helper: Find a user document in Firestore by UID or Email
 */
const findUser = async (identifier) => {
  if (!identifier) return null;
  
  // Try finding by UID first
  const userDoc = await db.collection("users").doc(identifier).get();
  if (userDoc.exists) {
    return { id: userDoc.id, data: userDoc.data() };
  }
  
  // Fallback: search by email
  const userQuery = await db.collection("users")
    .where("email", "==", identifier)
    .limit(1)
    .get();
    
  if (!userQuery.empty) {
    const doc = userQuery.docs[0];
    return { id: doc.id, data: doc.data() };
  }
  
  return null;
};

/**
 * Helper: Log admin actions to /admin_activity
 */
const logAdminActivity = async (action, targetUid, description) => {
  try {
    await db.collection("admin_activity").add({
      actorUid: "GEMINI_AI_CONNECTOR",
      actorName: "Gemini AI Studio Agent",
      actorRole: "SUPER_ADMIN",
      action: action,
      target: targetUid,
      description: description,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Failed to log admin activity:", error);
  }
};

/**
 * Endpoint: POST /execute
 * Routes incoming tool calls from Gemini AI Studio.
 */
app.post("/execute", async (req, res) => {
  const { functionName, arguments: args } = req.body;
  
  if (!functionName) {
    return res.status(400).json({ error: "Missing functionName in request body." });
  }
  
  try {
    switch (functionName) {
      
      // 1. Get User Quota, Subscription & Stats
      case "getUserStats": {
        const { emailOrUid } = args || {};
        if (!emailOrUid) {
          return res.status(400).json({ error: "Argument 'emailOrUid' is required." });
        }
        
        const user = await findUser(emailOrUid);
        if (!user) {
          return res.status(404).json({ error: `User with identifier '${emailOrUid}' not found.` });
        }
        
        // Calculate cumulative limits
        const usedBytes = Math.max(user.data.usedBytes || 0, user.data.totalBytesProcessed || 0, user.data.lifetimeBytes || 0);
        const usedFiles = Math.max(user.data.totalFilesProcessed || 0, user.data.usedFiles || 0, user.data.lifetimeFiles || 0);
        
        return res.json({
          uid: user.id,
          email: user.data.email,
          displayName: user.data.displayName || "Unknown",
          plan: user.data.plan || "free",
          suspended: !!user.data.suspended,
          usedBytes: usedBytes,
          usedFiles: usedFiles,
          rawTelemetry: {
            usedBytes: user.data.usedBytes || 0,
            usedFiles: user.data.usedFiles || 0,
            totalBytesProcessed: user.data.totalBytesProcessed || 0,
            totalFilesProcessed: user.data.totalFilesProcessed || 0,
            lifetimeBytes: user.data.lifetimeBytes || 0,
            lifetimeFiles: user.data.lifetimeFiles || 0
          },
          sessionCount: (user.data.sessionIds || []).length,
          createdAt: user.data.createdAt || null
        });
      }
      
      // 2. Update Subscription Plan
      case "updateUserPlan": {
        const { emailOrUid, newPlan } = args || {};
        if (!emailOrUid || !newPlan) {
          return res.status(400).json({ error: "Arguments 'emailOrUid' and 'newPlan' are required." });
        }
        
        const validPlans = ["free", "single_pass", "pro", "super", "family"];
        if (!validPlans.includes(newPlan.toLowerCase())) {
          return res.status(400).json({ error: `Invalid plan. Must be one of: ${validPlans.join(", ")}` });
        }
        
        const user = await findUser(emailOrUid);
        if (!user) {
          return res.status(404).json({ error: `User '${emailOrUid}' not found.` });
        }
        
        const planNormalized = newPlan.toLowerCase();
        
        // Update user record and reset active sessions counters
        await db.collection("users").doc(user.id).update({
          plan: planNormalized,
          usedBytes: 0,
          usedFiles: 0
        });
        
        // Generate ₹0 Admin Grant transaction receipt
        const transactionId = `TXN-ADM-${Date.now()}`;
        await db.collection("transactions").doc(transactionId).set({
          uid: user.id,
          email: user.data.email,
          amount: 0,
          currency: "INR",
          status: "SUCCESS",
          plan: planNormalized,
          type: "ADMIN_GRANT",
          timestamp: Date.now()
        });
        
        await logAdminActivity(
          "UPDATE_PLAN", 
          user.id, 
          `Plan updated to ${planNormalized} and usage counters reset via Gemini AI Studio.`
        );
        
        return res.json({
          success: true,
          message: `User '${user.data.email}' updated to '${planNormalized}' plan. Usage counters reset to 0.`,
          transactionId: transactionId
        });
      }
      
      // 3. Suspend / Unsuspend User
      case "toggleUserSuspension": {
        const { emailOrUid, suspend } = args || {};
        if (!emailOrUid || suspend === undefined) {
          return res.status(400).json({ error: "Arguments 'emailOrUid' and 'suspend' (boolean) are required." });
        }
        
        const user = await findUser(emailOrUid);
        if (!user) {
          return res.status(404).json({ error: `User '${emailOrUid}' not found.` });
        }
        
        const isSuspended = !!suspend;
        await db.collection("users").doc(user.id).update({
          suspended: isSuspended
        });
        
        await logAdminActivity(
          isSuspended ? "SUSPEND_USER" : "UNSUSPEND_USER",
          user.id,
          `User account suspension status toggled to ${isSuspended} via Gemini AI Studio.`
        );
        
        return res.json({
          success: true,
          message: `User '${user.data.email}' suspension status set to ${isSuspended}.`
        });
      }
      
      // 4. Retrieve Support Tickets
      case "getSupportTickets": {
        const { status } = args || {};
        let query = db.collection("tickets");
        
        if (status) {
          query = query.where("status", "==", status.toUpperCase());
        }
        
        const ticketDocs = await query.orderBy("timestamp", "desc").limit(20).get();
        const tickets = [];
        
        ticketDocs.forEach(doc => {
          tickets.push({ id: doc.id, ...doc.data() });
        });
        
        return res.json({ count: tickets.length, tickets: tickets });
      }
      
      // 5. Reply & Close Ticket
      case "replyToTicket": {
        const { ticketId, replyText, resolve } = args || {};
        if (!ticketId || !replyText) {
          return res.status(400).json({ error: "Arguments 'ticketId' and 'replyText' are required." });
        }
        
        const ticketDoc = await db.collection("tickets").doc(ticketId).get();
        if (!ticketDoc.exists) {
          return res.status(404).json({ error: `Ticket with ID '${ticketId}' not found.` });
        }
        
        const status = resolve ? "RESOLVED" : "ANSWERED";
        
        await db.collection("tickets").doc(ticketId).update({
          response: replyText,
          status: status,
          repliedAt: Date.now()
        });
        
        await logAdminActivity(
          "REPLY_TICKET",
          ticketDoc.data().uid,
          `Replied to ticket ${ticketId}. Status updated to ${status} via Gemini AI Studio.`
        );
        
        return res.json({
          success: true,
          message: `Successfully replied to ticket ${ticketId}. Status set to ${status}.`
        });
      }
      
      default:
        return res.status(404).json({
          error: `Function '${functionName}' not implemented in this gateway.`
        });
    }
  } catch (error) {
    console.error("Execution error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message
    });
  }
});

// Expose HTTPS Cloud Function
exports.geminiToolGateway = functions.https.onRequest(app);
