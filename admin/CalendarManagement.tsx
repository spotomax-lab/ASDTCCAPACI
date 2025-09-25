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
  Modal,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, query, where, onSnapshot, Timestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { formatDateForStorage } from '../utils/dateTimeHelpers';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const { height } = Dimensions.get('window');

// Funzione per verificare se uno slot è nel passato
const isSlotPassato = (slot, selectedDate) => {
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
const getSlotNotes = (slot, selectedField, selectedDate, slotConfigurations) => {
  if (!selectedField) return null;
  
  try {
    const dayOfWeek = selectedDate.getDay();
    const courtId = selectedField.replace('Campo ', '');
    const key = `${courtId}_${dayOfWeek}`;
    const dayConfigs = slotConfigurations[key] || [];
    
    const dateString = selectedDate.toISOString().split('T')[0];
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
  // Funzione per renderizzare le icone dei giocatori
  const renderPlayerIcons = (booking) => {
    if (!booking) return null;
    
    const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);

    if (booking.type === 'normal' || booking.type === 'standard') {
      if (booking.status === 'pending') {
        const icons = [];
        
        const confirmedPlayers = booking.players.filter(player => player.status === 'confirmed');
        confirmedPlayers.forEach((_, index) => {
          icons.push(
            <Ionicons key={`confirmed-${index}`} name="person" size={16} color="#3b82f6" style={calendarStyles.playerIcon} />
          );
        });
        
        const pendingCount = booking.invitedPlayers ? booking.invitedPlayers.filter(player => player.status === 'pending').length : 0;
        for (let i = 0; i < pendingCount; i++) {
          icons.push(
            <Ionicons key={`pending-${i}`} name="person" size={16} color="#f59e0b" style={calendarStyles.playerIcon} />
          );
        }
        
        return icons;
      } else {
        return Array(maxPlayers).fill(0).map((_, index) => (
          <Ionicons key={index} name="person" size={16} color="#3b82f6" style={calendarStyles.playerIcon} />
        ));
      }
    } else if (booking.type === 'open') {
      const currentPlayers = booking.players ? booking.players.filter(player => player.status === 'confirmed').length : 0;
      const icons = [];
      
      // Giocatori confermati (blu)
      for (let i = 0; i < currentPlayers; i++) {
        icons.push(
          <Ionicons key={`blue-${i}`} name="person" size={16} color="#3b82f6" style={calendarStyles.playerIcon} />
        );
      }
      
      // Posti disponibili (rossi)
      for (let i = 0; i < maxPlayers - currentPlayers; i++) {
        icons.push(
          <Ionicons key={`red-${i}`} name="person" size={16} color="#ef4444" style={calendarStyles.playerIcon} />
        );
      }
      
      return icons;
    }
    return null;
  };

  // Funzione per ottenere l'icona dello slot (emoji)
  const getSlotIcon = (type) => {
    switch (type) {
      case 'school': return '🎾';
      case 'individual': return '👤';
      case 'blocked': return '🔧';
      default: return '';
    }
  };

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

      // Gestione semplificata stati prenotazioni
      const bookedSlot = bookings.find(booking => {
        if (booking.courtName !== selectedField) return false;
        
        const bookingStart = new Date(`${booking.date}T${booking.startTime}`);
        const bookingEnd = new Date(`${booking.date}T${booking.endTime}`);
        
        return slotStartTime >= bookingStart && slotStartTime < bookingEnd;
      });

      if (bookedSlot) {
        let type = 'booked';
        if (bookedSlot.status === 'pending') {
          type = 'pending';
        } else if (bookedSlot.type === 'open' && bookedSlot.status === 'waiting') {
          type = 'open';
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
          return { 
            type: hit.activityType || 'blocked', 
            title: '', 
            id: null, 
            isBlock: true,
            notes: hit.notes || '' // Aggiungi le note al risultato
          };
        }
      } catch (e) {
        console.warn('Errore nella lettura activityType:', e);
      }

    } catch (error) {
      console.error('Error getting slot type:', error);
    }
    
    return { type: 'free', title: '', id: null, isBlock: false };
  };

  const getSlotStyle = (slotInfo, isSelected = false, slot) => {
    if (isSelected) {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotSelected];
    }
    
    // Controlla se lo slot è passato (solo per slot liberi)
    if (slotInfo.type === 'free' && isSlotPassato(slot, selectedDate)) {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotPast];
    }
    
    // CASO CORRETTO: Slot liberi non passati
    if (slotInfo.type === 'free') {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotFree];
    }
    
    if (slotInfo.type === 'pending') {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotPending];
    }
    
    // Le prenotazioni open confermate diventano verdi
    if (slotInfo.type === 'open' && slotInfo.bookingData && slotInfo.bookingData.status === 'confirmed') {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotBooked];
    }
    
    if (slotInfo.type === 'open') {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotOpen];
    }
    
    if (slotInfo.type === 'booked') {
      return [calendarStyles.timeSlot, calendarStyles.timeSlotBooked];
    }
    
    if (slotInfo.type) {
      switch (slotInfo.type) {
        case 'school':
          return [calendarStyles.timeSlot, calendarStyles.timeSlotSchool];
        case 'individual':
          return [calendarStyles.timeSlot, calendarStyles.timeSlotIndividual];
        case 'blocked':
        default:
          return [calendarStyles.timeSlot, calendarStyles.timeSlotBlocked];
      }
    }
    
    return [calendarStyles.timeSlot, calendarStyles.timeSlotFree];
  };

  // Funzione helper per descrizione tipo blocco
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

  const handleSlotPress = (slot, slotInfo) => {
    if (isEditMode) {
      // In modalità edit, controlla se lo slot è passato
      if (isSlotPassato(slot, selectedDate)) {
        Alert.alert(
          'Impossibile bloccare',
          'Non è possibile bloccare uno slot con orario già passato'
        );
        return;
      }
      onSlotSelect(slot.start);
    } else {
      let title = 'Info Slot';
      let message = '';
      
      if (slotInfo.type !== 'free' && slotInfo.bookingData) {
        const booking = slotInfo.bookingData;
        
        // Formatta la data in italiano
        const bookingDate = new Date(booking.date + 'T00:00:00');
        const dateFormatted = bookingDate.toLocaleDateString('it-IT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        
        // Determina il tipo di partita
        const matchTypeText = booking.matchType === 'singles' ? 'Singolare' : 'Doppio';
        const bookingTypeText = booking.type === 'open' ? 'Open' : 'Standard';
        
        // Conta i giocatori confermati
        const confirmedPlayers = booking.players.filter(player => player.status === 'confirmed');
        const currentPlayers = confirmedPlayers.length;
        const maxPlayers = booking.maxPlayers || (booking.matchType === 'singles' ? 2 : 4);
        
        // Prepara l'elenco degli altri giocatori (escludendo il prenotatore)
        const otherPlayers = confirmedPlayers
          .filter(player => player.userId !== booking.userId)
          .map(player => player.userName);
        
        // Costruisce il messaggio completo
        message += `Data: ${dateFormatted}\n`;
        message += `Orario: ${slot.display}\n`;
        message += `Campo: ${selectedField}\n`;
        message += `Tipo: ${bookingTypeText} - ${matchTypeText}\n`;
        
        if (booking.type === 'open') {
          // Messaggio per prenotazioni Open
          const statusText = booking.status === 'waiting' ? 'In attesa di giocatori' : 'Confermato';
          message += `Stato: ${statusText}\n`;
          message += `Giocatori: ${currentPlayers}/${maxPlayers}\n`;
          message += `Prenotato da: ${booking.userFirstName} ${booking.userLastName}\n`;
          
          if (otherPlayers.length > 0) {
            message += `Altri giocatori: ${otherPlayers.join(', ')}`;
          } else {
            message += `Altri giocatori: Nessun altro giocatore confermato`;
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
      } else if (slotInfo.type !== 'free') {
        // Messaggio per slot bloccati (non prenotazioni)
        title = `Info Slot - ${getBlockTypeDescription(slotInfo.type)}`;
        message += `Orario: ${slot.display}\n`;
        message += `Campo: ${selectedField}\n`;
        
        if (slotInfo.title) {
          message += `${slotInfo.title}\n`;
        }
        
        // AGGIUNTA: Mostra le note se presenti (senza la scritta "Note:")
        const slotNotes = slotInfo.notes || getSlotNotes(slot, selectedField, selectedDate, slotConfigurations);
        if (slotNotes) {
          message += `${slotNotes}\n`;
        }
      } else {
        // Messaggio per slot liberi - controlla se è passato
        const isPassato = isSlotPassato(slot, selectedDate);
        if (isPassato) {
          message = `Orario: ${slot.display}\nCampo: ${selectedField}\nStato: Passato (Non prenotabile)`;
        } else {
          message = `Orario: ${slot.display}\nCampo: ${selectedField}\nStato: Libero`;
        }
      }
      
      Alert.alert(title, message, [{ text: 'OK' }]);
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
            Seleziona gli slot per blocco una-tantum (solo slot futuri)
          </Text>
        )}
      </View>

      <View style={calendarStyles.timeGrid}>
        {timeSlots.map((slot, index) => {
          const slotInfo = getSlotType(slot);
          const isSelected = selectedSlots.includes(slot.start);
          const slotStyle = getSlotStyle(slotInfo, isSelected, slot);
          const booking = slotInfo.bookingData;
          const icon = getSlotIcon(slotInfo.type);
          const isPassato = slotInfo.type === 'free' && isSlotPassato(slot, selectedDate);

          return (
            <TouchableOpacity
              key={index}
              style={slotStyle}
              onPress={() => handleSlotPress(slot, slotInfo)}
              onLongPress={() => {
                if ((slotInfo.type === 'booked' || slotInfo.type === 'pending' || slotInfo.type === 'open') && userData?.role === 'admin') {
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
                  // AGGIUNTA: Mostra le note anche nel long press
                  const slotNotes = slotInfo.notes || getSlotNotes(slot, selectedField, selectedDate, slotConfigurations);
                  let longPressMessage = `Vuoi eliminare il blocco delle ${slot.start}?`;
                  
                  if (slotInfo.title) {
                    longPressMessage += `\nMotivo: ${slotInfo.title}`;
                  }
                  
                  if (slotNotes) {
                    longPressMessage += `\n${slotNotes}`;
                  }
                  
                  Alert.alert(
                    slotInfo.id ? 'Elimina Blocco' : 'Info Blocco',
                    longPressMessage,
                    slotInfo.id ? [
                      { text: 'Annulla', style: 'cancel' },
                      { 
                        text: 'Elimina', 
                        onPress: () => onDeleteBlock(slotInfo.id) 
                      }
                    ] : [
                      { text: 'OK', style: 'default' }
                    ]
                  );
                } else if (isPassato) {
                  Alert.alert(
                    'Info Slot',
                    `Orario: ${slot.display}\nCampo: ${selectedField}\nStato: Passato (Non prenotabile)`
                  );
                }
              }}
              disabled={isEditMode && isPassato} // Disabilita la selezione in edit mode per slot passati
            >
              <View style={[
                calendarStyles.slotContent,
                slotInfo.type === 'free' && calendarStyles.slotContentFree
              ]}>
                <Text style={[
                  calendarStyles.slotText,
                  isSelected && calendarStyles.slotTextSelected,
                  (slotInfo.type === 'booked' || slotInfo.type === 'pending' || slotInfo.type === 'open') && calendarStyles.slotTextBooked,
                  (slotInfo.type === 'school' || slotInfo.type === 'individual' || slotInfo.type === 'blocked') && calendarStyles.slotTextBlocked,
                  slotInfo.type === 'open' && calendarStyles.slotTextOpen,
                  isPassato && calendarStyles.slotTextPast
                ]}>
                  {slot.display}
                </Text>
                
                {booking && (slotInfo.type === 'booked' || slotInfo.type === 'pending' || slotInfo.type === 'open') ? (
                  <View style={calendarStyles.playersIconsContainer}>
                    {renderPlayerIcons(booking)}
                  </View>
                ) : icon !== '' ? (
                  <Text style={calendarStyles.slotIcon}>{icon}</Text>
                ) : (
                  <View style={calendarStyles.emptyIconContainer} />
                )}
              </View>
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
  const [showLegendModal, setShowLegendModal] = useState(false); // Nuovo stato per il modal della legenda

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
    // Controlla se lo slot è passato prima di permettere la selezione
    const slotObj = { start: slot };
    if (isSlotPassato(slotObj, selectedDate)) {
      Alert.alert(
        'Impossibile selezionare',
        'Non è possibile selezionare slot con orario già passato'
      );
      return;
    }
    
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

    // Verifica che tutti gli slot selezionati non siano passati
    for (const slot of selectedSlots) {
      const slotObj = { start: slot };
      if (isSlotPassato(slotObj, selectedDate)) {
        Alert.alert(
          'Errore',
          `Impossibile bloccare lo slot ${slot} perché è già passato`
        );
        return;
      }
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

  // Componente per il modal della legenda
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
              <Text style={styles.legendTitle}>Guida alla Creazione Slot</Text>
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
                  <Text style={styles.legendText}>Prenotazioni Confermate</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColorBox, styles.legendOpen]} />
                  <Text style={styles.legendText}>Prenotazioni in Attesa</Text>
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
                {isEditMode && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendColorBox, styles.legendSelected]} />
                    <Text style={styles.legendText}>Selezionato</Text>
                  </View>
                )}
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

            {/* Sezione Istruzioni per Admin */}
            {userData?.role === 'admin' && (
              <View style={styles.legendSection}>
                <Text style={styles.legendSectionTitle}>Istruzioni per Admin</Text>
                <View style={styles.instructionsList}>
                  <View style={styles.instructionItem}>
                    <Ionicons name="create-outline" size={16} color="#3b82f6" />
                    <Text style={styles.instructionText}>Crea blocchi una-tantum per eventi speciali</Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <Ionicons name="calendar-outline" size={16} color="#3b82f6" />
                    <Text style={styles.instructionText}>Usa il Planner Settimanale per programmazione ricorrente</Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <Ionicons name="time-outline" size={16} color="#3b82f6" />
                    <Text style={styles.instructionText}>Non è possibile bloccare slot con orario passato</Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    <Text style={styles.instructionText}>Tocca a lungo su un blocco per eliminarlo</Text>
                  </View>
                </View>
              </View>
            )}
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

            <Text style={styles.warningText}>
              ⚠️ Attenzione: Non è possibile bloccare slot con orario già passato
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

        {/* Pulsante per aprire la legenda */}
        <View style={styles.legendButtonContainer}>
          <TouchableOpacity 
            style={styles.legendButton}
            onPress={() => setShowLegendModal(true)}
          >
            <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
            <Text style={styles.legendButtonText}>Guida alla Creazione Slot</Text>
          </TouchableOpacity>
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

      {/* Modal per la legenda */}
      <LegendModal />
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
  warningText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
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
  legendButtonContainer: {
    alignItems: 'center',
    marginBottom: 20,
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
    maxHeight: '85%',
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
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
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
  timeSlotPending: {
    backgroundColor: '#fef08a',
    borderColor: '#dac945',
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
  slotContent: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingTop: 2,
    position: 'relative',
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
    marginTop: 2,
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
  emptyIconContainer: {
    height: 20,
    width: '100%',
  },
});

export default CalendarManagement;