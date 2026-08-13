import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  projectId: "intricate-analogy-3zp2g",
  appId: "1:1048107609495:web:29514190d0416c3519e8d2",
  apiKey: "AIzaSyDItGyEsgm5-Sccrxh7iUFuRoFkK8SUidw",
  authDomain: "intricate-analogy-3zp2g.firebaseapp.com",
  storageBucket: "intricate-analogy-3zp2g.firebasestorage.app",
  messagingSenderId: "1048107609495"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-fogliopresenzeme-128ebfb8-4e45-47cc-bf66-b81defc011b8");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
