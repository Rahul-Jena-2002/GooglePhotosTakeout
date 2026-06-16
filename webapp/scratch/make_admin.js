import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Initialize Firebase Admin (Using application default or local service-account.json)
const serviceAccountPath = "./service-account.json";
if (fs.existsSync(serviceAccountPath)) {
  console.log(`🔑 Initializing Firebase Admin using service account: ${serviceAccountPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.log("ℹ️ Initializing Firebase Admin using default/environment credentials with project ID: gt-metadata-merger.");
  admin.initializeApp({
    projectId: "gt-metadata-merger"
  });
}

const db = getFirestore();

async function makeAdmin(identifier) {
  if (!identifier) {
    console.error("❌ Please provide a User UID or Email address as an argument.");
    console.log("Usage: node scratch/make_admin.js <UID_OR_EMAIL>");
    process.exit(1);
  }

  let uid = identifier;
  let email = "";
  let displayName = "Admin User";

  // Check if identifier looks like an email
  if (identifier.includes("@")) {
    console.log(`🔍 Searching for user with email: ${identifier}...`);
    const usersSnap = await db.collection("users").where("email", "==", identifier).limit(1).get();
    if (usersSnap.empty) {
      console.error(`❌ No user document found for email: ${identifier}`);
      process.exit(1);
    }
    const userDoc = usersSnap.docs[0];
    uid = userDoc.id;
    email = userDoc.data().email || identifier;
    displayName = userDoc.data().displayName || displayName;
  } else {
    // Treat as UID, look up in users collection
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      email = userDoc.data().email || "";
      displayName = userDoc.data().displayName || displayName;
    }
  }

  console.log(`⏳ Granting Super Admin access to UID: ${uid} (${email || "No Email"})...`);

  // 1. Write admin document
  await db.collection("admins").doc(uid).set({
    uid,
    email: email || "admin@takeoutfix.com",
    displayName,
    role: "SUPER_ADMIN",
    status: "online",
    lastSeen: Date.now(),
    createdAt: Date.now()
  }, { merge: true });

  // 2. Set isAdmin flag in user document
  await db.collection("users").doc(uid).set({
    isAdmin: true
  }, { merge: true });

  console.log(`🚀 Success! User ${uid} is now registered as a SUPER_ADMIN in Firestore.`);
}

const arg = process.argv[2];
makeAdmin(arg)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed to grant admin access:", err);
    process.exit(1);
  });
