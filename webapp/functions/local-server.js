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
