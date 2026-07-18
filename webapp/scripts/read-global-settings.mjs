import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const newKey = JSON.parse(readFileSync(resolve(__dirname, "../functions/serviceAccountKey.json"), "utf-8"));
const newApp = initializeApp({ credential: cert(newKey) }, "NEW");
const newDb  = getFirestore(newApp);

async function read() {
  const doc = await newDb.collection("settings").doc("global").get();
  if (doc.exists) {
    console.log("GLOBAL SETTINGS:", JSON.stringify(doc.data(), null, 2));
  } else {
    console.log("Doc settings/global does not exist!");
  }
}

read().catch(console.error).finally(() => process.exit());
