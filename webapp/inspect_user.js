import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

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
const uid = "TA874QzdKuSUyMPNcJ8Yaqs3esu1";

async function inspect() {
  console.log("Fetching user document for:", uid);
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    console.log("User data:", JSON.stringify(userDoc.data(), null, 2));
  } else {
    console.log("User document not found!");
  }

  console.log("\nFetching recoveryHistory sessions...");
  const histSnap = await getDocs(collection(db, 'recoveryHistory', uid, 'sessions'));
  console.log(`Found ${histSnap.size} history sessions.`);
  histSnap.forEach(doc => {
    console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
  });

  console.log("\nFetching recoveries for user...");
  const recoveriesSnap = await getDocs(query(collection(db, 'recoveries'), where("uid", "==", uid)));
  console.log(`Found ${recoveriesSnap.size} recoveries.`);
  recoveriesSnap.forEach(doc => {
    console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
  });
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
