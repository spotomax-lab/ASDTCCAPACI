import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Image, Modal, Platform 
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, getDocs, addDoc, query, where, 
  onSnapshot, doc, getDoc, updateDoc
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
  // Vecchi stati per limiti - mantenuti per eventuali future modifiche
  const [userSinglesBookingsThisWeek, setUserSinglesBookingsThisWeek] = useState(0);
  const [userDoublesBookingsThisWeek, setUserDoublesBookingsThisWeek] = useState(0);
  // Nuovo stato per limite totale
  const [userTotalBookingsThisWeek, setUserTotalBookingsThisWeek] = useState(0);
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('singles');
  const [bookingMode, setBookingMode] = useState<'standard' | 'open'>('standard');
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

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

  useEffect(() => {
    fetchCourts();
    const unsubscribe = fetchSlotConfigurations();
    fetchAvailablePlayers();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedField && selectedDate) {
      fetchExistingBookings();
      fetchBlocks();
    }
  }, [selectedField, selectedDate]);

  // Vecchio useEffect per limiti singoli/doppi - mantenuto per eventuali future modifiche
  useEffect(() => {
    if (!user || isAdmin) return;

    const startOfWeek = getStartOfWeek(new Date());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', user.uid),
      where('createdAt', '>=', startOfWeek),
      where('createdAt', '<=', endOfWeek),
      where('status', '==', 'confirmed')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let singlesCount = 0;
      let doublesCount = 0;

      querySnapshot.forEach((doc) => {
        const booking = doc.data();
        if (booking.matchType === 'singles') {
          singlesCount++;
        } else if (booking.matchType === 'doubles') {
          doublesCount++;
        }
      });

      setUserSinglesBookingsThisWeek(singlesCount);
      setUserDoublesBookingsThisWeek(doublesCount);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  // Nuovo useEffect per limite totale di 5 partite a settimana
  useEffect(() => {
    if (!user || isAdmin) return;

    const startOfWeek = getStartOfWeek(new Date());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'bookings'),
      where('players', 'array-contains', { 
        userId: user.uid, 
        status: 'confirmed' 
      }),
      where('createdAt', '>=', startOfWeek),
      where('createdAt', '<=', endOfWeek),
      where('status', 'in', ['confirmed', 'waiting'])
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setUserTotalBookingsThisWeek(querySnapshot.size);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

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
      DateTimePickerAndroid.open({
        value: selectedDate,
        onChange: handleDateChange,
        mode: 'date',
        minimumDate: new Date(),
        positiveButtonLabel: 'Ok',
        negativeButtonLabel: 'Annulla'
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
      where('status', 'in', ['confirmed', 'waiting'])
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
      where('start', '>=', startOfDay),
      where('start', '<=', endOfDay)
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
    if (slot && slot.activityType && slot.activityType !== 'regular') return slot.activityType;
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

    return blockedSlot ? blockedSlot.type || 'blocked' : null;
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
  {
    const dayOfWeek = getDayOfWeek(selectedDate);
    const courtId = selectedField.replace('Campo ', '');
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
  }

    
    const isBlocked = blocks.some(block => {
      const courtId = selectedField.replace('Campo ', '');
      
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
      where('status', 'in', ['confirmed', 'waiting'])
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

    // Check if it's an open booking
    if (isBooked && booking && booking.type === 'open') {
      label = 'Prenotazione Open';
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
    
    if (isBooked && booking) {
      bookedBy = `${booking.userFirstName || ''} ${booking.userLastName || ''}`.trim() || 
                booking.userName || 'Utente';
      
      // Check if it's an open booking
      if (booking.type === 'open') {
        isOpenBooking = true;
        currentPlayers = booking.players ? booking.players.length : 1;
        maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
        
        // Check if user can join
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
    
    if (isOpenBooking) {
      lines.push(`Tipo: Prenotazione Open (${booking.matchType === 'singles' ? 'Singolare' : 'Doppio'})`);
      lines.push(`Giocatori: ${currentPlayers}/${maxPlayers}`);
      lines.push(`Stato: ${booking.status === 'waiting' ? 'In attesa di giocatori' : 'Confermato'}`);
    }

    const buttons = [{ text: 'OK' }];
    
    // Add join button if it's an open booking and user can join
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
    
    // Check if user is already in the booking
    if (booking.players.some(player => player.userId === user.uid)) {
      Alert.alert('Errore', 'Sei già in questa prenotazione');
      return;
    }
    
    // Check if booking is full
    const currentPlayers = booking.players ? booking.players.length : 1;
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
    
    if (currentPlayers >= maxPlayers) {
      Alert.alert('Errore', 'La prenotazione è già completa');
      return;
    }
    
    // Check if user has reached weekly limit
    if (!isAdmin && userTotalBookingsThisWeek >= 5) {
      Alert.alert(
        'Limite prenotazioni raggiunto',
        'Hai già effettuato 5 prenotazioni questa settimana. Non puoi unirti ad altre partite.'
      );
      return;
    }
    
    setBookingLoading(true);
    
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
        status: isNowFull ? 'confirmed' : 'waiting'
      });
      
      // Aggiorna immediatamente il conteggio locale
      setUserTotalBookingsThisWeek(prev => prev + 1);
      
      Alert.alert('Successo', 'Ti sei unito alla prenotazione con successo!');
      setSelectedSlot(null);
    } catch (error) {
      console.error('Errore durante l\'unione alla prenotazione:', error);
      Alert.alert('Errore', 'Impossibile unirsi alla prenotazione');
    } finally {
      setBookingLoading(false);
    }
  };

  const getSlotStyle = (slot) => {
    const blockType = getSlotBlockType(slot);
    const isBooked = isSlotBooked(slot);
    const isSelected = selectedSlot && selectedSlot.start === slot.start && selectedSlot.end === slot.end;
    const booking = findBookingForSlot(slot);
    const isOpenBooking = isBooked && booking && booking.type === 'open';
    
    if (isSelected) {
      return [styles.timeSlot, styles.timeSlotSelected];
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

    const hasAdjacent = await hasConsecutiveBooking(selectedSlot);
    if (hasAdjacent) {
      Alert.alert('Regola prenotazioni', 'Non si possono prenotare 2 slot orari consecutivi.');
      return;
    }

    if (!isSlotAvailable(selectedSlot)) {
      Alert.alert('Non prenotabile', 'Lo slot selezionato non è prenotabile.');
      return;
    }

    // Controllo nuovo limite di 5 partite totali a settimana
    if (!isAdmin && userTotalBookingsThisWeek >= 5) {
      Alert.alert(
        'Limite prenotazioni raggiunto',
        'Hai già effettuato 5 prenotazioni questa settimana. Non puoi effettuarne altre.'
      );
      return;
    }

    /* Vecchio controllo limiti - disattivato ma mantenuto per eventuali future modifiche
    if (!isAdmin) {
      if (matchType === 'singles' && userSinglesBookingsThisWeek >= 3) {
        Alert.alert(
          'Limite prenotazioni raggiunto',
          'Hai già effettuato 3 prenotazioni singolari questa settimana. Non puoi effettuarne altre.'
        );
        return;
      }
      
      if (matchType === 'doubles' && userDoublesBookingsThisWeek >= 1) {
        Alert.alert(
          'Limite prenotazioni raggiunto',
          'Hai già effettuato 1 prenotazione doppia questa settimana. Non puoi effettuarne altre.'
        );
        return;
      }
    }
    */

    setBookingLoading(true);
    try {
      const court = courts.find(c => c.name === selectedField);
      const dateString = formatDateForStorage(selectedDate);
      const duration = timeStringToMinutes(selectedSlot.end) - timeStringToMinutes(selectedSlot.start);
      const maxPlayers = matchType === 'singles' ? 2 : 4;

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
        status: bookingMode === 'open' ? 'waiting' : 'confirmed',
        type: bookingMode === 'open' ? 'open' : 'normal',
        matchType: matchType,
        players: [
          {
            userId: user.uid,
            userName: user.displayName || user.email,
            status: 'confirmed'
          }
        ],
        maxPlayers: maxPlayers,
        createdAt: new Date()
      };

      if (bookingMode === 'open') {
        bookingData.joinable = true;
        
        if (selectedPlayers.length > 0) {
          bookingData.invitedPlayers = selectedPlayers;
          
          for (const playerId of selectedPlayers) {
            await addDoc(collection(db, 'notifications'), {
              userId: playerId,
              type: 'booking_invitation',
              bookingData: bookingData,
              message: `${user.displayName || user.email} ti ha invitato a partecipare a una partita di ${matchType === 'singles' ? 'singolare' : 'doppio'}`,
              createdAt: new Date(),
              read: false
            });
          }
        }
      }

      await addDoc(collection(db, 'bookings'), bookingData);

      // Aggiorna immediatamente il conteggio locale
      setUserTotalBookingsThisWeek(prev => prev + 1);

      Alert.alert('Successo', 
        bookingMode === 'open' 
          ? `Prenotazione ${matchType === 'singles' ? 'singolare' : 'doppio'} open creata! ${selectedPlayers.length > 0 ? 'Gli invitati riceveranno una notifica.' : ''}`
          : 'Prenotazione confermata!'
      );
      
      setSelectedSlot(null);
      setSelectedPlayers([]);
      setBookingMode('standard');
    } catch (error) {
      console.error('Errore durante la prenotazione:', error);
      Alert.alert('Errore', 'Impossibile completare la prenotazione');
    } finally {
      setBookingLoading(false);
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
          
          {/* Informazioni limite aggiornate */}
          <Text style={styles.limitInfo}>
            {`Hai ${userTotalBookingsThisWeek}/5 prenotazioni questa settimana`}
          </Text>
          
          {/* Vecchie informazioni limite - mantenute ma nascoste 
          <Text style={[styles.limitInfo, {display: 'none'}]}>
            {matchType === 'singles' 
              ? `Hai ${userSinglesBookingsThisWeek}/3 prenotazioni singolari questa settimana`
              : `Hai ${userDoublesBookingsThisWeek}/1 prenotazione doppia questa settimana`
            }
          </Text>
          */}
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

        {bookingMode === 'open' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {matchType === 'singles' ? 'Invita Avversario' : 'Invita Giocatori'}
            </Text>
            <Text style={styles.inviteHint}>
              {matchType === 'singles' 
                ? 'Seleziona un avversario da invitare' 
                : 'Seleziona i giocatori che vuoi invitare (max 3)'}
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
            <Text style={styles.instructionItem}>• Seleziona <Text style={styles.bold}>Singolare</Text> o <Text style={styles.bold}>Doppio</Text></Text>
            <Text style={styles.instructionItem}>• Scegli tra <Text style={styles.bold}>Standard</Text> or <Text style={styles.bold}>Open</Text></Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Tocca brevemente</Text> per selezionare slot libero</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Tocca a lungo</Text> per vedere i dettagli</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Non si possono prenotare 2 slot consecutivi</Text></Text>
            <Text style={styles.instructionItem}>• <Text style={styles.greenText}>Verde chiaro</Text> = Libero</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.bookedText}>Verde intenso</Text> = Prenotato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.azureText}>Azzurro</Text> = Scuola Tennis</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.orangeText}>Arancione</Text> = Lezione individuale</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.redText}>Rosso</Text> = Bloccato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.violetText}>Viola</Text> = Selezionato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.yellowText}>Giallo</Text> = Prenotazione Open</Text>
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
  const isOpenBooking = isBooked && booking && booking.type === 'open';
  
  const getSlotIcon = () => {
    if (isOpenBooking) return '👥❓';
    if (isBooked) return '👥';
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
  {icon !== '' && (
    <Text style={styles.slotIcon}>
      {icon}
    </Text>
  )}
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
  playersContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    maxHeight: 50,
  },
  playerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 20,
    marginRight: 8,
  },
  playerChipSelected: {
    backgroundColor: '#3b82f6',
  },
  playerChipText: {
    color: '#4b5563',
    fontSize: 12,
  },
  playerChipTextSelected: {
    color: 'white',
  },
  inviteHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  selectedPlayersInfo: {
    fontSize: 12,
    color: '#3b82f6',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  instructionsContainer: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 6,
  },
  instructionItem: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 5,
    lineHeight: 14,
  },
  bold: {
    fontWeight: '600',
  },
  greenText: {
    color: '#22c55e',
    fontWeight: 'bold',
  },
  bookedText: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  azureText: {
    color: '#93c5fd',
    fontWeight: 'bold',
  },
  orangeText: {
    color: '#f59e0b',
    fontWeight: 'bold',
  },
  redText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  violetText: {
    color: '#8b5cf6',
    fontWeight: 'bold',
  },
  yellowText: {
    color: '#f59e0b',
    fontWeight: 'bold',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
slotContent: {
    alignItems: 'center',
  },
slotContentFree: {
  alignItems: 'center',
  justifyContent: 'flex-start',
  height: '100%',
  paddingTop: 14,
},
  slotText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
    includeFontPadding: false,
},
slotTextSelected: {
  color: 'white',
},
slotIcon: {
  fontSize: 16,
  marginTop: 0,
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
    borderColor: '#bbf7d0',
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
    borderColor: '#f59e0b',
  },
  timeSlotSchool: {
    backgroundColor: '#93c5fd',
    borderColor: '#3b82f6',
  },
  timeSlotIndividual: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706',
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
    marginBottom: 20,
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
});

export default BookingScreen;