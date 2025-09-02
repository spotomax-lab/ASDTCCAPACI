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
  Platform 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';

const { width, height } = Dimensions.get('window');

const SignupScreen = ({ navigation }) => {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!nome || !cognome || !email || !password) {
      Alert.alert('Errore', 'Per favore compila tutti i campi');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await updateProfile(userCredential.user, {
        displayName: `${nome} ${cognome}`
      });

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        nome,
        cognome,
        email,
        isAbbonato: true,
        dataIscrizione: new Date(),
        privacyAccepted: false,
        profileCompleted: false
      });

      // Naviga alla schermata Profilo invece di mostrare un alert
      navigation.navigate('Profilo', { mandatory: true });
      
    } catch (error) {
      console.log('Errore completo:', error);
      let errorMessage = 'Errore durante la registrazione';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Email già registrata';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email non valida';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password troppo debole';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Registrazione non abilitata';
      }
      
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
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.container}>
            <View style={styles.signupBox}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Text style={styles.logoEmoji}>🎾</Text>
                </View>
                <Text style={styles.clubName}>A.S.D. T.C. CAPACI</Text>
                <Text style={styles.clubSubtitle}>Tennis Club</Text>
                <Text style={styles.subtitle}>Crea il tuo account</Text>
              </View>

              {/* Form di registrazione */}
              <View style={styles.formContainer}>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={24} color="#64748b" style={styles.inputIcon} />
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
                  <Ionicons name="people-outline" size={24} color="#64748b" style={styles.inputIcon} />
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
                  <Ionicons name="mail-outline" size={24} color="#64748b" style={styles.inputIcon} />
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
                  <Ionicons name="lock-closed-outline" size={24} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password (min. 6 caratteri)"
                    placeholderTextColor="#64748b"
                    value={password}
                    onChangeText={setPassword}
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
                    <ActivityIndicator color="white" />
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

                {/* Aggiunta della dicitura di avviso */}
                <Text style={styles.warningText}>
                  Le registrazioni effettuate con Cognome e Nome incompleti o non reali saranno eliminate dagli amministratori.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  signupBox: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
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
    marginBottom: 30,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoEmoji: {
    fontSize: 32,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    color: '#14532d',
  },
  clubName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
    textAlign: 'center',
  },
  clubSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#1e293b',
  },
  signupButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  signupButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  signupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  loginLinkText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  warningText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 16,
  },
});

export default SignupScreen;