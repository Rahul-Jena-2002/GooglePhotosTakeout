/**
 * migrate-firestore.mjs
 * Full migration from old project -> new project
 * AUTO-DISCOVERS all collections and sub-collections from Firestore
 * Nothing is hardcoded — reads whatever exists in the source DB
 *
 * Usage: node scripts/migrate-firestore.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Init OLD project (source) ────────────────────────────────────────────────
const oldKey = JSON.parse(readFileSync(resolve(__dirname, "../functions/serviceAccountKey-OLD.json"), "utf-8"));
const oldApp = initializeApp({ credential: cert(oldKey) }, "OLD");
const oldDb  = getFirestore(oldApp);

// ── Init NEW project (destination) ───────────────────────────────────────────
const newKey = JSON.parse(readFileSync(resolve(__dirname, "../functions/serviceAccountKey.json"), "utf-8"));
const newApp = initializeApp({ credential: cert(newKey) }, "NEW");
const newDb  = getFirestore(newApp);

let totalDocs = 0;
let totalCols = 0;

// ── Recursively migrate a collection and ALL its sub-collections ─────────────
async function migrateCollection(colRef, dstDb, depth = 0) {
  const pad = "  ".repeat(depth);
  const snap = await colRef.get();

  if (snap.empty) {
    console.log(`${pad}⬜  ${colRef.path} (empty)`);
    return;
  }

  totalCols++;
  const BATCH_SIZE = 400;
  let batch = dstDb.batch();
  let batchCount = 0;
  let docCount = 0;

  for (const docSnap of snap.docs) {
    const dstRef = dstDb.doc(docSnap.ref.path);
    batch.set(dstRef, docSnap.data(), { merge: true });
    batchCount++;
    docCount++;
    totalDocs++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = dstDb.batch();
      batchCount = 0;
    }

    // Auto-discover and recurse into ALL sub-collections
    const subCols = await docSnap.ref.listCollections();
    for (const subCol of subCols) {
      await migrateCollection(subCol, dstDb, depth + 1);
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`${pad}✅ ${colRef.path} — ${docCount} docs`);
}

async function migrate() {
  console.log("🚀 Starting full Firestore migration");
  console.log(`   FROM: ${oldKey.project_id}`);
  console.log(`   TO:   ${newKey.project_id}`);
  console.log("   Mode: AUTO-DISCOVER (reads all collections from source)\n");

  // Discover ALL root-level collections from the old DB
  const rootCols = await oldDb.listCollections();

  if (rootCols.length === 0) {
    console.log("⚠️  No collections found in source project.");
    return;
  }

  console.log(`📦 Found ${rootCols.length} root collections: ${rootCols.map(c => c.id).join(", ")}\n`);

  for (const col of rootCols) {
    try {
      await migrateCollection(col, newDb);
    } catch (err) {
      console.error(`❌ Failed on "${col.path}": ${err.message}`);
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`   📁 ${totalCols} collections migrated`);
  console.log(`   📄 ${totalDocs} total documents copied`);
  console.log(`\n🔐 Encrypted keys (Dodo/Stripe/Gemini) copied AS-IS.`);
  console.log(`   Enter your MEK in Admin → Keys & Secrets to unlock them.`);
}

migrate().catch(console.error).finally(() => process.exit());
