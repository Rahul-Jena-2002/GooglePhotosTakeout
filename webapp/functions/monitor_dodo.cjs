const path = require("path");
// Programmatically set GOOGLE_APPLICATION_CREDENTIALS
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

const admin = require("firebase-admin");
admin.initializeApp();

const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

console.log("======================================================");
console.log("🚀 Real-time Dodo Payments Firestore Monitor Active");
console.log("======================================================\n");

// Print initial state of settings/secure to see if keys exist
db.collection("settings").doc("secure").get().then(doc => {
  if (doc.exists) {
    const data = doc.data();
    console.log("🟢 Settings/secure read test: SUCCESS");
    console.log(`🔑 dodo_webhook_key is set: ${data.dodo_webhook_key ? "YES" : "NO"}`);
    console.log(`🔑 dodo_api_key is set: ${data.dodo_api_key ? "YES" : "NO"}`);
  } else {
    console.log("⚠️ settings/secure does not exist or has no data.");
  }
}).catch(err => {
  console.error("❌ Failed to read settings/secure:", err.message);
});

// Print initial state of settings/global
db.collection("settings").doc("global").get().then(doc => {
  if (doc.exists) {
    const data = doc.data();
    console.log("🟢 Settings/global read test: SUCCESS");
    console.log("📦 Dodo products configured:");
    console.log(JSON.stringify(data.dodo_products || {}, null, 2));
  }
}).catch(err => {
  console.error("❌ Failed to read settings/global:", err.message);
});

// Monitor transactions
let initialTransactionsLoaded = false;
db.collection("transactions")
  .orderBy("timestamp", "desc")
  .limit(5)
  .onSnapshot(snapshot => {
    if (!initialTransactionsLoaded) {
      console.log("\n📜 Recent 5 Transactions in Database:");
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(` - ID: ${doc.id} | User: ${data.uid} | Plan: ${data.plan} | Amount: ${data.currency} ${data.amount} | Status: ${data.status} | Date: ${new Date(data.timestamp || 0).toLocaleString()}`);
      });
      initialTransactionsLoaded = true;
      console.log("\n⚡ Listening for new transactions...");
      return;
    }

    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        console.log(`\n🆕 [NEW TRANSACTION DETECTED]`);
        console.log(`   Transaction ID: ${change.doc.id}`);
        console.log(`   User UID:       ${data.uid}`);
        console.log(`   Email:          ${data.email || 'N/A'}`);
        console.log(`   Plan:           ${data.plan}`);
        console.log(`   Amount:         ${data.currency} ${data.amount}`);
        console.log(`   Status:         ${data.status}`);
        console.log(`   Timestamp:      ${new Date(data.timestamp || Date.now()).toLocaleString()}`);
      } else if (change.type === 'modified') {
        const data = change.doc.data();
        console.log(`\n🔄 [TRANSACTION UPDATED]`);
        console.log(`   Transaction ID: ${change.doc.id}`);
        console.log(`   Status:         ${data.status}`);
        console.log(`   User UID:       ${data.uid}`);
      }
    });
  }, err => {
    console.error("❌ Transactions snapshot listener error:", err.message);
  });

// Monitor users
let initialUsersLoaded = false;
db.collection("users")
  .orderBy("updatedAt", "desc")
  .limit(5)
  .onSnapshot(snapshot => {
    if (!initialUsersLoaded) {
      console.log("\n📜 Recent 5 Updated Users in Database:");
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(` - UID: ${doc.id} | Plan: ${data.plan} | Updated: ${data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'N/A'}`);
      });
      initialUsersLoaded = true;
      console.log("\n⚡ Listening for user plan upgrades...");
      return;
    }

    snapshot.docChanges().forEach(change => {
      const data = change.doc.data();
      const timeStr = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'N/A';
      console.log(`\n👤 [USER PLAN MODIFIED]`);
      console.log(`   User UID:  ${change.doc.id}`);
      console.log(`   New Plan:  ${data.plan}`);
      console.log(`   Updated:   ${timeStr}`);
      console.log(`   Raw Data:`, JSON.stringify(data, null, 2));
    });
  }, err => {
    console.error("❌ Users snapshot listener error:", err.message);
  });
