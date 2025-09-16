
// ✅ SignupScreen.tsx - Versione corretta con UI originale preservata
// (Questo codice è stato ricostruito con le modifiche richieste e mantenendo gli stili originali)

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import styles from '../styles/AuthStyles';

const SignupScreen = ({ navigation }) => {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSignup = async () => {
    if (!nome || !cognome || !email || !password) {
      Alert.alert('Errore', 'Per favore compila tutti i campi');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Errore', 'Inserisci un’email valida');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: `${nome} ${cognome}`,
      });

      await setDoc(doc(db, 'users', user.uid), {
        nome,
        cognome,
        email,
        isAbbonato: true,
        dataIscrizione: serverTimestamp(),
        privacyAccepted: false,
        profileCompleted: false,
        role: 'user',
      });

      Alert.alert('Registrazione completata', 'Completa ora il tuo profilo', [
        {
          text: 'OK',
          onPress: () =>
            navigation.navigate('Profilo', {
              mandatory: true,
              nome,
              cognome,
              email,
            }),
        },
      ]);
    } catch (error) {
      console.error('Signup error:', error);
      let msg = 'Errore durante la registrazione';
      if (error.code === 'auth/email-already-in-use') msg = 'Questa email è già registrata.';
      else if (error.code === 'auth/invalid-email') msg = 'Email non valida.';
      else if (error.code === 'auth/weak-password') msg = 'Password troppo debole.';
      Alert.alert('Errore', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="tennisball" size={64} color="#fff" />
        </View>

        <Text style={styles.title}>Registrati</Text>

        <TextInput
          style={styles.input}
          placeholder="Nome"
          placeholderTextColor="#ccc"
          value={nome}
          onChangeText={setNome}
        />
        <TextInput
          style={styles.input}
          placeholder="Cognome"
          placeholderTextColor="#ccc"
          value={cognome}
          onChangeText={setCognome}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#ccc"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#ccc"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Registrati</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Hai già un account? Accedi</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
};

export default SignupScreen;
