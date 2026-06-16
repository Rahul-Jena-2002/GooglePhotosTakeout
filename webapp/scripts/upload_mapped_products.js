import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const activeProducts = {
  "in": {
    "recovery_pass": "pdt_0Nh9Zks2AQYFkZDDPZ4WU",
    "pro": "pdt_0Nh9Zktw0jXm6ud31Jzhs",
    "super": "pdt_0Nh9ZkvbWR95UGjweWsGR"
  },
  "t1": {
    "recovery_pass": "pdt_0Nh9Zl6GYXA5pIg4vbqcq",
    "pro": "pdt_0Nh9Zl7aupVuFeY3bbpbx",
    "super": "pdt_0Nh9Zl8zmz0lnRJFgujtm"
  },
  "t2": {
    "recovery_pass": "pdt_0Nh9ZlDNl76WFLSCMzHv1",
    "pro": "pdt_0Nh9ZlF1jy8xSfL7IbJQw",
    "super": "pdt_0Nh9ZlGhyiNuBT5mM7wSD"
  },
  "t3": {
    "recovery_pass": "pdt_0Nh9ZlKubzBh1PcIOD64s",
    "pro": "pdt_0Nh9ZlMI0FBKuCyiMcI3X",
    "super": "pdt_0Nh9ZlNm9cRPWBZgwPabw"
  },
  "t4": {
    "recovery_pass": "pdt_0Nh9ZlSkNpF6d3Bllc5In",
    "pro": "pdt_0Nh9ZlUHayGCApkmqZD2Z",
    "super": "pdt_0Nh9ZlVvZutleMEjxhLpx"
  },
  "eu": {
    "recovery_pass": "pdt_0Nh9ZlaGXniogv1NgkIe1",
    "pro": "pdt_0Nh9Zld1zXm1ZhkbZUmhA",
    "super": "pdt_0Nh9ZleRd8nQZXpYhZL1p"
  },
  "jp": {
    "recovery_pass": "pdt_0Nh9ZliZk0JqPMIyo4xY8",
    "pro": "pdt_0Nh9Zlm1Z8CtEhpXPJr9n",
    "super": "pdt_0Nh9ZlnRCQnG1nyFLhyqA"
  },
  "cn": {
    "recovery_pass": "pdt_0Nh9ZltDGH3Esa67c8z9S",
    "pro": "pdt_0Nh9Zlwi7EnYFn9ZpMPLY",
    "super": "pdt_0Nh9ZlyKb3cwIf2XJH4s9"
  }
};

const fullProducts = {
  "in": {
    "pro": "pdt_0Nh9Zl0UTmszMvgYkOGP7",
    "super": "pdt_0Nh9Zl3xmvzG0p9pr2n1t"
  },
  "t1": {
    "pro": "pdt_0Nh9ZlAPPDcYEw3EerYg1",
    "super": "pdt_0Nh9ZlBv64Hj7cGQwKHuF"
  },
  "t2": {
    "pro": "pdt_0Nh9ZlIAdDAOfPcZvsS8r",
    "super": "pdt_0Nh9ZlJYlmcXa0GHO46hn"
  },
  "t3": {
    "pro": "pdt_0Nh9ZlPeUWO5VpB3wva4n",
    "super": "pdt_0Nh9ZlREj7rcNS1BPl9O5"
  },
  "t4": {
    "pro": "pdt_0Nh9ZlXNUiimhccg7Ljfz",
    "super": "pdt_0Nh9ZlYn7oVNNYzQYyvM5"
  },
  "eu": {
    "pro": "pdt_0Nh9ZlfpnIo88P6SuYsQw",
    "super": "pdt_0Nh9ZlhCOYmIo13UIG8Ld"
  },
  "jp": {
    "pro": "pdt_0Nh9ZlovLHLPhsa4gRPvv",
    "super": "pdt_0Nh9ZlriNJ6GzUw94Wsia"
  },
  "cn": {
    "pro": "pdt_0Nh9Zm0QVsVeCpqErLgmE",
    "super": "pdt_0Nh9Zm25H0v5F5wXT7vBk"
  }
};

async function run() {
  console.log(`\n======================================================`);
  console.log(`💾 TakeoutFix Product Mapping Firestore Uploader`);
  console.log(`======================================================\n`);

  let serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath && fs.existsSync('./service-account.json')) {
    serviceAccountPath = './service-account.json';
  }

  if (!serviceAccountPath && !process.env.FIREBASE_CONFIG && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("❌ Error: Firebase credentials not found.");
    console.log("Please authenticate in one of the following ways:");
    console.log("1. Download a service account JSON file from the Firebase Console (Settings -> Service Accounts).");
    console.log("2. Place it in the webapp folder as 'service-account.json' or set GOOGLE_APPLICATION_CREDENTIALS.");
    console.log("   Example: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/upload_mapped_products.js\n");
    process.exit(1);
  }

  if (admin.apps.length === 0) {
    if (serviceAccountPath) {
      console.log(`🔑 Using service account credentials from: ${serviceAccountPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.log("ℹ️ Initializing Firebase Admin with application default configuration.");
      admin.initializeApp();
    }
  }

  const db = admin.firestore();

  console.log("Writing mappings to /settings/global...");
  await db.collection("settings").doc("global").set({
    dodo_products: activeProducts,
    dodo_products_full: fullProducts,
    dodo_test_mode: true
  }, { merge: true });

  console.log("✅ Successfully wrote product mappings to settings/global in Firestore!");
  console.log("   dodo_products (Active Founding prices & Recovery Pass)");
  console.log("   dodo_products_full (Full prices for Pro/Super)");
  console.log("\n🎉 Upload finished successfully!");
}

run().then(() => process.exit(0)).catch(err => {
  console.error(`\n❌ Error occurred:`, err.message);
  process.exit(1);
});
