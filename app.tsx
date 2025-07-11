// App.tsx
import React, { useEffect, useState } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, User } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, setDoc, Timestamp, getDoc } from "firebase/firestore";

// Replace with your Firebase config from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyCzm1BYe4_1MXYlTNdW1Mjhv5ruWb_O97A",
  authDomain: "puppy-conversations.firebaseapp.com",
  projectId: "puppy-conversations",
  storageBucket: "puppy-conversations.firebasestorage.app",
  messagingSenderId: "791969376077",
  appId: "1:791969376077:web:57d4faf751a78fbee33904",
  measurementId: "G-1ZBS2R9SLH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

interface Conversation {
  id: string;
  name?: string;
  participants: string[];
  phoneNumberId: string;
  lastActivityAt: Timestamp;
}

interface Message {
  id: string;
  from: string;
  to: string[];
  direction: 'incoming' | 'outgoing';
  text: string;
  status: string;
  createdAt: Timestamp;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return unsubscribe;
  }, []);

  if (!user) {
    return <Auth />;
  }

  return <Dashboard user={user} />;
};
