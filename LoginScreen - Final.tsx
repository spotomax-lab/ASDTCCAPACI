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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './config/firebase';

const { width, height } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Errore', 'Per favore inserisci email e password');
      return;
    }

    setLoading(true);
    try {navigation
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
     
    } catch (error) {
      console.log('Errore completo:', error);
      let errorMessage = 'Errore durante il login';
      
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email non valida';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'Account disabilitato';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'Utente non trovato';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Password errata';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Troppi tentativi falliti. Riprova più tardi.';
      }
      
      Alert.alert('Errore', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert('Errore', 'Inserisci la tua email per reimpostare la password');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Email inviata', 'Controlla la tua casella email per reimpostare la password');
    } catch (error) {
      console.error('Errore nel reset password:', error);
      let errorMessage = 'Impossibile inviare l\'email di reset';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Nessun account associato a questa email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email non valida';
      }
      
      Alert.alert('Errore', errorMessage);
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
            <View style={styles.loginBox}>
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
                <Text style={styles.subtitle}>Accedi al tuo account</Text>
              </View>

              {/* Form di login */}
              <View style={styles.formContainer}>
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
                    placeholder="Password"
                    placeholderTextColor="#64748b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]} 
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.loginButtonText}>Accedi</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.passwordResetLink}
                  onPress={() => handlePasswordReset()}
                >
                  <Text style={styles.passwordResetText}>Hai dimenticato la password?</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.signupLink}
                  onPress={() => navigation.navigate('Signup')}
                >
                  <Text style={styles.signupLinkText}>
                    Non hai un account? Registrati
                  </Text>
                </TouchableOpacity>
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
  loginBox: {
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#dbeafe',
  },
  logoImage: {
    width: 99,
    height: 99,
    borderRadius: 10,
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
  loginButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  passwordResetLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  passwordResetText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  signupLink: {
    alignItems: 'center',
  },
  signupLinkText: {
    color: '#3b82f6',
    fontSize: 14,
  },
});

export default LoginScreen;