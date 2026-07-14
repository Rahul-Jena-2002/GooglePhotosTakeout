const path = require("path");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

async function run() {
  console.log("Reading settings/secure...");
  const snap = await db.collection("settings").doc("secure").get();
  if (snap.exists) {
    const data = snap.data();
    for (const key of Object.keys(data)) {
      const val = data[key];
      const isEncrypted = typeof val === 'string' && val.startsWith("enc:v1:");
      console.log(`Key: ${key}`);
      console.log(` - Type: ${typeof val}`);
      console.log(` - Is Encrypted (starts with enc:v1:): ${isEncrypted}`);
      if (isEncrypted) {
        console.log(` - Encrypted value prefix: ${val.substring(0, 15)}...`);
      } else if (val) {
        console.log(` - Plain value length: ${val.length}`);
        console.log(` - Plain value preview: ${val.substring(0, 10)}...`);
      }
    }
  } else {
    console.log("settings/secure does not exist!");
  }
}

run().catch(console.error);
