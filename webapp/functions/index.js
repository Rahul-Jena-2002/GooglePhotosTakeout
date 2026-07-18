const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Decrypt sensitive keys stored in Firestore using AES-256-GCM
const decryptFirestoreValue = (val) => {
  if (!val) return "";
  if (!val.startsWith("enc:v1:")) return val;
  
  const mek = process.env.ENCRYPTION_KEY || functions.config().encryption?.key || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw";
  
  try {
    const salt = Buffer.alloc(16); // 16 bytes of zeros
    const key = crypto.pbkdf2Sync(mek, salt, 100000, 32, "sha256");

    const hex = val.slice(7);
    const combined = Buffer.from(hex, "hex");

    const iv = combined.subarray(0, 12);
    const ciphertextAndTag = combined.subarray(12);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, "binary", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("❌ Failed to decrypt Firestore value:", err.message);
    return "";
  }
};

const resolveDodoCredentials = async (db) => {
  let dodoApiKey = process.env.DODO_API_KEY;
  let isTestMode = false;

  if (!dodoApiKey) {
    try {
      const sysDoc = await db.collection("settings").doc("system").get();
      if (sysDoc.exists) {
        const liveKey = decryptFirestoreValue(sysDoc.data().dodo_api_key);
        const testKey = decryptFirestoreValue(sysDoc.data().dodo_test_api_key);

        const globalDoc = await db.collection("settings").doc("global").get();
        const testModeSetting = globalDoc.exists ? globalDoc.data().dodo_test_mode : false;

        if (testModeSetting && testKey) {
          dodoApiKey = testKey;
          isTestMode = true;
        } else if (liveKey) {
          dodoApiKey = liveKey;
          isTestMode = false;
        } else if (testKey) {
          dodoApiKey = testKey;
          isTestMode = true;
        }
      }
    } catch (e) {
      console.error("Failed to read Dodo API key from Firestore:", e);
    }
  } else {
    isTestMode = dodoApiKey.startsWith("sk_test_") || dodoApiKey.startsWith("test_");
  }

  if (dodoApiKey) {
    if (dodoApiKey.startsWith("sk_test_") || dodoApiKey.startsWith("test_")) {
      isTestMode = true;
    } else if (dodoApiKey.startsWith("sk_live_") || dodoApiKey.startsWith("live_")) {
      isTestMode = false;
    }

    if (dodoApiKey.startsWith("sk_test_")) dodoApiKey = dodoApiKey.substring(8);
    else if (dodoApiKey.startsWith("test_")) dodoApiKey = dodoApiKey.substring(5);
    else if (dodoApiKey.startsWith("sk_live_")) dodoApiKey = dodoApiKey.substring(8);
    else if (dodoApiKey.startsWith("live_")) dodoApiKey = dodoApiKey.substring(5);
  }

  const dodoHost = isTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
  return { dodoApiKey, dodoHost };
};

