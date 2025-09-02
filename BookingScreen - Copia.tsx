import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

const BookingScreen = () => {
  const [selectedField, setSelectedField] = useState('Campo 1');
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Formatta la data in formato italiano GG/MM/AAAA
  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Dati dei campi
  const fields = [
    { id: 1, name: 'Campo 1' },
    { id: 2, name: 'Campo 2' }
  ];

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 22; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const toggleTimeSlot = (slot) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter(s => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  const showDatePickerModal = () => {
    DateTimePickerAndroid.open({
      value: selectedDate,
      onChange: handleDateChange,
      mode: 'date',
      minimumDate: new Date(),
      positiveButtonLabel: 'Ok',
      negativeButtonLabel: 'Annulla'
    });
  };

  const handleDateChange = (event, date) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleBooking = () => {
    if (!selectedField) {
      Alert.alert('Errore', 'Per favore, seleziona un campo.');
      return;
    }

    if (selectedSlots.length === 0) {
      Alert.alert('Errore', 'Per favore, seleziona almeno uno slot orario.');
      return;
    }

    Alert.alert(
      'Prenotazione Confermata!',
      `Campo: ${selectedField}\nData: ${formatDate(selectedDate)}\nOrari: ${selectedSlots.join(', ')}`
    );
  };

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
          
          {fields.map((field) => (
            <TouchableOpacity
              key={field.id}
              style={[
                styles.fieldCard,
                selectedField === field.name && styles.fieldCardSelected
              ]}
              onPress={() => setSelectedField(field.name)}
            >
              {/* Riquadro per foto quadrata (Logo) - Dimensioni originali */}
              <View style={styles.logoPlaceholder}>
                <Text style={styles.placeholderText}>LOGO</Text>
              </View>
              
              {/* Riquadro per foto rettangolare (Campo) - Dimensioni originali */}
              <View style={styles.fieldImagePlaceholder}>
                <Text style={styles.placeholderText}>FOTO CAMPO</Text>
              </View>
              
              {/* Nome Campo e Radio Button */}
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldName} numberOfLines={1}>{field.name}</Text>
                <View style={styles.radioButton}>
                  {selectedField === field.name && (
                    <View style={styles.radioButtonSelected} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Scritta Campo Attivo */}
        <View style={styles.activeFieldContainer}>
          <Text style={styles.activeFieldText}>Campo attivo: {selectedField}</Text>
        </View>

        {/* Sezione Data Modificabile con Icona Calendario */}
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

        {/* Separatore */}
        <View style={styles.separator} />

        {/* Istruzioni */}
        <View style={styles.section}>
          <Text style={styles.instructionsTitle}>Come prenotare:</Text>
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionItem}>• <Text style={styles.bold}>Clicca sui riquadri</Text> degli orari che vuoi prenotare</Text>
            <Text style={styles.instructionItem}>• Gli orari devono essere consecutivi</Text>
            <Text style={styles.instructionItem}>• Clicca di nuovo per deselezionare</Text>
            <Text style={styles.instructionItem}>• Ogni slot = 30 minuti</Text>
          </View>
        </View>

        {/* Separatore */}
        <View style={styles.separator} />

        {/* Griglia Orari */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orari Disponibili (8:00 - 22:00)</Text>
          
          <View style={styles.timeGrid}>
            {timeSlots.map((slot, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.timeSlot,
                  selectedSlots.includes(slot) && styles.timeSlotSelected
                ]}
                onPress={() => toggleTimeSlot(slot)}
              >
                <Text style={[
                  styles.timeSlotText,
                  selectedSlots.includes(slot) && styles.timeSlotTextSelected
                ]}>
                  {slot}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Istruzione Finale */}
        <Text style={styles.finalInstruction}>
          Seleziona gli orari cliccando sui riquadri sopra
        </Text>

        {/* Pulsante PRENOTA */}
        <TouchableOpacity style={styles.primaryButton} onPress={handleBooking}>
          <Text style={styles.primaryButtonText}>Prenota</Text>
        </TouchableOpacity>

        {/* Spazio aggiuntivo */}
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
  // Scritta Campo Attivo
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
  // Stili per la riga data + icona
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
  // Stili per le card dei campi - DIMENSIONI ORIGINALI
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
    backgroundColor: '#f0f9ff',
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
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  timeSlot: {
    width: '23%',
    padding: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 6,
  },
  timeSlotSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  timeSlotText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
  },
  timeSlotTextSelected: {
    color: 'white',
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
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  bottomSpacer: {
    height: 20,
  },
});

export default BookingScreen;