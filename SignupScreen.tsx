import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  Dimensions, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  ScrollView,
  Platform,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { 
  createUserWithEmailAndPassword, 
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config/firebase';

const { width, height } = Dimensions.get('window');

const SignupScreen = ({ navigation }) => {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    // Validazioni
    if (!nome || !cognome || !email || !password || !confirmPassword) {
      Alert.alert('Errore', 'Per favore compila tutti i campi');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Errore', 'Le password non coincidono');
      return;
    }
    
    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);
    try {
      // Pulizia prudenziale di eventuale fallback precedente
      await AsyncStorage.removeItem('pendingProfile');

      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // Imposta displayName (facoltativo ma utile)
      try {
        await updateProfile(userCredential.user, { displayName: `${nome} ${cognome}`.trim() });
      } catch {}

      // Fallback locale per il primo render del profilo
      await AsyncStorage.setItem('pendingProfile', JSON.stringify({
        nome, cognome, email: email.trim()
      }));

      // Crea/aggiorna il documento utente PRIMA di uscire da questa schermata (evita race)
      await setDoc(
        doc(db, 'users', uid),
        {
          nome,
          cognome,
          email: email.trim(),
          isAbbonato: true,
          dataIscrizione: serverTimestamp(),
          privacyAccepted: false,
          profileCompleted: false, // AppNavigator mostrerà ProfiloMandatory
          role: 'user'
        },
        { merge: true }
      );

      // LOG A — conferma creazione doc
      console.log('[SIGNUP] user doc creato:', uid, { nome, cognome, email: email.trim() });

      // NON navighiamo manualmente: l'AppNavigator mostrerà ProfiloMandatory (profileCompleted=false)
      Alert.alert('Registrazione completata', 'Account creato. Completa ora il tuo profilo.');
    } catch (error) {
      console.error('Errore registrazione:', error);
      let errorMessage = 'Errore durante la registrazione';
      if (error?.code === 'auth/email-already-in-use') errorMessage = 'Questa email è già registrata';
      else if (error?.code === 'auth/invalid-email') errorMessage = 'Email non valida';
      else if (error?.code === 'auth/weak-password') errorMessage = 'La password è troppo debole';
      Alert.alert('Errore', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#1e40af', '#3b82f6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.signupBox}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Image 
                    source={{ uri: 'https://i.imgur.com/R9HOnGx.png' }} 
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.clubName}>A.S.D. T.C. CAPACI</Text>
                <Text style={styles.clubSubtitle}>Tennis Club</Text>
                <Text style={styles.subtitle}>Crea il tuo account</Text>
              </View>

              {/* Form di registrazione */}
              <View style={styles.formContainer}>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Nome"
                    placeholderTextColor="#64748b"
                    value={nome}
                    onChangeText={setNome}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="people-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Cognome"
                    placeholderTextColor="#64748b"
                    value={cognome}
                    onChangeText={setCognome}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#64748b"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password (min. 6 caratteri)"
                    placeholderTextColor="#64748b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Conferma Password"
                    placeholderTextColor="#64748b"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleSignup}
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.signupButton, loading && styles.signupButtonDisabled]} 
                  onPress={handleSignup}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.signupButtonText}>Registrati</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.loginLink}
                  onPress={() => navigation.navigate('Login')}
                >
                  <Text style={styles.loginLinkText}>
                    Hai già un account? Accedi
                  </Text>
                </TouchableOpacity>

                <Text style={styles.warningText}>
                  Le registrazioni effettuate con Cognome e Nome incompleti o non reali saranno eliminate dagli amministratori.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Crediti sviluppatore */}
      <Text style={styles.credits}>App Developer: Massimiliano Spoto</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    width: width,
    height: height,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  signupBox: {
    backgroundColor: 'white',
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#dbeafe',
  },
  logoImage: {
    width: 76,
    height: 76,
    borderRadius: 8,
  },
  clubName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
    textAlign: 'center',
  },
  clubSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 42,
    fontSize: 15,
    color: '#1e293b',
    paddingVertical: 8,
  },
  signupButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  signupButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  signupButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  loginLink: {
    alignItems: 'center',
    marginBottom: 12,
  },
  loginLinkText: {
    color: '#3b82f6',
    fontSize: 13,
  },
  warningText: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 14,
  },
  credits: {
     position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontStyle: 'italic',
  },
});

export default SignupScreen;