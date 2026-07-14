const path = require("path");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

async function run() {
  const docRef = db.collection("settings").doc("system");
  const snap = await docRef.get();
  
  const existingKey = snap.exists ? snap.data().indexnow_key : null;
  if (!existingKey) {
    const defaultKey = "e107aca980264801af5ddd4a7fe361a3";
    console.log(`Setting default indexnow_key in database: ${defaultKey}`);
    await docRef.set({ indexnow_key: defaultKey }, { merge: true });
    console.log("🟢 Successfully set indexnow_key in settings/system!");
  } else {
    console.log(`indexnow_key already exists in database: ${existingKey}`);
  }
}

run().catch(console.error);
