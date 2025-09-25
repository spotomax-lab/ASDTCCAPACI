import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Image, Modal, Platform, FlatList,
  Dimensions
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, getDocs, addDoc, query, where, 
  onSnapshot, doc, getDoc, updateDoc, deleteDoc,
  Timestamp, arrayUnion, increment, setDoc, arrayRemove
} from 'firebase/firestore';
import { 
  db, 
  COURTS, 
  SLOT_CONFIGURATIONS, 
  BLOCKED_SLOTS 
} from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  getDayOfWeek,
  timeStringToMinutes,
  minutesToTimeString,
  formatDate,
  formatDateForStorage,
  getStartOfWeek
} from '../utils/dateTimeHelpers';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Funzione per ottenere la chiave della settimana (anno + numero settimana)
const getWeekKey = (date: Date) => {
  const startOfWeek = new Date(date);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const year = startOfWeek.getFullYear();
  const weekNumber = Math.ceil((((startOfWeek - new Date(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-${weekNumber}`;
};

// FUNZIONE AGGIUNTA: Verifica e aggiorna lo stato della prenotazione
const checkAndUpdateBookingStatus = async (bookingId: string) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) return;
    
    const bookingData = bookingSnap.data();
    
    // Per prenotazioni open: aggiorna lo stato basato sul numero di giocatori
    if (bookingData.type === 'open') {
      const currentPlayers = bookingData.players ? bookingData.players.filter(player => player.status === 'confirmed').length : 0;
      const maxPlayers = bookingData.maxPlayers || (bookingData.matchType === 'singles' ? 2 : 4);
      
      let newStatus = bookingData.status;
      
      if (currentPlayers >= maxPlayers && bookingData.status !== 'confirmed') {
        newStatus = 'confirmed';
      } else if (currentPlayers < maxPlayers && bookingData.status === 'confirmed') {
        newStatus = 'waiting';
      }
      
      if (newStatus !== bookingData.status) {
        await updateDoc(bookingRef, {
          status: newStatus
        });
      }
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento dello stato della prenotazione:', error);
  }
};

// Funzione per creare notifiche
const createNotification = async (userId: string, message: string, type: string, bookingData: any) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId: userId,
      message: message,
      type: type,
      bookingId: bookingData.id,
      createdAt: new Date(),
      read: false
    });
  } catch (error) {
    console.error('Errore nella creazione della notifica:', error);
  }
};

// Funzione per aggiornare il conteggio delle prenotazioni
const updateUserBookingCount = async (userId: string, operation: 'increment' | 'decrement' = 'increment') => {
  try {
    const weekKey = getWeekKey(new Date());
    const userWeekRef = doc(db, 'userWeeklyBookings', `${userId}_${weekKey}`);
    
    if (operation === 'increment') {
      await setDoc(userWeekRef, {
        count: increment(1),
        userId: userId,
        week: weekKey,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } else {
      const docSnap = await getDoc(userWeekRef);
      if (docSnap.exists() && docSnap.data().count > 0) {
        await updateDoc(userWeekRef, {
          count: increment(-1),
          updatedAt: Timestamp.now()
        });
      }
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento del conteggio:', error);
  }
};

// Funzione per ottenere il conteggio delle prenotazioni
const getUserBookingCount = async (userId: string) => {
  try {
    const weekKey = getWeekKey(new Date());
    const userWeekRef = doc(db, 'userWeeklyBookings', `${userId}_${weekKey}`);
    const docSnap = await getDoc(userWeekRef);
    
    if (docSnap.exists()) {
      return docSnap.data().count || 0;
    }
    return 0;
  } catch (error) {
    console.error('Errore nel recupero del conteggio:', error);
    return 0;
  }
};

const BookingScreen = () => {
  const [selectedField, setSelectedField] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.getHours() >= 22 ? new Date(now.setDate(now.getDate() + 1)) : now;
  });
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [slotConfigurations, setSlotConfigurations] = useState({});
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAndroidDatePicker, setShowAndroidDatePicker] = useState(false);
  const [userTotalBookingsThisWeek, setUserTotalBookingsThisWeek] = useState(0);
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('singles');
  const [bookingMode, setBookingMode] = useState<'standard' | 'open'>('standard');
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [updatingCount, setUpdatingCount] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [isSelectingPlayers, setIsSelectingPlayers] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

  // Funzione per renderizzare le icone dei giocatori (PULITA)
  const renderPlayerIcons = (booking) => {
    if (!booking) return null;
    
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);

    if (booking.type === 'normal' || booking.type === 'standard') {
      // Per prenotazioni standard: tutti i giocatori sono confermati (solo icone blu)
      return Array(maxPlayers).fill(0).map((_, index) => (
        <Ionicons key={index} name="person" size={16} color="#3b82f6" style={styles.playerIcon} />
      ));
    } else if (booking.type === 'open') {
      // Per prenotazioni open: giocatori confermati (blu) + posti disponibili (rossi)
      const currentPlayers = booking.players ? booking.players.filter(player => player.status === 'confirmed').length : 0;
      const icons = [];
      
      // Giocatori confermati (blu)
      for (let i = 0; i < currentPlayers; i++) {
        icons.push(
          <Ionicons key={`blue-${i}`} name="person" size={16} color="#3b82f6" style={styles.playerIcon} />
        );
      }
      
      // Posti disponibili (rossi)
      for (let i = 0; i < maxPlayers - currentPlayers; i++) {
        icons.push(
          <Ionicons key={`red-${i}`} name="person" size={16} color="#ef4444" style={styles.playerIcon} />
        );
      }
      
      return icons;
    }
    return null;
  };

  // Aggiungi questa funzione per verificare se la data è nei prossimi 3 giorni
  const isWithinNext3Days = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);
    threeDaysLater.setHours(23, 59, 59, 999);
    
    return date >= today && date <= threeDaysLater;
  };

  // AGGIUNTA: Funzione per verificare se uno slot è nel passato
  const isSlotPassato = (slot) => {
    try {
      const now = new Date();
      const dataSlot = new Date(selectedDate);
      const [ore, minuti] = slot.start.split(':').map(Number);
      dataSlot.setHours(ore, minuti, 0, 0);
      
      return dataSlot < now;
    } catch (error) {
      console.error('Errore nel controllo data/ora slot:', error);
      return false;
    }
  };

  // NUOVA FUNZIONE: Ottiene le note dalla configurazione slot
  const getSlotNotes = (slot) => {
    if (!selectedField) return null;
    
    try {
      const dayOfWeek = getDayOfWeek(selectedDate);
      const courtId = selectedField.replace('Campo ', '');
      const key = `${courtId}_${dayOfWeek}`;
      const dayConfigs = slotConfigurations[key] || [];
      
      const dateString = formatDateForStorage(selectedDate);
      const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
      const slotEndTime = new Date(`${dateString}T${slot.end}:00`);
      
      const config = dayConfigs.find(cfg => {
        if (!cfg || cfg.isActive === false) return false;
        const cfgStart = new Date(`${dateString}T${cfg.startTime}:00`);
        const cfgEnd = new Date(`${dateString}T${cfg.endTime}:00`);
        return slotStartTime < cfgEnd && slotEndTime > cfgStart && cfg.activityType && cfg.activityType !== 'regular';
      });
      
      return config ? config.notes || null : null;
    } catch (error) {
      console.error('Errore nel recupero delle note:', error);
      return null;
    }
  };

  // NUOVA FUNZIONE: Ottiene il tipo di blocco dalla configurazione slot
  const getSlotBlockTypeFromConfig = (slot) => {
    if (!selectedField) return null;
    
    try {
      const dayOfWeek = getDayOfWeek(selectedDate);
      const courtId = selectedField.replace('Campo ', '');
      const key = `${courtId}_${dayOfWeek}`;
      const dayConfigs = slotConfigurations[key] || [];
      
      const dateString = formatDateForStorage(selectedDate);
      const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
      
      const config = dayConfigs.find(cfg => {
        if (!cfg || cfg.isActive === false) return false;
        const cfgStart = new Date(`${dateString}T${cfg.startTime}:00`);
        const cfgEnd = new Date(`${dateString}T${cfg.endTime}:00`);
        return slotStartTime >= cfgStart && slotStartTime < cfgEnd && cfg.activityType && cfg.activityType !== 'regular';
      });
      
      return config ? config.activityType || null : null;
    } catch (error) {
      console.error('Errore nel recupero del tipo di blocco:', error);
      return null;
    }
  };

  // NUOVA FUNZIONE: Descrizione tipo blocco (identica a CalendarManagement)
  const getBlockTypeDescription = (blockType) => {
    switch (blockType) {
      case 'school': return 'Scuola Tennis';
      case 'individual': return 'Lezione Individuale';
      case 'blocked': return 'Bloccato';
      case 'booked': return 'Prenotato';
      case 'pending': return 'In attesa di conferma';
      case 'open': return 'Prenotazione Open';
      default: return blockType;
    }
  };

  useEffect(() => {
    fetchCourts();
    const unsubscribe = fetchSlotConfigurations();
    fetchAvailablePlayers();
    
    const cleanOldManualBlocks = async () => {
      try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const oldBlocksQuery = query(
          collection(db, BLOCKED_SLOTS),
          where('createdAt', '<', Timestamp.fromDate(oneWeekAgo)),
          where('isRecurring', '==', false)
        );
        
        const querySnapshot = await getDocs(oldBlocksQuery);
        querySnapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
        });
      } catch (error) {
        console.error('Error cleaning old blocks:', error);
      }
    };
    
    cleanOldManualBlocks();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || isAdmin) return;

    const loadUserBookingCount = async () => {
      try {
        const count = await getUserBookingCount(user.uid);
        setUserTotalBookingsThisWeek(count);
      } catch (error) {
        console.error('Error loading booking count:', error);
        setUserTotalBookingsThisWeek(0);
      }
    };

    loadUserBookingCount();

    const weekKey = getWeekKey(new Date());
    const userWeekRef = doc(db, 'userWeeklyBookings', `${user.uid}_${weekKey}`);
    
    const unsubscribe = onSnapshot(userWeekRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setUserTotalBookingsThisWeek(docSnap.data().count || 0);
        } else {
          setUserTotalBookingsThisWeek(0);
        }
      },
      (error) => {
        console.error('Error in snapshot:', error);
        setUserTotalBookingsThisWeek(0);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  useEffect(() => {
    if (selectedField && selectedDate) {
      fetchExistingBookings();
      fetchBlocks();
    }
  }, [selectedField, selectedDate]);

  const fetchCourts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, COURTS));
      const courtsList = [];
      querySnapshot.forEach((doc) => {
        courtsList.push({ id: doc.id, ...doc.data() });
      });
      courtsList.sort((a, b) => a.name.localeCompare(b.name));
      setCourts(courtsList);
      if (courtsList.length > 0) {
        setSelectedField(courtsList[0].name);
      }
    } catch (error) {
      console.error("Errore nel caricamento dei campi: ", error);
      Alert.alert("Errore", "Impossibile caricare i campi da tennis");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailablePlayers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const playersList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role !== 'admin' && doc.id !== user.uid) {
          playersList.push({ 
            id: doc.id, 
            ...data,
            fullName: `${data.nome || ''} ${data.cognome || ''}`.trim() || data.email
          });
        }
      });
      setAvailablePlayers(playersList);
    } catch (error) {
      console.error("Errore nel caricamento dei giocatori: ", error);
    }
  };

  const showDatePickerModal = () => {
    if (Platform.OS === 'android') {
      setShowAndroidDatePicker(true);
    } else {
      setShowDatePicker(true);
    }
  };

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowAndroidDatePicker(false);
    }
    
    if (date) {
      setSelectedDate(date);
      setSelectedSlot(null);
    }
    
    if (Platform.OS === 'ios') {
      setShowDatePicker(false);
    }
  };

  const fetchSlotConfigurations = () => {
    try {
      const q = query(collection(db, SLOT_CONFIGURATIONS));
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const configs = {};
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const key = `${data.courtId}_${data.dayOfWeek}`;
            if (!configs[key]) {
              configs[key] = [];
            }
            configs[key].push(data);
          });
          setSlotConfigurations(configs);
        },
        (error) => {
          console.error('Error in slot configurations snapshot:', error);
          Alert.alert('Errore', 'Impossibile caricare le configurazioni degli slot');
        }
      );
      return unsubscribe;
    } catch (error) {
      console.error('Error fetching slot configurations:', error);
      return () => {};
    }
  };

  const fetchExistingBookings = async () => {
    const dateString = formatDateForStorage(selectedDate);
    const q = query(
      collection(db, 'bookings'),
      where('courtName', '==', selectedField),
      where('date', '==', dateString),
      where('status', 'in', ['confirmed', 'waiting', 'pending'])
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const bookings = [];
      querySnapshot.forEach((doc) => {
        bookings.push({ id: doc.id, ...doc.data() });
      });
      setExistingBookings(bookings);
    });

    return () => unsubscribe();
  };

  const fetchBlocks = () => {
    if (!selectedField) return () => {};
    
    const dateString = formatDateForStorage(selectedDate);
    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(`${dateString}T23:59:59`);
    
    const courtId = selectedField.replace('Campo ', '');

    const q = query(
      collection(db, BLOCKED_SLOTS),
      where('start', '<=', endOfDay),
      where('end', '>=', startOfDay)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const blocksList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.courtId === courtId) {
          const blockData = {
            id: doc.id,
            ...data,
            start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
            end: data.end?.toDate ? data.end.toDate() : new Date(data.end)
          };
          blocksList.push(blockData);
        }
      });
      setBlocks(blocksList);
    }, (error) => {
      console.error('Error fetching blocks:', error);
    });

    return () => unsubscribe();
  };

  const generateTimeSlotsFromConfig = (startTime, endTime, slotDuration) => {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let currentHour = startHour;
    let currentMinute = startMinute;
    
    const totalStartMinutes = startHour * 60 + startMinute;
    const totalEndMinutes = endHour * 60 + endMinute;
    
    if (totalStartMinutes >= totalEndMinutes) {
      return [];
    }
    
    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      const startFormatted = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      let endHourTemp = currentHour;
      let endMinuteTemp = currentMinute + slotDuration;
      
      if (endMinuteTemp >= 60) {
        endHourTemp += Math.floor(endMinuteTemp / 60);
        endMinuteTemp = endMinuteTemp % 60;
      }
      
      const endFormatted = `${endHourTemp.toString().padStart(2, '0')}:${endMinuteTemp.toString().padStart(2, '0')}`;
      
      const totalCurrentMinutes = currentHour * 60 + currentMinute;
      const totalEndSlotMinutes = endHourTemp * 60 + endMinuteTemp;
      
      if (totalEndSlotMinutes > totalEndMinutes) {
        break;
      }
      
      slots.push({
        start: startFormatted,
        end: endFormatted,
        display: `${startFormatted} - ${endFormatted}`,
        duration: slotDuration
      });
      
      currentMinute += slotDuration;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }
    
    return slots;
  };

  const generateTimeSlots = () => {
    const dayOfWeek = getDayOfWeek(selectedDate);
    const courtId = selectedField.replace('Campo ', '');
    const key = `${courtId}_${dayOfWeek}`;
    
    const dayConfigs = slotConfigurations[key] || [];

    if (dayConfigs.length === 0) {
      return [];
    }

    let allSlots = [];
    dayConfigs.forEach(config => {
      if (!config || config.isActive === false) return;
      const type = config.activityType || 'regular';
      if (type === 'regular') {
        const slots = generateTimeSlotsFromConfig(config.startTime, config.endTime, config.slotDuration);
        allSlots = [...allSlots, ...slots];
      } else {
        allSlots.push({
          start: config.startTime,
          end: config.endTime,
          display: `${config.startTime} – ${config.endTime}`,
          activityType: type,
          notes: config.notes || '',
          source: 'config-block'
        });
      }
    });

    return allSlots.sort((a, b) => {
      const [aHour, aMinute] = a.start.split(':').map(Number);
      const [bHour, bMinute] = b.start.split(':').map(Number);
      return (aHour * 60 + aMinute) - (bHour * 60 + bMinute);
    });
  };

  const getSlotBlockType = (slot) => {
    if (!selectedField) return null;
    
    const dateString = formatDateForStorage(selectedDate);
    const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
    const slotEndTime = new Date(`${dateString}T${slot.end}:00`);
    
    const courtId = selectedField.replace('Campo ', '');

    const blockedSlot = blocks.find(block => {
      if (block.courtId !== courtId) return false;
      
      let blockStart, blockEnd;
      
      try {
        blockStart = block.start;
        blockEnd = block.end;
      } catch (error) {
        console.error('Error parsing block dates:', error);
        return false;
      }
      
      return slotStartTime < blockEnd && slotEndTime > blockStart;
    });

    if (blockedSlot) {
      return blockedSlot.type || 'blocked';
    }

    // Cerca anche nelle configurazioni slot
    return getSlotBlockTypeFromConfig(slot);
  };

  const getBlockedReason = (slot) => {
    if (!selectedField) return null;
    
    const dateString = formatDateForStorage(selectedDate);
    const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
    const slotEndTime = new Date(`${dateString}T${slot.end}:00`);
    
    const courtId = selectedField.replace('Campo ', '');

    const blockedSlot = blocks.find(block => {
      if (block.courtId !== courtId) return false;
      
      let blockStart, blockEnd;
      
      try {
        blockStart = block.start;
        blockEnd = block.end;
      } catch (error) {
        console.error('Error parsing block dates:', error);
        return false;
      }
      
      return slotStartTime < blockEnd && slotEndTime > blockStart;
    });
    
    return blockedSlot ? blockedSlot.title || 'Slot bloccato' : null;
  };

  const findBookingForSlot = (slot) => {
    const dateString = formatDateForStorage(selectedDate);
    const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
    const slotEndTime = new Date(`${dateString}T${slot.end}:00`);
    
    return existingBookings.find(booking => {
      if (booking.courtName !== selectedField) return false;
      
      const bookingStart = new Date(`${booking.date}T${booking.startTime}:00`);
      const bookingEnd = new Date(`${booking.date}T${booking.endTime}:00`);
      
      return slotStartTime < bookingEnd && slotEndTime > bookingStart;
    });
  };

  const isSlotBooked = (slot) => {
    return findBookingForSlot(slot) !== undefined;
  };

  const isSlotAvailable = (slot) => {
    if (!isWithinNext3Days(selectedDate)) {
      return false;
    }

    const dateString = formatDateForStorage(selectedDate);
    const slotStartTime = new Date(`${dateString}T${slot.start}:00`);
    const slotEndTime = new Date(`${dateString}T${slot.end}:00`);
    
    const courtId = selectedField.replace('Campo ', '');

    const isBlocked = blocks.some(block => {
      if (block.courtId !== courtId) return false;
      
      let blockStart, blockEnd;
      
      try {
        blockStart = block.start;
        blockEnd = block.end;
      } catch (error) {
        console.error('Error parsing block dates:', error);
        return false;
      }
      
      return slotStartTime < blockEnd && slotEndTime > blockStart;
    });

    if (isBlocked) return false;

    try {
      const dayOfWeek = getDayOfWeek(selectedDate);
      const key = `${courtId}_${dayOfWeek}`;
      const dayConfigs = slotConfigurations[key] || [];
      const intersectsNonRegular = dayConfigs.some(cfg => {
        if (!cfg || cfg.isActive === false) return false;
        const type = cfg.activityType || 'regular';
        if (type === 'regular') return false;
        const cfgStart = new Date(`${dateString}T${cfg.startTime}:00`);
        const cfgEnd = new Date(`${dateString}T${cfg.endTime}:00`);
        return slotStartTime < cfgEnd && slotEndTime > cfgStart;
      });
      if (intersectsNonRegular) return false;
    } catch (e) {
      console.warn('Errore nel controllo activityType:', e);
    }

    const isBooked = isSlotBooked(slot);

    return !isBooked;
  };

  const hasConsecutiveBooking = async (slot) => {
    if (!user) return false;
    
    const dateStr = formatDateForStorage(selectedDate);
    const q = query(
      collection(db, 'bookings'),
      where('players', 'array-contains', { 
        userId: user.uid, 
        status: 'confirmed' 
      }),
      where('date', '==', dateStr),
      where('status', 'in', ['confirmed', 'waiting', 'pending'])
    );
    
    const snapshot = await getDocs(q);
    const selStart = new Date(`${dateStr}T${slot.start}:00`).getTime();
    const selEnd = new Date(`${dateStr}T${slot.end}:00`).getTime();
    
    return snapshot.docs.some(doc => {
      const booking = doc.data();
      const bookStart = new Date(`${dateStr}T${booking.startTime}:00`).getTime();
      const bookEnd = new Date(`${dateStr}T${booking.endTime}:00`).getTime();
      
      return bookEnd === selStart || bookStart === selEnd;
    });
  };

  // FUNZIONE AGGIORNATA: Gestione del click sugli slot con visualizzazione identica a CalendarManagement
  const handleSlotPress = (slot) => {
    const blockType = getSlotBlockType(slot);
    const isBooked = isSlotBooked(slot);
    const booking = findBookingForSlot(slot);
    const slotNotes = getSlotNotes(slot); // Recupera le note
    const blockedReason = getBlockedReason(slot); // Motivo del blocco manuale

    let title = 'Info Slot';
    let message = '';
    let buttons = [{ text: 'OK' }];

    // PRIMA: Gestisci slot prenotati (mostra info anche se passati)
    if (isBooked && booking) {
      // Formatta la data in italiano
      const dateFormatted = formatDate(selectedDate);
      
      // Determina il tipo di partita
      const matchTypeText = booking.matchType === 'singles' ? 'Singolare' : 'Doppio';
      const bookingTypeText = booking.type === 'open' ? 'Open' : 'Standard';
      
      // Conta i giocatori confermati
      const confirmedPlayers = booking.players ? booking.players.filter(player => player.status === 'confirmed').length : 0;
      const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
      
      // Controlla se l'utente è già nella prenotazione come giocatore confermato
      const isUserInBooking = booking.players ? 
        booking.players.some(player => player.userId === user?.uid && player.status === 'confirmed') : false;
      
      // Controlla se l'utente è invitato ma non ha ancora accettato
      const isUserInvited = booking.invitedPlayers ? 
        booking.invitedPlayers.some(player => player.userId === user?.uid && player.status === 'pending') : false;
      
      // Prepara l'elenco degli altri giocatori (escludendo il prenotatore)
      const otherPlayers = booking.players ? 
        booking.players
          .filter(player => player.userId !== booking.userId && player.status === 'confirmed')
          .map(player => player.userName) : [];
      
      // Costruisce il messaggio base
      message += `Data: ${dateFormatted}\n`;
      message += `Orario: ${slot.start} - ${slot.end}\n`;
      message += `Campo: ${selectedField}\n`;
      message += `Tipo: ${bookingTypeText} - ${matchTypeText}\n`;
      
      if (booking.type === 'open') {
        // Messaggio per prenotazioni Open
        const statusText = booking.status === 'waiting' ? 'In attesa di giocatori' : 'Confermato';
        message += `Stato: ${statusText}\n`;
        message += `Giocatori: ${confirmedPlayers}/${maxPlayers}\n`;
        message += `Prenotato da: ${booking.userFirstName} ${booking.userLastName}\n`;
        
        if (otherPlayers.length > 0) {
          message += `Altri giocatori: ${otherPlayers.join(', ')}`;
        } else {
          message += `Altri giocatori: Nessun altro giocatore confermato`;
        }

        // Aggiungi il pulsante "Unisciti" solo se NON è passato e ci sono condizioni
        const isPassato = isSlotPassato(slot);
        if (!isPassato && !isUserInBooking && 
            booking.status === 'waiting' && 
            confirmedPlayers < maxPlayers &&
            !isUserInvited) {
          buttons.unshift({
            text: 'Unisciti alla prenotazione',
            onPress: () => handleJoinBooking(booking)
          });
        }
        
        // Se l'utente è invitato ma non ha ancora accettato, mostra pulsante per accettare invito
        if (!isPassato && isUserInvited) {
          buttons.unshift({
            text: 'Accetta invito',
            onPress: () => handleAcceptInvitation(booking)
          });
        }
      } else {
        // Messaggio per prenotazioni Standard
        const statusText = booking.status === 'confirmed' ? 'Confermato' : 'In attesa di conferma';
        message += `Stato: ${statusText}\n`;
        message += `Prenotato da: ${booking.userFirstName} ${booking.userLastName}\n`;
        
        if (otherPlayers.length > 0) {
          message += `Altri giocatori: ${otherPlayers.join(', ')}`;
        } else {
          message += `Altri giocatori: Nessun altro giocatore confermato`;
        }
      }
      
      Alert.alert(title, message, buttons);
      return;
    } 
    // SECONDO: Gestisci slot bloccati (mostra info IDENTICA a CalendarManagement)
    else if (blockType) {
      // Messaggio per slot bloccati - IDENTICO a CalendarManagement
      title = `Info Slot - ${getBlockTypeDescription(blockType)}`;
      message += `Orario: ${slot.display}\n`;
      message += `Campo: ${selectedField}\n`;
      
      // Aggiungi il motivo se presente (per blocchi manuali)
      if (blockedReason) {
        message += `Motivo: ${blockedReason}\n`;
      }
      
      // AGGIUNTA: Mostra le note se presenti (SENZA la scritta "Note:")
      if (slotNotes) {
        message += `${slotNotes}\n`;
      }
      
      Alert.alert(title, message, buttons);
      return;
    }
    
    // TERZO: Solo per slot liberi controlla se è passato
    if (isSlotPassato(slot)) {
      Alert.alert(
        'Slot non disponibile',
        'Impossibile prenotare, orario di gioco già in corso o passato'
      );
      return;
    }

    // Quarto: Slot libero e non passato - toggle selezione
    if (selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end) {
      setSelectedSlot(null);
      setSelectedPlayers([]);
      setIsSelectingPlayers(false);
    } else {
      setSelectedSlot(slot);
      setSelectedPlayers([]);
      setIsSelectingPlayers(false);
    }
  };

  // NUOVA FUNZIONE: Gestisce l'accettazione di un invito
  const handleAcceptInvitation = async (booking) => {
    if (!user) return;
    
    setBookingLoading(true);
    setUpdatingCount(true);
    
    try {
      const bookingRef = doc(db, 'bookings', booking.id);
      
      // Rimuovi l'utente dagli invitedPlayers e aggiungilo ai players come confermato
      const updatedInvitedPlayers = booking.invitedPlayers ? 
        booking.invitedPlayers.filter(player => player.userId !== user.uid) : [];
      
      // CORREZIONE: usa userData invece di user.displayName
      const newPlayer = {
        userId: user.uid,
        userName: userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email,
        status: 'confirmed'
      };
      
      const updatedPlayers = [...(booking.players || []), newPlayer];
      
      await updateDoc(bookingRef, {
        players: updatedPlayers,
        invitedPlayers: updatedInvitedPlayers,
        userIds: arrayUnion(user.uid)
      });
      
      // Verifica e aggiorna lo stato della prenotazione
      await checkAndUpdateBookingStatus(booking.id);
      
      // Aggiorna il conteggio delle prenotazioni per l'utente
      await updateUserBookingCount(user.uid);
      
      Alert.alert('Successo', 'Hai accettato l\'invito con successo!');
      setSelectedSlot(null);
    } catch (error) {
      console.error('Errore durante l\'accettazione dell\'invito:', error);
      Alert.alert('Errore', 'Impossibile accettare l\'invito');
    } finally {
      setBookingLoading(false);
      setUpdatingCount(false);
    }
  };

  // FUNZIONE MIGLIORATA: Gestisce l'unione a una prenotazione open
  const handleJoinBooking = async (booking) => {
    if (!user) return;
    
    // Controlla se lo slot è nel passato
    if (isSlotPassato({ start: booking.startTime, end: booking.endTime })) {
      Alert.alert('Partita passata', 'Non è possibile unirsi a una partita già iniziata o conclusa');
      return;
    }
    
    // Controlla solo se l'utente è già nei giocatori confermati
    const isUserInBooking = booking.players ? 
      booking.players.some(player => player.userId === user.uid && player.status === 'confirmed') : false;
    
    if (isUserInBooking) {
      Alert.alert('Errore', 'Sei già in questa prenotazione');
      return;
    }
    
    // Controlla se l'utente è già stato invitato (ma non ha ancora accettato)
    const isUserInvited = booking.invitedPlayers ? 
      booking.invitedPlayers.some(player => player.userId === user.uid) : false;
    
    if (isUserInvited) {
      Alert.alert('Invito già presente', 'Hai già un invito pendente per questa partita. Accettalo dalla lista delle partite open.');
      return;
    }
    
    const currentPlayers = booking.players ? booking.players.filter(player => player.status === 'confirmed').length : 0;
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
    
    if (currentPlayers >= maxPlayers) {
      Alert.alert('Errore', 'La prenotazione è già completa');
      return;
    }
    
    if (!isAdmin && userTotalBookingsThisWeek >= 5) {
      Alert.alert(
        'Limite prenotazioni raggiunto',
        'Hai già effettuato 5 prenotazioni questa settimana. Non puoi unirti ad altre partite.'
      );
      return;
    }
    
    setBookingLoading(true);
    setUpdatingCount(true);
    
    try {
      const bookingRef = doc(db, 'bookings', booking.id);
      
      // CORREZIONE: usa userData invece di user.displayName
      const newPlayer = {
        userId: user.uid,
        userName: userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email,
        status: 'confirmed'
      };
      
      const updatedPlayers = [...(booking.players || []), newPlayer];
      
      await updateDoc(bookingRef, {
        players: updatedPlayers,
        userIds: arrayUnion(user.uid)
      });
      
      // Verifica e aggiorna lo stato della prenotazione
      await checkAndUpdateBookingStatus(booking.id);
      
      // Aggiorna il conteggio delle prenotazioni per l'utente
      await updateUserBookingCount(user.uid);
      
      Alert.alert('Successo', 'Ti sei unito alla prenotazione con successo!');
      setSelectedSlot(null);
    } catch (error) {
      console.error('Errore durante l\'unione alla prenotazione:', error);
      Alert.alert('Errore', 'Impossibile unirsi alla prenotazione');
    } finally {
      setBookingLoading(false);
      setUpdatingCount(false);
    }
  };

  const getSlotStyle = (slot) => {
    const blockType = getSlotBlockType(slot);
    const isBooked = isSlotBooked(slot);
    const isSelected = selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end;
    const booking = findBookingForSlot(slot);
    const isOpenBooking = isBooked && booking && booking.type === 'open';
    
    // Le prenotazioni open sono verdi solo se confermate, altrimenti gialle
    const isOpenConfirmed = isOpenBooking && booking.status === 'confirmed';
    const isOpenWaiting = isOpenBooking && booking.status === 'waiting';
    
    if (isSelected) {
      return [styles.timeSlot, styles.timeSlotSelected];
    }
    
    // PRIMA le prenotazioni open confermate (verdi)
    if (isOpenConfirmed) {
      return [styles.timeSlot, styles.timeSlotBooked];
    }
    
    // POI le prenotazioni open in attesa (gialle)
    if (isOpenWaiting) {
      return [styles.timeSlot, styles.timeSlotOpen];
    }
    
    if (isBooked) {
      return [styles.timeSlot, styles.timeSlotBooked];
    }
    
    if (blockType) {
      switch (blockType) {
        case 'school':
          return [styles.timeSlot, styles.timeSlotSchool];
        case 'individual':
          return [styles.timeSlot, styles.timeSlotIndividual];
        case 'blocked':
        default:
          return [styles.timeSlot, styles.timeSlotBlocked];
      }
    }
    
    // Slot libero: controlla se è passato per lo stile visivo
    if (isSlotPassato(slot)) {
      return [styles.timeSlot, styles.timeSlotPast];
    }
    
    return [styles.timeSlot, styles.timeSlotFree];
  };

  const togglePlayerSelection = (playerId) => {
    if (selectedPlayers.includes(playerId)) {
      setSelectedPlayers(selectedPlayers.filter(id => id !== playerId));
    } else {
      const maxPlayers = matchType === 'singles' ? 1 : 3;
      if (selectedPlayers.length < maxPlayers) {
        setSelectedPlayers([...selectedPlayers, playerId]);
      } else {
        Alert.alert('Limite raggiunto', 
          matchType === 'singles' 
            ? 'Puoi selezionare massimo 1 giocatore per il singolare' 
            : 'Puoi selezionare massimo 3 giocatori per doppio'
        );
      }
    }
  };

  const handleBooking = async () => {
    if (!user || !selectedSlot) {
      Alert.alert('Errore', 'Utente non loggato o slot non selezionato');
      return;
    }

    // Controlla se lo slot è nel passato
    if (isSlotPassato(selectedSlot)) {
      Alert.alert(
        'Impossibile prenotare',
        'Orario di gioco già in corso o passato'
      );
      return;
    }

    // Se stiamo ancora selezionando i giocatori, apri il modal
    if (!isSelectingPlayers) {
      setIsSelectingPlayers(true);
      setShowPlayerModal(true);
      return;
    }

    // Controllo obbligatorio per la selezione dei giocatori in modalità standard
    if (bookingMode === 'standard') {
      const requiredPlayers = matchType === 'singles' ? 1 : 3;
      if (selectedPlayers.length !== requiredPlayers) {
        Alert.alert(
          'Selezione giocatori obbligatoria',
          matchType === 'singles' 
            ? 'Devi selezionare 1 avversario per il singolare' 
            : 'Devi selezionare 3 giocatori per il doppio'
        );
        return;
      }
    }

    try {
      const hasAdjacent = await hasConsecutiveBooking(selectedSlot);
      if (hasAdjacent) {
        Alert.alert('Regola prenotazioni', 'Non si possono prenotare 2 slot orari consecutivi.');
        return;
      }

      if (!isSlotAvailable(selectedSlot)) {
        Alert.alert('Non prenotabile', 'Lo slot selezionato non è prenotabile.');
        return;
      }

      if (!isAdmin && userTotalBookingsThisWeek >= 5) {
        Alert.alert(
          'Limite prenotazioni raggiunto',
          'Hai già effettuato 5 prenotazioni questa settimana. Non puoi effettuarne altre.'
        );
        return;
      }

      // Controlla il limite per tutti i giocatori coinvolti
      for (const playerId of [user.uid, ...selectedPlayers]) {
        const playerBookingsCount = await getUserBookingCount(playerId);
        if (playerBookingsCount >= 5) {
          const player = playerId === user.uid 
            ? { fullName: 'Tu' } 
            : availablePlayers.find(p => p.id === playerId);
          Alert.alert(
            'Limite prenotazioni raggiunto',
            `${player?.fullName} ha già raggiunto il limite di 5 prenotazioni questa settimana.`
          );
          return;
        }
      }
    } catch (error) {
      console.error('Errore nei controlli pre-prenotazione:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante i controlli di prenotazione');
      return;
    }

    setBookingLoading(true);
    setUpdatingCount(true);
    
    try {
      const court = courts.find(c => c.name === selectedField);
      const dateString = formatDateForStorage(selectedDate);
      const duration = timeStringToMinutes(selectedSlot.end) - timeStringToMinutes(selectedSlot.start);
      const maxPlayers = matchType === 'singles' ? 2 : 4;

      // CORREZIONE: usa userData invece di user.displayName
      const players = [
        {
          userId: user.uid,
          userName: userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email,
          status: 'confirmed'
        }
      ];

      // Gli invitati vanno solo in invitedPlayers, non in players
      const invitedPlayers = bookingMode === 'open' ? 
        selectedPlayers.map(playerId => {
          const player = availablePlayers.find(p => p.id === playerId);
          return {
            userId: playerId,
            userName: player?.fullName || playerId,
            status: 'pending'
          };
        }) : [];

      // Le prenotazioni open iniziano sempre come 'waiting'
      let status = bookingMode === 'standard' ? 'confirmed' : 'waiting';

      // CORREZIONE: usa userData invece di user.displayName
      const bookingData = {
        userId: user.uid,
        userName: userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email,
        userFirstName: userData?.nome || '',
        userLastName: userData?.cognome || '',
        courtId: court.id,
        courtName: court.name,
        date: dateString,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        duration: duration,
        status: status,
        type: bookingMode === 'open' ? 'open' : 'standard',
        matchType: matchType,
        players: players,
        invitedPlayers: invitedPlayers,
        maxPlayers: maxPlayers,
        createdAt: Timestamp.fromDate(new Date()),
        userIds: [user.uid], // Solo il creatore inizialmente
      };

      if (bookingMode === 'open') {
        bookingData.joinable = true;
      }

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      const bookingWithId = { ...bookingData, id: docRef.id };

      // Aggiorna il conteggio per TUTTI i giocatori nelle prenotazioni standard
      if (bookingMode === 'standard') {
        // Per standard, aggiungi tutti i giocatori selezionati come confermati
        const standardPlayers = [
          {
            userId: user.uid,
            // CORREZIONE: usa userData invece di user.displayName
            userName: userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email,
            status: 'confirmed'
          },
          ...selectedPlayers.map(playerId => {
            const player = availablePlayers.find(p => p.id === playerId);
            return {
              userId: playerId,
              userName: player?.fullName || playerId,
              status: 'confirmed'
            };
          })
        ];

        await updateDoc(docRef, {
          players: standardPlayers,
          userIds: [user.uid, ...selectedPlayers]
        });

        for (const playerId of [user.uid, ...selectedPlayers]) {
          await updateUserBookingCount(playerId);
        }
        Alert.alert('Successo', 'Prenotazione confermata!');
      } else {
        // Per open, aggiorna solo il prenotante
        await updateUserBookingCount(user.uid);
        
        // Crea notifiche per i giocatori invitati
        for (const playerId of selectedPlayers) {
          const player = availablePlayers.find(p => p.id === playerId);
          // CORREZIONE: usa userData invece di user.displayName
          const userDisplayName = userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email;
          const message = `${userDisplayName} ti ha invitato a una partita ${matchType === 'singles' ? 'singolare' : 'doppio'} open il ${formatDate(selectedDate)} dalle ${selectedSlot.start} alle ${selectedSlot.end}`;
          
          await createNotification(
            playerId,
            message,
            'booking_invitation',
            bookingWithId
          );
        }
        
        // Crea notifiche per tutti gli altri giocatori (solo per open)
        // CORREZIONE: usa userData invece di user.displayName
        const userDisplayName = userData ? `${userData.nome || ''} ${userData.cognome || ''}`.trim() || user.email : user.email;
        const openMessage = `Nuova partita ${matchType === 'singles' ? 'singolare' : 'doppio'} open il ${formatDate(selectedDate)} dalle ${selectedSlot.start} alle ${selectedSlot.end}. Unisciti!`;
        
        for (const player of availablePlayers) {
          if (player.id !== user.uid && !selectedPlayers.includes(player.id)) {
            await createNotification(
              player.id,
              openMessage,
              'open_match',
              bookingWithId
            );
          }
        }
        
        Alert.alert('Successo', 
          `Prenotazione ${matchType === 'singles' ? 'singolare' : 'doppio'} open creata!${selectedPlayers.length > 0 ? ' Gli invitati hanno ricevuto una notifica.' : ''}`
        );
      }
      
      setSelectedSlot(null);
      setSelectedPlayers([]);
      setBookingMode('standard');
      setShowPlayerModal(false);
      setIsSelectingPlayers(false);
    } catch (error) {
      console.error('Errore durante la prenotazione:', error);
      Alert.alert('Errore', 'Impossibile completare la prenotazione');
    } finally {
      setBookingLoading(false);
      setUpdatingCount(false);
    }
  };

  const renderPlayerItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.playerItem,
        selectedPlayers.includes(item.id) && styles.playerItemSelected
      ]}
      onPress={() => togglePlayerSelection(item.id)}
    >
      <Text style={[
        styles.playerItemText,
        selectedPlayers.includes(item.id) && styles.playerItemTextSelected
      ]}>
        {item.fullName}
      </Text>
      {selectedPlayers.includes(item.id) && (
        <Ionicons name="checkmark" size={20} color="white" />
      )}
    </TouchableOpacity>
  );

  // Componente per la legenda nel modal
  const LegendModal = () => (
    <Modal
      visible={showLegendModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowLegendModal(false)}
    >
      <View style={styles.legendModalContainer}>
        <View style={styles.legendModalContent}>
          {/* Header del modal */}
          <View style={styles.legendHeader}>
            <View style={styles.legendTitleContainer}>
              <Ionicons name="information-circle" size={24} color="#3b82f6" />
              <Text style={styles.legendTitle}>Legenda Prenotazioni</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setShowLegendModal(false)}
              style={styles.legendCloseButton}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.legendScrollContent} showsVerticalScrollIndicator={false}>
            {/* Sezione Stati Slot */}
            <View style={styles.legendSection}>
              <Text style={styles.legendSectionTitle}>Stati degli Slot</Text>
              <View style={styles.legendGrid}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendFree]} />
                  <Text style={styles.legendText}>Libero</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendPast]} />
                  <Text style={styles.legendText}>Libero (Passato)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendBooked]} />
                  <Text style={styles.legendText}>Prenotato/Open Confermato</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendOpen]} />
                  <Text style={styles.legendText}>Open in attesa</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendSchool]} />
                  <Text style={styles.legendText}>Scuola Tennis</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendIndividual]} />
                  <Text style={styles.legendText}>Lezione Individuale</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendBlocked]} />
                  <Text style={styles.legendText}>Bloccato</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendSelected]} />
                  <Text style={styles.legendText}>Selezionato</Text>
                </View>
              </View>
            </View>

            {/* Sezione Icone Giocatori */}
            <View style={styles.legendSection}>
              <Text style={styles.legendSectionTitle}>Icone Giocatori</Text>
              <View style={styles.legendIconsContainer}>
                <View style={styles.legendIconItem}>
                  <Ionicons name="person" size={20} color="#3b82f6" />
                  <Text style={styles.legendText}>Giocatore confermato</Text>
                </View>
                <View style={styles.legendIconItem}>
                  <Ionicons name="person" size={20} color="#ef4444" />
                  <Text style={styles.legendText}>Posto disponibile (Open)</Text>
                </View>
              </View>
            </View>

            {/* Sezione Istruzioni */}
            <View style={styles.legendSection}>
              <Text style={styles.legendSectionTitle}>Come Prenotare</Text>
              <View style={styles.instructionsList}>
                <View style={styles.instructionItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={styles.instructionText}>Seleziona Singolare o Doppio</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={styles.instructionText}>Scehi tra Standard o Open</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={styles.instructionText}>Tocca brevemente per selezionare</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={styles.instructionText}>Tocca a lungo per i dettagli</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Ionicons name="close-circle" size={16} color="#ef4444" />
                  <Text style={styles.instructionText}>Non si possono prenotare 2 slot consecutivi</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Ionicons name="alert-circle" size={16} color="#f59e0b" />
                  <Text style={styles.instructionText}>Limite di 5 prenotazioni a settimana</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer del modal */}
          <View style={styles.legendFooter}>
            <TouchableOpacity 
              style={styles.legendGotItButton}
              onPress={() => setShowLegendModal(false)}
            >
              <Text style={styles.legendGotItButtonText}>Ho capito!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Caricamento campi...</Text>
      </View>
    );
  }

  const timeSlots = generateTimeSlots();

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollContent}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seleziona Campo</Text>
          
          <View style={styles.fieldsRow}>
            {courts.map((court) => (
              <TouchableOpacity
                key={court.id}
                style={[
                  styles.fieldCard,
                  selectedField === court.name && styles.fieldCardSelected
                ]}
                onPress={() => {
                  setSelectedField(court.name);
                  setSelectedSlot(null);
                }}
              >
                <View style={styles.fieldImageContainer}>
                  {court.name === "Campo 1" ? (
                    <Image 
                      source={{ uri: 'https://i.imgur.com/m2gNENM.jpeg' }} 
                      style={styles.fieldImage}
                      resizeMode="cover"
                    />
                  ) : court.name === "Campo 2" ? (
                    <Image 
                      source={{ uri: 'https://i.imgur.com/OUtLYZ3.jpeg' }} 
                      style={styles.fieldImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.fieldImagePlaceholder}>
                      <Text style={styles.placeholderText}>FOTO CAMPO</Text>
                    </View>
                  )}
                </View>
                
                <Text style={styles.fieldName}>{court.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.activeFieldContainer}>
          <Text style={styles.activeFieldText}>Campo attivo: {selectedField}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.dateTitleContainer}>
            <Text style={styles.sectionTitle}>Data</Text>
            <Text style={styles.dateInstruction}> (Seleziona una data dal calendario)</Text>
          </View>
          <View style={styles.dateRow}>
            <View style={styles.dateContainer}>
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            </View>
            <TouchableOpacity 
              onPress={showDatePickerModal}
              style={styles.calendarIcon}
            >
              <Ionicons name="calendar" size={24} color="#3b82f6" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tipo di Partita</Text>
          
          <View style={styles.matchTypeContainer}>
            <TouchableOpacity
              style={[
                styles.matchTypeButton,
                matchType === 'singles' && styles.matchTypeButtonSelected
              ]}
              onPress={() => {
                setMatchType('singles');
                setSelectedPlayers([]);
              }}
            >
              <View style={styles.matchTypeTextContainer}>
                <Text style={[
                  styles.matchTypeMainText,
                  matchType === 'singles' && styles.matchTypeMainTextSelected
                ]}>
                  Singolare
                </Text>
                <Text style={[
                  styles.matchTypeSubText,
                  matchType === 'singles' && styles.matchTypeSubTextSelected
                ]}>
                  (2 giocatori)
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.matchTypeButton,
                matchType === 'doubles' && styles.matchTypeButtonSelected
              ]}
              onPress={() => {
                setMatchType('doubles');
                setSelectedPlayers([]);
              }}
            >
              <View style={styles.matchTypeTextContainer}>
                <Text style={[
                  styles.matchTypeMainText,
                  matchType === 'doubles' && styles.matchTypeMainTextSelected
                ]}>
                  Doppio
                </Text>
                <Text style={[
                  styles.matchTypeSubText,
                  matchType === 'doubles' && styles.matchTypeSubTextSelected
                ]}>
                  (4 giocatori)
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modalità Prenotazione</Text>
          
          <View style={styles.bookingModeContainer}>
            <TouchableOpacity
              style={[
                styles.bookingModeButton,
                bookingMode === 'standard' && styles.bookingModeButtonSelected
              ]}
              onPress={() => setBookingMode('standard')}
            >
              <Text style={[
                styles.bookingModeText,
                bookingMode === 'standard' && styles.bookingModeTextSelected
              ]}>
                Prenotazione Chiusa
              </Text>
              <Text style={[
                styles.bookingModeSubtext,
                bookingMode === 'standard' && styles.bookingModeSubtextSelected
              ]}>
                {matchType === 'singles' 
                  ? 'Seleziona obbligatoriamente 1 avversario' 
                  : 'Seleziona obbligatoriamente 3 giocatori'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.bookingModeButton,
                bookingMode === 'open' && styles.bookingModeButtonSelected
              ]}
              onPress={() => setBookingMode('open')}
            >
              <Text style={[
                styles.bookingModeText,
                bookingMode === 'open' && styles.bookingModeTextSelected
              ]}>
                Prenotazione Open
              </Text>
              <Text style={[
                styles.bookingModeSubtext,
                bookingMode === 'open' && styles.bookingModeSubtextSelected
              ]}>
                {matchType === 'singles' 
                  ? 'Invita opzionalmente 1 avversario' 
                  : 'Invita opzionalmente fino a 3 giocatori'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.limitInfo}>
            {updatingCount ? 'Aggiornamento...' : `Hai effettuato ${userTotalBookingsThisWeek}/5 prenotazioni questa settimana`}
          </Text>
        </View>

        <View style={styles.separator} />

        {/* Pulsante per aprire la legenda */}
        <View style={styles.section}>
          <View style={styles.legendButtonContainer}>
            <TouchableOpacity 
              style={styles.legendButton}
              onPress={() => setShowLegendModal(true)}
            >
              <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
              <Text style={styles.legendButtonText}>Guida alla Prenotazione</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Orario Giornaliero</Text>
          </View>
          
          {timeSlots.length > 0 ? (
            <>
              <View style={styles.timeGrid}>
                {timeSlots.map((slot, index) => {
                  const blockType = getSlotBlockType(slot);
                  const isBooked = isSlotBooked(slot);
                  const isSelected = selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end;
                  const booking = findBookingForSlot(slot);
                  const isOpenBooking = isBooked && booking && booking.type === 'open';
                  const isOpenConfirmed = isOpenBooking && booking.status === 'confirmed';
                  const isOpenWaiting = isOpenBooking && booking.status === 'waiting';
                  const isPassato = isSlotPassato(slot);
                  
                  const getSlotIcon = () => {
                    if (isBooked) return '';
                    if (blockType === 'school') return '🎾';
                    if (blockType === 'individual') return '👤';
                    if (blockType === 'blocked') return '🔧';
                    return '';
                  };

                  const icon = getSlotIcon();
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={getSlotStyle(slot)}
                      onPress={() => handleSlotPress(slot)}
                      onLongPress={() => handleSlotPress(slot)}
                    >
                      <View style={[
                        styles.slotContent,
                        !blockType && !isBooked && styles.slotContentFree
                      ]}>
                        <Text style={[
                          styles.slotText,
                          isSelected && styles.slotTextSelected,
                          (isBooked && !isOpenBooking) && styles.slotTextBooked,
                          (blockType === 'school' || blockType === 'individual') && styles.slotTextBlocked,
                          isOpenWaiting && styles.slotTextOpen,
                          isOpenConfirmed && styles.slotTextBooked,
                          isPassato && styles.slotTextPast
                        ]}>
                          {slot.display}
                        </Text>
                        
                        {isBooked && booking ? (
                          <View style={styles.playersIconsContainer}>
                            {renderPlayerIcons(booking)}
                          </View>
                        ) : icon !== '' ? (
                          <Text style={styles.slotIcon}>{icon}</Text>
                        ) : (
                          <View style={styles.emptyIconContainer} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              <Text style={styles.finalInstruction}>
                Seleziona gli orari cliccando sui riquadri sopra
              </Text>

              {selectedSlot && (
                <TouchableOpacity 
                  style={[styles.primaryButton, bookingLoading && styles.primaryButtonDisabled]} 
                  onPress={handleBooking}
                  disabled={bookingLoading}
                >
                  {bookingLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {!isSelectingPlayers 
                        ? (bookingMode === 'open' 
                            ? `Crea prenotazione ${matchType === 'singles' ? 'singolare' : 'doppio'} open` 
                            : 'Conferma prenotazione')
                        : 'Conferma con giocatori selezionati'
                      }
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {showDatePicker && Platform.OS === 'ios' && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showDatePicker}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalButtonText}>Conferma</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {showAndroidDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Modal per la selezione dei giocatori */}
      <Modal
        visible={showPlayerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowPlayerModal(false);
          setIsSelectingPlayers(true);
        }}
      >
        <View style={styles.playerModalContainer}>
          <View style={styles.playerModalContent}>
            <View style={styles.playerModalHeader}>
              <Text style={styles.playerModalTitle}>
                {bookingMode === 'standard' 
                  ? (matchType === 'singles' ? 'Seleziona Avversario' : 'Seleziona Giocatori')
                  : (matchType === 'singles' ? 'Invita Avversario' : 'Invita Giocatori')
                }
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowPlayerModal(false);
                  setIsSelectingPlayers(true);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#3b82f6" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.playerModalSubtitle}>
              {bookingMode === 'standard' 
                ? (matchType === 'singles' 
                    ? 'Seleziona 1 avversario' 
                    : 'Seleziona 3 giocatori')
                : (matchType === 'singles' 
                    ? 'Puoi selezionare fino a 1 avversario' 
                    : 'Puoi selezionare fino a 3 giocatori')
              }
            </Text>
            
            {bookingMode === 'open' && (
              <TouchableOpacity 
                style={styles.selectAllButton}
                onPress={() => {
                  const maxPlayers = matchType === 'singles' ? 1 : 3;
                  const allPlayerIds = availablePlayers.slice(0, maxPlayers).map(p => p.id);
                  setSelectedPlayers(allPlayerIds);
                }}
              >
                <Text style={styles.selectAllButtonText}>Seleziona tutti</Text>
              </TouchableOpacity>
            )}
            
            <FlatList
              data={availablePlayers}
              renderItem={renderPlayerItem}
              keyExtractor={item => item.id}
              style={styles.playerList}
            />
            
            <View style={styles.playerModalFooter}>
              <Text style={styles.selectedCount}>
                {selectedPlayers.length} {matchType === 'singles' ? 'avversario' : 'giocatori'} selezionati
                {bookingMode === 'standard' && 
                  ` (${matchType === 'singles' ? '1 necessario' : '3 necessari'})`
                }
              </Text>
              <View style={styles.playerModalButtonContainer}>
                <TouchableOpacity 
                  style={styles.okButton}
                  onPress={() => {
                    setShowPlayerModal(false);
                    setIsSelectingPlayers(true);
                    
                    // Per prenotazioni standard, conferma automaticamente dopo la selezione
                    if (bookingMode === 'standard') {
                      // Verifica che il numero di giocatori sia corretto
                      const requiredPlayers = matchType === 'singles' ? 1 : 3;
                      if (selectedPlayers.length === requiredPlayers) {
                        handleBooking(); // Chiama handleBooking per confermare
                      }
                    }
                  }}
                >
                  <Text style={styles.okButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal per la legenda */}
      <LegendModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 30,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  dateTitleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  dateInstruction: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748b',
  },
  fieldsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  activeFieldContainer: {
    backgroundColor: '#3b82f6',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 16,
  },
  activeFieldText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
    textAlign: 'center',
  },
  calendarIcon: {
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  fieldCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  fieldCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'white',
  },
  fieldImageContainer: {
    width: '100%',
    height: 120,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fieldImage: {
    width: '100%',
    height: '100%',
  },
  fieldImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#4b5563',
    fontSize: 9,
    fontWeight: 'bold',
  },
  fieldName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '1e293b',
    textAlign: 'center',
  },
  matchTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchTypeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  matchTypeButtonSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  matchTypeTextContainer: {
    alignItems: 'center',
  },
  matchTypeMainText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
  },
  matchTypeMainTextSelected: {
    color: 'white',
  },
  matchTypeSubText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  matchTypeSubTextSelected: {
    color: 'white',
  },
  limitInfo: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  bookingModeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bookingModeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  bookingModeButtonSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#7c3aed',
  },
  bookingModeText: {
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  bookingModeTextSelected: {
    color: 'white',
  },
  bookingModeSubtext: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  bookingModeSubtextSelected: {
    color: 'white',
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  legendButtonContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  legendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#3b82f6',
    gap: 8,
  },
  legendButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 14,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  slotContent: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingTop: 2,
  },
   slotContentFree: {
    // Rimuoviamo qualsiasi stile speciale per gli slot liberi
  },
  slotText: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111827',
    includeFontPadding: false,
    marginBottom: 4,
  },
  slotTextSelected: {
    color: 'white',
  },
  slotTextBooked: {
    color: 'black',
  },
  slotTextBlocked: {
    color: '#111827',
  },
  slotTextOpen: {
    color: '#111827',
  },
  slotTextPast: {
    color: '#6b7280',
  },
  slotIcon: {
    fontSize: 16,
    marginTop: 0,
  },
  emptyIconContainer: {
    height: 20,
    width: '100%',
  },
  playersIconsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 2,
  },
  playerIcon: {
    marginHorizontal: 1,
    fontSize: 16,
  },
  timeSlot: {
    justifyContent: 'center',
    height: 68,
    width: '31%',
    padding: 0,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 50,
    position: 'relative',
  },
  timeSlotFree: {
    backgroundColor: '#dcfce7',
    borderColor: '#83d6a0',
  },
  timeSlotPast: {
    backgroundColor: '#d1d5db',
    borderColor: '#9ca3af',
  },
  timeSlotSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#7c3aed',
  },
  timeSlotBooked: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  timeSlotOpen: {
    backgroundColor: '#fef08a',
    borderColor: '#dac945',
  },
  timeSlotSchool: {
    backgroundColor: '#93c5fd',
    borderColor: '#3b82f6',
  },
  timeSlotIndividual: {
    backgroundColor: '#f59e0b',
    borderColor: '#ea580c',
  },
  timeSlotBlocked: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  timeSlotText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'black',
    textAlign: 'center',
  },
  timeSlotTextSelected: {
    color: 'white',
  },
  timeSlotTextBooked: {
    color: 'white',
  },
  timeSlotTextBlocked: {
    color: 'black',
  },
  finalInstruction: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 16,
    marginTop: 6,
  },
  primaryButton: {
    padding: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  bottomSpacer: {
    height: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
  },
  modalButton: {
    padding: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 16,
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // Stili per il modal dei giocatori
  playerModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  playerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  playerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  playerModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  playerModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  selectAllButton: {
    backgroundColor: '#3b82f6',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 16,
  },
  selectAllButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  playerList: {
    maxHeight: '70%',
    marginBottom: 16,
  },
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
  },
  playerItemSelected: {
    backgroundColor: '#3b82f6',
  },
  playerItemText: {
    fontSize: 16,
    color: '#1e293b',
  },
  playerItemTextSelected: {
    color: 'white',
  },
  playerModalFooter: {
    alignItems: 'center',
  },
  selectedCount: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  playerModalButtonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  okButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  okButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // Stili per il modal della legenda
  legendModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  legendModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  legendTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  legendCloseButton: {
    padding: 4,
  },
  legendScrollContent: {
    padding: 20,
  },
  legendSection: {
    marginBottom: 24,
  },
  legendSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  legendColorBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
  },
  legendFree: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  legendPast: {
    backgroundColor: '#d1d5db',
    borderColor: '#9ca3af',
  },
  legendBooked: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  legendOpen: {
    backgroundColor: '#fef08a',
    borderColor: '#dac945',
  },
  legendSchool: {
    backgroundColor: '#93c5fd',
    borderColor: '#3b82f6',
  },
  legendIndividual: {
    backgroundColor: '#f59e0b',
    borderColor: '#ea580c',
  },
  legendBlocked: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  legendSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#7c3aed',
  },
  legendText: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
  },
  legendIconsContainer: {
    gap: 12,
  },
  legendIconItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionsList: {
    gap: 10,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  legendFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  legendGotItButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  legendGotItButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BookingScreen;