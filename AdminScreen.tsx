// AdminScreen migliorato
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, getDocs, deleteDoc, doc, orderBy, where } from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';
import CalendarManagement from './admin/CalendarManagement';
import SlotConfigurationScreen from './admin/SlotConfigurationScreen';
import DateTimePicker from '@react-native-community/datetimepicker';

const AdminScreen = () => {
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('bookings');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDate, setFilterDate] = useState(null);
  const [filterCourt, setFilterCourt] = useState('all');
  const [filterUser, setFilterUser] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { userData } = useAuth();

  // Check if user is admin
  if (!userData || userData.role !== 'admin') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Accesso negato. Solo gli amministratori possono accedere a questa sezione.</Text>
      </View>
    );
  }

  const fetchBookings = async () => {
    try {
      const q = query(
        collection(db, 'bookings'), 
        orderBy('date', 'asc'),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const bookingsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        bookingsList.push({ 
          id: doc.id, 
          ...data,
          // Converti i timestamp in date JavaScript
          date: data.date, // già stringa
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          startTime: data.startTime, // già stringa
          endTime: data.endTime // già stringa
        });
      });
      
      setBookings(bookingsList);
      setFilteredBookings(bookingsList);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      Alert.alert('Errore', 'Impossibile caricare le prenotazioni');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'bookings') {
      fetchBookings();
    }
  }, [activeTab]);

  useEffect(() => {
    applyFilters();
  }, [bookings, filterDate, filterCourt, filterUser]);

  const applyFilters = () => {
    let result = [...bookings];
    
    if (filterDate) {
      const filterDateString = filterDate.toISOString().split('T')[0];
      result = result.filter(booking => booking.date === filterDateString);
    }
    
    if (filterCourt !== 'all') {
      result = result.filter(booking => booking.courtName === filterCourt);
    }
    
    if (filterUser) {
      const searchTerm = filterUser.toLowerCase();
      result = result.filter(booking => 
        booking.userName.toLowerCase().includes(searchTerm) ||
        booking.userFirstName.toLowerCase().includes(searchTerm) ||
        booking.userLastName.toLowerCase().includes(searchTerm)
      );
    }
    
    setFilteredBookings(result);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const handleDeleteBooking = async (bookingId) => {
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
              setBookings(bookings.filter(booking => booking.id !== bookingId));
              Alert.alert('Successo', 'Prenotazione eliminata con successo');
            } catch (error) {
              console.error('Error deleting booking:', error);
              Alert.alert('Errore', 'Impossibile eliminare la prenotazione');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString) => {
    try {
      const date = typeof dateString === 'string' 
        ? new Date(dateString) 
        : dateString;
      
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return 'Data non valida';
    }
  };

  const formatDateTime = (timestamp) => {
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : timestamp;
      
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

  const calculateTimeRange = (booking) => {
    if (!booking.startTime || !booking.endTime) {
      return { start: 'N/A', end: 'N/A', duration: '0 ore' };
    }

    const start = booking.startTime;
    const end = booking.endTime;
    
    // Calcola la durata in minuti
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    const totalMinutes = endTotal - startTotal;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    let durationStr = '';
    if (hours > 0) {
      durationStr += `${hours} ${hours === 1 ? 'ora' : 'ore'}`;
    }
    if (minutes > 0) {
      if (durationStr) durationStr += ' ';
      durationStr += `${minutes} min`;
    }
    if (!durationStr) {
      durationStr = '0 min';
    }

    return { start, end, duration: durationStr };
  };

  const clearFilters = () => {
    setFilterDate(null);
    setFilterCourt('all');
    setFilterUser('');
  };

  const renderBooking = ({ item }) => {
    const { start, end, duration } = calculateTimeRange(item);

    return (
      <View style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <Text style={styles.campoText}>{item.courtName}</Text>
          <TouchableOpacity 
            onPress={() => handleDeleteBooking(item.id)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={20} color="#e74c3c" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.dataText}>{formatDate(item.date)}</Text>
        
        <View style={styles.orarioContainer}>
          <Ionicons name="time-outline" size={16} color="#3498db" />
          <Text style={styles.orarioText}>
            {start} - {end} <Text style={styles.durataText}>({duration})</Text>
          </Text>
        </View>
        
        <View style={styles.userInfo}>
          <Ionicons name="person-outline" size={16} color="#7f8c8d" />
          <Text style={styles.userText}>
            {item.userFirstName} {item.userLastName}
          </Text>
        </View>
        
        <View style={styles.infoContainer}>
          <Ionicons name="calendar-outline" size={14} color="#7f8c8d" />
          <Text style={styles.infoText}>Prenotata il {formatDateTime(item.createdAt)}</Text>
        </View>
        
        <View style={styles.statusContainer}>
          <Text style={[
            styles.statusText,
            item.status === 'confirmed' ? styles.statusConfirmed : styles.statusCancelled
          ]}>
            {item.status === 'confirmed' ? 'Confermata' : 'Cancellata'}
          </Text>
        </View>
      </View>
    );
  };

  const renderFilters = () => (
    <Modal
      visible={showFilters}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowFilters(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Filtri Prenotazioni</Text>
          
          <Text style={styles.filterLabel}>Data:</Text>
          <TouchableOpacity 
            style={styles.dateFilterButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text>{filterDate ? formatDate(filterDate) : 'Seleziona data'}</Text>
            <Ionicons name="calendar" size={20} color="#3b82f6" />
          </TouchableOpacity>

          <Text style={styles.filterLabel}>Campo:</Text>
          <View style={styles.courtFilter}>
            {['all', 'Campo 1', 'Campo 2'].map(court => (
              <TouchableOpacity
                key={court}
                style={[
                  styles.courtFilterButton,
                  filterCourt === court && styles.courtFilterButtonSelected
                ]}
                onPress={() => setFilterCourt(court)}
              >
                <Text style={[
                  styles.courtFilterText,
                  filterCourt === court && styles.courtFilterTextSelected
                ]}>
                  {court === 'all' ? 'Tutti' : court}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Utente:</Text>
          <TextInput
            style={styles.userFilterInput}
            value={filterUser}
            onChangeText={setFilterUser}
            placeholder="Cerca per nome utente"
          />

          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterButton, styles.clearButton]}
              onPress={clearFilters}
            >
              <Text style={styles.filterButtonText}>Azzera Filtri</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, styles.applyButton]}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.filterButtonText}>Applica</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderContent = () => {
    if (activeTab === 'bookings') {
      if (loading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Caricamento prenotazioni...</Text>
          </View>
        );
      }

      return (
        <View style={styles.bookingsContainer}>
          <View style={styles.bookingsHeader}>
            <Text style={styles.resultsText}>
              {filteredBookings.length} prenotazioni trovate
            </Text>
            <TouchableOpacity 
              style={styles.filterToggle}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons name="filter" size={20} color="#3b82f6" />
              <Text style={styles.filterToggleText}>Filtri</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredBookings}
            renderItem={renderBooking}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={64} color="#bdc3c7" />
                <Text style={styles.emptyText}>Nessuna prenotazione trovata</Text>
                {(filterDate || filterCourt !== 'all' || filterUser) && (
                  <TouchableOpacity onPress={clearFilters}>
                    <Text style={styles.clearFiltersText}>Azzera filtri</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        </View>
      );
    } else if (activeTab === 'calendar') {
      return <CalendarManagement />;
    } else if (activeTab === 'slots') {
      return <SlotConfigurationScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pannello Amministratore</Text>
      
      {/* Admin Navigation Bar */}
      <View style={styles.adminNav}>
        <TouchableOpacity 
          style={[styles.navButton, activeTab === 'bookings' && styles.activeNavButton]}
          onPress={() => setActiveTab('bookings')}
        >
          <Ionicons 
            name="list" 
            size={20} 
            color={activeTab === 'bookings' ? '#fff' : '#3b82f6'} 
          />
          <Text style={[styles.navText, activeTab === 'bookings' && styles.activeNavText]}>
            Prenotazioni
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.navButton, activeTab === 'calendar' && styles.activeNavButton]}
          onPress={() => setActiveTab('calendar')}
        >
          <Ionicons 
            name="calendar" 
            size={20} 
            color={activeTab === 'calendar' ? '#fff' : '#3b82f6'} 
          />
          <Text style={[styles.navText, activeTab === 'calendar' && styles.activeNavText]}>
            Calendario
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navButton, activeTab === 'slots' && styles.activeNavButton]}
          onPress={() => setActiveTab('slots')}
        >
          <Ionicons 
            name="time" 
            size={20} 
            color={activeTab === 'slots' ? '#fff' : '#3b82f6'} 
          />
          <Text style={[styles.navText, activeTab === 'slots' && styles.activeNavText]}>
            Slot
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {renderContent()}
      {renderFilters()}

      {showDatePicker && (
        <DateTimePicker
          value={filterDate || new Date()}
          mode="date"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              setFilterDate(date);
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginVertical: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
    margin: 20,
  },
  adminNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 10,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  activeNavButton: {
    backgroundColor: '#3b82f6',
  },
  navText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  activeNavText: {
    color: '#fff',
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
  bookingsContainer: {
    flex: 1,
  },
  bookingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  resultsText: {
    fontSize: 14,
    color: '#64748b',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  filterToggleText: {
    marginLeft: 4,
    color: '#3b82f6',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 20,
  },
  bookingCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  campoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  deleteButton: {
    padding: 8,
  },
  dataText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: 8,
  },
  orarioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  orarioText: {
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 8,
  },
  durataText: {
    color: '#64748b',
    fontSize: 14,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userText: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 8,
  },
  statusContainer: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusConfirmed: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusCancelled: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 16,
    textAlign: 'center',
  },
  clearFiltersText: {
    color: '#3b82f6',
    marginTop: 8,
    fontWeight: '600',
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
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  dateFilterButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  courtFilter: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  courtFilterButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  courtFilterButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  courtFilterText: {
    color: '#64748b',
    fontWeight: '600',
  },
  courtFilterTextSelected: {
    color: 'white',
  },
  userFilterInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  filterButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#e5e7eb',
  },
  applyButton: {
    backgroundColor: '#3b82f6',
  },
  filterButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default AdminScreen;