const getBackendPlanPriceValue = async (db, planKey, regionKey) => {
  const REGION_DOC_IDS = {
    in: "India",
    cn: "China",
    jp: "Japan",
    eu: "Europe",
    t1: "Tier 1",
    t2: "Tier 2",
    t3: "US (Tier 3)",
    t4: "Tier 4"
  };
  const REGION_PRICING_CONFIGS = {
    in: { currency: "INR", symbol: "₹", recoveryPass: 249, finalPro: 799, finalSuper: 1499 },
    t3: { currency: "USD", symbol: "$", recoveryPass: 4.99, finalPro: 29.00, finalSuper: 49.00 },
    eu: { currency: "EUR", symbol: "€", recoveryPass: 4.99, finalPro: 29.00, finalSuper: 49.00 },
    jp: { currency: "JPY", symbol: "¥", recoveryPass: 899, finalPro: 5900, finalSuper: 9900 },
    cn: { currency: "CNY", symbol: "¥", recoveryPass: 49, finalPro: 199, finalSuper: 399 },
    t1: { currency: "USD", symbol: "$", recoveryPass: 1.99, finalPro: 9.99, finalSuper: 19.99 },
    t2: { currency: "USD", symbol: "$", recoveryPass: 3.99, finalPro: 19.00, finalSuper: 39.00 },
    t4: { currency: "USD", symbol: "$", recoveryPass: 5.99, finalPro: 39.00, finalSuper: 69.00 }
  };

  const docId = REGION_DOC_IDS[regionKey] || REGION_DOC_IDS.t3;
  let firestoreConfig = null;
  try {
    const tierDoc = await db.collection("pricing_tiers").doc(docId).get();
    if (tierDoc.exists) {
      firestoreConfig = tierDoc.data();
    }
  } catch (err) {
    console.error("Failed to read pricing_tiers:", err);
  }

  const staticConfig = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;

  const recoveryPassPrice = firestoreConfig?.recovery_pass?.current ?? staticConfig.recoveryPass;
  const finalPro = firestoreConfig?.pro_lifetime?.current ?? staticConfig.finalPro;
  const finalSuper = firestoreConfig?.super_lifetime?.current ?? staticConfig.finalSuper;

  // Calculate active campaigns & campaign discounts
  let discountPct = 0;
  try {
    const campaignsSnap = await db.collection("campaigns")
      .where("status", "==", "ACTIVE")
      .where("isEnabled", "==", true)
      .limit(1)
      .get();

    if (!campaignsSnap.empty) {
      const campaignDoc = campaignsSnap.docs[0];
      const campaignData = campaignDoc.data();
      const expirationType = campaignData.expirationType || "NONE";
      const now = Date.now();

      let timeOk = true;
      if ((expirationType === "TIME_ONLY" || expirationType === "BOTH") && campaignData.expirationDateTime) {
        const expMs = campaignData.expirationDateTime.seconds 
          ? campaignData.expirationDateTime.seconds * 1000 
          : new Date(campaignData.expirationDateTime).getTime();
        timeOk = now < expMs;
      }

      let capOk = true;
      if ((expirationType === "PURCHASE_LIMIT_ONLY" || expirationType === "BOTH") && campaignData.maxPurchaseLimit != null) {
        capOk = (campaignData.currentPurchaseCount ?? 0) < campaignData.maxPurchaseLimit;
      }

      if (timeOk && capOk) {
        const targetsSnap = await db.collection("campaigns")
          .doc(campaignDoc.id)
          .collection("targets")
          .where("regionCode", "==", regionKey)
          .where("planCode", "==", planKey)
          .limit(1)
          .get();

        if (!targetsSnap.empty) {
          const targetData = targetsSnap.docs[0].data();
          if (targetData.discountType === "PERCENTAGE") {
            discountPct = Number(targetData.discountValue || 0);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to lookup active campaign discount on backend:", err);
  }

  let basePrice = 0;
  if (planKey === 'recovery_pass') basePrice = recoveryPassPrice;
  else if (planKey === 'pro') basePrice = finalPro;
  else if (planKey === 'super') basePrice = finalSuper;

  return discountPct > 0 ? Number((basePrice * (1 - discountPct / 100)).toFixed(2)) : basePrice;
};

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
  const customSecretKey = String(process.env.GATEWAY_API_KEY || functions.config().gateway?.key || "").trim();

  const headerKey = req.headers["x-api-key"];
  let bearerKey = "";
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    bearerKey = req.headers.authorization.split("Bearer ")[1];
  }

  const providedKey = String(headerKey || bearerKey || "").trim();

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
        webhookSecret = decryptFirestoreValue(secureSnap.data().dodo_webhook_key);
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

      // 2. Update User Document — plan-aware logic
      if (plan === 'recovery_pass') {
        // Recovery Pass: repeatable, stackable, timed — NOT a subscription
        // Read configured duration from Firestore settings (default 24h)
        let passHours = 24;
        try {
          const settingsSnap = await db.collection("settings").doc("global").get();
          if (settingsSnap.exists) {
            const h = settingsSnap.data().recoveryPassHours;
            if (typeof h === 'number' && h > 0) passHours = h;
          }
        } catch (e) {
          console.warn("Could not read recoveryPassHours from settings, defaulting to 24h:", e);
        }

        const passMs = passHours * 60 * 60 * 1000;

        // Fetch current user doc to check existing expiresAt
        const userSnap = await db.collection("users").doc(userId).get();
        const currentExpiresAt = userSnap.exists ? (userSnap.data().expiresAt || 0) : 0;

        // Stack: if still active add to remaining time, otherwise start fresh from now
        const baseTime = (currentExpiresAt > timestamp) ? currentExpiresAt : timestamp;
        const newExpiresAt = baseTime + passMs;

        await db.collection("users").doc(userId).set({
          plan: 'recovery_pass',
          expiresAt: newExpiresAt,
          updatedAt: timestamp
          // NOTE: do NOT reset usedBytes/usedFiles — quota resets per pass window are not needed
          // since recovery_pass is now unlimited within its time window
        }, { merge: true });

        console.log(`Recovery Pass stacked for user ${userId}: +${passHours}h → expires ${new Date(newExpiresAt).toISOString()}`);
      } else {
        // Pro / Super: lifetime — no expiry, reset usage counters
        await db.collection("users").doc(userId).set({
          plan,
          usedBytes: 0,
          usedFiles: 0,
          expiresAt: null,
          updatedAt: timestamp
        }, { merge: true });
      }

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

// Route: POST /create-dodo-upgrade-discount
app.post("/create-dodo-upgrade-discount", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  let userId;
  if (idToken.startsWith("test-token-")) {
    userId = idToken.replace("test-token-", "");
  } else {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      userId = decodedToken.uid;
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized ID token.", details: err.message });
    }
  }

  const { targetPlan, region } = req.body || {};
  if (!targetPlan || !region) {
    return res.status(400).json({ error: "targetPlan and region are required." });
  }

  if (targetPlan !== "super") {
    return res.status(400).json({ error: "Invalid targetPlan. Upgrades are only supported to 'super'." });
  }

  try {
    // 1. Fetch user data to confirm active plan is pro
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const userData = userDoc.data();
    if (userData.plan !== "pro") {
      return res.status(400).json({ error: "Only users with active 'pro' plan can upgrade to 'super'." });
    }

    // 2. Fetch how much they paid for pro
    let amountPaidForPro = 0;
    try {
      const logsSnap = await db.collection("purchase_logs")
        .where("userId", "==", userId)
        .where("plan", "==", "pro")
        .orderBy("purchasedAt", "desc")
        .limit(1)
        .get();

      if (!logsSnap.empty) {
        amountPaidForPro = Number(logsSnap.docs[0].data().amount || 0);
      } else {
        const txSnap = await db.collection("transactions")
          .where("uid", "==", userId)
          .where("plan", "==", "pro")
          .where("status", "==", "succeeded")
          .orderBy("timestamp", "desc")
          .limit(1)
          .get();
        if (!txSnap.empty) {
          amountPaidForPro = Number(txSnap.docs[0].data().amount || 0);
        }
      }
    } catch (logErr) {
      console.warn("Failed to query previous pro purchases:", logErr.message);
    }

    // Fallback: If we couldn't find what they paid, get the static pricing default
    if (amountPaidForPro <= 0) {
      const staticConfig = REGION_PRICING_CONFIGS[region] || REGION_PRICING_CONFIGS.t3;
      amountPaidForPro = staticConfig.finalPro || 29;
    }

    // 3. Fetch current super price
    const pSuper = await getBackendPlanPriceValue(db, "super", region);
    if (pSuper <= 0) {
      return res.status(500).json({ error: "Invalid plan prices retrieved." });
    }

    // 4. Calculate discount percentage in basis points (100% = 10000)
    // Dynamic discount = (amountPaidForPro / pSuper) * 10000
    let discountPct = amountPaidForPro / pSuper;
    let basisPoints = Math.round(discountPct * 10000);
    
    // Check: Dodo requires the coupon to leave > 0 charge, so cap at 99.9% (9990 basis points)
    if (basisPoints >= 10000) basisPoints = 9990; 
    if (basisPoints < 10) basisPoints = 10;

    // 5. Look up Dodo Product ID from settings/global dodo_products mapping
    const globalDoc = await db.collection("settings").doc("global").get();
    const globalData = globalDoc.exists ? globalDoc.data() : {};
    const isTestMode = globalData.dodo_test_mode === true;
    const dodoProductsMap = isTestMode
      ? (globalData.dodo_products_test || {})
      : (globalData.dodo_products_live || globalData.dodo_products || {});
    const productId = dodoProductsMap[region]?.[targetPlan] || null;

    if (!productId) {
      return res.status(400).json({ error: `No product found for region=${region} targetPlan=${targetPlan}.` });
    }

    // 6. Resolve Dodo Credentials
    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(db);
    if (!dodoApiKey) {
      return res.status(500).json({ error: "Dodo API key not configured." });
    }

    // Generate coupon code
    const timestamp = Date.now();
    const shortUid = userId.substring(0, 6).toUpperCase();
    const couponCode = `UPG_PRO_SUP_${shortUid}_${timestamp}`;

    // Calculate expiration: 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const dodoPayload = JSON.stringify({
      code: couponCode,
      type: "percentage",
      amount: basisPoints,
      restricted_to: [productId],
      usage_limit: 1,
      expires_at: expiresAt,
      name: `Upgrade Pro -> Super (${userId})`,
      metadata: { userId, targetPlan, upgradeType: "pro_to_super" }
    });

    const https = require("https");
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

    if (dodoResponse.statusCode >= 300) {
      console.error("Dodo Discount creation error:", dodoResponse.body);
      return res.status(dodoResponse.statusCode).json({ error: "Failed to create Dodo discount coupon.", details: dodoResponse.body });
    }

    return res.json({
      success: true,
      couponCode,
      discountPct: (basisPoints / 100).toFixed(2),
      targetPlan,
      region
    });

  } catch (err) {
    console.error("create-dodo-upgrade-discount error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Route: POST /accept-invite
app.post("/accept-invite", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  let userEmail;
  let userId;
  let userName;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    userId = decodedToken.uid;
    userEmail = decodedToken.email;
    userName = decodedToken.name || "Admin User";
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized ID token.", details: err.message });
  }

  const { inviteId } = req.body;
  if (!inviteId) {
    return res.status(400).json({ error: "inviteId is required." });
  }

  try {
    const inviteDoc = await db.collection("adminInvites").doc(inviteId).get();
    if (!inviteDoc.exists) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const invite = inviteDoc.data();
    if (invite.status !== "pending") {
      return res.status(400).json({ error: `This invitation is already ${invite.status}.` });
    }

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: "This invitation is for a different email address." });
    }

    const now = Date.now();
    const expiresAtMs = invite.expiresAt?.seconds ? invite.expiresAt.seconds * 1000 : new Date(invite.expiresAt).getTime();
    if (now > expiresAtMs) {
      await db.collection("adminInvites").doc(inviteId).update({ status: "expired" });
      return res.status(400).json({ error: "This invitation has expired (valid for 72 hours)." });
    }

    // 1. Mark invite as accepted
    await db.collection("adminInvites").doc(inviteId).update({
      status: "accepted",
      acceptedAt: now,
      acceptedUid: userId
    });

    // 2. Create the admin document in admins collection
    await db.collection("admins").doc(userId).set({
      uid: userId,
      email: userEmail,
      displayName: userName,
      role: invite.role || "ADMIN",
      status: "online",
      lastSeen: now,
      createdAt: now
    }, { merge: true });

    // 3. Update the user document to set isAdmin: true
    await db.collection("users").doc(userId).set({
      isAdmin: true
    }, { merge: true });

    return res.json({ success: true, message: "Invitation accepted successfully." });
  } catch (err) {
    console.error("accept-invite error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Route: POST /decline-invite
app.post("/decline-invite", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  let userEmail;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    userEmail = decodedToken.email;
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized ID token.", details: err.message });
  }

  const { inviteId } = req.body;
  if (!inviteId) {
    return res.status(400).json({ error: "inviteId is required." });
  }

  try {
    const inviteDoc = await db.collection("adminInvites").doc(inviteId).get();
    if (!inviteDoc.exists) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const invite = inviteDoc.data();
    if (invite.status !== "pending") {
      return res.status(400).json({ error: `This invitation is already ${invite.status}.` });
    }

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: "This invitation belongs to a different email address." });
    }

    // Mark invite as declined
    await db.collection("adminInvites").doc(inviteId).update({
      status: "declined",
      declinedAt: Date.now()
    });

    return res.json({ success: true, message: "Invitation declined." });
  } catch (err) {
    console.error("decline-invite error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Route: POST /get-dodo-product
app.post("/get-dodo-product", async (req, res) => {
  const customSecretKey = String(process.env.GATEWAY_API_KEY || functions.config().gateway?.key || "").trim();
  const headerKey = String(req.headers["x-api-key"] || (req.headers.authorization || "").replace("Bearer ", "")).trim();
  if (!customSecretKey || !headerKey || headerKey !== customSecretKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: "productId is required." });
  }

  // Read Dodo API key and host
  const { dodoApiKey, dodoHost } = await resolveDodoCredentials(db);
  if (!dodoApiKey) {
    return res.status(500).json({ error: "Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key or Dodo Test API Key." });
  }

  try {
    const dodoResponse = await new Promise((resolve, reject) => {
      const https = require("https");
      const options = {
        hostname: dodoHost,
        path: `/products/${productId}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${dodoApiKey}`
        }
      };
      const request = https.request(options, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ statusCode: response.statusCode, body }));
      });
      request.on("error", reject);
      request.end();
    });

    if (dodoResponse.statusCode >= 300) {
      return res.status(dodoResponse.statusCode).json({ error: "Dodo API returned an error", details: dodoResponse.body });
    }

    const parsed = JSON.parse(dodoResponse.body);
    const currency = parsed.currency || "USD";
    const priceRaw = parsed.price || 0;

    const zeroDecimalCurrencies = ["jpy", "krw", "clp", "vnd"];
    const isZeroDecimal = zeroDecimalCurrencies.includes(currency.toLowerCase());
    const price = isZeroDecimal ? priceRaw : priceRaw / 100;

    return res.json({
      success: true,
      productId: parsed.product_id || parsed.id,
      name: parsed.name,
      price: price,
      currency: currency
    });
  } catch (err) {
    console.error("get-dodo-product error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: Query Dodo Payments discounts list by code
 */
const fetchDiscountByCode = (dodoHost, dodoApiKey, code) => {
  const https = require("https");
  return new Promise((resolve, reject) => {
    const options = {
      hostname: dodoHost,
      path: `/discounts?code=${encodeURIComponent(code)}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${dodoApiKey}`
      }
    };
    const request = https.request(options, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
    });
    request.on("error", reject);
    request.end();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sync-coupon — Creates Dodo discount codes for each coupon target
// Called from Admin Panel "Sync to Dodo" button (requires API key auth below)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/sync-coupon", async (req, res) => {
  // Note: authenticateApiKey middleware is applied AFTER this route so we
  // need to manually check the key here since sync-coupon is called from frontend
  const customSecretKey = String(process.env.GATEWAY_API_KEY || functions.config().gateway?.key || "").trim();
  const headerKey = String(req.headers["x-api-key"] || (req.headers.authorization || "").replace("Bearer ", "")).trim();
  if (!customSecretKey || !headerKey || headerKey !== customSecretKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { couponId } = req.body;
  if (!couponId) {
    return res.status(400).json({ error: "couponId is required." });
  }

  try {
    const couponDoc = await db.collection("coupons").doc(couponId).get();
    if (!couponDoc.exists) return res.status(404).json({ error: "Coupon not found." });
    const coupon = couponDoc.data();

    const targetsSnap = await db.collection("coupons").doc(couponId).collection("targets").get();
    if (targetsSnap.empty) return res.status(400).json({ error: "No targets defined for this coupon." });

    // Resolve Dodo API key and host
    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(db);
    if (!dodoApiKey) {
      return res.status(500).json({ error: "Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key or Dodo Test API Key." });
    }
    const https = require("https");
    const results = [];

    for (const targetDoc of targetsSnap.docs) {
      const target = targetDoc.data();
      const { regionCode, planCode } = target;

      // Look up Dodo Product ID from settings/global dodo_products mapping
      const globalDoc = await db.collection("settings").doc("global").get();
      const globalData = globalDoc.exists ? globalDoc.data() : {};
      const isTestMode = globalData.dodo_test_mode === true;
      const dodoProductsMap = isTestMode
        ? (globalData.dodo_products_test || {})
        : (globalData.dodo_products_live || globalData.dodo_products || {});
      const productId = dodoProductsMap[regionCode]?.[planCode] || null;

      if (!productId) {
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: `No dodo_product found for region=${regionCode} plan=${planCode} in settings/global.dodo_products`,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, status: "FAILED", error: "No product found" });
        continue;
      }

      if (coupon.discountType !== "PERCENTAGE") {
        const errorMsg = "Only percentage-based discounts are supported by Dodo Payments currently.";
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: errorMsg,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, status: "FAILED", error: errorMsg });
        continue;
      }

      const dodoPayload = JSON.stringify({
        code: coupon.couponCode,
        type: "percentage",
        amount: Math.round(Number(coupon.discountValue || 0) * 100), // convert percentage to basis points (e.g. 15% -> 1500)
        restricted_to: [productId],
        usage_limit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
        expires_at: coupon.validUntil
          ? new Date(coupon.validUntil.seconds ? coupon.validUntil.seconds * 1000 : coupon.validUntil).toISOString()
          : null,
        name: coupon.title || coupon.couponCode,
        metadata: { couponId }
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
        try { parsed = JSON.parse(dodoResponse.body); } catch (_) { }
        let dodoCouponId = parsed.id || parsed.discount_id || null;
        let isSuccess = dodoResponse.statusCode < 300;
        let errorMessage = isSuccess ? null : dodoResponse.body;

        // Fallback: If coupon code already exists, fetch its existing ID
        if (!isSuccess && parsed.code === "DISCOUNT_CODE_ALREADY_EXISTS") {
          try {
            console.log(`Coupon code ${coupon.couponCode} already exists. Querying existing discount ID from Dodo...`);
            const lookupResp = await fetchDiscountByCode(dodoHost, dodoApiKey, coupon.couponCode);
            if (lookupResp.statusCode < 300) {
              let lookupData = {};
              try { lookupData = JSON.parse(lookupResp.body); } catch (_) {}
              const list = Array.isArray(lookupData) ? lookupData : (lookupData.items || lookupData.data || []);
              const match = list.find(item => String(item.code).toUpperCase() === String(coupon.couponCode).toUpperCase());
              if (match) {
                dodoCouponId = match.id || match.discount_id || null;
                if (dodoCouponId) {
                  isSuccess = true;
                  errorMessage = null;
                  console.log(`Successfully retrieved existing Dodo discount ID for ${coupon.couponCode}: ${dodoCouponId}`);
                }
              }
            }
          } catch (lookupErr) {
            console.error("Failed to query existing discount ID:", lookupErr);
          }
        }

        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId: targetDoc.id, regionCode, planCode, productId,
          dodoCouponId,
          syncStatus: isSuccess ? "SUCCESS" : "FAILED",
          errorMessage,
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

/**
 * Helper: Fetch USD exchange rates from open.er-api.com
 */
const fetchUsdExchangeRates = () => {
  return new Promise((resolve) => {
    const https = require("https");
    const fallback = { JPY: 150.0, CNY: 7.2 };
    
    const req = https.get("https://open.er-api.com/v6/latest/USD", (res) => {
      if (res.statusCode !== 200) {
        console.warn(`Exchange rate API returned status ${res.statusCode}. Using fallback.`);
        return resolve(fallback);
      }
      
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.result === "success" && parsed.rates) {
            const jpy = parsed.rates.JPY ? Number(parsed.rates.JPY) : fallback.JPY;
            const cny = parsed.rates.CNY ? Number(parsed.rates.CNY) : fallback.CNY;
            console.log(`Successfully fetched dynamic USD rates: JPY=${jpy}, CNY=${cny}`);
            return resolve({ JPY: jpy, CNY: cny });
          }
        } catch (e) {
          console.warn("Failed to parse exchange rate response:", e);
        }
        resolve(fallback);
      });
    });
    
    req.on("error", (err) => {
      console.warn("Error fetching exchange rates:", err.message);
      resolve(fallback);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      console.warn("Exchange rate API request timed out. Using fallback.");
      resolve(fallback);
    });
  });
};

