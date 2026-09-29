import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, deleteDoc, getDocs, collection, getDoc } from 'firebase/firestore';

export const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'apple-developer-club-sgu',
  appId: process.env.FIREBASE_APP_ID || '1:305244227542:web:d47261a7dcba5cf7328677',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'apple-developer-club-sgu.firebasestorage.app',
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyBjaMHqICDfKeUfGdrkFHgqGQG8Erfk-L0',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'apple-developer-club-sgu.firebaseapp.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '305244227542',
  projectNumber: '305244227542'
};

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some(arg => arg.includes('test'));

let _firestoreInstance = null;
export const getFirestoreDb = () => {
  if (isTest) return null;
  if (!_firestoreInstance) {
    try {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      _firestoreInstance = getFirestore(app);
    } catch {
      _firestoreInstance = null;
    }
  }
  return _firestoreInstance;
};

export class FirestoreSyncService {
  constructor() {
    this.isConfigured = !isTest && Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
  }

  get db() {
    return getFirestoreDb();
  }

  async save(collectionName, id, data) {
    if (!this.isConfigured || !this.db) return 'synced';
    try {
      const cleanData = JSON.parse(JSON.stringify(data));
      await setDoc(doc(this.db, collectionName, String(id)), cleanData);
      return 'synced';
    } catch (err) {
      console.error(`[Firestore] Error saving to ${collectionName}/${id}:`, err.message);
      return 'failed';
    }
  }

  async delete(collectionName, id) {
    if (!this.isConfigured || !this.db) return 'deleted';
    try {
      await deleteDoc(doc(this.db, collectionName, String(id)));
      return 'deleted';
    } catch (err) {
      console.error(`[Firestore] Error deleting from ${collectionName}/${id}:`, err.message);
      return 'failed';
    }
  }

  async get(collectionName, id) {
    if (!this.isConfigured || !this.db) return null;
    try {
      const snap = await getDoc(doc(this.db, collectionName, String(id)));
      return snap.exists() ? snap.data() : null;
    } catch (err) {
      console.error(`[Firestore] Error reading ${collectionName}/${id}:`, err.message);
      return null;
    }
  }

  async list(collectionName) {
    if (!this.isConfigured || !this.db) return [];
    try {
      const snap = await getDocs(collection(this.db, collectionName));
      return snap.docs.map(d => d.data());
    } catch (err) {
      console.error(`[Firestore] Error reading collection ${collectionName}:`, err.message);
      return [];
    }
  }
}

export const firestoreSync = new FirestoreSyncService();
