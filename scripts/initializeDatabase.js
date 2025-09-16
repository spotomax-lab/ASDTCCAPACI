// scripts/initializeDatabase.js
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

// La tua configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB9EY3fBSeAMSxD0a8rBNXssQcuLHOOskE",
  authDomain: "asd-tc-capaci.firebaseapp.com",
  projectId: "asd-tc-capaci",
  storageBucket: "asd-tc-capaci.firebasestorage.app",
  messagingSenderId: "704239141797",
  appId: "1:704239141797:web:8a745fbd360714ef41de4c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const initializeSlotConfigurations = async () => {
  try {
    const daysOfWeek = [1, 2, 3, 4, 5, 6]; // Lunedì to Sabato
    const courts = ['1', '2'];

    for (const courtId of courts) {
      for (const dayOfWeek of daysOfWeek) {
        const config = {
          courtId,
          dayOfWeek,
          slotDuration: 60, // Default a 60 minuti
          startTime: '08:00',
          endTime: '22:00',
          activityType: 'regular',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await addDoc(collection(db, 'slotConfigurations'), config);
      }
    }

    console.log('✅ Configurazioni slot inizializzate con successo!');
  } catch (error) {
    console.error('❌ Errore durante l\'inizializzazione:', error);
  }
};

// Esegui la funzione
initializeSlotConfigurations();