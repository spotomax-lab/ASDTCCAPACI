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
  onDeleteBooking
}) => {
  const timeSlots = [];
  for (let hour = 8; hour <= 22; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }

  const getSlotType = (slot) => {
    try {
      const dateString = selectedDate.toISOString().split('T')[0];
      const slotStartTime = new Date(`${dateString} ${slot}`);
      
      // Prima controlla se è bloccato manualmente
      const blockedSlot = blockedSlots.find(block => {
        const courtIdFromName = selectedField.replace('Campo ', '');
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

      // Controlla sempre le prenotazioni
      const bookedSlot = bookings.find(booking => {
        if (booking.courtName !== selectedField) return false;
        return booking.slots && booking.slots.includes(slot);
      });

      if (bookedSlot) {
        return {
          type: 'booked',
          title: `Prenotato da ${bookedSlot.userFirstName} ${bookedSlot.userLastName}`,
          id: bookedSlot.id,
          isBlock: false,
          userInfo: `${bookedSlot.userFirstName} ${bookedSlot.userLastName} (${bookedSlot.userName})`
        };
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
      case 'booked': return '#10b981'; // Verde per prenotazioni
      default: return '#dcfce7'; // Verde chiaro per libero
    }
  };

  const getSlotIcon = (type) => {
  switch (type) {
    case 'school': return '🎾';
    case 'individual': return '👤';
    case 'blocked': return '🔧'; // Icona per manutenzione/altro
    case 'booked': return '👥';
    default: return ''; // Rimuove l'emoji ✅ dagli slot liberi
  }
};

  const handleSlotPress = (slot, slotInfo) => {
    if (isEditMode) {
      onSlotSelect(slot);
    } else {
      let message = `Ora: ${slot}\nCampo: ${selectedField}`;
      
      if (slotInfo.type !== 'free') {
        message += `\nStato: ${slotInfo.type === 'booked' ? 'Prenotato' : 'Bloccato'}`;
        if (slotInfo.title) message += `\nMotivo: ${slotInfo.title}`;
        if (slotInfo.userInfo) message += `\nUtente: ${slotInfo.userInfo}`;
      }
      
      Alert.alert('Info Slot', message, [{ text: 'OK' }]);
    }
  };

  return (
    <View style={calendarStyles.container}>
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
            Seleziona gli slot da bloccare
          </Text>
        )}
      </View>

      <View style={calendarStyles.timeGrid}>
        {timeSlots.map((slot, index) => {
          const slotInfo = getSlotType(slot);
          const isSelected = selectedSlots.includes(slot);
          const color = getSlotColor(slotInfo.type, isSelected);
          const icon = getSlotIcon(slotInfo.type);

          return (
            <TouchableOpacity
              key={index}
              style={[calendarStyles.timeSlot, { backgroundColor: color }]}
              onPress={() => handleSlotPress(slot, slotInfo)}
              onLongPress={() => {
                if (slotInfo.type === 'booked' && userData?.role === 'admin') {
                  Alert.alert(
                    'Dettagli Prenotazione',
                    `Prenotato da: ${slotInfo.userInfo}\nOra: ${slot}\nCampo: ${selectedField}`,
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
                    `Vuoi eliminare il blocco delle ${slot}?\nMotivo: ${slotInfo.title || 'Nessun titolo'}`,
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
              <Text style={[
                calendarStyles.slotText,
                slotInfo.type === 'free' && calendarStyles.slotTextFree,
                isSelected && calendarStyles.slotTextSelected // Aggiungi questo stile per gli slot selezionati
              ]}>
                {slot} {icon}
              </Text>
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

  const { userData } = useAuth();

  const courts = [
    { id: '1', name: 'Campo 1' },
    { id: '2', name: 'Campo 2' }
  ];

  const selectedFieldName = courts.find(c => c.id === selectedFieldId)?.name || 'Campo 1';

  useEffect(() => {
    fetchBlockedSlots();
    fetchBookings();
  }, [selectedDate, selectedFieldId]);

  const fetchBlockedSlots = async () => {
    try {
      setLoading(true);
      const dateStart = new Date(selectedDate);
      dateStart.setHours(0, 0, 0, 0);
      
      const dateEnd = new Date(selectedDate);
      dateEnd.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'blockedSlots'),
        where('start', '>=', dateStart),
        where('start', '<=', dateEnd)
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const slots = [];
        querySnapshot.forEach((doc) => {
          slots.push({ id: doc.id, ...doc.data() });
        });
        setBlockedSlots(slots);
        setLoading(false);
      }, (error) => {
        console.error('Error in blocked slots snapshot:', error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error fetching blocked slots:', error);
      Alert.alert('Errore', 'Impossibile caricare gli slot bloccati');
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const dateString = selectedDate.toISOString().split('T')[0];
      const q = query(
        collection(db, 'bookings'),
        where('courtName', '==', selectedFieldName),
        where('date', '==', dateString),
        where('status', '==', 'confirmed')
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
      Alert.alert('Errore', 'Impossibile bloccare gli slots: ' + error.message);
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
      Alert.alert('Errore', 'Impossibile eliminare il blocco');
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
              Alert.alert('Errore', 'Impossibile eliminare la prenotazione');
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
            <Text style={styles.createBlockText}>Crea Nuovo Blocco</Text>
          </TouchableOpacity>
        )}

        {/* Guida alla creazione di blocchi */}
        {showCreationGuide && (
          <View style={styles.creationGuide}>
            <Text style={styles.guideTitle}>Modalità creazione blocchi attiva</Text>
            <Text style={styles.guideText}>
              Seleziona gli slot che vuoi bloccare, poi clicca "Conferma Blocco"
            </Text>
            
            <View style={styles.usageExamples}>
              <Text style={styles.exampleTitle}>Esempi di utilizzo:</Text>
              <Text style={styles.example}>• 🎾 Scuola tennis (under 12, agonistica)</Text>
              <Text style={styles.example}>• 👤 Lezioni con istruttore</Text>
              <Text style={styles.example}>• 🏆 Preparazione tornei</Text>
              <Text style={styles.example}>• 🔧 Manutenzione campo</Text>
            </View>

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
            <Text style={styles.legendText}>Prenotazioni Utenti</Text>
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
        />

        {/* Spazio finale per permettere lo scroll completo */}
        <View style={styles.bottomSpacer} />

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            onChange={handleDateChange}
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
              <Text style={styles.modalTitle}>Crea Blocco Orario</Text>
              
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
                placeholder="Es: Scuola Tennis Under 12"
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
    padding: 16,
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
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
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
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
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
  cancelCreationButton: {
    alignSelf: 'flex-start',
    padding: 8,
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
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
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
    color: '#374151', // Colore scuro per migliorare il contrasto
    fontWeight: '600',
  },
  modalButtonConfirmText: {
    color: 'white',
    fontWeight: '600',
  },
});

// Stili per il componente CalendarView
const calendarStyles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    minHeight: 500,
  },
   header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  editModeText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 4,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  timeSlot: {
    width: '23%',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 60,
    justifyContent: 'center',
  },
  slotText: {
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    color: 'white', // Testo bianco di default
  },
  slotTextFree: {
    color: '#15803d', // Testo verde scuro per slot liberi
  },
  slotTextSelected: {
    color: 'white', // Forza testo bianco per slot selezionati
  },
slotText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  slotTextFree: {
    color: '#15803d', // Testo verde scuro per slot liberi
  },
  selectedIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});

export default CalendarManagement;