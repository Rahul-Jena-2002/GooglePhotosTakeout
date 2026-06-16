import admin from "firebase-admin";
import fs from "fs";

// Initialize Firebase Admin (Using application default or local service-account.json)
let serviceAccountPath = "./service-account.json";
if (fs.existsSync(serviceAccountPath)) {
  console.log(`🔑 Initializing Firebase Admin using service account: ${serviceAccountPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.log("ℹ️ Initializing Firebase Admin using default/environment credentials.");
  admin.initializeApp();
}

const db = admin.firestore();

// Staged mapping IDs (Clean, 6:36 AM successful Dodo API run)
const dodo_products = {
  in: {
    recovery_pass: "pdt_0Nh9Zks2AQYFkZDDPZ4WU",
    pro: "pdt_0Nh9Zktw0jXm6ud31Jzhs",
    super: "pdt_0Nh9ZkvbWR95UGjweWsGR"
  },
  t1: {
    recovery_pass: "pdt_0Nh9Zl6GYXA5pIg4vbqcq",
    pro: "pdt_0Nh9Zl7aupVuFeY3bbpbx",
    super: "pdt_0Nh9Zl8zmz0lnRJFgujtm"
  },
  t2: {
    recovery_pass: "pdt_0Nh9ZlDNl76WFLSCMzHv1",
    pro: "pdt_0Nh9ZlF1jy8xSfL7IbJQw",
    super: "pdt_0Nh9ZlGhyiNuBT5mM7wSD"
  },
  t3: {
    recovery_pass: "pdt_0Nh9ZlKubzBh1PcIOD64s",
    pro: "pdt_0Nh9ZlMI0FBKuCyiMcI3X",
    super: "pdt_0Nh9ZlNm9cRPWBZgwPabw"
  },
  t4: {
    recovery_pass: "pdt_0Nh9ZlSkNpF6d3Bllc5In",
    pro: "pdt_0Nh9ZlUHayGCApkmqZD2Z",
    super: "pdt_0Nh9ZlVvZutleMEjxhLpx"
  },
  eu: {
    recovery_pass: "pdt_0Nh9ZlaGXniogv1NgkIe1",
    pro: "pdt_0Nh9Zld1zXm1ZhkbZUmhA",
    super: "pdt_0Nh9ZleRd8nQZXpYhZL1p"
  },
  jp: {
    recovery_pass: "pdt_0Nh9ZliZk0JqPMIyo4xY8",
    pro: "pdt_0Nh9Zlm1Z8CtEhpXPJr9n",
    super: "pdt_0Nh9ZlnRCQnG1nyFLhyqA"
  },
  cn: {
    recovery_pass: "pdt_0Nh9ZltDGH3Esa67c8z9S",
    pro: "pdt_0Nh9Zlwi7EnYFn9ZpMPLY",
    super: "pdt_0Nh9ZlyKb3cwIf2XJH4s9"
  }
};

const dodo_products_full = {
  in: {
    pro: "pdt_0Nh9Zl0UTmszMvgYkOGP7",
    super: "pdt_0Nh9Zl3xmvzG0p9pr2n1t"
  },
  t1: {
    pro: "pdt_0Nh9ZlAPPDcYEw3EerYg1",
    super: "pdt_0Nh9ZlBv64Hj7cGQwKHuF"
  },
  t2: {
    pro: "pdt_0Nh9ZlIAdDAOfPcZvsS8r",
    super: "pdt_0Nh9ZlJYlmcXa0GHO46hn"
  },
  t3: {
    pro: "pdt_0Nh9ZlPeUWO5VpB3wva4n",
    super: "pdt_0Nh9ZlREj7rcNS1BPl9O5"
  },
  t4: {
    pro: "pdt_0Nh9ZlXNUiimhccg7Ljfz",
    super: "pdt_0Nh9ZlYn7oVNNYzQYyvM5"
  },
  eu: {
    pro: "pdt_0Nh9ZlfpnIo88P6SuYsQw",
    super: "pdt_0Nh9ZlhCOYmIo13UIG8Ld"
  },
  jp: {
    pro: "pdt_0Nh9ZlovLHLPhsa4gRPvv",
    super: "pdt_0Nh9ZlriNJ6GzUw94Wsia"
  },
  cn: {
    pro: "pdt_0Nh9Zm0QVsVeCpqErLgmE", // Corrected 'l' -> 'm' based on dashboard listing
    super: "pdt_0Nh9Zm25H0v5F5wXT7vBk"
  }
};

async function main() {
  console.log("⏳ Connecting to Firestore and staging pricing matrix updates...");
  
  const globalSettingsRef = db.collection("settings").doc("global");
  
  try {
    // Atomically merge both dictionaries into your production configuration doc
    await globalSettingsRef.set({
      dodo_products,
      dodo_products_full,
      dodo_test_mode: true, // Enables sandbox subdomain routing for checkout redirects
      lastScriptSync: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log("🚀 Success! All active mapping IDs are now live in settings/global.");
  } catch (error) {
    console.error("❌ Failed to update Firestore document:", error);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
