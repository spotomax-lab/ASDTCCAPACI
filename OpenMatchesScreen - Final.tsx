import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  TouchableOpacity, 
  RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, getDoc, setDoc, increment, Timestamp, arrayRemove
} from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

// Funzione per ottenere la chiave della settimana
const getWeekKey = (date) => {
  const startOfWeek = new Date(date);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const year = startOfWeek.getFullYear();
  const weekNumber = Math.ceil((((startOfWeek - new Date(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-${weekNumber}`;
};

// Funzione per aggiornare il conteggio delle prenotazioni
const updateUserBookingCount = async (userId, operation = 'increment') => {
  try {
    const weekKey = getWeekKey(new Date());
    const userWeekRef = doc(db, 'userWeeklyBookings', `${userId}_${weekKey}`);
    
    if (operation === 'increment') {
      await setDoc(userWeekRef, {
        count: increment(1),
        userId: userId,
        week: weekKey,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } else {
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

// FUNZIONE AGGIUNTA: Verifica e aggiorna lo stato della prenotazione
const checkAndUpdateBookingStatus = async (bookingId) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) return;
    
    const bookingData = bookingSnap.data();
    
    // Per prenotazioni open: aggiorna lo stato basato sul numero di giocatori
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

const OpenMatchesScreen = () => {
  const [partiteOpen, setPartiteOpen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Funzione per ottenere la lista dei giocatori confermati (creatore PRIMO, poi gli altri)
  const getConfirmedPlayersList = (partita) => {
    if (!partita.players) return [];
    
    const confirmedPlayers = partita.players.filter(player => player.status === 'confirmed');
    
    // Separa il creatore dagli altri giocatori
    const creator = confirmedPlayers.find(player => player.userId === partita.userId);
    const otherPlayers = confirmedPlayers.filter(player => player.userId !== partita.userId);
    
    // Restituisci creatore primo, poi gli altri
    return creator ? [creator, ...otherPlayers] : otherPlayers;
  };

  const fetchPartiteOpen = () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};

    try {
      // Query per partite open disponibili (non create dall'utente corrente) o dove l'utente è invitato
      const q = query(
        collection(db, 'bookings'),
        where('type', '==', 'open'),
        where('status', '==', 'waiting'),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc')
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const partiteList = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // CORREZIONE: Includi partite dove l'utente non è il creatore O è stato invitato
            const isInvited = data.invitedPlayers && 
              data.invitedPlayers.some(p => p.userId === user.uid && p.status === 'pending');
            
            // CORREZIONE: Controlla se l'utente è già nei giocatori confermati
            const isAlreadyConfirmed = data.players ? 
              data.players.some(p => p.userId === user.uid && p.status === 'confirmed') : false;
            
            // Escludi partite dove l'utente è già confermato
            if (!isAlreadyConfirmed && (data.userId !== user.uid || isInvited)) {
              partiteList.push({ 
                id: doc.id, 
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
                isInvited: isInvited
              });
            }
          });
          setPartiteOpen(partiteList);
          setLoading(false);
          setRefreshing(false);
          setError(null);
        },
        (error) => {
          console.error('Errore nel fetch delle partite open:', error);
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
    const unsubscribe = fetchPartiteOpen();
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPartiteOpen();
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

  // FUNZIONE MIGLIORATA: Gestisce l'unione a una partita open
  const handleJoinMatch = async (partita) => {
    if (!user) return;
    
    // CORREZIONE: Controlla se l'utente ha già raggiunto il limite settimanale
    try {
      const weekKey = getWeekKey(new Date());
      const userWeekRef = doc(db, 'userWeeklyBookings', `${user.uid}_${weekKey}`);
      const docSnap = await getDoc(userWeekRef);
      
      const userBookingsCount = docSnap.exists() ? docSnap.data().count : 0;
      
      if (userBookingsCount >= 5) {
        Alert.alert(
          'Limite prenotazioni raggiunto',
          'Hai già effettuato 5 prenotazioni questa settimana. Non puoi unirsi ad altre partite.'
        );
        return;
      }
    } catch (error) {
      console.error('Errore nel controllo del limite:', error);
    }
    
    // CORREZIONE: Controlla se l'utente è già nei giocatori confermati
    const isUserConfirmed = partita.players ? 
      partita.players.some(player => player.userId === user.uid && player.status === 'confirmed') : false;
    
    if (isUserConfirmed) {
      Alert.alert('Errore', 'Sei già in questa prenotazione');
      return;
    }
    
    // CORREZIONE: Controlla se c'è ancora posto (solo giocatori confermati contano)
    const currentPlayers = partita.players ? partita.players.filter(player => player.status === 'confirmed').length : 0;
    const maxPlayers = partita.maxPlayers || (partita.matchType === 'singles' ? 2 : 4);
    
    if (currentPlayers >= maxPlayers) {
      Alert.alert('Partita piena', 'Questa partita ha già raggiunto il numero massimo di giocatori');
      return;
    }
    
    setLoading(true);
    
    try {
      const partitaRef = doc(db, 'bookings', partita.id);
      const newPlayer = {
        userId: user.uid,
        userName: user.displayName || user.email,
        status: 'confirmed'
      };
      
      // CORREZIONE: Se l'utente era invitato, rimuovilo dagli invitedPlayers
      const updatedInvitedPlayers = partita.invitedPlayers ? 
        partita.invitedPlayers.filter(player => player.userId !== user.uid) : [];
      
      const updatedPlayers = [...(partita.players || []), newPlayer];
      const isNowFull = updatedPlayers.filter(player => player.status === 'confirmed').length >= maxPlayers;
      
      await updateDoc(partitaRef, {
        players: updatedPlayers,
        invitedPlayers: updatedInvitedPlayers,
        userIds: arrayUnion(user.uid),
        status: isNowFull ? 'confirmed' : 'waiting'
      });
      
      // Verifica e aggiorna lo stato della prenotazione
      await checkAndUpdateBookingStatus(partita.id);
      
      // Aggiorna il conteggio delle prenotazioni per l'utente
      await updateUserBookingCount(user.uid);
      
      Alert.alert('Successo', 'Ti sei unito alla partita con successo!');
    } catch (error) {
      console.error('Errore durante l\'unione alla partita:', error);
      Alert.alert('Errore', 'Impossibile unirsi alla partita');
    } finally {
      setLoading(false);
    }
  };

  const renderPartita = ({ item }) => {
    const start = item.startTime || 'N/A';
    const end = item.endTime || 'N/A';
    
    // CORREZIONE: Conta solo i giocatori confermati
    const currentPlayers = item.players ? item.players.filter(player => player.status === 'confirmed').length : 0;
    const maxPlayers = item.maxPlayers || (item.matchType === 'singles' ? 2 : 4);
    const postiDisponibili = maxPlayers - currentPlayers;
    
    // Ottieni la lista dei giocatori confermati (creatore PRIMO, poi gli altri)
    const confirmedPlayersList = getConfirmedPlayersList(item);

    return (
      <View style={styles.partitaCard}>
        <View style={styles.partitaHeader}>
          <Text style={styles.campoText}>{item.courtName}</Text>
          <View style={styles.headerRight}>
            {item.isInvited && (
              <View style={styles.invitedBadge}>
                <Ionicons name="mail-unread" size={14} color="#ffffff" />
                <Text style={styles.invitedText}>Sei stato invitato</Text>
              </View>
            )}
            <View style={[styles.statoBadge, styles.statoWaiting]}>
              <Text style={[styles.statoTesto, styles.statoTestoWaiting]}>
                {item.isInvited ? 'Invito in sospeso' : 'In attesa di giocatori'}
              </Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.dataText}>{formatDate(item.date)}</Text>
        
        <View style={styles.orarioContainer}>
          <Ionicons name="time-outline" size={18} color="#3498db" />
          <Text style={styles.orarioText}>
            {start} - {end}
          </Text>
        </View>
        
        <View style={styles.infoContainer}>
          <Ionicons name="person-outline" size={16} color="#7f8c8d" />
          <Text style={styles.infoText}>
            Creata da: {item.userFirstName} {item.userLastName}
          </Text>
        </View>

        <View style={styles.infoContainer}>
  <Ionicons name="people-outline" size={16} color="#7f8c8d" />
  <Text style={styles.infoText}>
    {postiDisponibili} {postiDisponibili === 1 ? 'posto disponibile' : 'posti disponibili'} ({currentPlayers}/{maxPlayers})
  </Text>
</View>
        
        <View style={styles.infoContainer}>
          <Ionicons name="tennisball-outline" size={16} color="#7f8c8d" />
          <Text style={styles.infoText}>
            {item.matchType === 'singles' ? 'Singolare' : 'Doppio'}
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

        <TouchableOpacity 
          style={[
            styles.joinButton,
            item.isInvited && styles.inviteButton
          ]}
          onPress={() => handleJoinMatch(item)}
          disabled={loading}
        >
          <Text style={styles.joinButtonText}>
            {item.isInvited ? 'Accetta invito' : 'Unisciti alla partita'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.caricamentoContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.caricamentoTesto}>Caricamento partite open...</Text>
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

  if (partiteOpen.length === 0) {
    return (
      <View style={styles.vuotoContainer}>
        <Ionicons name="people-outline" size={64} color="#bdc3c7" />
        <Text style={styles.vuotoTesto}>Nessuna partita open disponibile</Text>
        <Text style={styles.vuotoSottoTesto}>Le partite open disponibili appariranno qui</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titolo}>Partite Open Disponibili</Text>
      <Text style={styles.sottoTitolo}>
        Unisciti alle partite organizzate da altri giocatori o accetta i tuoi inviti
      </Text>
      <FlatList
        data={partiteOpen}
        renderItem={renderPartita}
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
  partitaCard: {
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
  partitaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  campoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  invitedText: {
    color: 'white',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '600',
  },
  statoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statoWaiting: {
    backgroundColor: '#d1ecf1',
  },
  statoTesto: {
    fontSize: 12,
    fontWeight: '600',
  },
  statoTestoWaiting: {
    color: '#0c5460',
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
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  joinButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  inviteButton: {
    backgroundColor: '#8b5cf6',
  },
  joinButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
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

export default OpenMatchesScreen;