import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, query, where, onSnapshot, updateDoc, doc, 
  getDoc, arrayUnion 
} from 'firebase/firestore';
import { db } from './config/firebase';
import { useAuth } from './context/AuthContext';

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const notificationsList = [];
      querySnapshot.forEach((doc) => {
        notificationsList.push({ id: doc.id, ...doc.data() });
      });
      // Filtra solo le notifiche di invito diretto
      const filteredNotifications = notificationsList.filter(
        notification => notification.type === 'booking_invitation'
      );
      setNotifications(filteredNotifications);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      console.error('Errore nel segnare come letta:', error);
    }
  };

  const handleNotificationPress = async (notification) => {
    markAsRead(notification.id);
    
    if (notification.type === 'booking_invitation') {
      // Naviga alla schermata di prenotazione con i dettagli dell'invito
      Alert.alert('Invito Partita', notification.message, [
        { 
          text: 'Rifiuta', 
          onPress: () => console.log('Invito rifiutato'),
          style: 'cancel' 
        },
        { 
          text: 'Accetta', 
          onPress: () => handleAcceptInvitation(notification.bookingId)
        }
      ]);
    }
  };

  const handleAcceptInvitation = async (bookingId) => {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      
      if (!bookingSnap.exists()) {
        Alert.alert('Errore', 'La prenotazione non esiste più');
        return;
      }
      
      const bookingData = bookingSnap.data();
      const maxPlayers = bookingData.maxPlayers || (bookingData.matchType === 'singles' ? 2 : 4);
      
      // Controlla se c'è ancora posto
      if (bookingData.players.length >= maxPlayers) {
        Alert.alert('Partita piena', 'Questa partita ha già raggiunto il numero massimo di giocatori');
        return;
      }
      
      // Aggiungi l'utente alla prenotazione
      await updateDoc(bookingRef, {
        players: arrayUnion({
          userId: user.uid,
          userName: user.displayName || user.email,
          status: 'confirmed'
        }),
        userIds: arrayUnion(user.uid)
      });
      
      // Controlla se la partita è ora completa
      const updatedBookingSnap = await getDoc(bookingRef);
      const updatedBooking = updatedBookingSnap.data();
      
      if (updatedBooking.players.length >= maxPlayers) {
        await updateDoc(bookingRef, {
          status: 'confirmed'
        });
      }
      
      Alert.alert('Successo', 'Ti sei unito alla partita con successo!');
    } catch (error) {
      console.error('Errore nell\'accettazione dell\'invito:', error);
      Alert.alert('Errore', 'Impossibile accettare l\'invito');
    }
  };

  const renderNotification = ({ item }) => (
    <TouchableOpacity 
      style={styles.notificationItem}
      onPress={() => handleNotificationPress(item)}
    >
      <Ionicons name="tennisball" size={24} color="#3b82f6" />
      <View style={styles.notificationContent}>
        <Text style={styles.notificationMessage}>{item.message}</Text>
        <Text style={styles.notificationTime}>
          {new Date(item.createdAt?.toDate()).toLocaleString('it-IT')}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inviti Partite</Text>
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nessun invito in sospeso</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  notificationMessage: {
    fontSize: 16,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 16,
    color: '#6b7280',
  },
});

export default NotificationsScreen;