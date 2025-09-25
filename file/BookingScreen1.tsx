import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Image, Modal, Platform 
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, getDocs, addDoc, query, where, 
  onSnapshot, doc, getDoc, updateDoc, deleteDoc,
  Timestamp, arrayUnion, increment, setDoc
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

// Funzione per ottenere la chiave della settimana (anno + numero settimana)
const getWeekKey = (date: Date) => {
  const startOfWeek = new Date(date);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const year = startOfWeek.getFullYear();
  const weekNumber = Math.ceil((((startOfWeek - new Date(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-${weekNumber}`;
};

const checkAndUpdateBookingStatus = async (bookingId: string) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) return;
    
    const bookingData = bookingSnap.data();
    const allPlayers = [...bookingData.players, ...bookingData.invitedPlayers];
    
    // Controlla se tutti i giocatori hanno confermato
    const allConfirmed = allPlayers.every(player => player.status === 'confirmed');
    
    if (allConfirmed && bookingData.status !== 'confirmed') {
      await updateDoc(bookingRef, {
        status: 'confirmed'
      });
      
      // Aggiorna il conteggio delle prenotazioni per tutti i giocatori
      for (const player of allPlayers) {
        await updateUserBookingCount(player.userId);
      }
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento dello stato della prenotazione:', error);
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
  const [userTotalBookingsThisWeek, setUserTotalBookingsThisWeek] = useState(0);
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('singles');
  const [bookingMode, setBookingMode] = useState<'standard' | 'open'>('standard');
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [updatingCount, setUpdatingCount] = useState(false);

  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

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
      // Possiamo decidere di non fare nulla o mostrare un messaggio all'utente
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
      // In caso di errore di permessi, possiamo ritornare 0 e magari loggare l'errore
      return 0;
    }
  };

  const isWithinNext3Days = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    
    return date >= today && date <= threeDaysLater;
  };

  const handleSlotSelect = (slot) => {
    if (selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot(slot);
    }
  };

  const renderPlayerIcons = (booking) => {
    if (!booking) return null;
    
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);

    if (booking.type === 'normal') {
      if (booking.status === 'pending') {
        const icons = [];
        
        const confirmedPlayers = booking.players.filter(player => player.status === 'confirmed');
        confirmedPlayers.forEach((_, index) => {
          icons.push(
            <Ionicons key={`confirmed-${index}`} name="person" size={14} color="#3b82f6" style={styles.playerIcon} />
          );
        });
        
        const pendingCount = booking.invitedPlayers ? booking.invitedPlayers.filter(player => player.status === 'pending').length : 0;
        for (let i = 0; i < pendingCount; i++) {
          icons.push(
            <Ionicons key={`pending-${i}`} name="person" size={14} color="#f59e0b" style={styles.playerIcon} />
          );
        }
        
        return icons;
      } else {
        return Array(maxPlayers).fill(0).map((_, index) => (
          <Ionicons key={index} name="person" size={14} color="#3b82f6" style={styles.playerIcon} />
        ));
      }
    } else if (booking.type === 'open') {
      const currentPlayers = booking.players ? booking.players.length : 0;
      const icons = [];
      for (let i = 0; i < currentPlayers; i++) {
        icons.push(
          <Ionicons key={`blue-${i}`} name="person" size={14} color="#3b82f6" style={styles.playerIcon} />
        );
      }
      for (let i = 0; i < maxPlayers - currentPlayers; i++) {
        icons.push(
          <Ionicons key={`red-${i}`} name="person" size={14} color="#ef4444" style={styles.playerIcon} />
        );
      }
      return icons;
    }
    return null;
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
        const weekKey = getWeekKey(new Date());
        const userWeekRef = doc(db, 'userWeeklyBookings', `${user.uid}_${weekKey}`);
        const docSnap = await getDoc(userWeekRef);
        
        if (docSnap.exists()) {
          setUserTotalBookingsThisWeek(docSnap.data().count || 0);
        } else {
          // Se il documento non esiste, contiamo manualmente le prenotazioni esistenti
          const dateStart = new Date();
          dateStart.setDate(dateStart.getDate() - dateStart.getDay());
          dateStart.setHours(0, 0, 0, 0);
          
          const dateEnd = new Date(dateStart);
          dateEnd.setDate(dateEnd.getDate() + 7);
          
          const q = query(
            collection(db, 'bookings'),
            where('userIds', 'array-contains', user.uid),
            where('date', '>=', formatDateForStorage(dateStart)),
            where('date', '<=', formatDateForStorage(dateEnd)),
            where('status', 'in', ['confirmed', 'waiting', 'pending'])
          );
          
          const querySnapshot = await getDocs(q);
          setUserTotalBookingsThisWeek(querySnapshot.size);
        }
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
        // Potremmo impostare il conteggio a 0 in caso di errore?
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
      DateTimePicker.open({
        value: selectedDate,
        onChange: handleDateChange,
        mode: 'date',
        minimumDate: new Date(),
        positiveButton: { text: 'Ok' },
        negativeButton: { text: 'Annulla' }
      });
    } else {
      setShowDatePicker(true);
    }
  };

  const handleDateChange = (event, date) => {
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

    try {
      const dayOfWeek = getDayOfWeek(selectedDate);
      const key = `${courtId}_${dayOfWeek}`;
      const dayConfigs = slotConfigurations[key] || [];
      const hit = dayConfigs.find(cfg => {
        if (!cfg || cfg.isActive === false) return false;
        const cfgStart = new Date(`${dateString}T${cfg.startTime}:00`);
        const cfgEnd = new Date(`${dateString}T${cfg.endTime}:00`);
        return slotStartTime < cfgEnd && slotEndTime > cfgStart && cfg.activityType && cfg.activityType !== 'regular';
      });
      if (hit) {
        return hit.activityType || 'blocked';
      }
    } catch (e) {
      console.warn('Errore nella lettura activityType:', e);
    }

    return null;
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

  const getBlockTypeDescription = (blockType) => {
    switch (blockType) {
      case 'school': return 'Scuola Tennis';
      case 'individual': return 'Lezione Individuale';
      case 'blocked': return 'Bloccato (Manutenzione/Altro)';
      default: return blockType;
    }
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

  const handleSlotPress = (slot) => {
    const blockType = getSlotBlockType(slot);
    const isBooked = isSlotBooked(slot);
    const booking = findBookingForSlot(slot);

    const typeLabelMap = {
      school: 'Scuola Tennis',
      individual: 'Lezione Individuale',
      blocked: 'Bloccato (Manutenzione/Altro)',
      regular: 'Campo libero',
    };
    
    let label = isBooked ? 'Prenotato' : (blockType ? typeLabelMap[blockType] : 'Informazioni');

    if (isBooked && booking) {
      if (booking.status === 'pending') {
        label = 'In attesa di conferma';
      } else if (booking.type === 'open') {
        label = 'Prenotazione Open';
      }
    }

    let note = slot.notes || null;
    if (!note && blockType === 'blocked') {
      note = getBlockedReason(slot);
    }

    let bookedBy = null;
    let isOpenBooking = false;
    let currentPlayers = 0;
    let maxPlayers = 0;
    let canJoin = false;
    let isPending = false;
    
    if (isBooked && booking) {
      bookedBy = `${booking.userFirstName || ''} ${booking.userLastName || ''}`.trim() || 
                booking.userName || 'Utente';
      
      isPending = booking.status === 'pending';
      
      if (booking.type === 'open') {
        isOpenBooking = true;
        currentPlayers = booking.players ? booking.players.length : 1;
        maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
        
        if (booking.userId !== user.uid && 
            booking.status === 'waiting' && 
            currentPlayers < maxPlayers) {
          canJoin = true;
        }
      }
    }

    const lines = [];
    if (note) lines.push(note);
    lines.push(`${slot.start} - ${slot.end}`);
    if (bookedBy) lines.push(`Prenotato da: ${bookedBy}`);
    
    if (isPending) {
      lines.push(`Stato: In attesa di conferma`);
    } else if (isOpenBooking) {
      lines.push(`Tipo: Prenotazione Open (${booking.matchType === 'singles' ? 'Singolare' : 'Doppio'})`);
      lines.push(`Giocatori: ${currentPlayers}/${maxPlayers}`);
      lines.push(`Stato: ${booking.status === 'waiting' ? 'In attesa di giocatori' : 'Confermato'}`);
    }

    const buttons = [{ text: 'OK' }];
    
    if (canJoin) {
      buttons.unshift({
        text: 'Unisciti alla prenotazione',
        onPress: () => handleJoinBooking(booking)
      });
    }

    Alert.alert(`Info Slot - ${label}`, lines.join('\n'), buttons);
  };

  const handleJoinBooking = async (booking) => {
    if (!user) return;
    
    if (booking.players.some(player => player.userId === user.uid)) {
      Alert.alert('Errore', 'Sei già in questa prenotazione');
      return;
    }
    
    const currentPlayers = booking.players ? booking.players.length : 1;
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
    
    if (currentPlayers >= maxPlayers) {
      Alert.alert('Errore', 'La prenotazione è già completa');
      return;
    }
    
    if (!isAdmin && userTotalBookingsThisWeek >= 5) {
      Alert.alert(
        'Limite prenotazioni raggiunto',
        'Hai già effettuado 5 prenotazioni questa settimana. Non puoi unirti ad altre partite.'
      );
      return;
    }
    
    setBookingLoading(true);
    setUpdatingCount(true);
    
    try {
      const bookingRef = doc(db, 'bookings', booking.id);
      const newPlayer = {
        userId: user.uid,
        userName: user.displayName || user.email,
        status: 'confirmed'
      };
      
      const updatedPlayers = [...booking.players, newPlayer];
      const isNowFull = updatedPlayers.length >= maxPlayers;
      
      await updateDoc(bookingRef, {
        players: updatedPlayers,
        status: isNowFull ? 'confirmed' : 'waiting',
        userIds: arrayUnion(user.uid) // Aggiungi questa linea
      });
      
      // Verifica e aggiorna lo stato della prenotazione se necessario
      await checkAndUpdateBookingStatus(booking.id);
      
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
    const isPending = isBooked && booking && booking.status === 'pending';
    
    if (isSelected) {
      return [styles.timeSlot, styles.timeSlotSelected];
    }
    
    if (isPending) {
      return [styles.timeSlot, styles.timeSlotBooked];
    }
    
    if (isOpenBooking) {
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
            ? 'Puoi invitare massimo 1 giocatore per il singolare' 
            : 'Puoi invitare massimo 3 giocatori per doppio'
        );
      }
    }
  };

  const handleBooking = async () => {
    if (!user || !selectedSlot) return;

    if (bookingMode === 'standard') {
      const requiredPlayers = matchType === 'singles' ? 1 : 3;
      if (selectedPlayers.length !== requiredPlayers) {
        Alert.alert(
          'Selezione giocatori',
          matchType === 'singles' 
            ? 'Devi selezionare 1 avversario per il singolare' 
            : 'Devi selezionare 3 giocatori per il doppio'
        );
        return;
      }
    }

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

    for (const playerId of [user.uid, ...selectedPlayers]) {
      const playerBookingsCount = await getUserBookingCount(playerId);
      if (playerBookingsCount >= 5) {
        const player = playerId === user.uid 
          ? { fullName: 'Tu' } 
          : availablePlayers.find(p => p.id === playerId);
        Alert.alert(
          'Limite prenotazioni raggiunto',
          `${player?.fullName} ha già raggiunto il limite de 5 prenotazioni questa settimana.`
        );
        return;
      }
    }

    setBookingLoading(true);
    setUpdatingCount(true);
    try {
      const court = courts.find(c => c.name === selectedField);
      const dateString = formatDateForStorage(selectedDate);
      const duration = timeStringToMinutes(selectedSlot.end) - timeStringToMinutes(selectedSlot.start);
      const maxPlayers = matchType === 'singles' ? 2 : 4;

      // MODIFICA: Per prenotazioni standard, tutti i giocatori sono confirmed immediatamente
      const players = [
        {
          userId: user.uid,
          userName: user.displayName || user.email,
          status: 'confirmed'
        },
        ...selectedPlayers.map(playerId => {
          const player = availablePlayers.find(p => p.id === playerId);
          return {
            userId: playerId,
            userName: player?.fullName || playerId,
            status: 'confirmed' // Sempre confirmed per standard
          };
        })
      ];

      let status = 'confirmed'; // Sempre confirmed per standard
      if (bookingMode === 'open') {
        status = 'waiting';
        // Per open, rimuovi gli invitedPlayers dai players
        players.length = 1; // Tieni solo il prenotante
      }

      const bookingData = {
        userId: user.uid,
        userName: user.displayName || user.email,
        userFirstName: userData?.nome || '',
        userLastName: userData?.cognome || '',
        courtId: court.id,
        courtName: court.name,
        date: dateString,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        duration: duration,
        status: status,
        type: bookingMode === 'open' ? 'open' : 'normal',
        matchType: matchType,
        players: players,
        invitedPlayers: bookingMode === 'open' ? 
          selectedPlayers.map(playerId => {
            const player = availablePlayers.find(p => p.id === playerId);
            return {
              userId: playerId,
              userName: player?.fullName || playerId,
              status: 'pending'
            };
          }) : [],
        maxPlayers: maxPlayers,
        createdAt: Timestamp.fromDate(new Date()),
        userIds: [user.uid, ...selectedPlayers],
      };

      if (bookingMode === 'open') {
        bookingData.joinable = true;
      }

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      const bookingWithId = { ...bookingData, id: docRef.id };

      // MODIFICA: Aggiorna il conteggio per TUTTI i giocatori nelle prenotazioni standard
      if (bookingMode === 'standard') {
        for (const playerId of [user.uid, ...selectedPlayers]) {
          await updateUserBookingCount(playerId);
        }
        Alert.alert('Successo', 'Prenotazione confermata!');
      } else {
        // Per open, aggiorna solo il prenotante
        await updateUserBookingCount(user.uid);
        
        const message = `Nuova partita ${matchType === 'singles' ? 'singolare' : 'doppio'} open il ${formatDate(selectedDate)} dalle ${selectedSlot.start} alle ${selectedSlot.end}. Unisciti!`;
        
        for (const player of availablePlayers) {
          if (player.id !== user.uid) {
            await createNotification(
              player.id,
              message,
              'open_match',
              bookingWithId
            );
          }
        }
        
        Alert.alert('Successo', 
          `Prenotazione ${matchType === 'singles' ? 'singolare' : 'doppio'} open creata! Tutti i giocatori sono stati notificati.`
        );
      }
      
      setSelectedSlot(null);
      setSelectedPlayers([]);
      setBookingMode('standard');
    } catch (error) {
      console.error('Errore durante la prenotazione:', error);
      Alert.alert('Errore', 'Impossibile completare la prenotazione');
    } finally {
      setBookingLoading(false);
      setUpdatingCount(false);
    }
  };

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
          <Text style={styles.sectionTitle}>Data</Text>
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
          <Text style={styles.datePickerHint}>Seleziona una data dal calendario</Text>
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
              <Text style={[
                styles.matchTypeText,
                matchType === 'singles' && styles.matchTypeTextSelected
              ]}>
                Singolare (2 giocatori)
              </Text>
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
              <Text style={[
                styles.matchTypeText,
                matchType === 'doubles' && styles.matchTypeTextSelected
              ]}>
                Doppio (4 giocatori)
              </Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.limitInfo}>
            {updatingCount ? 'Aggiornamento...' : `Hai effettuato ${userTotalBookingsThisWeek}/5 prenotazioni questa settimana`}
          </Text>
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
                {matchType === 'singles' ? 'Gioco singolo' : 'Squadra completa'}
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
                {matchType === 'singles' ? 'Cerca avversario' : 'Cerca giocatori'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {bookingMode === 'standard' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {matchType === 'singles' ? 'Seleziona Avversario' : 'Seleziona Giocatori'}
            </Text>
            <Text style={styles.inviteHint}>
              {matchType === 'singles' 
                ? 'Seleziona il giocatore con cui vuoi giocare' 
                : 'Seleziona dei giocatori che vuoi invitare (max 3)'}
            </Text>
            
            <ScrollView style={styles.playersContainer} horizontal={true}>
              {availablePlayers.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerChip,
                    selectedPlayers.includes(player.id) && styles.playerChipSelected
                  ]}
                  onPress={() => togglePlayerSelection(player.id)}
                >
                  <Text style={[
                    styles.playerChipText,
                    selectedPlayers.includes(player.id) && styles.playerChipTextSelected
                  ]}>
                    {player.fullName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <Text style={styles.selectedPlayersInfo}>
              {selectedPlayers.length} {matchType === 'singles' ? 'avversario' : 'giocatori'} selezionati
            </Text>
          </View>
        )}

        {bookingMode === 'open' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {matchType === 'singles' ? 'Invita Avversario (Opzionale)' : 'Invita Giocatori (Opzionale)'}
            </Text>
            <Text style={styles.inviteHint}>
              {matchType === 'singles' 
                ? 'Puoi selezionare un avversario da invitare' 
                : 'Puoi selezionare dei giocatori da invitare (max 3)'}
            </Text>
            
            <ScrollView style={styles.playersContainer} horizontal={true}>
              {availablePlayers.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerChip,
                    selectedPlayers.includes(player.id) && styles.playerChipSelected
                  ]}
                  onPress={() => togglePlayerSelection(player.id)}
                >
                  <Text style={[
                    styles.playerChipText,
                    selectedPlayers.includes(player.id) && styles.playerChipTextSelected
                  ]}>
                    {player.fullName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <Text style={styles.selectedPlayersInfo}>
              {selectedPlayers.length} {matchType === 'singles' ? 'avversario' : 'giocatori'} selezionati
            </Text>
          </View>
        )}

        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.instructionsTitle}>Come prenotare:</Text>
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionItem}>• Seleziona <Text style={styles.bold}>Singolare</Text> or <Text style={styles.bold}>Doppio</Text></Text>
            <Text style={styles.instructionItem}>• Scehi tra <Text style={styles.bold}>Standard</Text> or <Text style={styles.bold}>Open</Text></Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Tocca brevemente</Text> per selezionare slot libero</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Tocca a lungo</Text> per vedere i dettagli</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Non si possono prenotare 2 slot consecutivi</Text></Text>
            <Text style={styles.instructionItem}>• <Text style={styles.greenText}>Verde chiaro</Text> = Libero</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bookedText}>Verde intenso</Text> = Prenotato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.pendingText}>Arancione</Text> = In attesa di conferma</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.azureText}>Azzurro</Text> = Scuola Tennis</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.orangeText}>Arancione scuro</Text> = Lezione individuale</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.redText}>Rosso</Text> = Bloccato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.violetText}>Viola</Text> = Selezionato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.yellowText}>Giallo</Text> = Prenotazione Open</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.blueText}>Omino blu</Text> = Giocatore confermado</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.yellowText}>Omino giallo</Text> = Giocatore da confermare</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orari Disponibili</Text>
          
          {timeSlots.length > 0 ? (
            <>
              <View style={styles.timeGrid}>
                {timeSlots.map((slot, index) => {
                  const blockType = getSlotBlockType(slot);
                  const isBooked = isSlotBooked(slot);
                  const isSelected = selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end;
                  const booking = findBookingForSlot(slot);
                  
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
                      onPress={() => { 
                        const t = getSlotBlockType(slot); 
                        const booked = isSlotBooked(slot); 
                        if (t || booked || slot.activityType) { 
                          handleSlotPress(slot); 
                        } else { 
                          handleSlotSelect(slot); 
                        } 
                      }}
                      onLongPress={() => handleSlotPress(slot)}
                    >
                      <View style={[
                        styles.slotContent,
                        !blockType && !isBooked && styles.slotContentFree
                      ]}>
                        <Text style={[
                          styles.slotText,
                          isSelected && styles.slotTextSelected
                        ]}>
                          {slot.display}
                        </Text>
                        {isBooked && booking ? (
                          <View style={styles.playersIconsContainer}>
                            {renderPlayerIcons(booking)}
                          </View>
                        ) : icon !== '' ? (
                          <Text style={styles.slotIcon}>{icon}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              <Text style={styles.finalInstruction}>
                Seleziona gli orari cliccando sui riquadri sopra
              </Text>

              <TouchableOpacity 
                style={[styles.primaryButton, (!selectedSlot || bookingLoading) && styles.primaryButtonDisabled]} 
                onPress={handleBooking}
                disabled={!selectedSlot || bookingLoading}
              >
                {bookingLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {bookingMode === 'open' 
                      ? `Crea prenotazione ${matchType === 'singles' ? 'singolare' : 'doppio'} open` 
                      : 'Prenota'
                    }
                  </Text>
                )}
              </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
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
  datePickerHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
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
  matchTypeText: {
    color: '#64748b',
    fontWeight: '600',
  },
  matchTypeTextSelected: {
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
   