const path = require("path");
const https = require("https");
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

function makeRequest(url) {
  return new Promise((resolve) => {
    console.log(`\nTesting URL: ${url}`);
    const urlObj = new URL(url);
    const body = JSON.stringify({
      regionCode: "in",
      planCode: "pro"
    });
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "tf-nYaeW9VRotsI4XYUCSuIHp7VTeBP5oZrGUZ6ZFoH",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    
    const req = https.request(options, (res) => {
      let resBody = "";
      res.on("data", (chunk) => resBody += chunk);
      res.on("end", () => {
        resolve({ status: res.statusCode, body: resBody });
      });
    });
    
    req.on("error", (err) => {
      resolve({ error: err.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function run() {
  const res1 = await makeRequest("https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway/get-dodo-product");
  console.log(`Result 1: Status=${res1.status || 'ERROR'} Error=${res1.error || 'NONE'}`);
  console.log("Body:", res1.body);
  
  const res2 = await makeRequest("https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway/geminiToolGateway/get-dodo-product");
  console.log(`Result 2: Status=${res2.status || 'ERROR'} Error=${res2.error || 'NONE'}`);
  console.log("Body:", res2.body);
}

run().catch(console.error);
