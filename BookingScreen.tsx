import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, addDoc, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

const BookingScreen = () => {
  const [selectedField, setSelectedField] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]);
  
  // Funzione per ottenere la data iniziale (oggi o domani dopo le 22:00)
  const getInitialDate = () => {
    const now = new Date();
    const hours = now.getHours();
    // Se sono dopo le 22:00, passa a domani
    if (hours >= 22) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return now;
  };

  const [selectedDate, setSelectedDate] = useState(getInitialDate());
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});

  const { user } = useAuth();

  // Funzione per formattare la data in YYYY-MM-DD (locale)
  const formatDateForStorage = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch courts from Firestore
  useEffect(() => {
    const fetchCourts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'courts'));
        const courtsList = [];
        querySnapshot.forEach((doc) => {
          courtsList.push({ id: doc.id, ...doc.data() });
        });
        
        courtsList.sort((a, b) => a.name.localeCompare(b.name));
        setCourts(courtsList);
        
        const campo1 = courtsList.find(court => court.name === "Campo 1");
        if (campo1) {
          setSelectedField("Campo 1");
        } else if (courtsList.length > 0) {
          setSelectedField(courtsList[0].name);
        }
      } catch (error) {
        console.error("Errore nel caricamento dei campi: ", error);
        Alert.alert("Errore", "Impossibile caricare i campi da tennis");
      } finally {
        setLoading(false);
      }
    };

    fetchCourts();
  }, []);

  // Fetch existing bookings for the selected date and field
  useEffect(() => {
    if (!selectedField || !selectedDate) return;

    const dateString = formatDateForStorage(selectedDate);
    const q = query(
      collection(db, 'bookings'),
      where('courtName', '==', selectedField),
      where('date', '==', dateString),
      where('status', '==', 'confirmed')
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const bookings = [];
      const userIds = new Set();
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        });
        if (data.userId) {
          userIds.add(data.userId);
        }
      });
      
      setExistingBookings(bookings);
      await fetchUserProfiles(Array.from(userIds));
    });

    return () => unsubscribe();
  }, [selectedField, selectedDate]);

  // Funzione per recuperare i profili utente
  const fetchUserProfiles = async (userIds) => {
    const profiles = { ...userProfiles };
    
    for (const userId of userIds) {
      if (!profiles[userId]) {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            profiles[userId] = {
              firstName: userData.nome || '',
              lastName: userData.cognome || '',
              displayName: userData.displayName || ''
            };
          }
        } catch (error) {
          console.error("Errore nel recupero del profilo utente:", error);
        }
      }
    }
    
    setUserProfiles(profiles);
  };

  // Formatta la data in formato italiano GG/MM/AAAA
  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 22; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const nextMinute = minute + 30;
        const nextHour = nextMinute === 60 ? hour + 1 : hour;
        const nextMinuteFormatted = nextMinute === 60 ? '00' : nextMinute.toString().padStart(2, '0');
        const endTimeString = `${nextHour.toString().padStart(2, '0')}:${nextMinuteFormatted}`;
        
        slots.push({
          start: timeString,
          end: endTimeString,
          display: `${timeString} - ${endTimeString}`
        });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Check if a time slot is already booked - VERSIONE CORRETTA
  const isSlotBooked = (slot) => {
    return existingBookings.some(booking => {
      if (!booking.slots || !Array.isArray(booking.slots)) return false;
      
      // Confronta ogni slot della prenotazione con lo slot corrente
      return booking.slots.some(bookedSlot => {
        // Se lo slot prenotato è uguale all'orario di inizio
        return bookedSlot === slot.start;
      });
    });
  };

  // Get user name for a booked slot
  const getBookedByUser = (slot) => {
    const booking = existingBookings.find(booking => {
      if (!booking.slots || !Array.isArray(booking.slots)) return false;
      return booking.slots.includes(slot.start);
    });
    
    if (booking && booking.userId && userProfiles[booking.userId]) {
      const userProfile = userProfiles[booking.userId];
      if (userProfile.firstName && userProfile.lastName) {
        return `${userProfile.firstName} ${userProfile.lastName}`;
      } else if (userProfile.displayName) {
        return userProfile.displayName;
      }
    }
    
    return booking ? booking.userName || 'Utente' : null;
  };

  // Gestisce il tap sugli slot
  const handleSlotPress = (slot) => {
    if (isSlotBooked(slot)) {
      const bookedBy = getBookedByUser(slot);
      Alert.alert(
        'Prenotato da',
        bookedBy,
        [{ text: 'OK' }]
      );
      return;
    }

    if (selectedSlots.includes(slot.start)) {
      setSelectedSlots(selectedSlots.filter(s => s !== slot.start));
    } else {
      setSelectedSlots([...selectedSlots, slot.start]);
    }
  };

  const showDatePickerModal = () => {
    DateTimePickerAndroid.open({
      value: selectedDate,
      onChange: handleDateChange,
      mode: 'date',
      minimumDate: getInitialDate(),
      positiveButtonLabel: 'Ok',
      negativeButtonLabel: 'Annulla'
    });
  };

  const handleDateChange = (event, date) => {
    if (date) {
      setSelectedDate(date);
      setSelectedSlots([]);
    }
  };

  const handleBooking = async () => {
    if (!selectedField) {
      Alert.alert('Errore', 'Per favore, seleziona un campo.');
      return;
    }

    if (selectedSlots.length === 0) {
      Alert.alert('Errore', 'Per favore, seleziona almeno uno slot orario.');
      return;
    }

    if (!user) {
      Alert.alert('Errore', 'Devi essere loggato per effettuare eine prenotazione.');
      return;
    }

    setBookingLoading(true);

    try {
      const selectedCourt = courts.find(court => court.name === selectedField);
      
      if (!selectedCourt) {
        Alert.alert('Errore', 'Campo non trovato.');
        return;
      }

      // Recupera i dati dell'utente corrente
      let userFirstName = '';
      let userLastName = '';
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userFirstName = userData.nome || '';
          userLastName = userData.cognome || '';
        }
      } catch (error) {
        console.error("Errore nel recupero del profilo utente:", error);
      }

      // Salva la prenotazione su Firestore
      await addDoc(collection(db, 'bookings'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        userFirstName: userFirstName,
        userLastName: userLastName,
        courtId: selectedCourt.id,
        courtName: selectedCourt.name,
        date: formatDateForStorage(selectedDate),
        slots: selectedSlots,
        status: 'confirmed',
        createdAt: new Date()
      });

      Alert.alert(
        'Prenotazione Confermata!',
        `Campo: ${selectedField}\nData: ${formatDate(selectedDate)}\nOrari: ${selectedSlots.join(', ')}`
      );
      
      setSelectedSlots([]);
      
    } catch (error) {
      console.error('Errore durante la prenotazione:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante la prenotazione.');
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

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollContent}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Sezione Selezione Campo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seleziona Campo</Text>
          
          {courts.map((court) => (
            <TouchableOpacity
              key={court.id}
              style={[
                styles.fieldCard,
                selectedField === court.name && styles.fieldCardSelected
              ]}
              onPress={() => {
                setSelectedField(court.name);
                setSelectedSlots([]);
              }}
            >
              <View style={styles.logoPlaceholder}>
                <Text style={styles.placeholderText}>LOGO</Text>
              </View>
              
              <View style={styles.fieldImagePlaceholder}>
                <Text style={styles.placeholderText}>FOTO CAMPO</Text>
              </View>
              
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldName} numberOfLines={1}>{court.name}</Text>
                <View style={styles.radioButton}>
                  {selectedField === court.name && (
                    <View style={styles.radioButtonSelected} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
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
              style={styles.calendarIcon}
              onPress={showDatePickerModal}
            >
              <Ionicons name="calendar" size={24} color="#3b82f6" />
            </TouchableOpacity>
          </View>
          <Text style={styles.datePickerHint}>Seleziona una data dal calendario</Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.instructionsTitle}>Come prenotare:</Text>
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Clicca sui riquadri</Text> degli orari che vuoi prenotare</Text>
            <Text style={styles.instructionItem}>• Gli orari devono essere consecutivi</Text>
            <Text style={styles.instructionItem}>• Clicca di nuovo para deselezionare</Text>
            <Text style={styles.instructionItem}>• Ogni slot = 30 minuti</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.greenText}>Verde</Text> = Libero</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.redText}>Rosso</Text> = Prenotato</Text>
            <Text style={styles.instructionItem}>• <Text style={styles.blueText}>Tocca</Text> gli slot prenotati per vedere chi ha prenotato</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orari Disponibili (8:00 - 22:00)</Text>
          
          <View style={styles.timeGrid}>
            {timeSlots.map((slot, index) => {
              const isBooked = isSlotBooked(slot);
              const isSelected = selectedSlots.includes(slot.start);
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.timeSlot,
                    isSelected && styles.timeSlotSelected,
                    isBooked && styles.timeSlotBooked
                  ]}
                  onPress={() => handleSlotPress(slot)}
                >
                  <Text style={[
                    styles.timeSlotText,
                    isSelected && styles.timeSlotTextSelected,
                    isBooked && styles.timeSlotTextBooked
                  ]}>
                    {slot.display}
                  </Text>
                  {isBooked && (
                    <Text style={styles.bookedIndicator}>⏰</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.finalInstruction}>
          Seleziona gli orari cliccando sui riquadri sopra
        </Text>

        <TouchableOpacity 
          style={[styles.primaryButton, bookingLoading && styles.primaryButtonDisabled]} 
          onPress={handleBooking}
          disabled={bookingLoading}
        >
          {bookingLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryButtonText}>Prenota</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fieldCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'white',
  },
  logoPlaceholder: {
    width: 65,
    height: 65,
    borderRadius: 5,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  fieldImagePlaceholder: {
    width: 156,
    height: 65,
    borderRadius: 5,
    backgroundColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  placeholderText: {
    color: '#4b5563',
    fontSize: 9,
    fontWeight: 'bold',
  },
  fieldInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    flexShrink: 1,
  },
  radioButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3b82f6',
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
  redText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  blueText: {
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  timeSlot: {
    width: '23%',
    padding: 8,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 50,
  },
  timeSlotSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  timeSlotBooked: {
    backgroundColor: '#fecaca',
    borderColor: '#fca5a5',
  },
  timeSlotText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#15803d',
    textAlign: 'center',
  },
  timeSlotTextSelected: {
    color: 'white',
  },
  timeSlotTextBooked: {
    color: '#b91c1c',
  },
  bookedIndicator: {
    fontSize: 10,
    marginTop: 2,
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
});

export default BookingScreen;