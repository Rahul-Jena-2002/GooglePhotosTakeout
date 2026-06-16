import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const { initializeApp, cert } = admin;

// Initialize Firebase Admin (Using local service-account.json or environment credentials)
const serviceAccountPath = "./service-account.json";
if (fs.existsSync(serviceAccountPath)) {
  console.log(`🔑 Initializing Firebase Admin using service account: ${serviceAccountPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  initializeApp({
    credential: cert(serviceAccount)
  });
} else {
  console.log("ℹ️ Initializing Firebase Admin using default/environment credentials with project ID: gt-metadata-merger.");
  initializeApp({
    projectId: "gt-metadata-merger"
  });
}

const db = getFirestore();

// 8 Regional configurations mapped to their Firestore document IDs
const PRICING_TIERS = {
  "India": {
    currency_code: "INR",
    currency_symbol: "₹",
    recovery_pass: { current: 249, was: 499 },
    pro_lifetime: { current: 799, was: 1499 },
    super_lifetime: { current: 1499, was: 2999 }
  },
  "China": {
    currency_code: "CNY",
    currency_symbol: "¥",
    recovery_pass: { current: 49, was: 99 },
    pro_lifetime: { current: 199, was: 399 },
    super_lifetime: { current: 399, was: 799 }
  },
  "Japan": {
    currency_code: "JPY",
    currency_symbol: "¥",
    recovery_pass: { current: 899, was: 1799 },
    pro_lifetime: { current: 5900, was: 11900 },
    super_lifetime: { current: 9900, was: 19900 }
  },
  "Europe": {
    currency_code: "EUR",
    currency_symbol: "€",
    recovery_pass: { current: 4.99, was: 9.99 },
    pro_lifetime: { current: 29.00, was: 59.00 },
    super_lifetime: { current: 49.00, was: 99.00 }
  },
  "Tier 1": {
    currency_code: "USD",
    currency_symbol: "$",
    recovery_pass: { current: 1.99, was: 3.99 },
    pro_lifetime: { current: 9.99, was: 19.99 },
    super_lifetime: { current: 19.99, was: 39.99 }
  },
  "Tier 2": {
    currency_code: "USD",
    currency_symbol: "$",
    recovery_pass: { current: 3.99, was: 7.99 },
    pro_lifetime: { current: 19.00, was: 39.00 },
    super_lifetime: { current: 39.00, was: 79.00 }
  },
  "US (Tier 3)": {
    currency_code: "USD",
    currency_symbol: "$",
    recovery_pass: { current: 4.99, was: 9.99 },
    pro_lifetime: { current: 29.00, was: 59.00 },
    super_lifetime: { current: 49.00, was: 99.00 }
  },
  "Tier 4": {
    currency_code: "USD",
    currency_symbol: "$",
    recovery_pass: { current: 5.99, was: 11.99 },
    pro_lifetime: { current: 39.00, was: 79.00 },
    super_lifetime: { current: 69.00, was: 139.00 }
  }
};

// Initial campaigns document seed values
const CAMPAIGN = {
  card_title: "Family License",
  discount_percentage: 20,
  dodo_variant_id: "pdt_family_placeholder",
  active_features: [
    "Everything in Super Lifetime",
    "Share access with up to 5 family members",
    "Separate individual history logs",
    "VIP customer support response SLA"
  ],
  visibility_toggle: true,
  condition_type: "none",
  max_purchase_limit: null,
  current_purchase_count: 0,
  expiration_at: null
};

async function seed() {
  console.log("⏳ Seeding regional pricing tiers...");
  for (const [region, data] of Object.entries(PRICING_TIERS)) {
    await db.collection("pricing_tiers").doc(region).set(data);
    console.log(`✓ Seeded region pricing tier: ${region}`);
  }

  console.log("⏳ Seeding admin campaigns configuration...");
  await db.collection("admin_config").doc("campaigns").set(CAMPAIGN);
  console.log("✓ Seeded admin_config/campaigns document.");

  console.log("🚀 Firestore seeding completed successfully!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  });
