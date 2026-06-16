const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin SDK
// Priority: serviceAccountKey.json → Application Default Credentials (ADC)
// ADC works when:
//   - GOOGLE_APPLICATION_CREDENTIALS env points to a key file
//   - gcloud auth application-default login has been run
// Explicit projectId prevents "Unable to detect Project Id" error.
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "gt-metadata-merger";
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
  console.log("✅ Firebase Admin SDK: serviceAccountKey.json");
} else {
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
  admin.initializeApp({ projectId: PROJECT_ID });
  console.log("✅ Firebase Admin SDK: Application Default Credentials (projectId: " + PROJECT_ID + ")");
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn("⚠️  No GOOGLE_APPLICATION_CREDENTIALS set. If Firestore fails, either:");
    console.warn("   1. Download serviceAccountKey.json from Firebase Console → Project Settings → Service Accounts");
    console.warn("   2. Run: gcloud auth application-default login");
  }
}


const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;

const getFirebaseCLIToken = async () => {
  const configHome = process.env.HOME || "/home/rahul";
  const configPath = path.join(configHome, '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase tools configuration file not found at ${configPath}. Please login with 'firebase login' first.`);
  }
  const firebaseToolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = firebaseToolsConfig.tokens || {};
  let accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  const refreshAccessToken = async (rToken) => {
    const clientId = "1014389776834-8o4rgc66upa3hgn73g2eul3o8e63e26m.apps.googleusercontent.com";
    const clientSecret = "Ym174NCiQg5475s5G2IxgL3y";
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: rToken
      })
    });
    if (!refreshRes.ok) {
      throw new Error(`Failed to refresh token: ${refreshRes.status}`);
    }
    const data = await refreshRes.json();
    return data.access_token;
  };

  if (!accessToken && refreshToken) {
    accessToken = await refreshAccessToken(refreshToken);
  }
  return { accessToken, refreshToken, refreshAccessToken };
};

app.use(cors({ origin: true }));
app.use(express.json());

// API Key authentication key for AI Studio
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "takeoutfix-gemini-secret-2026";

app.use((req, res, next) => {
  const headerKey = req.headers["x-api-key"];
  let bearerKey = "";
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    bearerKey = req.headers.authorization.split("Bearer ")[1];
  }
  const providedKey = headerKey || bearerKey;

  if (!providedKey || providedKey !== GEMINI_API_KEY) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing API key. Please check headers."
    });
  }
  next();
});

// Helper functions
const findUser = async (identifier) => {
  if (!identifier) return null;
  const userDoc = await db.collection("users").doc(identifier).get();
  if (userDoc.exists) {
    return { id: userDoc.id, data: userDoc.data() };
  }
  const userQuery = await db.collection("users").where("email", "==", identifier).limit(1).get();
  if (!userQuery.empty) {
    const doc = userQuery.docs[0];
    return { id: doc.id, data: doc.data() };
  }
  return null;
};

