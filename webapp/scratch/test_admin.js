import admin from 'firebase-admin';
console.log("admin keys:", Object.keys(admin));
console.log("admin.firestore:", typeof admin.firestore);
try {
  const app = admin.initializeApp();
  console.log("Initialized default app");
  console.log("firestore function check:", typeof app.firestore);
} catch (e) {
  console.error("Error during init:", e.message);
}
