const path = require("path");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

async function run() {
  const snap = await db.collection("settings").doc("system").get();
  if (snap.exists) {
    console.log("FULL cloud_function_url: ", snap.data().cloud_function_url);
    console.log("FULL gateway_api_key:      ", snap.data().gateway_api_key);
  } else {
    console.log("No settings/system doc");
  }
}

run().catch(console.error);
