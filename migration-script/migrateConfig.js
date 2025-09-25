// Configurazione per lo script di migrazione
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// La tua configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB9EY3fBSeAMSxD0a8rBNXssQcuLHOOskE",
  authDomain: "asd-tc-capaci.firebaseapp.com",
  projectId: "asd-tc-capaci",
  storageBucket: "asd-tc-capaci.firebasestorage.app",
  messagingSenderId: "704239141797",
  appId: "1:704239141797:web:8a745fbd360714ef41de4c"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);