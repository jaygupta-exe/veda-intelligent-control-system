import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAnnigh3RnqwTL8yQaIPSXbtF3ZuLUtGU",
  authDomain: "veda-ai-fb2f2.firebaseapp.com",
  projectId: "veda-ai-fb2f2",
  storageBucket: "veda-ai-fb2f2.firebasestorage.app",
  messagingSenderId: "520576947244",
  appId: "1:520576947244:web:33bd6120434b23ef116d89"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
