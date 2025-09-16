// config/firebaseSchema.js

// Configurazione slot per campo e giorno della settimana
export const slotConfigurationSchema = {
  courtId: 'string',      // Riferimento al campo
  dayOfWeek: 'number',    // 0-6 (0=domenica)
  slotDuration: 'number', // Durata in minuti
  startTime: 'string',    // Formato "HH:MM"
  endTime: 'string',      // Formato "HH:MM"
  activityType: 'string', // 'regular', 'school', 'individual'
  isActive: 'boolean',
  createdAt: 'timestamp',
  updatedAt: 'timestamp'
};

// Nuovo schema per le prenotazioni
export const bookingSchema = {
  userId: 'string',
  userName: 'string',
  userFirstName: 'string',
  userLastName: 'string',
  courtId: 'string',
  courtName: 'string',
  date: 'string',        // Formato "YYYY-MM-DD"
  startTime: 'string',   // Formato "HH:MM"
  endTime: 'string',     // Formato "HH:MM"
  duration: 'number',    // Durata in minuti
  status: 'string',      // 'confirmed', 'cancelled'
  createdAt: 'timestamp',
  // Note: rimuoviamo il campo 'slots' poiché ora ogni prenotazione ha un singolo slot con durata variabile
};

// Nuovo schema per i blocchi
export const blockSchema = {
  courtId: 'string',
  title: 'string',
  type: 'string',        // 'maintenance', 'tournament', 'lesson'
  start: 'timestamp',
  end: 'timestamp',
  description: 'string',
  createdAt: 'timestamp'
};