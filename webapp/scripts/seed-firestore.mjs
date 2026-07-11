/**
 * seed-firestore.mjs
 * Seeds the new takeout-fix Firebase project with all required
 * Firestore collections and documents for the app to work.
 *
 * Usage:
 *   node scripts/seed-firestore.mjs
 *
 * Requires: serviceAccountKey.json in webapp/functions/ directory
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, "../functions/serviceAccountKey.json"), "utf-8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function seed() {
  console.log("🌱 Seeding Firestore for takeout-fix project...\n");

  // ─── 1. settings/global ─────────────────────────────────────────────────────
  console.log("📝 Writing settings/global...");
  await db.doc("settings/global").set({
    active_gateway: "dodo",
    dodo_test_mode: true,
    dodo_products: {
      in:  { recovery_pass: "", pro: "", super: "" },
      t1:  { recovery_pass: "", pro: "", super: "" },
      t2:  { recovery_pass: "", pro: "", super: "" },
      t3:  { recovery_pass: "", pro: "", super: "" },
      t4:  { recovery_pass: "", pro: "", super: "" },
      eu:  { recovery_pass: "", pro: "", super: "" },
      jp:  { recovery_pass: "", pro: "", super: "" },
      cn:  { recovery_pass: "", pro: "", super: "" },
    },
    tierThresholds: {
      free:          { maxFiles: 250,    maxSizeMB: 500    },
      recovery_pass: { maxFiles: 3000,   maxSizeMB: 3072   },
      pro:           { maxFiles: 50000,  maxSizeMB: 51200  },
      super:         { maxFiles: 100000, maxSizeMB: 102400 },
    },
    refundPolicy: "We offer a 100% Recovery Guarantee: if a verified technical issue prevents your restoration, and our support desk is unable to resolve it, we will issue a full refund within 7 days of purchase. Refunds are not available for change of mind or successfully completed recoveries.",
    comparisonRows: [
      { featureName: "Device Limit",        free: "1 device", recovery_pass: "1 device", pro: "2 devices",  super: "3 devices"  },
      { featureName: "Processing Limit",    free: "",         recovery_pass: "",         pro: "",           super: "",           isDynamicLimit: true },
      { featureName: "Photo Matching",      free: "Up to 90%", recovery_pass: "Up to 100%", pro: "Up to 90%", super: "Up to 90%" },
      { featureName: "Advanced Media Tools", free: "—",        recovery_pass: "—",        pro: "—",          super: "Included"   },
      { featureName: "No Ads Window",       free: "—",        recovery_pass: "—",        pro: "—",          super: "✓ Enabled"  },
    ],
    features_config: {
      headings: {
        free: "Free",
        recovery_pass: "Recovery Pass",
        pro: "Pro Lifetime",
        super: "Super Lifetime"
      },
      subheadings: {
        free: "Free up to 250 files or 500MB",
        recovery_pass: "Single takeout batch up to 3,000 files or 3GB",
        pro: "Unlimited photos and videos. 2 devices. Lifetime.",
        super: "Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime."
      },
      free: [
        { text: "Free up to 250 files or 500MB", isBold: false },
        { text: "Restores original dates & times", isBold: false },
        { text: "Works directly in your browser", isBold: false },
        { text: "Photos stay 100% private", isBold: false }
      ],
      recovery_pass: [
        { text: "Single takeout batch up to 3,000 files or 3GB", isBold: true },
        { text: "Friendly support help desk", isBold: false },
        { text: "Download clean file update logs", isBold: false }
      ],
      pro: [
        { text: "Unlimited photos & videos", isBold: true },
        { text: "Keep history of your runs", isBold: false },
        { text: "Priority support messages", isBold: false }
      ],
      super: [
        { text: "Complete ad-free experience", isBold: true },
        { text: "View hidden photo details", isBold: false },
        { text: "Find and clean duplicates", isBold: false },
        { text: "Compare before & after logs", isBold: false }
      ]
    }
  }, { merge: true });

  // ─── 2. settings/system ─────────────────────────────────────────────────────
  console.log("📝 Writing settings/system...");
  await db.doc("settings/system").set({
    cloud_function_url: ""
  }, { merge: true });

  // ─── 3. pricing_tiers ────────────────────────────────────────────────────────
  console.log("📝 Writing pricing_tiers...");
  const pricingTiers = {
    "India": {
      currency_code: "INR", currency_symbol: "₹", price_includes_tax: false,
      recovery_pass: { current: 249,    was: 499  },
      pro_lifetime:  { current: 799,    was: 1499 },
      super_lifetime:{ current: 1499,   was: 2999 }
    },
    "US (Tier 3)": {
      currency_code: "USD", currency_symbol: "$", price_includes_tax: false,
      recovery_pass: { current: 4.99,  was: 9.99  },
      pro_lifetime:  { current: 29.00, was: 49.00 },
      super_lifetime:{ current: 49.00, was: 89.00 }
    },
    "Europe": {
      currency_code: "EUR", currency_symbol: "€", price_includes_tax: false,
      recovery_pass: { current: 4.99,  was: 9.99  },
      pro_lifetime:  { current: 29.00, was: 49.00 },
      super_lifetime:{ current: 49.00, was: 89.00 }
    },
    "Japan": {
      currency_code: "JPY", currency_symbol: "¥", price_includes_tax: false,
      recovery_pass: { current: 899,  was: 1799 },
      pro_lifetime:  { current: 5900, was: 9900 },
      super_lifetime:{ current: 9900, was: 17900 }
    },
    "China": {
      currency_code: "CNY", currency_symbol: "¥", price_includes_tax: false,
      recovery_pass: { current: 49,  was: 99  },
      pro_lifetime:  { current: 199, was: 399 },
      super_lifetime:{ current: 399, was: 799 }
    },
    "Tier 1": {
      currency_code: "USD", currency_symbol: "$", price_includes_tax: false,
      recovery_pass: { current: 1.99, was: 3.99  },
      pro_lifetime:  { current: 9.99, was: 19.99 },
      super_lifetime:{ current: 19.99, was: 39.99 }
    },
    "Tier 2": {
      currency_code: "USD", currency_symbol: "$", price_includes_tax: false,
      recovery_pass: { current: 3.99,  was: 7.99  },
      pro_lifetime:  { current: 19.00, was: 39.00 },
      super_lifetime:{ current: 39.00, was: 69.00 }
    },
    "Tier 4": {
      currency_code: "USD", currency_symbol: "$", price_includes_tax: false,
      recovery_pass: { current: 5.99,  was: 11.99 },
      pro_lifetime:  { current: 39.00, was: 69.00 },
      super_lifetime:{ current: 69.00, was: 119.00 }
    }
  };
  for (const [docId, data] of Object.entries(pricingTiers)) {
    await db.doc(`pricing_tiers/${docId}`).set(data, { merge: true });
    console.log(`  ✓ pricing_tiers/${docId}`);
  }

  // ─── 4. config/foundingMembers ───────────────────────────────────────────────
  console.log("📝 Writing config/foundingMembers...");
  await db.doc("config/foundingMembers").set({ count: 0 }, { merge: true });

  // ─── 5. platform_stats/global ───────────────────────────────────────────────
  console.log("📝 Writing platform_stats/global...");
  await db.doc("platform_stats/global").set({
    filesRestored: 0,
    bytesProcessed: 0
  }, { merge: true });

  console.log("\n✅ Firestore seeded successfully!");
  console.log("\n📋 Next steps:");
  console.log("  1. Go to Firebase Console → takeout-fix → Authentication");
  console.log("  2. Enable Google Sign-In provider");
  console.log("  3. Add 'localhost' to Authorized Domains");
  console.log("  4. Add your new serviceAccountKey.json to webapp/functions/");
  console.log("  5. Open http://localhost:4321 and sign in — admin access auto-registers!");
}

seed().catch(console.error).finally(() => process.exit());
