import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from 'config/firebase'; // <— adatta il path se diverso

// Scope: aggiunti micro-accorgimenti + log A

export default function SignupScreen({ navigation }: any) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    if (!nome || !cognome || !email || !password) {
      Alert.alert('Dati mancanti', 'Compila nome, cognome, email e password.');
      return;
    }
    setLoading(true);
    try {
      // Micro-accorgimento #1: pulizia prudenziale del fallback prima dell'uso
      await AsyncStorage.removeItem('pendingProfile');

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      if (auth.currentUser && (nome || cognome)) {
        await updateProfile(auth.currentUser, { displayName: `${nome} ${cognome}`.trim() });
      }

      // Salva fallback immediato per la prima apertura
      await AsyncStorage.setItem('pendingProfile', JSON.stringify({ nome, cognome, email: email.trim() }));

      // Crea il documento PRIMA di navigare
      await setDoc(
        doc(db, 'users', uid),
        { nome, cognome, email: email.trim(), createdAt: serverTimestamp() },
        { merge: true }
      );

      // LOG A) conferma creazione doc
      console.log('[SIGNUP] user doc creato:', uid, { nome, cognome, email: email.trim() });

      // Reset dello stack con params espliciti inclusi UID
      navigation.reset({
        index: 0,
        routes: [
          { name: 'ProfiloMandatory', params: { uid, nome, cognome, email: email.trim(), mandatory: true } },
        ],
      });
    } catch (e: any) {
      console.error('Signup flow failed:', e);
      Alert.alert('Registrazione fallita', e?.message ?? 'Errore imprevisto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Crea account</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Nome" autoCapitalize="words" />

        <Text style={styles.label}>Cognome</Text>
        <TextInput value={cognome} onChangeText={setCognome} style={styles.input} placeholder="Cognome" autoCapitalize="words" />

        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} style={styles.input} placeholder="Password" secureTextEntry autoCapitalize="none" />

        <Pressable style={styles.button} onPress={onSignup} disabled={loading}>
          {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Registrati</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 },
  button: { marginTop: 20, borderRadius: 28, paddingVertical: 14, alignItems: 'center', elevation: 2, backgroundColor: '#3f51b5' },
  buttonText: { color: 'white', fontWeight: '700' },
});
