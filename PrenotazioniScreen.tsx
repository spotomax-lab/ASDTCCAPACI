import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

const PrenotazioniScreen = () => {
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};

    try {
      // Query principale con ordinamento per data crescente (dalla più vicina)
      const q = query(
        collection(db, 'bookings'),
        where('userId', '==', user.uid),
        orderBy('date', 'asc') // Ordine crescente: dalla più vicina
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const prenotazioniList = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            prenotazioniList.push({ 
              id: doc.id, 
              ...data,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
            });
          });
          setPrenotazioni(prenotazioniList);
          setLoading(false);
          setError(null);
        },
        (error) => {
          if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.log('Indice non ancora pronto, uso query semplificata');
            
            // Query semplificata senza orderBy
            const simpleQ = query(
              collection(db, 'bookings'),
              where('userId', '==', user.uid)
            );
            
            const newUnsubscribe = onSnapshot(
              simpleQ,
              (querySnapshot) => {
                const prenotazioniList = [];
                querySnapshot.forEach((doc) => {
                  const data = doc.data();
                  prenotazioniList.push({ 
                    id: doc.id, 
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
                  });
                });
                
                // Ordina manualmente per data in ordine crescente (dalla più vicina)
                prenotazioniList.sort((a, b) => {
                  return a.date.localeCompare(b.date); // Ordine crescente
                });
                
                setPrenotazioni(prenotazioniList);
                setLoading(false);
                setError(null);
              },
              (error) => {
                console.error('Errore nel fetch semplificato:', error);
                setLoading(false);
                setError(error.message);
              }
            );
            
            unsubscribe = newUnsubscribe;
          } else {
            console.error('Errore nel fetch delle prenotazioni:', error);
            setLoading(false);
            setError(error.message);
          }
        }
      );
    } catch (error) {
      console.error('Errore nella query:', error);
      setLoading(false);
      setError(error.message);
    }

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user]);

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
      console.error('Errore nella formattazione della data:', error);
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
      console.error('Errore nella formattazione della data/ora:', error);
      return 'Data non valida';
    }
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

  const renderPrenotazione = ({ item }) => {
    const { start, end, duration } = calculateTimeRange(item.slots);

    return (
      <View style={styles.prenotazioneCard}>
        <View style={styles.prenotazioneHeader}>
          <Text style={styles.campoText}>{item.courtName}</Text>
          <View style={[
            styles.statoBadge,
            item.status === 'confirmed' ? styles.statoConfermata : styles.statoCancellata
          ]}>
            <Text style={styles.statoTesto}>
              {item.status === 'confirmed' ? 'Confermata' : 'Cancellata'}
            </Text>
          </View>
        </View>
        
        <Text style={styles.dataText}>{formatDate(item.date)}</Text>
        
        <View style={styles.orarioContainer}>
          <Ionicons name="time-outline" size={18} color="#3498db" />
          <Text style={styles.orarioText}>
            {start} - {end} <Text style={styles.durataText}>({duration})</Text>
          </Text>
        </View>
        
        <View style={styles.separatore} />
        
        <View style={styles.infoContainer}>
          <Ionicons name="calendar-outline" size={16} color="#7f8c8d" />
          <Text style={styles.infoText}>Prenotata il {formatDateTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.caricamentoContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.caricamentoTesto}>Caricamento prenotazioni...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.erroreContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.erroreTesto}>Errore nel caricamento</Text>
        <Text style={styles.erroreSottoTesto}>Riprova più tardi</Text>
        <TouchableOpacity style={styles.riprovaButton} onPress={() => window.location.reload()}>
          <Text style={styles.riprovaTesto}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (prenotazioni.length === 0) {
    return (
      <View style={styles.vuotoContainer}>
        <Ionicons name="calendar-outline" size={64} color="#bdc3c7" />
        <Text style={styles.vuotoTesto}>Nessuna prenotazione trovata</Text>
        <Text style={styles.vuotoSottoTesto}>Le tue prenotazioni appariranno qui</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titolo}>Le tue prenotazioni</Text>
      <FlatList
        data={prenotazioni}
        renderItem={renderPrenotazione}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listaContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  caricamentoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  caricamentoTesto: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  vuotoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  vuotoTesto: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6c757d',
    marginTop: 16,
    marginBottom: 8,
  },
  vuotoSottoTesto: {
    fontSize: 14,
    color: '#adb5bd',
    textAlign: 'center',
  },
  erroreContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  erroreTesto: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e74c3c',
    marginTop: 16,
    marginBottom: 8,
  },
  erroreSottoTesto: {
    fontSize: 14,
    color: '#adb5bd',
    textAlign: 'center',
    marginBottom: 16,
  },
  riprovaButton: {
    padding: 12,
    backgroundColor: '#3498db',
    borderRadius: 6,
  },
  riprovaTesto: {
    color: 'white',
    fontWeight: '600',
  },
  titolo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 24,
    textAlign: 'center',
  },
  listaContainer: {
    paddingBottom: 20,
  },
  prenotazioneCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  prenotazioneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  campoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
  },
  statoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statoConfermata: {
    backgroundColor: '#d4edda',
  },
  statoCancellata: {
    backgroundColor: '#f8d7da',
  },
  statoTesto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#155724',
  },
  dataText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3498db',
    marginVertical: 8,
  },
  orarioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  orarioText: {
    fontSize: 18,
    color: '#2c3e50',
    marginLeft: 8,
  },
  durataText: {
    color: '#7f8c8d',
    fontSize: 16,
  },
  separatore: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
});

export default PrenotazioniScreen;