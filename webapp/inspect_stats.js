import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBAQFr7OeHkaLDk8yfNyGl6YD2qhdlnoXk",
  authDomain: "gt-metadata-merger.firebaseapp.com",
  projectId: "gt-metadata-merger",
  storageBucket: "gt-metadata-merger.firebasestorage.app",
  messagingSenderId: "198090983108",
  appId: "1:198090983108:web:a90faac4214ecd91d76b91",
  measurementId: "G-P0DY1QKD63"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log("Fetching platform_stats/global...");
  try {
    const globalDoc = await getDoc(doc(db, 'platform_stats', 'global'));
    if (globalDoc.exists()) {
      console.log("Global stats document data:", JSON.stringify(globalDoc.data(), null, 2));
    } else {
      console.log("Global stats document does not exist!");
    }
  } catch (err) {
    console.error("Error fetching global stats:", err);
  }

  console.log("Fetching settings/global...");
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
    if (settingsDoc.exists()) {
      console.log("Settings global document data:", JSON.stringify(settingsDoc.data(), null, 2));
    } else {
      console.log("Settings global document does not exist!");
    }
  } catch (err) {
    console.error("Error fetching settings global:", err);
  }
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
