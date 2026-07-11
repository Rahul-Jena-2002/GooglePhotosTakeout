/**
 * seed-new-project.mjs
 * Seeds takeout-fix Firestore using the Web SDK (no service account needed)
 * Works as long as Firestore is in test mode (first 30 days of new project)
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBTj1lcAbftiAYwnv5upjHK7ET_sNgZNk",
  authDomain: "takeout-fix.firebaseapp.com",
  projectId: "takeout-fix",
  storageBucket: "takeout-fix.firebasestorage.app",
  messagingSenderId: "1089411779683",
  appId: "1:1089411779683:web:a0afa9043f9f7cecdabc56",
  measurementId: "G-YNTVCXYR6N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  console.log("🌱 Seeding takeout-fix Firestore via Web SDK...\n");

  try {
    // 1. settings/global
    console.log("📝 settings/global...");
    await setDoc(doc(db, "settings", "global"), {
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
        { featureName: "Device Limit",         free: "1 device",    recovery_pass: "1 device",     pro: "2 devices",  super: "3 devices"  },
        { featureName: "Processing Limit",     free: "",            recovery_pass: "",             pro: "",           super: "",           isDynamicLimit: true },
        { featureName: "Photo Matching",       free: "Up to 90%",   recovery_pass: "Up to 100%",   pro: "Up to 90%",  super: "Up to 90%"  },
        { featureName: "Advanced Media Tools", free: "—",           recovery_pass: "—",            pro: "—",          super: "Included"   },
        { featureName: "No Ads Window",        free: "—",           recovery_pass: "—",            pro: "—",          super: "✓ Enabled"  },
      ],
      features_config: {
        headings: { free: "Free", recovery_pass: "Recovery Pass", pro: "Pro Lifetime", super: "Super Lifetime" },
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
    console.log("  ✅ settings/global done");

    // 2. settings/system
    console.log("📝 settings/system...");
    await setDoc(doc(db, "settings", "system"), {
      cloud_function_url: ""
    }, { merge: true });
    console.log("  ✅ settings/system done");

    // 3. pricing_tiers
    console.log("📝 pricing_tiers...");
    const tiers = {
      "India":        { currency_code: "INR", currency_symbol: "₹", price_includes_tax: false, recovery_pass: { current: 249,   was: 499  }, pro_lifetime: { current: 799,   was: 1499 }, super_lifetime: { current: 1499,  was: 2999  } },
      "US (Tier 3)":  { currency_code: "USD", currency_symbol: "$", price_includes_tax: false, recovery_pass: { current: 4.99,  was: 9.99 }, pro_lifetime: { current: 29.00, was: 49.00 }, super_lifetime: { current: 49.00, was: 89.00 } },
      "Europe":       { currency_code: "EUR", currency_symbol: "€", price_includes_tax: false, recovery_pass: { current: 4.99,  was: 9.99 }, pro_lifetime: { current: 29.00, was: 49.00 }, super_lifetime: { current: 49.00, was: 89.00 } },
      "Japan":        { currency_code: "JPY", currency_symbol: "¥", price_includes_tax: false, recovery_pass: { current: 899,   was: 1799 }, pro_lifetime: { current: 5900,  was: 9900  }, super_lifetime: { current: 9900,  was: 17900 } },
      "China":        { currency_code: "CNY", currency_symbol: "¥", price_includes_tax: false, recovery_pass: { current: 49,    was: 99   }, pro_lifetime: { current: 199,   was: 399   }, super_lifetime: { current: 399,   was: 799   } },
      "Tier 1":       { currency_code: "USD", currency_symbol: "$", price_includes_tax: false, recovery_pass: { current: 1.99,  was: 3.99 }, pro_lifetime: { current: 9.99,  was: 19.99 }, super_lifetime: { current: 19.99, was: 39.99 } },
      "Tier 2":       { currency_code: "USD", currency_symbol: "$", price_includes_tax: false, recovery_pass: { current: 3.99,  was: 7.99 }, pro_lifetime: { current: 19.00, was: 39.00 }, super_lifetime: { current: 39.00, was: 69.00 } },
      "Tier 4":       { currency_code: "USD", currency_symbol: "$", price_includes_tax: false, recovery_pass: { current: 5.99,  was: 11.99 }, pro_lifetime: { current: 39.00, was: 69.00 }, super_lifetime: { current: 69.00, was: 119.00 } },
    };
    for (const [id, data] of Object.entries(tiers)) {
      await setDoc(doc(db, "pricing_tiers", id), data, { merge: true });
      console.log(`  ✅ pricing_tiers/${id}`);
    }

    // 4. config/foundingMembers
    console.log("📝 config/foundingMembers...");
    await setDoc(doc(db, "config", "foundingMembers"), { count: 0 }, { merge: true });
    console.log("  ✅ config/foundingMembers done");

    // 5. platform_stats/global
    console.log("📝 platform_stats/global...");
    await setDoc(doc(db, "platform_stats", "global"), { filesRestored: 0, bytesProcessed: 0 }, { merge: true });
    console.log("  ✅ platform_stats/global done");

    console.log("\n🎉 All done! Firestore seeded successfully.");
    console.log("\n📋 Next: Sign in at http://localhost:4321 with your Google account");
    console.log("   Auto-admin registration will trigger for rahuljena.dev@gmail.com");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (err.code === "permission-denied") {
      console.error("   Firestore rules are blocking writes.");
      console.error("   Go to Firebase Console → Firestore → Rules and set:");
      console.error("   allow read, write: if true;   (for testing only)");
    }
    process.exit(1);
  }

  process.exit(0);
}

seed();
