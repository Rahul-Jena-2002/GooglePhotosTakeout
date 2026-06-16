import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
const { initializeApp, credential } = admin;

console.log("getFirestore is:", typeof getFirestore);
console.log("credential is:", typeof credential);
