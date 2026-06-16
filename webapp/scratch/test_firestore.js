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

async function run() {
  try {
    const snap = await getDoc(doc(db, "config", "foundingMembers"));
    if (snap.exists()) {
      console.log("Firestore config/foundingMembers count:", snap.data());
    } else {
      console.log("Firestore config/foundingMembers does not exist!");
    }
  } catch (err) {
    console.error("Error fetching doc:", err);
  }
  process.exit(0);
}

run();
