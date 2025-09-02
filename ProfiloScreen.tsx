import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  Modal,
  Linking,
  Platform,
  StatusBar,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  updatePassword, 
  updateEmail, 
  EmailAuthProvider, 
  reauthenticateWithCredential,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './config/firebase';
import { useAuth } from './context/AuthContext';

const ProfiloScreen = ({ navigation, route }) => {
  const { user } = useAuth();
  const isMandatory = route.params?.mandatory || false;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [changingCellulare, setChangingCellulare] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  
  // Dati utente
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cellulare, setCellulare] = useState('');
  
  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Email
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  
  // Cellulare
  const [newCellulare, setNewCellulare] = useState('');
  const [cellularePassword, setCellularePassword] = useState('');
  
  // Privacy
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errors, setErrors] = useState({});

  // Carica i dati dell'utente
  useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setCognome(userData.cognome || '');
          setNome(userData.nome || '');
          setEmail(userData.email || user.email || '');
          setCellulare(userData.cellulare || '');
          setPrivacyAccepted(userData.privacyAccepted || false);
        }
      } catch (error) {
        console.error('Errore nel caricamento del profilo:', error);
        Alert.alert('Errore', 'Impossibile caricare i dati del profilo');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user]);

  // Valida il form
  const validateForm = () => {
    const newErrors = {};
    
    if (!cellulare.trim()) {
      newErrors.cellulare = 'Il numero di cellulare è obbligatorio';
    } else if (!/^[0-9]{10,15}$/.test(cellulare)) {
      newErrors.cellulare = 'Inserisci un numero di cellulare valido';
    }
    
    if (!privacyAccepted) {
      newErrors.privacy = 'Devi accettare l\'informativa sulla privacy';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Valida il numero de cellulare
  const validateCellulare = (numero) => {
    return /^[0-9]{10,15}$/.test(numero);
  };

  // Salva il profilo
  const handleSaveProfile = async () => {
    if (!validateForm()) return;
    
    try {
      setSaving(true);
      
      await updateDoc(doc(db, 'users', user.uid), {
        cognome,
        nome,
        email,
        cellulare,
        privacyAccepted,
        profileCompleted: true
      });
      
      Alert.alert('Successo', 'Profilo aggiornato con successo');
      
      // Se è la prima volta, torna alla schermata principale
      if (isMandatory) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      }
    } catch (error) {
      console.error('Errore nel salvataggio del profilo:', error);
      Alert.alert('Errore', 'Impossibile salvare il profilo');
    } finally {
      setSaving(false);
    }
  };

  // Cambia password
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Errore', 'Compila tutti i campi della password');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      Alert.alert('Errore', 'Le password non coincidono');
      return;
    }
    
    if (newPassword.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }
    
    try {
      // Riautentica l'utente
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Cambia password
      await updatePassword(user, newPassword);
      
      Alert.alert('Successo', 'Password cambiata con successo');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangingPassword(false);
    } catch (error) {
      console.error('Errore nel cambio password:', error);
      
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Errore', 'La password corrente non è corretta');
      } else {
        Alert.alert('Errore', 'Impossibile cambiare la password');
      }
    }
  };

  // Cambia email
  const handleChangeEmail = async () => {
    if (!newEmail || !emailPassword) {
      Alert.alert('Errore', 'Compila tutti i campi');
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      Alert.alert('Errore', 'Inserisci un indirizzo email valido');
      return;
    }
    
    try {
      // Riautentica l'utente
      const credential = EmailAuthProvider.credential(user.email, emailPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Cambia email
      await updateEmail(user, newEmail);
      
      // Invia email de verifica
      await sendEmailVerification(user);
      
      // Aggiorna email nel database
      await updateDoc(doc(db, 'users', user.uid), {
        email: newEmail
      });
      
      Alert.alert(
        'Successo', 
        'Email cambiata con successo. Ti abbiamo inviato una email de verifica.'
      );
      
      setEmail(newEmail);
      setNewEmail('');
      setEmailPassword('');
      setChangingEmail(false);
    } catch (error) {
      console.error('Errore nel cambio email:', error);
      
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Errore', 'La password non è corretta');
      } else if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Errore', 'Questa email è già in uso da un altro account');
      } else {
        Alert.alert('Errore', 'Impossibile cambiare l\'email');
      }
    }
  };

  // Cambia cellulare
  const handleChangeCellulare = async () => {
    if (!newCellulare || !cellularePassword) {
      Alert.alert('Errore', 'Compila tutti i campi');
      return;
    }
    
    if (!validateCellulare(newCellulare)) {
      Alert.alert('Errore', 'Inserisci un numero di cellulare valido (10-15 cifre)');
      return;
    }
    
    try {
      // Riautentica l'utente
      const credential = EmailAuthProvider.credential(user.email, cellularePassword);
      await reauthenticateWithCredential(user, credential);
      
      // Aggiorna cellulare nel database
      await updateDoc(doc(db, 'users', user.uid), {
        cellulare: newCellulare
      });
      
      Alert.alert('Successo', 'Numero di cellulare cambiato con successo');
      
      setCellulare(newCellulare);
      setNewCellulare('');
      setCellularePassword('');
      setChangingCellulare(false);
    } catch (error) {
      console.error('Errore nel cambio cellulare:', error);
      
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Errore', 'La password non è corretta');
      } else {
        Alert.alert('Errore', 'Impossibile cambiare il numero di cellulare');
      }
    }
  };

  // Apri il link della privacy policy
  const openPrivacyPolicy = () => {
    Linking.openURL('https://www.il-tuo-sito.com/privacy-policy');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Caricamento profilo...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Il Tuo Profilo</Text>
          
          {isMandatory && (
            <Text style={styles.mandatoryText}>
              Completa il tuo profilo per continuare
            </Text>
          )}
        </View>
        
        {/* Sezione Informazioni Personali */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informazioni Personali</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Cognome</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{cognome}</Text>
            </View>
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nome</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{nome}</Text>
            </View>
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.emailContainer}>
              <Text style={styles.emailText}>{email}</Text>
            </View>
            
            <View style={styles.changeButtonContainer}>
              <TouchableOpacity 
                style={styles.changeButton}
                onPress={() => setChangingEmail(!changingEmail)}
              >
                <Text style={styles.changeButtonText}>
                  {changingEmail ? 'Annulla' : 'Cambia Email'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {changingEmail && (
              <View>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Nuova Email</Text>
                  <TextInput
                    style={styles.input}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="Inserisci la nuova email"
                  />
                </View>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Password Attuale</Text>
                  <TextInput
                    style={styles.input}
                    value={emailPassword}
                    onChangeText={setEmailPassword}
                    secureTextEntry
                    placeholder="Inserisci la password attuale"
                  />
                </View>
                
                <TouchableOpacity 
                  style={styles.confirmButton}
                  onPress={handleChangeEmail}
                >
                  <Text style={styles.confirmButtonText}>Conferma Cambio Email</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Numero di Cellulare *</Text>
            <View style={styles.emailContainer}>
              <Text style={styles.emailText}>{cellulare}</Text>
            </View>
            
            <View style={styles.changeButtonContainer}>
              <TouchableOpacity 
                style={styles.changeButton}
                onPress={() => setChangingCellulare(!changingCellulare)}
              >
                <Text style={styles.changeButtonText}>
                  {changingCellulare ? 'Annulla' : 'Cambia Cellulare'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {changingCellulare && (
              <View>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Nuovo Cellulare</Text>
                  <TextInput
                    style={styles.input}
                    value={newCellulare}
                    onChangeText={setNewCellulare}
                    keyboardType="phone-pad"
                    placeholder="Inserisci il nuovo numero di cellulare"
                  />
                </View>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Password Attuale</Text>
                  <TextInput
                    style={styles.input}
                    value={cellularePassword}
                    onChangeText={setCellularePassword}
                    secureTextEntry
                    placeholder="Inserisci la password attuale"
                  />
                </View>
                
                <TouchableOpacity 
                  style={styles.confirmButton}
                  onPress={handleChangeCellulare}
                >
                  <Text style={styles.confirmButtonText}>Conferma Cambio Cellulare</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {errors.cellulare && <Text style={styles.errorText}>{errors.cellulare}</Text>}
          </View>
        </View>
        
        {/* Sezione Password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Password</Text>
          
          <TouchableOpacity 
            style={styles.passwordButton}
            onPress={() => setChangingPassword(!changingPassword)}
          >
            <Text style={styles.passwordButtonText}>
              {changingPassword ? 'Annulla' : 'Cambia Password'}
            </Text>
          </TouchableOpacity>
          
          {changingPassword && (
            <View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password Attuale</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="Inserisci la password attuale"
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nuova Password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="Inserisci la nuova password"
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Conferma Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Conferma la nuova password"
                />
              </View>
              
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={handleChangePassword}
              >
                <Text style={styles.confirmButtonText}>Conferma Cambio Password</Text>
              </TouchableOpacity>
            </View>
            )}
        </View>
        
        {/* Sezione Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          
          <TouchableOpacity 
            style={styles.privacyLink}
            onPress={() => setPrivacyModalVisible(true)}
          >
            <Ionicons name="document-text-outline" size={20} color="#3b82f6" />
            <Text style={styles.privacyLinkText}>Leggi l'informativa sulla privacy</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setPrivacyAccepted(!privacyAccepted)}
          >
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
              {privacyAccepted && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
            <Text style={styles.checkboxLabel}>
              Accetto l'informativa sulla privacy e il trattamento dei dati personali *
            </Text>
          </TouchableOpacity>
          
          {errors.privacy && <Text style={styles.errorText}>{errors.privacy}</Text>}
        </View>
        
        {/* Pulsante Salva */}
        <TouchableOpacity 
          style={[styles.saveButton, (!privacyAccepted || !cellulare) && styles.saveButtonDisabled]}
          onPress={handleSaveProfile}
          disabled={saving || !privacyAccepted || !cellulare}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isMandatory ? 'Completa Profilo' : 'Salva Modifiche'}
            </Text>
          )}
        </TouchableOpacity>
        
        {isMandatory && (
          <Text style={styles.noteText}>
            * Campi obbligatori per proseguire
          </Text>
        )}
      </ScrollView>
      
      {/* Modal Privacy */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={privacyModalVisible}
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Informativa sulla Privacy</Text>
            
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, 
                nisl eget aliquam ultricies, nunc nisl aliquet nunc, quis aliquam nisl 
                nunc eu nisl. Nullam euismod, nisl eget aliquam ultricies, nunc nisl 
                aliquet nunc, quis aliquam nisl nunc eu nisl.{"\n\n"}
                
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, 
                nisl eget aliquam ultricies, nunc nisl aliquet nunc, quis aliquam nisl 
                nunc eu nisl. Nullam euismod, nisl eget aliquam ultricies, nunc nisl 
                aliquet nunc, quis aliquam nisl nunc eu nisl.{"\n\n"}
                
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, 
                nisl eget aliquam ultricies, nunc nisl aliquet nunc, quis aliquam nisl 
                nunc eu nisl. Nullam euismod, nisl eget aliquam ultricies, nunc nisl 
                aliquet nunc, quis aliquam nisl nunc eu nisl.
              </Text>
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setPrivacyModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Ho Capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  mandatoryText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  readOnlyField: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  readOnlyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  emailContainer: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  emailText: {
    fontSize: 16,
    color: '#6b7280',
  },
  changeButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  changeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  changeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  passwordButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  passwordButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  privacyLinkText: {
    color: '#3b82f6',
    marginLeft: 8,
    textDecorationLine: 'underline',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkboxLabel: {
    flex: 1,
    color: '#374151',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  noteText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: '70%',
    marginBottom: 20,
  },
  modalText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default ProfiloScreen;