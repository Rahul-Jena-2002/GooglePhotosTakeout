import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
const { initializeApp, cert } = admin;

console.log("cert is:", typeof cert);
