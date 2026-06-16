const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin SDK
// It checks for 'serviceAccountKey.json' in the same folder.
// If not found, it falls back to default credentials (e.g., set via GOOGLE_APPLICATION_CREDENTIALS)
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK initialized using serviceAccountKey.json");
} else {
  admin.initializeApp();
  console.log("Firebase Admin SDK initialized using default environment credentials.");
  console.warn("WARNING: If Firestore operations fail, make sure to download serviceAccountKey.json from your Firebase Console and place it in this directory.");
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
app.post("/sync-coupon", async (req, res) => {
  const { couponId } = req.body;
  if (!couponId) {
    return res.status(400).json({ error: "couponId is required." });
  }

  try {
    const { accessToken, refreshToken, refreshAccessToken } = await getFirebaseCLIToken();

    // Helper for authenticated fetch
    const firestoreFetch = async (url, options = {}) => {
      let headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      };
      let response = await fetch(url, { ...options, headers });
      if (response.status === 401 && refreshToken) {
        const newToken = await refreshAccessToken(refreshToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...options, headers });
      }
      return response;
    };

    // 1. Get coupon doc
    const couponUrl = `https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/coupons/${couponId}`;
    const couponResp = await firestoreFetch(couponUrl);
    if (couponResp.status === 404) {
      return res.status(404).json({ error: "Coupon not found." });
    }
    const couponDoc = await couponResp.json();
    const couponFields = couponDoc.fields || {};

    const couponCode = couponFields.couponCode?.stringValue || "";
    const discountType = couponFields.discountType?.stringValue || "PERCENTAGE";
    const discountValue = Number(couponFields.discountValue?.integerValue || couponFields.discountValue?.doubleValue || 0);
    const usageLimit = couponFields.usageLimit?.integerValue ? Number(couponFields.usageLimit.integerValue) : null;
    const validUntil = couponFields.validUntil?.timestampValue || null;

    // 2. Get targets
    const targetsUrl = `https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/coupons/${couponId}/targets`;
    const targetsResp = await firestoreFetch(targetsUrl);
    const targetsDoc = await targetsResp.json();
    const targetDocs = targetsDoc.documents || [];

    if (targetDocs.length === 0) {
      return res.status(400).json({ error: "No targets defined for this coupon." });
    }

    // 3. Get global doc
    const globalUrl = `https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/settings/global`;
    const globalResp = await firestoreFetch(globalUrl);
    const globalDoc = await globalResp.json();
    const globalFields = globalDoc.fields || {};
    const dodoProductsMap = {};

    if (globalFields.dodo_products?.mapValue?.fields) {
      const regionFields = globalFields.dodo_products.mapValue.fields;
      for (const [rCode, rVal] of Object.entries(regionFields)) {
        dodoProductsMap[rCode] = {};
        if (rVal.mapValue?.fields) {
          for (const [pCode, pVal] of Object.entries(rVal.mapValue.fields)) {
            dodoProductsMap[rCode][pCode] = pVal.stringValue || "";
          }
        }
      }
    }

    // Read Dodo API key
    let dodoApiKey = process.env.DODO_API_KEY || "7RM41OfN1w8XWVR2.DcyoI7MMlg5Ydc_EMOlG_om2QE8hGxOHsgpa9-gdpZAaapWO";

    const dodoHost = "live.dodopayments.com";
    const results = [];

    for (const tDoc of targetDocs) {
      const tFields = tDoc.fields || {};
      const regionCode = tFields.regionCode?.stringValue || "";
      const planCode = tFields.planCode?.stringValue || "";
      const targetId = tDoc.name.split("/").pop();

      const productId = dodoProductsMap[regionCode]?.[planCode] || null;

      const syncLogUrl = `https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/coupons/${couponId}/sync_log`;

      if (!productId) {
        const payload = {
          fields: {
            couponId: { stringValue: couponId },
            targetId: { stringValue: targetId },
            regionCode: { stringValue: regionCode },
            planCode: { stringValue: planCode },
            dodoCouponId: { nullValue: null },
            syncStatus: { stringValue: "FAILED" },
            errorMessage: { stringValue: `No dodo_product found for region=${regionCode} plan=${planCode}` },
            syncedAt: { integerValue: String(Date.now()) }
          }
        };
        await firestoreFetch(syncLogUrl, { method: "POST", body: payload });
        results.push({ regionCode, planCode, status: "FAILED", error: "No product found" });
        continue;
      }

      const dodoPayload = JSON.stringify({
        code: couponCode,
        discount_type: discountType === "PERCENTAGE" ? "percentage" : "fixed",
        discount_value: discountValue,
        product_id: productId,
        max_redemptions: usageLimit,
        expires_at: validUntil ? new Date(validUntil).toISOString() : null
      });

      try {
        const dodoResponse = await new Promise((resolve, reject) => {
          const https = require("https");
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

        const payload = {
          fields: {
            couponId: { stringValue: couponId },
            targetId: { stringValue: targetId },
            regionCode: { stringValue: regionCode },
            planCode: { stringValue: planCode },
            productId: { stringValue: productId },
            dodoCouponId: dodoCouponId ? { stringValue: dodoCouponId } : { nullValue: null },
            syncStatus: { stringValue: isSuccess ? "SUCCESS" : "FAILED" },
            errorMessage: isSuccess ? { nullValue: null } : { stringValue: dodoResponse.body },
            syncedAt: { integerValue: String(Date.now()) }
          }
        };
        await firestoreFetch(syncLogUrl, { method: "POST", body: payload });
        results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? "SUCCESS" : "FAILED" });
      } catch (apiErr) {
        const payload = {
          fields: {
            couponId: { stringValue: couponId },
            targetId: { stringValue: targetId },
            regionCode: { stringValue: regionCode },
            planCode: { stringValue: planCode },
            productId: { stringValue: productId },
            dodoCouponId: { nullValue: null },
            syncStatus: { stringValue: "FAILED" },
            errorMessage: { stringValue: apiErr.message },
            syncedAt: { integerValue: String(Date.now()) }
          }
        };
        await firestoreFetch(syncLogUrl, { method: "POST", body: payload });
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
