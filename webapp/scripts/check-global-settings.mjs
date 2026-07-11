import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const serviceAccountPath = "g:/Projects/Google Takeout FIx/webapp/functions/serviceAccountKey.json";
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = getFirestore();
const globalSnap = await db.collection("settings").doc("global").get();
if (globalSnap.exists) {
  console.log("Global Settings Document Data:");
  console.log(JSON.stringify(globalSnap.data(), null, 2));
} else {
  console.log("settings/global document does not exist!");
}
