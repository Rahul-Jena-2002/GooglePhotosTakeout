const path = require("path");
const https = require("https");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

// Decrypt helper (matching index.js behavior)
const decryptFirestoreValue = (val) => {
  if (!val) return "";
  if (!val.startsWith("enc:v1:")) return val;
  
  // Try to use a test encryption key or local env
  const mek = process.env.ENCRYPTION_KEY;
  if (!mek) {
    console.error("❌ ENCRYPTION_KEY environment variable is required to decrypt Firestore secrets.");
    return "";
  }
  
  try {
    const crypto = require("crypto");
    const salt = Buffer.alloc(16);
    const key = crypto.pbkdf2Sync(mek, salt, 100000, 32, "sha256");

    const hex = val.slice(7);
    const combined = Buffer.from(hex, "hex");

    const iv = combined.subarray(0, 12);
    const ciphertextAndTag = combined.subarray(12);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, "binary", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("❌ Failed to decrypt Firestore value:", err.message);
    return "";
  }
};

async function testDodoApi() {
  console.log("Fetching Dodo Live API key from Firestore...");
  const snap = await db.collection("settings").doc("system").get();
  if (!snap.exists) {
    console.error("❌ settings/system doc does not exist!");
    return;
  }
  
  const rawKey = snap.data().dodo_api_key;
  if (!rawKey) {
    console.error("❌ dodo_api_key not found in settings/system!");
    return;
  }
  
  console.log(`Raw key status: type=${typeof rawKey}, startsWithEnc=${rawKey.startsWith("enc:v1:")}`);
  const apiKey = decryptFirestoreValue(rawKey);
  if (!apiKey) {
    console.error("❌ API Key decrypted to empty string!");
    return;
  }
  
  console.log(`Using API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);
  
  // Call Dodo products API
  const options = {
    hostname: "live.dodopayments.com",
    path: "/v1/products",
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  };
  
  console.log("Sending GET request to live.dodopayments.com/v1/products...");
  const req = https.request(options, (res) => {
    let body = "";
    res.on("data", (chunk) => body += chunk);
    res.on("end", () => {
      console.log(`\nResponse Status: ${res.statusCode} ${res.statusMessage}`);
      console.log("Response headers:");
      console.log(JSON.stringify(res.headers, null, 2));
      try {
        const parsed = JSON.parse(body);
        console.log(`\nResponse Body (Success): JSON parsed successfully. Keys: ${Object.keys(parsed).join(", ")}`);
        if (parsed.data) {
          console.log(`Number of products: ${parsed.data.length}`);
          parsed.data.slice(0, 3).forEach(p => {
            console.log(` - Product: ID=${p.id || p.product_id}, Name=${p.name}`);
          });
        } else {
          console.log("Parsed body structure:", JSON.stringify(parsed, null, 2));
        }
      } catch (err) {
        console.log("\nResponse Body (Raw):");
        console.log(body);
      }
    });
  });
  
  req.on("error", (err) => {
    console.error("❌ Request failed:", err.message);
  });
  
  req.end();
}

testDodoApi().catch(console.error);
