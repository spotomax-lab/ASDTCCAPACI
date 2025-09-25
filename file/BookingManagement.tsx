import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  RefreshControl,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, deleteDoc, doc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { formatDate, formatDateTime } from '../utils/dateTimeHelpers';

const BookingManagement = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        const bookingsList = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          bookingsList.push({ 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
          });
        });
        
        setBookings(bookingsList);
        setLoading(false);
        setRefreshing(false);
      }, 
      (error) => {
        console.error('Error in bookings snapshot:', error);
        Alert.alert('Errore', 'Impossibile caricare le prenotazioni');
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    // Il listener onSnapshot si aggiornerà automaticamente
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
              // Non è necessario filtrare manualmente grazie a onSnapshot
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

  const calculateTimeRange = (slots) => {
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return { start: 'N/A', end: 'N/A', duration: '0 ore' };
    }

    const sortedSlots = [...slots].sort();
    const start = sortedSlots[0];
    const lastSlot = sortedSlots[slots.length - 1];

    const [lastHour, lastMinute] = lastSlot.split(':').map(Number);
    const endTime = new Date(0, 0, 0, lastHour, lastMinute + 30);
    const end = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`;

    const totalMinutes = slots.length * 30;
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

  const renderBooking = ({ item }) => {
    const { start, end, duration } = calculateTimeRange(item.slots);
    const isOpen = item.type === 'open';
    const isWaiting = item.status === 'waiting';

    return (
      <View style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.campoText}>{item.courtName}</Text>
            <Text style={styles.bookingType}>
              {isOpen ? 'Open' : 'Standard'} • 
              {isWaiting ? ' In attesa' : ' Confermata'}
            </Text>
          </View>
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
            {item.userFirstName} {item.userLastName} ({item.userName})
          </Text>
        </View>
        
        <View style={styles.infoContainer}>
          <Ionicons name="calendar-outline" size={14} color="#7f8c8d" />
          <Text style={styles.infoText}>Prenotata il {formatDateTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Caricamento prenotazioni...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={bookings}
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
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  campoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  bookingType: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
    marginTop: 4,
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
});

export default BookingManagement;