import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  projectId: "apple-developer-club-sgu",
  appId: "1:305244227542:web:d47261a7dcba5cf7328677",
  storageBucket: "apple-developer-club-sgu.firebasestorage.app",
  apiKey: "AIzaSyBjaMHqICDfKeUfGdrkFHgqGQG8Erfk-L0",
  authDomain: "apple-developer-club-sgu.firebaseapp.com",
  messagingSenderId: "305244227542",
  projectNumber: "305244227542"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