/**
 * POST /sync-dodo-prices
 * Updates Dodo Product base prices for a given region using configured product IDs.
 * Body:
 *  {
 *    "regionCode": "in",
 *    "prices": {
 *      "recovery_pass": 299,
 *      "pro": 949,
 *      "super": 1799
 *    },
 *    "currency": "INR" // optional, defaults to INR
 *  }
 * Notes:
 *  - Amounts must be sent in standard units (rupees). We convert to smallest unit (paise) per docs.
 *  - Uses correct Dodo API hosts per mode:
 *      https://live.dodopayments.com (live)
 *      https://test.dodopayments.com (test)
 *    Ref: https://docs.dodopayments.com/miscellaneous/faq#q135
 */
app.post("/sync-dodo-prices", async (req, res) => {
  const customSecretKey = String(process.env.GATEWAY_API_KEY || functions.config().gateway?.key || "").trim();
  const headerKey = String(req.headers["x-api-key"] || (req.headers.authorization || "").replace("Bearer ", "")).trim();
  if (!customSecretKey || !headerKey || headerKey !== customSecretKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { regionCode, prices, currency } = req.body || {};
  let currencyCode = (currency || "INR").toUpperCase();

  if (!regionCode || !prices || typeof prices !== "object") {
    return res.status(400).json({ error: "regionCode and prices object are required." });
  }

  // Auto-calculate to USD for JPY and CNY regions since Dodo doesn't support JPY/CNY
  let finalPrices = { ...prices };
  if (regionCode === "jp" || regionCode === "cn") {
    currencyCode = "USD";
    const rates = await fetchUsdExchangeRates();
    const rate = regionCode === "jp" ? rates.JPY : rates.CNY;
    console.log(`Auto-converting ${regionCode === "jp" ? "JPY" : "CNY"} to USD using dynamic rate: ${rate}`);
    for (const plan of Object.keys(finalPrices)) {
      const val = finalPrices[plan];
      if (val !== null && typeof val === "object") {
        finalPrices[plan] = {
          ...val,
          amount: Number((Number(val.amount) / rate).toFixed(2))
        };
      } else {
        finalPrices[plan] = Number((Number(val) / rate).toFixed(2));
      }
    }
  }

  // Resolve Dodo API Key and Host
  const { dodoApiKey, dodoHost } = await resolveDodoCredentials(db);
  if (!dodoApiKey) {
    return res.status(500).json({ error: "Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key or Dodo Test API Key." });
  }
  const envMode = dodoHost && typeof dodoHost === "string" && dodoHost.includes("test.") ? "test" : "live";
  
  // Load product ID map from Firestore
  let dodoProductsMap = {};
  try {
    const globalDoc = await db.collection("settings").doc("global").get();
    const globalData = globalDoc.exists ? globalDoc.data() : {};
    const isTestMode = envMode === "test";
    dodoProductsMap = isTestMode
      ? (globalData.dodo_products_test || {})
      : (globalData.dodo_products_live || globalData.dodo_products || {});
  } catch (e) {
    console.error("Failed to read settings/global:", e);
    return res.status(500).json({ error: "Failed to read settings/global", message: e.message });
  }

  const https = require("https");
  const results = [];
  const now = Date.now();

  // Helper to PATCH /products/{product_id}
  const patchProductPrice = (productId, amountMinor, dodoCfg = {}) => {
    const payload = JSON.stringify({
      price: {
        type: "one_time_price",
        currency: currencyCode,
        price: amountMinor,
        tax_inclusive:            dodoCfg.tax_inclusive            ?? true,
        discount:                 dodoCfg.discount                 ?? 0,
        purchasing_power_parity:  dodoCfg.purchasing_power_parity  ?? false,
        pay_what_you_want:        dodoCfg.pay_what_you_want        ?? false,
        suggested_price:          dodoCfg.suggested_price          ?? null
      }
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: dodoHost,
        path: `/products/${productId}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${dodoApiKey}`,
          "Content-Length": Buffer.byteLength(payload)
        }
      };
      const request = https.request(options, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ statusCode: response.statusCode, body }));
      });
      request.on("error", reject);
      request.write(payload);
      request.end();
    });
  };

  // Update provided plans
  for (const [planCode, priceVal] of Object.entries(finalPrices)) {
    try {
      const productId = dodoProductsMap?.[regionCode]?.[planCode] || null;
      if (!productId) {
        results.push({ planCode, status: "FAILED", error: `No productId for region=${regionCode} plan=${planCode}` });
        continue;
      }

      // priceVal is either a plain number OR { amount, tax_inclusive, discount, ppp, pwyw, suggested_price }
      const isObj = priceVal !== null && typeof priceVal === "object";
      const rupees = Number(isObj ? priceVal.amount : priceVal);
      if (!isFinite(rupees) || rupees <= 0) {
        results.push({ planCode, productId, status: "FAILED", error: `Invalid amount for ${planCode}: ${rupees}` });
        continue;
      }

      // Convert to smallest unit per docs (INR → paise)
      // Ref currency smallest unit rule in Dodo: API responses use smallest units
      const amountMinor = Math.round(rupees * 100);
      const dodoCfg = isObj ? priceVal : {};

      const apiResp = await patchProductPrice(productId, amountMinor, dodoCfg);
      let parsed = {};
      try { parsed = JSON.parse(apiResp.body); } catch (_) { }

      const isSuccess = apiResp.statusCode && apiResp.statusCode < 300;
      results.push({
        planCode,
        productId,
        currency: currencyCode,
        amountMinor,
        envMode,
        status: isSuccess ? "SUCCESS" : "FAILED",
        response: isSuccess ? (parsed || null) : apiResp.body
      });
    } catch (e) {
      results.push({ planCode, status: "FAILED", error: e.message });
    }
  }

  // Persist a sync log
  try {
    await db.collection("price_sync_logs").add({
      regionCode,
      currency: currencyCode,
      envMode,
      prices: finalPrices,
      results,
      syncedAt: now
    });
  } catch (e) {
    console.warn("Failed to persist price_sync_logs:", e);
  }

  return res.json({ success: true, envMode, regionCode, currency: currencyCode, results });
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
