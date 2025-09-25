import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  ActivityIndicator,
  Dimensions,
  TextInput,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, query, where, onSnapshot, Timestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { formatDateForStorage } from '../utils/dateTimeHelpers';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const { height } = Dimensions.get('window');

// Componente per la visualizzazione del calendario
const CalendarView = ({ 
  selectedDate, 
  blockedSlots, 
  bookings,
  selectedField,
  isEditMode, 
  selectedSlots, 
  onSlotSelect,
  userData,
  onDeleteBlock,
  onDeleteBooking,
  slotConfigurations = {}
}) => {
  // Funzione helper per generare slot da configurazione
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

  // Sostituisci la generazione degli slot fissi con quella basata sulle configurazioni
  const generateTimeSlots = () => {
    const dayOfWeek = selectedDate.getDay();
    const courtId = selectedField.replace('Campo ', '');
    const key = `${courtId}_${dayOfWeek}`;
    
    // Cerca le configurazioni per questo campo e giorno
    const dayConfigs = slotConfigurations[key] || [];

    let allSlots = [];
    
    // Se non ci sono configurazioni, non generare slot predefiniti
    if (dayConfigs.length === 0) {
      return [];
    } else {
      // Genera gli slot per ogni configurazione
      dayConfigs.forEach(config => {
        if (config.isActive) {
          const slots = generateTimeSlotsFromConfig(config.startTime, config.endTime, config.slotDuration);
          allSlots = [...allSlots, ...slots];
        }
      });
    }
    
    return allSlots.sort((a, b) => {
      const [aHour, aMinute] = a.start.split(':').map(Number);
      const [bHour, bMinute] = b.start.split(':').map(Number);
      return (aHour * 60 + aMinute) - (bHour * 60 + bMinute);
    });
  };

  const timeSlots = generateTimeSlots();

  const getSlotType = (slot) => {
    try {
      // Aggiungi controllo di sicurezza per selectedField
      if (!selectedField) {
        return { type: 'free', title: '', id: null, isBlock: false };
      }
      
      const dateString = selectedDate.toISOString().split('T')[0];
      const slotStartTime = new Date(`${dateString} ${slot.start}`);

      const courtIdFromName = selectedField.replace('Campo ', '');

      // Prima controlla se è bloccato manualmente
      const blockedSlot = blockedSlots.find(block => {
        if (block.courtId !== courtIdFromName) return false;
        
        let blockStart, blockEnd;
        
        try {
          blockStart = block.start?.toDate ? block.start.toDate() : new Date(block.start);
          blockEnd = block.end?.toDate ? block.end.toDate() : new Date(block.end);
        } catch (error) {
          console.error('Error parsing block dates:', error);
          return false;
        }
        
        return slotStartTime >= blockStart && slotStartTime < blockEnd;
      });

      if (blockedSlot) {
        return {
          type: blockedSlot.type || 'blocked',
          title: blockedSlot.title || '',
          id: blockedSlot.id,
          isBlock: true
        };
      }

      // MODIFICA: Gestione semplificata stati prenotazioni
      const bookedSlot = bookings.find(booking => {
        if (booking.courtName !== selectedField) return false;
        
        const bookingStart = new Date(`${booking.date}T${booking.startTime}`);
        const bookingEnd = new Date(`${booking.date}T${booking.endTime}`);
        
        return slotStartTime >= bookingStart && slotStartTime < bookingEnd;
      });

      if (bookedSlot) {
        let type = 'booked';
        if (bookedSlot.type === 'open' && bookedSlot.status === 'waiting') {
          type = 'waiting';
        }
        
        return {
          type: type,
          title: `Prenotato da ${bookedSlot.userFirstName} ${bookedSlot.userLastName}`,
          id: bookedSlot.id,
          isBlock: false,
          userInfo: `${bookedSlot.userFirstName} ${bookedSlot.userLastName}`,
          bookingStatus: bookedSlot.status,
          bookingData: bookedSlot
        };
      }
      // Controlla activityType dal planner settimanale
      try {
        const dayOfWeek = selectedDate.getDay();
        const key = `${courtIdFromName}_${dayOfWeek}`;
        const dayConfigs = slotConfigurations[key] || [];
        const hit = dayConfigs.find(cfg => {
          if (!cfg || cfg.isActive === false) return false;
          const cfgStart = new Date(`${dateString}T${cfg.startTime}:00`);
          const cfgEnd = new Date(`${dateString}T${cfg.endTime}:00`);
          return slotStartTime >= cfgStart && slotStartTime < cfgEnd && cfg.activityType && cfg.activityType !== 'regular';
        });
        if (hit) {
          return { type: hit.activityType || 'blocked', title: '', id: null, isBlock: true };
        }
      } catch (e) {
        console.warn('Errore nella lettura activityType:', e);
      }

    } catch (error) {
      console.error('Error getting slot type:', error);
    }
    
    return { type: 'free', title: '', id: null, isBlock: false };
  };

  const getSlotColor = (type, isSelected = false) => {
    if (isSelected) return '#8b5cf6'; // Viola per selezione
    
    switch (type) {
      case 'school': return '#3b82f6'; // Blu
      case 'individual': return '#f59e0b'; // Arancione
      case 'blocked': return '#ef4444'; // Rosso per bloccato (manutenzione/altro)
      case 'booked': return '#10b981'; // Verde per prenotazioni confermate
      case 'pending': return '#fef08a'; // Giallo per prenotazioni in attesa
      case 'waiting': return '#fef08a'; // Giallo per prenotazioni in attesa
      default: return '#dcfce7'; // Verde chiaro per libero
    }
  };

  const getSlotIcon = (type) => {
    switch (type) {
      case 'school': return '🎾';
      case 'individual': return '👤';
      case 'blocked': return '🔧';
      case 'booked': return '👥';
      case 'pending': return '⏳';
      case 'waiting': return '⏳';
      default: return ''; // Rimuove l'emoji ✅ dagli slot libero
    }
  };

  const handleSlotPress = (slot, slotInfo) => {
    if (isEditMode) {
      onSlotSelect(slot.start);
    } else {
      let message = `Ora: ${slot.display}\nCampo: ${selectedField}`;
      
      if (slotInfo.type !== 'free') {
        let statusText = '';
        let details = '';
        
        switch (slotInfo.type) {
          case 'booked': 
            statusText = 'Prenotato';
            if (slotInfo.bookingData) {
              const booking = slotInfo.bookingData;
              details = `Tipo: ${booking.type === 'open' ? 'Open' : 'Standard'} - ${booking.matchType === 'singles' ? 'Singolare' : 'Doppio'}`;
              
              if (booking.status === 'pending') {
                if (booking.type === 'open') {
                  statusText = 'In attesa di accettazione del giocatore' + (booking.matchType === 'doubles' ? 'i' : '');
                } else {
                  statusText = 'In attesa di conferma del giocatore' + (booking.matchType === 'doubles' ? 'i' : '');
                }
              }
            }
            break;
          case 'pending': 
            statusText = 'In attesa di conferma';
            if (slotInfo.bookingData) {
              const booking = slotInfo.bookingData;
              details = `Tipo: ${booking.type === 'open' ? 'Open' : 'Standard'} - ${booking.matchType === 'singles' ? 'Singolare' : 'Doppio'}`;
              
              if (booking.type === 'open') {
                statusText = 'In attesa di accettazione del giocatore' + (booking.matchType === 'doubles' ? 'i' : '');
              } else {
                statusText = 'In attesa di conferma del giocatore' + (booking.matchType === 'doubles' ? 'i' : '');
              }
            }
            break;
          case 'waiting': 
            statusText = 'In lista d\'attesa';
            if (slotInfo.bookingData) {
              const booking = slotInfo.bookingData;
              details = `Tipo: ${booking.type === 'open' ? 'Open' : 'Standard'} - ${booking.matchType === 'singles' ? 'Singolare' : 'Doppio'}`;
            }
            break;
          case 'school': statusText = 'Scuola Tennis'; break;
          case 'individual': statusText = 'Lezione Individuale'; break;
          case 'blocked': statusText = 'Bloccato'; break;
          default: statusText = slotInfo.type;
        }
        
        message += `\nStato: ${statusText}`;
        if (details) message += `\n${details}`;
        if (slotInfo.userInfo) {
          // Mostra solo il nome dell'utente senza informazioni ridondanti
          const userMatch = slotInfo.userInfo.match(/^([^\(]+)/);
          if (userMatch) {
            message += `\nUtente: ${userMatch[0].trim()}`;
          }
        }
      }
      
      Alert.alert('Info Slot', message, [{ text: 'OK' }]);
    }
  };

  return (
    <View>
      <View style={calendarStyles.header}>
        <Text style={calendarStyles.title}>
          {selectedDate.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })}
        </Text>
        {isEditMode && (
          <Text style={calendarStyles.editModeText}>
            Seleziona gli slot per blocco una-tantum
          </Text>
        )}
      </View>

      <View style={calendarStyles.timeGrid}>
        {timeSlots.map((slot, index) => {
          const slotInfo = getSlotType(slot);
          const isSelected = selectedSlots.includes(slot.start);
          const color = getSlotColor(slotInfo.type, isSelected);
          const icon = getSlotIcon(slotInfo.type);

          return (
            <TouchableOpacity
              key={index}
              style={[calendarStyles.timeSlot, { backgroundColor: color }]}
              onPress={() => handleSlotPress(slot, slotInfo)}
              onLongPress={() => {
                if ((slotInfo.type === 'booked' || slotInfo.type === 'pending' || slotInfo.type === 'waiting') && userData?.role === 'admin') {
                  Alert.alert(
                    'Dettagli Prenotazione',
                    `Prenotato da: ${slotInfo.userInfo}\nOra: ${slot.display}\nCampo: ${selectedField}\nStato: ${slotInfo.bookingStatus || 'confermato'}`,
                    [
                      { 
                        text: 'Elimina Prenotazione', 
                        onPress: () => onDeleteBooking(slotInfo.id),
                        style: 'destructive'
                      },
                      { text: 'Annulla', style: 'cancel' }
                    ]
                  );
                } else if (slotInfo.type !== 'free' && userData?.role === 'admin' && slotInfo.isBlock) {
                  Alert.alert(
                    'Elimina Blocco',
                    `Vuoi eliminare il blocco delle ${slot.start}?\nMotivo: ${slotInfo.title || 'Nessun titolo'}`,
                    [
                      { text: 'Annulla', style: 'cancel' },
                      { 
                        text: 'Elimina', 
                        onPress: () => onDeleteBlock(slotInfo.id) 
                      }
                    ]
                  );
                }
              }}
            >
              <View style={calendarStyles.slotContent}>
                <Text style={[
                  calendarStyles.slotText,
                  slotInfo.type === 'free' && calendarStyles.slotTextFree,
                  isSelected && calendarStyles.slotTextSelected
                ]}>
                  {slot.display}
                </Text>
                <Text style={calendarStyles.slotIcon}>
                  {icon}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={16} color="white" style={calendarStyles.selectedIcon} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const CalendarManagement = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedFieldId, setSelectedFieldId] = useState('1');
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [blockTitle, setBlockTitle] = useState('');
  const [blockType, setBlockType] = useState('school');
  const [showCreationGuide, setShowCreationGuide] = useState(false);
  const [slotConfigurations, setSlotConfigurations] = useState({});

  const { userData } = useAuth();

  const courts = [
    { id: '1', name: 'Campo 1' },
    { id: '2', name: 'Campo 2' }
  ];

  const selectedFieldName = courts.find(c => c.id === selectedFieldId)?.name || 'Campo 1';

  useEffect(() => {
    fetchBlockedSlots();
    fetchBookings();
    fetchSlotConfigurations();
  }, [selectedDate, selectedFieldId]);

  const fetchSlotConfigurations = () => {
    try {
      const q = query(collection(db, 'slotConfigurations'));
      const unsubscribe = onSnapshot(q, 
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
          if (error.code === 'permission-denied') {
            console.warn('Permessi insufficienti per le configurazioni slot');
            Alert.alert('Errore', 'Permessi insufficienti per le configurazioni slot');
          }
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error fetching slot configurations:', error);
      return () => {};
    }
  };

  const fetchBlockedSlots = async () => {
    try {
      setLoading(true);
      const dateStart = new Date(selectedDate);
      dateStart.setHours(0, 0, 0, 0);
      
      const dateEnd = new Date(selectedDate);
      dateEnd.setHours(23, 59, 59, 999);

      // Usa una query più semplice senza where clauses complessi
      const q = query(collection(db, 'blockedSlots'));
      
      const unsubscribe = onSnapshot(q, 
        (querySnapshot) => {
          const slots = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const courtId = selectedFieldName.replace('Campo ', '');
            
            // Filtra per data e campo lato client
            try {
              const startDate = data.start?.toDate ? data.start.toDate() : new Date(data.start);
              if (startDate >= dateStart && startDate <= dateEnd && data.courtId === courtId) {
                slots.push({ 
                  id: doc.id, 
                  ...data,
                  start: startDate,
                  end: data.end?.toDate ? data.end.toDate() : new Date(data.end)
                });
              }
            } catch (error) {
              console.error('Error parsing block dates:', error);
            }
          });
          setBlockedSlots(slots);
          setLoading(false);
        }, 
        (error) => {
          console.error('Error in blocked slots snapshot:', error);
          setLoading(false);
          
          if (error.code === 'permission-denied') {
            console.warn('Permessi insufficienti per accedere agli slot bloccati');
            Alert.alert('Errore', 'Permessi insufficienti per accedere agli slot bloccati');
          }
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Error fetching blocked slots:', error);
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const dateString = selectedDate.toISOString().split('T')[0];
      // Modifica la query per includere tutti gli stati delle prenotazioni
      const q = query(
        collection(db, 'bookings'),
        where('courtName', '==', selectedFieldName),
        where('date', '==', dateString),
        where('status', 'in', ['confirmed', 'waiting', 'pending'])
      );

      const querySnapshot = await getDocs(q);
      const bookingsList = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        bookingsList.push({ 
          id: doc.id, 
          ...data
        });
      });
      
      setBookings(bookingsList);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      
      // Gestione specifica per errori di permesso
      if (error.code === 'permission-denied') {
        console.warn('Permessi insufficienti per accedere alle prenotazioni');
        Alert.alert('Errore', 'Permessi insufficienti per accedere alle prenotazioni');
      } else {
        Alert.alert('Errore', 'Impossibile caricare le prenotazioni');
      }
    }
  };

  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      setSelectedSlots([]);
    }
  };

  const navigateDate = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    
    // Non permettere di navigare a date passate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) return;
    
    setSelectedDate(newDate);
    setSelectedSlots([]);
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot);
      } else {
        return [...prev, slot];
      }
    });
  };

  const handleSaveBlocks = async () => {
    if (selectedSlots.length === 0) {
      Alert.alert('Errore', 'Seleziona almeno uno slot orario');
      return;
    }

    if (!blockTitle.trim()) {
      Alert.alert('Errore', 'Inserisci un titolo per il blocco');
      return;
    }

    try {
      setLoading(true);
      
      for (const slot of selectedSlots) {
        const [hours, minutes] = slot.split(':').map(Number);
        
        const startDateTime = new Date(selectedDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const endDateTime = new Date(selectedDate);
        endDateTime.setHours(hours, minutes + 30, 0, 0);

        await addDoc(collection(db, 'blockedSlots'), {
          type: blockType,
          courtId: selectedFieldId,
          title: blockTitle.trim(),
          start: Timestamp.fromDate(startDateTime),
          end: Timestamp.fromDate(endDateTime),
          createdAt: Timestamp.now(),
          isRecurring: false // Aggiunto per distinguere i blocchi una-tantum
        });
      }
      
      Alert.alert('Successo', 'Slot bloccati con successo!');
      setSelectedSlots([]);
      setBlockTitle('');
      setShowEditModal(false);
      setIsEditMode(false);
      setShowCreationGuide(false);
      fetchBlockedSlots();
      
    } catch (error) {
      console.error('Error blocking slots:', error);
      
      // Gestione specifica per errori di permesso
      if (error.code === 'permission-denied') {
        Alert.alert('Errore', 'Non hai i permessi per bloccare gli slot');
      } else if (error.code === 'unavailable') {
        Alert.alert('Errore', 'Connessione di rete non disponibile');
      } else {
        Alert.alert('Errore', 'Impossibile bloccare gli slots: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (!blockId) return;

    try {
      await deleteDoc(doc(db, 'blockedSlots', blockId));
      Alert.alert('Successo', 'Blocco eliminato con successo');
      fetchBlockedSlots();
    } catch (error) {
      console.error('Error deleting block:', error);
      
      // Gestione specifica per errori di permesso
      if (error.code === 'permission-denied') {
        Alert.alert('Errore', 'Non hai i permessi per eliminare i blocchi');
      } else if (error.code === 'not-found') {
        Alert.alert('Errore', 'Blocco non trovato');
      } else {
        Alert.alert('Errore', 'Impossibile eliminare il blocco');
      }
    }
  };

  const handleDeleteBooking = async (bookingId) => {
    if (!bookingId) return;

    Alert.alert(
      'Conferma eliminazione',
      'Sei sicuro di voler eliminare questa prenotazione?',
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Elimina',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'bookings', bookingId));
              Alert.alert('Successo', 'Prenotazione eliminata con successo');
              fetchBookings();
            } catch (error) {
              console.error('Error deleting booking:', error);
              
              // Gestione specifica per errori di permesso
              if (error.code === 'permission-denied') {
                Alert.alert('Errore', 'Non hai i permessi per eliminare les prenotazioni');
              } else if (error.code === 'not-found') {
                Alert.alert('Errore', 'Prenotazione non trovata');
              } else {
                Alert.alert('Errore', 'Impossibile eliminare la prenotazione');
              }
            }
          }
        }
      ]
    );
  };

  const startBlockCreation = () => {
    setIsEditMode(true);
    setShowCreationGuide(true);
    setSelectedSlots([]);
  };

  const cancelBlockCreation = () => {
    setIsEditMode(false);
    setShowCreationGuide(false);
    setSelectedSlots([]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Caricamento calendario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Header con navigazione e selezione campo */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigateDate(-1)} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color="#3b82f6" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setShowDatePicker(true)}
            style={styles.dateSelector}
          >
            <Text style={styles.dateText}>
              {selectedDate.toLocaleDateString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}
            </Text>
            <Ionicons name="calendar" size={20} color="#3b82f6" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigateDate(1)} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color="#3b82f6" />
          </TouchableOpacity>
        </View>

        {/* Selezione Campo */}
        <View style={styles.fieldSelector}>
          <Text style={styles.fieldLabel}>Campo:</Text>
          {courts.map((court) => (
            <TouchableOpacity
              key={court.id}
              style={[
                styles.fieldButton,
                selectedFieldId === court.id && styles.fieldButtonSelected
              ]}
              onPress={() => {
                setSelectedFieldId(court.id);
                setSelectedSlots([]);
              }}
            >
              <Text style={[
                styles.fieldButtonText,
                selectedFieldId === court.id && styles.fieldButtonTextSelected
              ]}>
                {court.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pulsante per creare blocco */}
        {userData?.role === 'admin' && !isEditMode && (
          <TouchableOpacity
            style={styles.createBlockButton}
            onPress={startBlockCreation}
          >
            <Ionicons name="lock-closed" size={20} color="white" />
            <Text style={styles.createBlockText}>Crea Blocco Una-Tantum</Text>
          </TouchableOpacity>
        )}

        {/* Guida alla creazione di blocchi */}
        {showCreationGuide && (
          <View style={styles.creationGuide}>
            <Text style={styles.guideTitle}>Modalità creazione blocchi attiva</Text>
            <Text style={styles.guideText}>
              Seleziona gli slot che vuoi bloccare per eventi una-tantum, poi clicca "Conferma Blocco"
            </Text>
            
            <View style={styles.usageExamples}>
              <Text style={styles.exampleTitle}>Esempi di utilizzo:</Text>
              <Text style={styles.example}>• 🏆 Tornei e eventi speciali</Text>
              <Text style={styles.example}>• 🔧 Manutenzione straordinaria</Text>
              <Text style={styles.example}>• 🎉 Eventi privati</Text>
              <Text style={styles.example}>• ❌ Chiusure improvvise</Text>
            </View>

            <Text style={styles.noteText}>
              Nota: Per programmazione ricorrente (scuola tennis, lezioni) usa la Configurazione Slot
            </Text>

            <TouchableOpacity 
              style={styles.cancelCreationButton}
              onPress={cancelBlockCreation}
            >
              <Text style={styles.cancelCreationText}>Annulla Creazione</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pulsante per confermare blocco quando ci sono slot selezionati */}
        {isEditMode && selectedSlots.length > 0 && (
          <TouchableOpacity
            style={styles.confirmBlockButton}
            onPress={() => setShowEditModal(true)}
            disabled={loading}
          >
            <Ionicons name="save" size={20} color="white" />
            <Text style={styles.confirmBlockText}>
              Conferma Blocco ({selectedSlots.length} slot selezionati)
            </Text>
          </TouchableOpacity>
        )}

        {/* Legenda Colorata */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#dcfce7' }]} />
            <Text style={styles.legendText}>Libero</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>Scuola Tennis</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>Lezioni</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>Bloccato</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>Prenotazioni Confermate</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#fef08a' }]} />
            <Text style={styles.legendText}>Prenotazioni in Attesa</Text>
          </View>
          {isEditMode && (
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#8b5cf6' }]} />
              <Text style={styles.legendText}>Selezionato</Text>
            </View>
          )}
        </View>

        {/* Calendario Visuale */}
        <CalendarView 
          selectedDate={selectedDate}
          blockedSlots={blockedSlots}
          bookings={bookings}
          selectedField={selectedFieldName}
          isEditMode={isEditMode}
          selectedSlots={selectedSlots}
          onSlotSelect={handleSlotSelect}
          userData={userData}
          onDeleteBlock={handleDeleteBlock}
          onDeleteBooking={handleDeleteBooking}
          slotConfigurations={slotConfigurations}
        />

        {/* Spazio finale per permettere lo scroll completo */}
        <View style={styles.bottomSpacer} />

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            onChange={handleDateChange}
            minimumDate={new Date()} // Impedisce di selezionare date passate
          />
        )}

        {/* Modal per creazione blocchi */}
        <Modal
          visible={showEditModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Crea Blocco Una-Tantum</Text>
              
              <Text style={styles.sectionTitle}>Dettagli Blocco</Text>
              
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Campo:</Text> {selectedFieldName}
                </Text>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Data:</Text> {selectedDate.toLocaleDateString('it-IT')}
                </Text>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Orari:</Text> {selectedSlots.join(', ')}
                </Text>
              </View>

              <Text style={styles.modalLabel}>Titolo del Blocco *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Es: Torneo Under 16"
                value={blockTitle}
                onChangeText={setBlockTitle}
              />

              <Text style={styles.modalLabel}>Tipo di Attività *</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeButton, blockType === 'school' && styles.typeButtonSelected]}
                  onPress={() => setBlockType('school')}
                >
                  <Ionicons name="people" size={20} color={blockType === 'school' ? 'white' : '#3b82f6'} />
                  <Text style={[
                    styles.typeButtonText,
                    blockType === 'school' && styles.typeButtonTextSelected
                  ]}>
                    Scuola Tennis
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, blockType === 'individual' && styles.typeButtonSelected]}
                  onPress={() => setBlockType('individual')}
                >
                  <Ionicons name="person" size={20} color={blockType === 'individual' ? 'white' : '#3b82f6'} />
                  <Text style={[
                    styles.typeButtonText,
                    blockType === 'individual' && styles.typeButtonTextSelected
                  ]}>
                    Lezione Individuale
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, blockType === 'blocked' && styles.typeButtonSelected]}
                  onPress={() => setBlockType('blocked')}
                >
                  <Ionicons name="construct" size={20} color={blockType === 'blocked' ? 'white' : '#3b82f6'} />
                  <Text style={[
                    styles.typeButtonText,
                    blockType === 'blocked' && styles.typeButtonTextSelected
                  ]}>
                    Altro
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleSaveBlocks}
                  disabled={loading || !blockTitle.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.modalButtonConfirmText}>Crea Blocco</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
};