const logAdminActivity = async (action, targetUid, description) => {
  try {
    await db.collection("admin_activity").add({
      actorUid: "GEMINI_LOCAL_SERVER",
      actorName: "Gemini AI Studio Local Connector",
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

// Route: POST /sync-coupon
// Rewritten to use Firebase Admin SDK (db) directly — no getFirebaseCLIToken() needed.
app.post("/sync-coupon", async (req, res) => {
  const { couponId } = req.body;
  if (!couponId) {
    return res.status(400).json({ error: "couponId is required." });
  }

  try {
    // 1. Get coupon doc via Admin SDK
    const couponSnap = await db.collection("coupons").doc(couponId).get();
    if (!couponSnap.exists) {
      return res.status(404).json({ error: "Coupon not found." });
    }
    const coupon = couponSnap.data();
    const couponCode = coupon.couponCode || "";
    const discountType = coupon.discountType || "PERCENTAGE";
    const discountValue = Number(coupon.discountValue || 0);
    const usageLimit = coupon.usageLimit || null;
    const validUntil = coupon.validUntil
      ? (coupon.validUntil.seconds ? new Date(coupon.validUntil.seconds * 1000).toISOString() : new Date(coupon.validUntil).toISOString())
      : null;

    // 2. Get targets
    const targetsSnap = await db.collection("coupons").doc(couponId).collection("targets").get();
    if (targetsSnap.empty) {
      return res.status(400).json({ error: "No targets defined for this coupon." });
    }

    // 3. Get Dodo product map from settings/global
    const globalSnap = await db.collection("settings").doc("global").get();
    const dodoProductsMap = globalSnap.exists ? (globalSnap.data().dodo_products || {}) : {};

    // 4. Resolve Dodo API key
    let dodoApiKey = process.env.DODO_API_KEY;
    if (!dodoApiKey) {
      try {
        const sysSnap = await db.collection("settings").doc("system").get();
        if (sysSnap.exists) dodoApiKey = sysSnap.data().dodo_api_key;
      } catch (e) { /* ignore */ }
    }
    if (!dodoApiKey) {
      return res.status(500).json({ error: "DODO_API_KEY not configured. Set env var or save in Admin Settings → Dodo Live API Key field." });
    }

    const dodoHost = "live.dodopayments.com";
    const https = require("https");
    const results = [];

    for (const targetDoc of targetsSnap.docs) {
      const { regionCode, planCode } = targetDoc.data();
      const targetId = targetDoc.id;
      const productId = dodoProductsMap[regionCode]?.[planCode] || null;

      if (!productId) {
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId, regionCode, planCode,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: `No dodo_product found for region=${regionCode} plan=${planCode} in settings/global.dodo_products`,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, status: "FAILED", error: "No product found" });
        continue;
      }

      const dodoPayload = JSON.stringify({
        code: couponCode,
        discount_type: discountType === "PERCENTAGE" ? "percentage" : "fixed",
        discount_value: discountValue,
        product_id: productId,
        max_redemptions: usageLimit,
        expires_at: validUntil
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
        const dodoCouponId = parsed.id || parsed.discount_id || null;
        const isSuccess = dodoResponse.statusCode < 300;

        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId, regionCode, planCode, productId, dodoCouponId,
          syncStatus: isSuccess ? "SUCCESS" : "FAILED",
          errorMessage: isSuccess ? null : dodoResponse.body,
          syncedAt: Date.now()
        });
        results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? "SUCCESS" : "FAILED" });
      } catch (apiErr) {
        await db.collection("coupons").doc(couponId).collection("sync_log").add({
          couponId, targetId, regionCode, planCode, productId,
          dodoCouponId: null, syncStatus: "FAILED",
          errorMessage: apiErr.message, syncedAt: Date.now()
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

// Route: POST /get-dodo-product
app.post("/get-dodo-product", async (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: "productId is required." });
  }

  // Read Dodo API key
  let dodoApiKey = process.env.DODO_API_KEY || "7RM41OfN1w8XWVR2.DcyoI7MMlg5Ydc_EMOlG_om2QE8hGxOHsgpa9-gdpZAaapWO";

  const dodoHost = "live.dodopayments.com";

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

    // Convert from lowest denomination to standard unit
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

// Route: POST /execute
app.post("/execute", async (req, res) => {
  const { functionName, arguments: args } = req.body;
  if (!functionName) {
    return res.status(400).json({ error: "Missing functionName in request body." });
  }

  console.log(`[${new Date().toISOString()}] Executing function: ${functionName}`, args);

  try {
    switch (functionName) {
      case "getUserStats": {
        const { emailOrUid } = args || {};
        if (!emailOrUid) return res.status(400).json({ error: "Argument 'emailOrUid' is required." });

        const user = await findUser(emailOrUid);
        if (!user) return res.status(404).json({ error: `User '${emailOrUid}' not found.` });

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
            totalFilesProcessed: user.data.totalFilesProcessed || 0
          },
          sessionCount: (user.data.sessionIds || []).length
        });
      }

      case "updateUserPlan": {
        const { emailOrUid, newPlan } = args || {};
        if (!emailOrUid || !newPlan) return res.status(400).json({ error: "Arguments required." });

        const validPlans = ["free", "single_pass", "pro", "super"];
        if (!validPlans.includes(newPlan.toLowerCase())) {
          return res.status(400).json({ error: "Invalid plan." });
        }

        const user = await findUser(emailOrUid);
        if (!user) return res.status(404).json({ error: "User not found." });

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

        await logAdminActivity("UPDATE_PLAN", user.id, `Plan updated to ${planNormalized} via Gemini local connector.`);

        return res.json({ success: true, plan: planNormalized, transactionId });
      }

      case "toggleUserSuspension": {
        const { emailOrUid, suspend } = args || {};
        if (!emailOrUid || suspend === undefined) return res.status(400).json({ error: "Arguments required." });

        const user = await findUser(emailOrUid);
        if (!user) return res.status(404).json({ error: "User not found." });

        const isSuspended = !!suspend;
        await db.collection("users").doc(user.id).update({ suspended: isSuspended });
        await logAdminActivity(isSuspended ? "SUSPEND_USER" : "UNSUSPEND_USER", user.id, `User suspension set to ${isSuspended}`);

        return res.json({ success: true, suspended: isSuspended });
      }

      case "getSupportTickets": {
        const { status } = args || {};
        let query = db.collection("tickets");
        if (status) query = query.where("status", "==", status.toUpperCase());

        const ticketDocs = await query.orderBy("timestamp", "desc").limit(20).get();
        const tickets = [];
        ticketDocs.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));
        return res.json({ count: tickets.length, tickets });
      }

      case "replyToTicket": {
        const { ticketId, replyText, resolve } = args || {};
        if (!ticketId || !replyText) return res.status(400).json({ error: "Arguments required." });

        const ticketDoc = await db.collection("tickets").doc(ticketId).get();
        if (!ticketDoc.exists) return res.status(404).json({ error: "Ticket not found." });

        const status = resolve ? "RESOLVED" : "ANSWERED";
        await db.collection("tickets").doc(ticketId).update({
          response: replyText,
          status: status,
          repliedAt: Date.now()
        });
        await logAdminActivity("REPLY_TICKET", ticketDoc.data().uid, `Replied to ticket ${ticketId}. Status: ${status}`);

        return res.json({ success: true, status });
      }

      default:
        return res.status(404).json({ error: `Function ${functionName} not found.` });
    }
  } catch (error) {
    console.error("Error executing action:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/sync-dodo-prices", async (req, res) => {
  const { regionCode, prices, currency } = req.body || {};
  const currencyCode = (currency || "INR").toUpperCase();

  if (!regionCode || !prices || typeof prices !== "object") {
    return res.status(400).json({ error: "regionCode and prices object are required." });
  }

  // Resolve Dodo API Key from env or Firestore settings/system
  let dodoApiKey = process.env.DODO_API_KEY;
  if (!dodoApiKey) {
    try {
      const sysDoc = await db.collection("settings").doc("system").get();
      if (sysDoc.exists) dodoApiKey = sysDoc.data().dodo_api_key;
    } catch (e) {
      console.error("Failed to read Dodo API key from Firestore:", e);
    }
  }
  if (!dodoApiKey) {
    return res.status(500).json({ error: "DODO_API_KEY not found. Set env variable or save it in Admin Settings → Dodo Live API Key field." });
  }

  // Always live for local server (pinned per Dodo Sentra agent recommendation)
  const dodoHost = "live.dodopayments.com";

  // Load product ID map from Firestore
  let dodoProductsMap = {};
  try {
    const globalDoc = await db.collection("settings").doc("global").get();
    dodoProductsMap = globalDoc.exists ? (globalDoc.data().dodo_products || {}) : {};
  } catch (e) {
    return res.status(500).json({ error: "Failed to read settings/global: " + e.message });
  }

  const https = require("https");
  const results = [];
  const now = Date.now();

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

  for (const [planCode, priceVal] of Object.entries(prices)) {
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
        results.push({ planCode, productId, status: "FAILED", error: `Invalid amount: ${rupees}` });
        continue;
      }
      // Convert to smallest currency unit (INR → paise, USD → cents, etc.)
      const amountMinor = Math.round(rupees * 100);
      const dodoCfg = isObj ? priceVal : {};
      const apiResp = await patchProductPrice(productId, amountMinor, dodoCfg);
      let parsed = {};
      try { parsed = JSON.parse(apiResp.body); } catch (_) {}
      const isSuccess = apiResp.statusCode && apiResp.statusCode < 300;
      results.push({
        planCode, productId, currency: currencyCode, amountMinor,
        status: isSuccess ? "SUCCESS" : "FAILED",
        response: isSuccess ? parsed : apiResp.body
      });
    } catch (e) {
      results.push({ planCode, status: "FAILED", error: e.message });
    }
  }

  // Log to Firestore
  try {
    await db.collection("price_sync_logs").add({ regionCode, currency: currencyCode, prices, results, syncedAt: now });
  } catch (e) {
    console.warn("Failed to write price_sync_logs:", e);
  }

  return res.json({ success: true, regionCode, currency: currencyCode, results });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 TakeoutFix Local Gemini Connector is running!`);
  console.log(`📡 Local server listening on http://localhost:${PORT}`);
  console.log(`🔒 Secret API Key required: "${GEMINI_API_KEY}"`);
  console.log(`======================================================\n`);
  console.log(`To expose this server to Google AI Studio for free:`);
  console.log(`1. Install ngrok (https://ngrok.com) or use localtunnel`);
  console.log(`2. Run: ngrok http 3000`);
  console.log(`3. Copy the generated HTTPS URL (e.g. https://xxxx.ngrok-free.app)`);
  console.log(`4. Configure Google AI Studio tool call webhook URL to:`);
  console.log(`   https://xxxx.ngrok-free.app/execute`);
  console.log(`======================================================\n`);
});
