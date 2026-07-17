// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBEu8ppzxYD_WM6OH84Nqxhgh03Kog79tU",
  authDomain: "tamweel-platform.firebaseapp.com",
  projectId: "tamweel-platform",
  storageBucket: "tamweel-platform.firebasestorage.app",
  messagingSenderId: "864897617521",
  appId: "1:864897617521:web:aa8f9ec96c4b896ca155d0",
  measurementId: "G-GZF36SWZ0L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Google Sign In Helper
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export default app;
