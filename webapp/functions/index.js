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

// ─────────────────────────────────────────────────────────────────────────────
// Dodo Payments Webhook handler
// ─────────────────────────────────────────────────────────────────────────────
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
  
  if (webhookSecret !== "dodo-webhook-secret-placeholder") {
    if (!verifyDodoWebhook(req, webhookSecret)) {
      console.warn("Invalid Dodo webhook signature received.");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else {
    console.log("Placeholder secret detected. Skipping signature verification (TEST MODE).");
  }

  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: "Missing type or data in payload." });
  }

  console.log(`Processing Dodo webhook event: ${type}`);

  if (type === "payment.succeeded") {
    const userId = data.metadata?.userId || data.metadata?.userid;
    const plan = data.metadata?.plan || data.metadata?.plankey;
    const regionCode = data.metadata?.region || data.metadata?.metadata_region || "t3";

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
      const discountCode = (data.discount_code || data.coupon_code || "").toUpperCase();

      // 1. Create Transaction Document (existing behaviour preserved)
      await db.collection("transactions").doc(txId).set({
        txId,
        uid: userId,
        email: userEmail,
        displayName: userEmail.split("@")[0] || "Dodo Customer",
        plan,
        amount,
        currency,
        displayAmount: `${currency === "INR" ? "₹" : "$"}${amount}`,
        status: "succeeded",
        timestamp,
        paymentMethod: "Dodo Payments",
        cardLast4: null
      });

      // 2. Update User Document
      await db.collection("users").doc(userId).set({
        plan,
        usedBytes: 0,
        usedFiles: 0,
        expiresAt: null,
        updatedAt: timestamp
      }, { merge: true });

      // 3. Find active campaign → increment currentPurchaseCount → auto-expire if cap hit
      let activeCampaignId = null;
      try {
        const campaignsSnap = await db.collection("campaigns")
          .where("isEnabled", "==", true)
          .where("status", "==", "ACTIVE")
          .limit(1)
          .get();

        if (!campaignsSnap.empty) {
          const campaignDoc = campaignsSnap.docs[0];
          activeCampaignId = campaignDoc.id;
          const campaignRef = db.collection("campaigns").doc(campaignDoc.id);

          await db.runTransaction(async (tx) => {
            const freshSnap = await tx.get(campaignRef);
            if (freshSnap.exists) {
              const newCount = (freshSnap.data().currentPurchaseCount || 0) + 1;
              const maxLimit = freshSnap.data().maxPurchaseLimit;
              const updates = { currentPurchaseCount: newCount };
              if (maxLimit != null && newCount >= maxLimit) {
                updates.status = "EXPIRED";
                updates.isEnabled = false;
                console.log(`Campaign ${campaignDoc.id} auto-expired at limit ${maxLimit}.`);
              }
              tx.update(campaignRef, updates);
            }
          });
          console.log(`Campaign ${campaignDoc.id} purchase count incremented.`);
        }
      } catch (err) {
        console.error("Failed to update campaign purchase count:", err);
      }

      // 4. Find matching coupon → increment usedCount
      let matchedCouponId = null;
      if (discountCode) {
        try {
          const couponSnap = await db.collection("coupons")
            .where("couponCode", "==", discountCode)
            .limit(1)
            .get();
          if (!couponSnap.empty) {
            const couponDoc = couponSnap.docs[0];
            matchedCouponId = couponDoc.id;
            await db.collection("coupons").doc(couponDoc.id).update({
              usedCount: (couponDoc.data().usedCount || 0) + 1,
              updatedAt: timestamp
            });
            console.log(`Coupon ${discountCode} usedCount incremented.`);
          }
        } catch (err) {
          console.error("Failed to update coupon usedCount:", err);
        }
      }

      // 5. Write to purchase_logs collection
      await db.collection("purchase_logs").add({
        campaignId: activeCampaignId,
        couponId: matchedCouponId,
        couponCode: discountCode || null,
        productId: data.product_id || null,
        customerEmail: userEmail,
        userId,
        plan,
        regionCode,
        amount,
        currency,
        purchasedAt: timestamp,
        dodoPaymentId: txId
      });

      // 6. Admin activity log
      await db.collection("admin_activity").add({
        actorUid: userId,
        actorName: userEmail || "Dodo Customer",
        actorRole: "USER",
        action: "PURCHASE",
        target: plan,
        description: `Purchased ${plan} via Dodo Payments for ${currency} ${amount}${discountCode ? ` using coupon ${discountCode}` : ""}`,
        timestamp
      });

      console.log(`User ${userId} upgraded to ${plan}.`);
    } catch (err) {
      console.error("Failed to update user license in Firestore:", err);
      return res.status(500).json({ error: "Database update failure", message: err.message });
    }
  }

  return res.status(200).json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sync-coupon — Creates Dodo discount codes for each coupon target
