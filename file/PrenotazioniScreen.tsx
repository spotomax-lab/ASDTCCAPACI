import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

const PrenotazioniScreen = () => {
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchPrenotazioni = () => {
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
        where('userIds', 'array-contains', user.uid),
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
          setRefreshing(false);
          setError(null);
        },
        (error) => {
          console.error('Errore nel fetch delle prenotazioni:', error);
          setLoading(false);
          setRefreshing(false);
          setError(error.message);
        }
      );
    } catch (error) {
      console.error('Errore nella query:', error);
      setLoading(false);
      setRefreshing(false);
      setError(error.message);
    }

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchPrenotazioni();
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrenotazioni();
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

  const canDeleteBooking = (prenotazione) => {
    const now = new Date();
    
    // Controlla se è entro 1 ora dalla creazione
    const createdTime = prenotazione.createdAt?.toDate ? prenotazione.createdAt.toDate() : new Date(prenotazione.createdAt);
    const oneHourAfterCreation = new Date(createdTime.getTime() + 60 * 60 * 1000);
    
    if (now < oneHourAfterCreation) {
      return { canDelete: true, type: 'eliminata' };
    }
    
    // Controlla se mancano più di 2 ore all'inizio della prenotazione
    const bookingDate = new Date(prenotazione.date);
    const [hours, minutes] = prenotazione.startTime.split(':').map(Number);
    bookingDate.setHours(hours, minutes, 0, 0);
    
    const twoHoursBeforeBooking = new Date(bookingDate.getTime() - 2 * 60 * 60 * 1000);
    
    if (now < twoHoursBeforeBooking) {
      return { canDelete: true, type: 'cancellata' };
    }
    
    return { canDelete: false, type: null };
  };

  const handleDeleteBooking = async (prenotazione) => {
    const { canDelete, type } = canDeleteBooking(prenotazione);
    
    if (!canDelete) {
      Alert.alert('Impossibile cancellare', 'Non è più possibile cancellare questa prenotazione');
      return;
    }

    let message = '';
    if (type === 'eliminata') {
      message = 'Sei sicuro di voler eliminare questa prenotazione? (Annullamento entro 1 ora dalla creazione)';
    } else {
      message = 'Sei sicuro di voler cancellare questa prenotazione? (Annullamento con più di 2 ore di anticipo)';
    }

    Alert.alert(
      'Conferma cancellazione',
      message,
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Conferma',
          onPress: async () => {
            try {
              const bookingRef = doc(db, 'bookings', prenotazione.id);
              await updateDoc(bookingRef, {
                status: type,
                cancelledAt: new Date()
              });
              
              Alert.alert('Successo', `Prenotazione ${type} con successo`);
            } catch (error) {
              console.error('Errore durante la cancellazione:', error);
              Alert.alert('Errore', 'Impossibile cancellare la prenotazione');
            }
          }
        }
      ]
    );
  };

  const renderPrenotazione = ({ item }) => {
    // Utilizza startTime e endTime direttamente dalla prenotazione
    const start = item.startTime || 'N/A';
    const end = item.endTime || 'N/A';
    
    // Calcola la durata in ore e minuti dal campo duration
    let durationStr = '0 min';
    if (item.duration) {
      const hours = Math.floor(item.duration / 60);
      const minutes = item.duration % 60;
      durationStr = '';
      if (hours > 0) {
        durationStr += `${hours} ${hours === 1 ? 'ora' : 'ore'}`;
      }
      if (minutes > 0) {
        if (durationStr) durationStr += ' ';
        durationStr += `${minutes} min`;
      }
    }

    const { canDelete } = canDeleteBooking(item);
    const isCancelled = item.status !== 'confirmed';

    // MODIFICA: Mostra sempre come confermata le prenotazioni standard
    const isStandardConfirmed = item.type === 'normal' && item.status === 'confirmed';
    const isOpenWaiting = item.type === 'open' && item.status === 'waiting';
    const isOpenConfirmed = item.type === 'open' && item.status === 'confirmed';

    return (
      <View style={[styles.prenotazioneCard, (item.status !== 'confirmed') && styles.prenotazioneCancellata]}>
        <View style={styles.prenotazioneHeader}>
          <Text style={styles.campoText}>{item.courtName}</Text>
          <View style={styles.headerActions}>
            <View style={[
              styles.statoBadge,
              isStandardConfirmed && styles.statoConfermata,
              isOpenWaiting && styles.statoPending,
              isOpenConfirmed && styles.statoConfermata
            ]}>
              <Text style={[
                styles.statoTesto,
                isStandardConfirmed && styles.statoTestoConfermata,
                isOpenWaiting && styles.statoTestoPending,
                isOpenConfirmed && styles.statoTestoConfermata
              ]}>
                {isStandardConfirmed ? 'Confermata' : 
                 isOpenWaiting ? 'In attesa' : 
                 isOpenConfirmed ? 'Confermata' : item.status}
              </Text>
            </View>
            {canDelete && !isCancelled && (
              <TouchableOpacity 
                onPress={() => handleDeleteBooking(item)}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={20} color="#e74c3c" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        <Text style={styles.dataText}>{formatDate(item.date)}</Text>
        
        <View style={styles.orarioContainer}>
          <Ionicons name="time-outline" size={18} color="#3498db" />
          <Text style={styles.orarioText}>
            {start} - {end} <Text style={styles.durataText}>({durationStr})</Text>
          </Text>
        </View>
        
        <View style={styles.separatore} />
        
        <View style={styles.infoContainer}>
          <Ionicons name="calendar-outline" size={16} color="#7f8c8d" />
          <Text style={styles.infoText}>Prenotata il {formatDateTime(item.createdAt)}</Text>
        </View>

        {item.cancelledAt && (
          <View style={styles.infoContainer}>
            <Ionicons name="close-circle-outline" size={16} color="#e74c3c" />
            <Text style={styles.infoTextCancellata}>
              {item.status === 'cancellata' ? 'Cancellata' : 'Eliminata'} il {formatDateTime(item.cancelledAt)}
            </Text>
          </View>
        )}
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
        <TouchableOpacity style={styles.riprovaButton} onPress={() => onRefresh()}>
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
      <Text style={styles.sottoTitolo}>
        • Puoi eliminare entro 1 ora dalla creazione
        {"\n"}
        • Puoi cancellare con più di 2 ore di anticipo
      </Text>
      <FlatList
        data={prenotazioni}
        renderItem={renderPrenotazione}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listaContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
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
    marginBottom: 8,
    textAlign: 'center',
  },
  sottoTitolo: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  listaContainer: {
    paddingBottom: 20,
  },
  prenotazioneCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  prenotazioneCancellata: {
    opacity: 0.7,
    backgroundColor: '#f8f9fa',
  },
  prenotazioneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
  },
  statoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
  },
  statoConfermata: {
    backgroundColor: '#d4edda',
  },
  statoCancellata: {
    backgroundColor: '#fff3cd',
  },
  statoEliminata: {
    backgroundColor: '#f8d7da',
  },
  statoPending: {
    backgroundColor: '#fff3cd',
  },
  statoWaiting: {
    backgroundColor: '#d1ecf1',
  },
  statoTesto: {
    fontSize: 12,
    fontWeight: '600',
  },
  statoTestoConfermata: {
    color: '#155724',
  },
  statoTestoCancellata: {
    color: '#856404',
  },
  statoTestoEliminata: {
    color: '#721c24',
  },
  statoTestoPending: {
    color: '#856404',
  },
  statoTestoWaiting: {
    color: '#0c5460',
  },
  deleteButton: {
    padding: 4,
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
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  infoTextCancellata: {
    fontSize: 14,
    color: '#e74c3c',
    marginLeft: 8,
    fontStyle: 'italic',
  },
});

export default PrenotazioniScreen;