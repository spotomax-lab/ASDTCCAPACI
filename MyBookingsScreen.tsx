import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc, increment, Timestamp } from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

const MyBookingsScreen = () => {
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Funzione per verificare se una prenotazione è passata
  const isPrenotazionePassata = (prenotazione) => {
    try {
      const now = new Date();
      const dataPrenotazione = new Date(prenotazione.date);
      const [ore, minuti] = prenotazione.startTime.split(':').map(Number);
      dataPrenotazione.setHours(ore, minuti, 0, 0);
      
      return dataPrenotazione < now;
    } catch (error) {
      console.error('Errore nel controllo data prenotazione:', error);
      return false;
    }
  };

  const fetchPrenotazioni = () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};

    try {
      const q = query(
        collection(db, 'bookings'),
        where('userIds', 'array-contains', user.uid),
        where('status', 'in', ['confirmed', 'waiting']),
        orderBy('date', 'asc')
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
          
          // Filtra le prenotazioni passate
          const prenotazioniFiltrate = prenotazioniList.filter(prenotazione => 
            !isPrenotazionePassata(prenotazione)
          );
          
          setPrenotazioni(prenotazioniFiltrate);
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

  // Verifica se l'utente è il creatore della prenotazione
  const isBookingCreator = (prenotazione) => {
    return prenotazione.userId === user?.uid;
  };

  // Conta giocatori confermati (INCLUSO il creatore)
  const getConfirmedPlayersCount = (prenotazione) => {
    if (!prenotazione.players) return 0;
    return prenotazione.players.filter(player => player.status === 'confirmed').length;
  };

  // Ottieni la lista dei giocatori confermati (creatore PRIMO, poi gli altri)
  const getConfirmedPlayersList = (prenotazione) => {
    if (!prenotazione.players) return [];
    
    const confirmedPlayers = prenotazione.players.filter(player => player.status === 'confirmed');
    
    // Separa il creatore dagli altri giocatori
    const creator = confirmedPlayers.find(player => player.userId === prenotazione.userId);
    const otherPlayers = confirmedPlayers.filter(player => player.userId !== prenotazione.userId);
    
    // Restituisci creatore primo, poi gli altri
    return creator ? [creator, ...otherPlayers] : otherPlayers;
  };

  // Verifica se è possibile cancellare/uscire dalla prenotazione
  const canCancelBooking = (prenotazione, isCreator) => {
    const now = new Date();
    
    // Per le prenotazioni open, i non creatori possono SEMPRE uscire (entro i limiti temporali)
    if (prenotazione.type === 'open' && !isCreator) {
      // Controlla se mancano più di 2 ore all'inizio della prenotazione
      const bookingDate = new Date(prenotazione.date);
      const [hours, minutes] = prenotazione.startTime.split(':').map(Number);
      bookingDate.setHours(hours, minutes, 0, 0);
      
      const twoHoursBeforeBooking = new Date(bookingDate.getTime() - 2 * 60 * 60 * 1000);
      
      if (now < twoHoursBeforeBooking) {
        return { canCancel: true, type: 'uscita' };
      }
      
      return { canCancel: false, type: null };
    }
    
    // Per i creatori o prenotazioni standard, applica le regole normali
    // Controlla se è entro 1 ora dalla creazione
    const createdTime = prenotazione.createdAt?.toDate ? prenotazione.createdAt.toDate() : new Date(prenotazione.createdAt);
    const oneHourAfterCreation = new Date(createdTime.getTime() + 60 * 60 * 1000);
    
    if (now < oneHourAfterCreation) {
      return { canCancel: true, type: 'eliminata' };
    }
    
    // Controlla se mancano più di 2 ore all'inizio della prenotazione
    const bookingDate = new Date(prenotazione.date);
    const [hours, minutes] = prenotazione.startTime.split(':').map(Number);
    bookingDate.setHours(hours, minutes, 0, 0);
    
    const twoHoursBeforeBooking = new Date(bookingDate.getTime() - 2 * 60 * 60 * 1000);
    
    if (now < twoHoursBeforeBooking) {
      return { canCancel: true, type: 'cancellata' };
    }
    
    return { canCancel: false, type: null };
  };

  // Funzione per aggiornare lo stato della prenotazione dopo la rimozione di un giocatore
  const checkAndUpdateBookingStatus = async (bookingId) => {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      
      if (!bookingSnap.exists()) return;
      
      const bookingData = bookingSnap.data();
      
      if (bookingData.type === 'open') {
        const currentPlayers = bookingData.players ? bookingData.players.filter(player => player.status === 'confirmed').length : 0;
        const maxPlayers = bookingData.maxPlayers || (bookingData.matchType === 'singles' ? 2 : 4);
        
        let newStatus = bookingData.status;
        
        if (currentPlayers >= maxPlayers && bookingData.status !== 'confirmed') {
          newStatus = 'confirmed';
        } else if (currentPlayers < maxPlayers && bookingData.status === 'confirmed') {
          newStatus = 'waiting';
        }
        
        if (newStatus !== bookingData.status) {
          await updateDoc(bookingRef, {
            status: newStatus
          });
        }
      }
    } catch (error) {
      console.error('Errore nell\'aggiornamento dello stato della prenotazione:', error);
    }
  };

  // Funzione per aggiornare il conteggio delle prenotazioni
  const updateUserBookingCount = async (userId, operation = 'decrement') => {
    try {
      const weekKey = getWeekKey(new Date());
      const userWeekRef = doc(db, 'userWeeklyBookings', `${userId}_${weekKey}`);
      
      if (operation === 'decrement') {
        const docSnap = await getDoc(userWeekRef);
        if (docSnap.exists() && docSnap.data().count > 0) {
          await updateDoc(userWeekRef, {
            count: increment(-1),
            updatedAt: Timestamp.now()
          });
        }
      }
    } catch (error) {
      console.error('Errore nell\'aggiornamento del conteggio:', error);
    }
  };

  // Funzione per ottenere la chiave della settimana
  const getWeekKey = (date) => {
    const startOfWeek = new Date(date);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const year = startOfWeek.getFullYear();
    const weekNumber = Math.ceil((((startOfWeek - new Date(year, 0, 1)) / 86400000) + 1) / 7);
    return `${year}-${weekNumber}`;
  };

  // Gestisce l'uscita da una prenotazione
  const handleLeaveBooking = async (prenotazione) => {
    if (!user) return;

    const isCreator = isBookingCreator(prenotazione);
    const { canCancel, type } = canCancelBooking(prenotazione, isCreator);
    const confirmedPlayers = getConfirmedPlayersCount(prenotazione);

    if (!canCancel) {
      Alert.alert('Impossibile uscire', 'Non è più possibile uscire da questa prenotazione');
      return;
    }

    // Se è il creatore e ci sono altri giocatori, deve cancellare l'intera prenotazione
    if (isCreator && confirmedPlayers > 1) {
      Alert.alert(
        'Impossibile uscire',
        'Sei il creatore di questa partita e ci sono altri giocatori. Devi cancellare l\'intera prenotazione.',
        [
          {
            text: 'Cancella prenotazione',
            style: 'destructive',
            onPress: () => handleDeleteBooking(prenotazione)
          },
          {
            text: 'Annulla',
            style: 'cancel'
          }
        ]
      );
      return;
    }

    Alert.alert(
      'Conferma uscita',
      'Sei sicuro di voler uscire da questa prenotazione?',
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Esci',
          style: 'destructive',
          onPress: async () => {
            try {
              const bookingRef = doc(db, 'bookings', prenotazione.id);
              
              // Se è il creatore e non ci sono altri giocatori, cancella tutta la prenotazione
              if (isCreator && confirmedPlayers <= 1) {
                await updateDoc(bookingRef, {
                  status: 'cancellata',
                  cancelledAt: new Date()
                });
                await updateUserBookingCount(user.uid);
                Alert.alert('Successo', 'Prenotazione cancellata con successo');
              } else {
                // Rimuovi solo l'utente corrente dalla prenotazione
                const updatedPlayers = prenotazione.players.filter(player => player.userId !== user.uid);
                const updatedUserIds = prenotazione.userIds.filter(id => id !== user.uid);
                
                await updateDoc(bookingRef, {
                  players: updatedPlayers,
                  userIds: updatedUserIds
                });
                
                // Aggiorna lo stato della prenotazione
                await checkAndUpdateBookingStatus(prenotazione.id);
                
                // Aggiorna il conteggio delle prenotazioni
                await updateUserBookingCount(user.uid);
                
                Alert.alert('Successo', 'Sei uscito dalla prenotazione con successo');
              }
            } catch (error) {
              console.error('Errore durante l\'uscita dalla prenotazione:', error);
              Alert.alert('Errore', 'Impossibile uscire dalla prenotazione');
            }
          }
        }
      ]
    );
  };

  // Gestisce la cancellazione completa della prenotazione (solo per il creatore)
  const handleDeleteBooking = async (prenotazione) => {
    const isCreator = isBookingCreator(prenotazione);
    const { canCancel, type } = canCancelBooking(prenotazione, isCreator);

    if (!isCreator) {
      Alert.alert('Errore', 'Solo il creatore della prenotazione può cancellarla');
      return;
    }

    if (!canCancel) {
      Alert.alert('Impossibile cancellare', 'Non è più possibile cancellare questa prenotazione');
      return;
    }

    Alert.alert(
      'Conferma cancellazione',
      'Sei sicuro di voler cancellare questa prenotazione? Tutti i partecipanti verranno notificati.',
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Cancella',
          style: 'destructive',
          onPress: async () => {
            try {
              const bookingRef = doc(db, 'bookings', prenotazione.id);
              await updateDoc(bookingRef, {
                status: type,
                cancelledAt: new Date()
              });
              
              // Aggiorna il conteggio delle prenotazioni per tutti i partecipanti
              if (prenotazione.userIds) {
                for (const userId of prenotazione.userIds) {
                  await updateUserBookingCount(userId);
                }
              }
              
              Alert.alert('Successo', 'Prenotazione cancellata con successo');
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
    const start = item.startTime || 'N/A';
    const end = item.endTime || 'N/A';
    
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
      if (!durationStr) {
        durationStr = '0 min';
      }
    }

    const isCreator = isBookingCreator(item);
    const isOpen = item.type === 'open';
    const { canCancel } = canCancelBooking(item, isCreator);
    const isWaiting = item.status === 'waiting';
    const confirmedPlayers = getConfirmedPlayersCount(item);
    const maxPlayers = item.maxPlayers || (item.matchType === 'singles' ? 2 : 4);
    
    // Ottieni la lista dei giocatori confermati (creatore PRIMO, poi gli altri)
    const confirmedPlayersList = getConfirmedPlayersList(item);

    return (
      <View style={styles.prenotazioneCard}>
        <View style={styles.prenotazioneHeader}>
          <Text style={styles.campoText}>{item.courtName}</Text>
          <View style={[styles.statoBadge, isWaiting ? styles.statoWaiting : styles.statoConfermata]}>
            <Text style={[styles.statoTesto, isWaiting ? styles.statoTestoWaiting : styles.statoTestoConfermata]}>
              {isOpen ? 'Open' : 'Standard'} • {isWaiting ? 'In attesa' : 'Confermata'}
            </Text>
          </View>
        </View>
        
        <Text style={styles.dataText}>{formatDate(item.date)}</Text>
        
        <View style={styles.orarioContainer}>
          <Ionicons name="time-outline" size={18} color="#3498db" />
          <Text style={styles.orarioText}>
            {start} - {end} <Text style={styles.durataText}>({durationStr})</Text>
          </Text>
        </View>

        <View style={styles.creatorInfo}>
          <Ionicons name="person-outline" size={16} color="#7f8c8d" />
          <Text style={styles.creatorText}>
            Creata da: {item.userFirstName} {item.userLastName}
            {isCreator && ' (Tu)'}
          </Text>
        </View>

        <View style={styles.playersInfo}>
          <Ionicons name="people-outline" size={16} color="#7f8c8d" />
          <Text style={styles.playersText}>
            Giocatori: {confirmedPlayers}/{maxPlayers}
            {isCreator && ' • Sei il creatore'}
          </Text>
        </View>
        
        {/* MOSTRA TUTTI I GIOCATORI CONFERMATI (creatore PRIMO) */}
        {confirmedPlayersList.length > 0 && (
          <View style={styles.confirmedPlayersContainer}>
            <Text style={styles.confirmedPlayersLabel}>Giocatori confermati:</Text>
            {confirmedPlayersList.map((player, index) => (
              <View key={index} style={styles.playerRow}>
                <Ionicons 
                  name={player.userId === item.userId ? "person" : "person"} 
                  size={14} 
                  color={player.userId === item.userId ? "#3b82f6" : "#27ae60"} 
                />
                <Text style={[
                  styles.playerName,
                  player.userId === item.userId && styles.creatorName
                ]}>
                  {player.userName}
                </Text>
              </View>
            ))}
          </View>
        )}
        
        <View style={styles.separatore} />
        
        <View style={styles.infoRow}>
          <View style={styles.infoContainer}>
            <Ionicons name="calendar-outline" size={16} color="#7f8c8d" />
            <Text style={styles.infoText}>Prenotata il {formatDateTime(item.createdAt)}</Text>
          </View>
          
          {canCancel && (
            <TouchableOpacity 
              onPress={() => isOpen ? handleLeaveBooking(item) : handleDeleteBooking(item)}
              style={styles.deleteButton}
            >
              <Ionicons 
                name={isOpen ? "exit-outline" : "trash-outline"} 
                size={20} 
                color="#e74c3c" 
              />
            </TouchableOpacity>
          )}
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
        <Text style={styles.vuotoTesto}>Nessuna prenotazione attiva</Text>
        <Text style={styles.vuotoSottoTesto}>Le tue prenotazioni future appariranno qui</Text>
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
        {"\n"}
        • Partite Open: esci senza cancellare la prenotazione altrui
        {"\n"}
        • Le prenotazioni passate non vengono visualizzate
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
  prenotazioneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
  },
  statoConfermata: {
    backgroundColor: '#d4edda',
  },
  statoWaiting: {
    backgroundColor: '#fff3cd',
  },
  statoTesto: {
    fontSize: 12,
    fontWeight: '600',
  },
  statoTestoConfermata: {
    color: '#155724',
  },
  statoTestoWaiting: {
    color: '#856404',
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
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  creatorText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  playersInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  playersText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  separatore: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flex: 1,
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
  deleteButton: {
    padding: 8,
    marginLeft: 10,
  },
  confirmedPlayersContainer: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  confirmedPlayersLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 6,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playerName: {
    fontSize: 14,
    color: '#34495e',
    marginLeft: 6,
  },
  creatorName: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});

export default MyBookingsScreen;