// Called from Admin Panel "Sync to Dodo" button (requires API key auth below)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/sync-coupon", async (req, res) => {
  // Note: authenticateApiKey middleware is applied AFTER this route so we
  // need to manually check the key here since sync-coupon is called from frontend
  const customSecretKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key || "takeoutfix-gemini-secret-2026";
  const headerKey = req.headers["x-api-key"] || (req.headers.authorization || "").replace("Bearer ", "");
  if (!headerKey || headerKey !== customSecretKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { couponId } = req.body;
  if (!couponId) {
    return res.status(400).json({ error: "couponId is required." });
  }

  // Read Dodo API key from settings/system
  let dodoApiKey = process.env.DODO_API_KEY;
  if (!dodoApiKey) {
    try {
      const sysSnap = await db.collection("settings").doc("system").get();
      if (sysSnap.exists) dodoApiKey = sysSnap.data().dodo_api_key;
    } catch (e) {
      console.error("Failed to read Dodo API key:", e);
    }
  }
  if (!dodoApiKey) {
    return res.status(500).json({ error: "Dodo API key not configured in settings/system.dodo_api_key" });
  }

  try {
    const couponDoc = await db.collection("coupons").doc(couponId).get();
    if (!couponDoc.exists) return res.status(404).json({ error: "Coupon not found." });
    const coupon = couponDoc.data();

    const targetsSnap = await db.collection("coupons").doc(couponId).collection("targets").get();
    if (targetsSnap.empty) return res.status(400).json({ error: "No targets defined for this coupon." });

    const https = require("https");
    const isDodoTestMode = process.env.DODO_TEST_MODE === "true";
    const dodoHost = isDodoTestMode ? "test.api.dodopayments.com" : "api.dodopayments.com";
    const results = [];

    for (const targetDoc of targetsSnap.docs) {
      const target = targetDoc.data();
      const { regionCode, planCode } = target;

      // Look up Dodo Product ID from dodo_products collection
      const productQuery = await db.collection("dodo_products")
        .where("regionCode", "==", regionCode)
        .where("planCode", "==", planCode)
        .limit(1)
        .get();

      if (productQuery.empty) {
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: `No dodo_product found for ${regionCode}/${planCode}`,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, status: "FAILED", error: "No product found" });
        continue;
      }

      const productId = productQuery.docs[0].data().productId;

      const dodoPayload = JSON.stringify({
        code: coupon.couponCode,
        discount_type: coupon.discountType === "PERCENTAGE" ? "percentage" : "fixed",
        discount_value: coupon.discountValue,
        product_id: productId,
        max_redemptions: coupon.usageLimit || null,
        expires_at: coupon.validUntil
          ? new Date(coupon.validUntil.seconds ? coupon.validUntil.seconds * 1000 : coupon.validUntil).toISOString()
          : null
      });

      try {
        const dodoResponse = await new Promise((resolve, reject) => {
          const options = {
            hostname: dodoHost,
            path: "/discounts",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dodoApiKey}`,
              "Content-Length": Buffer.byteLength(dodoPayload)
            }
          };
          const request = https.request(options, (response) => {
            let body = "";
            response.on("data", (chunk) => { body += chunk; });
            response.on("end", () => resolve({ statusCode: response.statusCode, body }));
          });
          request.on("error", reject);
          request.write(dodoPayload);
          request.end();
        });

        let parsed = {};
        try { parsed = JSON.parse(dodoResponse.body); } catch (_) {}
        const dodoCouponId = parsed.id || parsed.discount_id || null;
        const isSuccess = dodoResponse.statusCode < 300;

        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode, productId,
          dodoCouponId,
          syncStatus: isSuccess ? "SUCCESS" : "FAILED",
          errorMessage: isSuccess ? null : dodoResponse.body,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? "SUCCESS" : "FAILED" });
      } catch (apiErr) {
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode, productId,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: apiErr.message,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, productId, status: "FAILED", error: apiErr.message });
      }
    }

    return res.json({ success: true, couponId, results });
  } catch (err) {
    console.error("sync-coupon error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.use(authenticateApiKey);

/**
 * Helper: Find a user document in Firestore by UID or Email
 */
const findUser = async (identifier) => {
  if (!identifier) return null;
  
  const userDoc = await db.collection("users").doc(identifier).get();
  if (userDoc.exists) {
    return { id: userDoc.id, data: userDoc.data() };
  }
  
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
        
        const usedBytes = Math.max(user.data.usedBytes || 0, user.data.totalBytesProcessed || 0, user.data.lifetimeBytes || 0);
        const usedFiles = Math.max(user.data.totalFilesProcessed || 0, user.data.usedFiles || 0, user.data.lifetimeFiles || 0);
        
        return res.json({
          uid: user.id,
          email: user.data.email,
          displayName: user.data.displayName || "Unknown",
          plan: user.data.plan || "free",
          suspended: !!user.data.suspended,
          usedBytes,
          usedFiles,
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
        
        const validPlans = ["free", "single_pass", "pro", "super"];
        if (!validPlans.includes(newPlan.toLowerCase())) {
          return res.status(400).json({ error: `Invalid plan. Must be one of: ${validPlans.join(", ")}` });
        }
        
        const user = await findUser(emailOrUid);
        if (!user) {
          return res.status(404).json({ error: `User '${emailOrUid}' not found.` });
        }
        
        const planNormalized = newPlan.toLowerCase();
        
        await db.collection("users").doc(user.id).update({
          plan: planNormalized,
          usedBytes: 0,
          usedFiles: 0
        });
        
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
          transactionId
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
        
        return res.json({ count: tickets.length, tickets });
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
          status,
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
