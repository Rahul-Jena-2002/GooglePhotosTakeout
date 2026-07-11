import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("serviceAccountKey.json", "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const MIGRATIONS = [
  {
    email: "rahuljena.dev@gmail.com",
    oldUid: "6rbFYqTgTObr3Y0tZxqFTNYgE9I2",
    newUid: "egxOcDrIaZfxvwUI7jGBEmIxFhA3"
  },
  {
    email: "rahuljenasonu@gmail.com",
    oldUid: "fM6QqyCXXSPK6vUEm9kWMZmurpl2",
    newUid: "EmiBSAUtN3f4S6kU0wJ1Im0t7aZ2"
  }
];

async function runMigration() {
  for (const m of MIGRATIONS) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Migrating data for: ${m.email}`);
    console.log(`Old UID: ${m.oldUid} ---> New UID: ${m.newUid}`);
    console.log(`--------------------------------------------------`);

    // 1. Copy user document data
    const oldUserRef = db.collection("users").doc(m.oldUid);
    const newUserRef = db.collection("users").doc(m.newUid);
    
    const oldUserSnap = await oldUserRef.get();
    const newUserSnap = await newUserRef.get();

    if (oldUserSnap.exists) {
      const oldData = oldUserSnap.data();
      console.log(`Found old user document. Plan: ${oldData.plan}, usedBytes: ${oldData.usedBytes}`);
      
      const newMergedData = {
        ...oldData,
        uid: m.newUid,
        isAdmin: true, // Keep admin flag
        // Keep new session IDs if they exist
        sessionIds: newUserSnap.exists ? (newUserSnap.data().sessionIds || oldData.sessionIds || []) : (oldData.sessionIds || [])
      };
      
      await newUserRef.set(newMergedData, { merge: true });
      console.log(`Successfully merged user doc data into new UID document.`);
    } else {
      console.log(`No old user document found under UID: ${m.oldUid}`);
    }

    // 2. Migrate recovery history sessions subcollection
    const oldSessionsRef = oldUserRef.collection("sessions");
    const newSessionsRef = newUserRef.collection("sessions");
    const sessionsSnap = await oldSessionsRef.get();

    console.log(`Found ${sessionsSnap.size} recovery sessions to migrate.`);
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      await newSessionsRef.doc(sessionDoc.id).set(sessionData, { merge: true });
      console.log(`Copied session: ${sessionDoc.id} (${sessionData.archiveName || 'Archive'})`);
      await sessionDoc.ref.delete();
    }

    // 3. Update transactions referencing old UID
    const txQuery = await db.collection("transactions").where("uid", "==", m.oldUid).get();
    console.log(`Found ${txQuery.size} transactions to update.`);
    for (const txDoc of txQuery.docs) {
      await txDoc.ref.update({ uid: m.newUid });
      console.log(`Updated transaction: ${txDoc.id}`);
    }

    // 4. Update tickets referencing old UID
    const ticketQuery = await db.collection("tickets").where("uid", "==", m.oldUid).get();
    console.log(`Found ${ticketQuery.size} tickets to update.`);
    for (const ticketDoc of ticketQuery.docs) {
      await ticketDoc.ref.update({ uid: m.newUid });
      console.log(`Updated ticket: ${ticketDoc.id}`);
    }

    // 5. Update active sessions referencing old UID
    const activeSessionsQuery = await db.collection("active_sessions").where("uid", "==", m.oldUid).get();
    console.log(`Found ${activeSessionsQuery.size} active sessions to update.`);
    for (const sessionDoc of activeSessionsQuery.docs) {
      await sessionDoc.ref.update({ uid: m.newUid });
      console.log(`Updated active session: ${sessionDoc.id}`);
    }

    // 6. Delete old user document
    if (oldUserSnap.exists) {
      await oldUserRef.delete();
      console.log(`Deleted old user document under UID: ${m.oldUid}`);
    }
  }

  console.log(`\nReconciliation completed successfully.`);
}

runMigration().catch(console.error);
