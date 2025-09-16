// utils/dateTimeHelpers.js

// Funzione per generare slot in base alla durata configurata
export const generateTimeSlots = (startTime, endTime, slotDuration) => {
  const slots = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let currentHour = startHour;
  let currentMinute = startMinute;
  
  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
    const startFormatted = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    // Calcola il tempo di fine
    let endHourTemp = currentHour;
    let endMinuteTemp = currentMinute + slotDuration;
    
    if (endMinuteTemp >= 60) {
      endHourTemp += Math.floor(endMinuteTemp / 60);
      endMinuteTemp = endMinuteTemp % 60;
    }
    
    const endFormatted = `${endHourTemp.toString().padStart(2, '0')}:${endMinuteTemp.toString().padStart(2, '0')}`;
    
    slots.push({
      start: startFormatted,
      end: endFormatted,
      duration: slotDuration,
      display: `${startFormatted} - ${endFormatted}`
    });
    
    // Avanza dello slot duration
    currentMinute += slotDuration;
    if (currentMinute >= 60) {
      currentHour += Math.floor(currentMinute / 60);
      currentMinute = currentMinute % 60;
    }
  }
  
  return slots;
};

// Funzione per ottenere il giorno della settimana (0-6, dove 0 è domenica)
export const getDayOfWeek = (date: Date): number => {
  return date.getDay();
};

// Funzione per formattare l'orario
export const formatTime = (date) => {
  return date.toTimeString().slice(0, 5);
};

// Funzione per convertire minuti in formato ore:minuti
export const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Funzione per convertire stringa orario in minuti
export const timeStringToMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Funzione per verificare se due intervalli si sovrappongono
export const hasTimeOverlap = (start1, end1, start2, end2) => {
  return start1 < end2 && start2 < end1;
};

// Funzione per formattare la data in formato italiano GG/MM/AAAA
export const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Funzione per formattare data e ora
export const formatDateTime = (timestamp: any): string => {
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'Data non valida';
  }
};

// Funzione per formattare la data per Firestore (YYYY-MM-DD)
export const formatDateForStorage = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Funzione per generare slot dalla configurazione
export const generateTimeSlotsFromConfig = (startTime, endTime, slotDuration) => {
  const slots = [];
  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);
  let current = startMinutes;
  
  while (current + slotDuration <= endMinutes) {
    const startTimeFormatted = minutesToTimeString(current);
    const endTimeFormatted = minutesToTimeString(current + slotDuration);
    
    slots.push({
      start: startTimeFormatted,
      end: endTimeFormatted,
      display: `${startTimeFormatted} - ${endTimeFormatted}`
    });
    
    current += slotDuration;
  }
  
  return slots;
};

// Funzione per ottenere l'inizio della settimana (lunedì)
export const getStartOfWeek = (date) => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

// Funzione per verificare se una data è oggi
export const isToday = (date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

// Funzione per verificare se una data è nel passato
export const isPastDate = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

// Funzione per aggiungere giorni a una data
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Funzione per formattare l'orario in formato italiano
export const formatTimeItalian = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Funzione per calcolare la differenza in minuti tra due orari
export const getTimeDifference = (startTime, endTime) => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;
  
  return endTotalMinutes - startTotalMinutes;
};