// Stili per il componente principale
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    padding: 0,
  },
  navButton: {
    padding: 8,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  fieldSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 0,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
  },
  fieldButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 4,
  },
  fieldButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  fieldButtonText: {
    color: '#64748b',
    fontWeight: '600',
  },
  fieldButtonTextSelected: {
    color: 'white',
  },
  createBlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  createBlockText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  creationGuide: {
    backgroundColor: '#e0f2fe',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: 8,
  },
  guideText: {
    fontSize: 14,
    color: '#0c4a6e',
    marginBottom: 12,
  },
  usageExamples: {
    marginBottom: 12,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 4,
  },
  example: {
    fontSize: 13,
    color: '#0c4a6e',
    marginLeft: 8,
  },
  noteText: {
    fontSize: 12,
    color: '#0369a1',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cancelCreationButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginTop: 8,
  },
  cancelCreationText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  confirmBlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  confirmBlockText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 0,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#374151',
  },
  bottomSpacer: {
    height: 50,
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
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1e293b',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
  },
  infoLabel: {
    fontWeight: '600',
    color: '#334155',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    gap: 8,
  },
  typeButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  typeButtonText: {
    color: '#64748b',
    fontWeight: '600',
  },
  typeButtonTextSelected: {
    color: 'white',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#e5e7eb',
  },
  modalButtonConfirm: {
    backgroundColor: '#3b82f6',
  },
  modalButtonCancelText: {
    color: '#374151',
    fontWeight: '600',
  },
  modalButtonConfirmText: {
    color: 'white',
    fontWeight: '600',
  },
});

// Stili per il componente CalendarView

const calendarStyles = StyleSheet.create({
  container: { backgroundColor: '#f3f4f6', padding: 16 },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  editModeText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { backgroundColor: '#e5edff', padding: 10, borderRadius: 10 },
  dateDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  dateText: { fontSize: 16, color: '#1f2937' },
  courtRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  courtLabel: { fontSize: 16, color: '#374151', marginRight: 8 },
  courtBtn: { backgroundColor: '#e5e7eb', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginRight: 8 },
  courtBtnActive: { backgroundColor: '#3b82f6' },
  courtBtnText: { color: '#3b82f6', fontWeight: '600' },
  courtBtnTextActive: { color: '#fff' },

  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  timeSlot: {
    width: '31%',
    height: 68,
    padding: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#dcfce7',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: 'relative',
  },
  slotContent: {
    alignItems: 'center',
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
    marginTop: 2,
  },
  selectedIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});

export default CalendarManagement;