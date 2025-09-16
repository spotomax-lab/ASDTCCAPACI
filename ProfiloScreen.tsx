import React, { useEffect, useRef, useState } from 'react';
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
  BackHandler,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { 
  updatePassword, 
  updateEmail, 
  EmailAuthProvider, 
  reauthenticateWithCredential
} from 'firebase/auth';
import { doc, getDoc, updateDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './config/firebase';
import { useAuth } from './context/AuthContext';

const ProfiloScreen = ({ navigation, route }) => {
  const { user, refreshUserData } = useAuth();
  const isMandatory = route.params?.mandatory || false;
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [changingCellulare, setChangingCellulare] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  
  // Dati utente - con valori predefiniti dai parametri di navigazione
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');

  





  





  





  const [cellulare, setCellulare] = useState('');
  const [tempCellulare, setTempCellulare] = useState('');
  
  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Email
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  
  // Privacy
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errors, setErrors] = useState({});
  // === LOGICA AGGIUNTA (solo logica, UI invariata) ===
// UID risolto: dai params (se presenti) o dall'utente autenticato
  const [resolvedUid, setResolvedUid] = useState<string | undefined>(undefined);

  useEffect(() => {
    const p: any = route?.params ?? {};
    if (typeof p.uid === 'string' && p.uid && !resolvedUid) setResolvedUid(p.uid);
  }, [route?.params, resolvedUid]);

  useEffect(() => {
    if (!resolvedUid && user?.uid) setResolvedUid(user.uid);
    else if (!resolvedUid && auth?.currentUser?.uid) setResolvedUid(auth.currentUser.uid);
  }, [resolvedUid]);

  // Log C) uid risolto
  useEffect(() => {
    if (resolvedUid) __DEV__ && console.log('[PROFILO] uid risolto:', resolvedUid);
  }, [resolvedUid]);
  // Debounced logging of route.params (avoids spam on re-renders)
  const paramsLogRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const s = JSON.stringify((route as any)?.params ?? {});
      if (paramsLogRef.current === s) return;
      paramsLogRef.current = s;
      __DEV__ && console.log('[PROFILO] route.params grezzi:', s);
    } catch {
      __DEV__ && console.log('[PROFILO] route.params grezzi: (non serializzabili)');
    }
  }, [route?.params]);


  // Fallback pendingProfile (solo se i campi sono vuoti e l'email combacia)
  useEffect(() => {
    (async () => {
      if (nome || cognome || email) return;
      try {
        const raw = await AsyncStorage.getItem('pendingProfile');
        if (!raw) return;
        const p = JSON.parse(raw);
        const currentEmail = route?.params?.email || user?.email || auth?.currentUser?.email || '';
        if (p?.email && currentEmail && p.email !== currentEmail) {
          __DEV__ && console.log('[PROFILO] pendingProfile ignorato: email diversa da quella corrente');
          return;
        }
        if (typeof p?.cognome === 'string') setCognome(p.cognome);
        if (typeof p?.nome === 'string') setNome(p.nome);
        if (typeof p?.email === 'string') setEmail(p.email);
      } catch {}
    })();
  }, [nome, cognome, email]);

  // Subscription a users/{resolvedUid} + self-heal se doc mancante
  useEffect(() => {
    if (!resolvedUid) return;
    const ref = doc(db, 'users', resolvedUid);

    __DEV__ && console.log('[PROFILO] subscribe users/{uid} ->', resolvedUid);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const d: any = snap.data();
        __DEV__ && console.log('[PROFILO] snapshot exists: true, dati:', d);
        if (typeof d?.cognome === 'string') setCognome(d.cognome);
        if (typeof d?.nome === 'string') setNome(d.nome);
        if (typeof d?.email === 'string') setEmail(d.email);
        const cellulareValue = d?.cellulare || '';
        if (typeof setCellulare === 'function') setCellulare(cellulareValue);
        if (typeof setTempCellulare === 'function') setTempCellulare(cellulareValue);
        if (typeof setPrivacyAccepted === 'function') setPrivacyAccepted(!!d?.privacyAccepted);
      
        try { await AsyncStorage.removeItem('pendingProfile'); } catch {}
} else {
        __DEV__ && console.warn('[PROFILO] snapshot exists: false (doc mancante)');
        if (cognome || nome || email) {
          try {
            await setDoc(ref, { cognome, nome, email }, { merge: true });
            __DEV__ && console.log('[PROFILO] self-heal setDoc eseguito');
          } catch (e) { __DEV__ && console.error('Self-heal setDoc failed', e); }
        } else {
          try {
            __DEV__ && console.log('[PROFILO] getDoc users/{uid}…');
            const once = await getDoc(ref);
            __DEV__ && console.log('[PROFILO] esiste?', once.exists());
            if (once.exists()) {
              const d: any = once.data();
              __DEV__ && console.log('[PROFILO] dati (getDoc):', d);
              if (typeof d?.cognome === 'string') setCognome(d.cognome);
              if (typeof d?.nome === 'string') setNome(d.nome);
              if (typeof d?.email === 'string') setEmail(d.email);
              const cellulareValue = d?.cellulare || '';
              if (typeof setCellulare === 'function') setCellulare(cellulareValue);
              if (typeof setTempCellulare === 'function') setTempCellulare(cellulareValue);
              if (typeof setPrivacyAccepted === 'function') setPrivacyAccepted(!!d?.privacyAccepted);
            }
          } catch (e) { __DEV__ && console.error('[PROFILO] getDoc errore', e); }
        }
      }
    });
    return () => unsub();
  }, [resolvedUid]);


  // Gestione del tasto indietro su Android
  



useEffect(() => {
    // Solo su Android e solo se è una compilazione obbligatoria
    if (Platform.OS === 'android' && isMandatory) {
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        handleBackPress
      );

      return () => backHandler.remove();
    }
  }, [isMandatory]);

  const handleBackPress = () => {
    if (isMandatory) {
      Alert.alert(
        'Completa il profilo',
        'Devi completare il profilo per poter utilizzare l\'app. Vuoi davvero uscire?',
        [
          {
            text: 'Annulla',
            onPress: () => null,
            style: 'cancel',
          },
          {
            text: 'Esci',
            onPress: () => BackHandler.exitApp(),
          },
        ]
      );
      return true; // Previene il comportamento predefinito (tornare indietro)
    }
    return false; // Consente il comportamento predefinito
  };

  // Carica i dati dell'utente
  



useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        
        // Se siamo in modalità obbligatoria e abbiamo dati dai parametri,
        // usiamo quelli e non carichiamo da Firestore per evitare warning
        if (isMandatory && route.params?.cognome && route.params?.nome && route.params?.email) {
          setCognome(route.params.cognome);
          setNome(route.params.nome);
          setEmail(route.params.email);
          setCellulare('');
          setTempCellulare('');
          setPrivacyAccepted(false);
          setLoading(false);
          return;
        }
        
        // Altrimenti carichiamo i dati da Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const cellulareValue = userData.cellulare || '';
          
          // Usa i dati da Firestore solo se non abbiamo già dati dai parametri
          if (!cognome) setCognome(userData.cognome || '');
          if (!nome) setNome(userData.nome || '');
          if (!email) setEmail(userData.email || user.email || '');
          
          setCellulare(cellulareValue);
          setTempCellulare(cellulareValue);
          setPrivacyAccepted(userData.privacyAccepted || false);
        } else {
          // Non mostrare warning in modalità obbligatoria
          if (!isMandatory) {
           __DEV__ && console.debug('[PROFILO] doc mancante: in attesa che venga creato…');          }
        }
      } catch (error) {
        __DEV__ && console.error('Errore nel caricamento del profilo:', error);
        Alert.alert('Errore', 'Impossibile caricare i dati del profilo');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user, isMandatory]);

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
      
      // Aggiorna i dati utente nel contesto
      await refreshUserData();
      
      Alert.alert(
        'Successo', 
        'Profilo aggiornato con successo',
        [
          {
            text: 'OK',
            onPress: () => {
              // Se è la prima volta, naviga verso MainTabs
              if (isMandatory) {
                navigation.navigate('MainTabs');
              }
            }
          }
        ]
      );
      
    } catch (error) {
      __DEV__ && console.error('Errore nel salvataggio del profilo:', error);
      Alert.alert('Errore', 'Impossibile salvare il profilo');
    } finally {
      setSaving(false);
    }
  };

  // Salva il cellulare
  const handleSaveCellulare = async () => {
    if (!tempCellulare.trim()) {
      Alert.alert('Errore', 'Il numero di cellulare è obbligatorio');
      return;
    }
    
    if (!/^[0-9]{10,15}$/.test(tempCellulare)) {
      Alert.alert('Errore', 'Inserisci un numero di cellulare valido');
      return;
    }
    
    try {
      setSaving(true);
      setCellulare(tempCellulare);
      
      await updateDoc(doc(db, 'users', user.uid), {
        cellulare: tempCellulare
      });
      
      Alert.alert('Successo', 'Numero di cellulare aggiornato con successo');
      setChangingCellulare(false);
    } catch (error) {
      __DEV__ && console.error('Errore nel salvataggio del cellulare:', error);
      Alert.alert('Errore', 'Impossibile salvare il numero di cellulare');
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
      __DEV__ && console.error('Errore nel cambio password:', error);
      
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
      
      // Aggiorna email nel database
      await updateDoc(doc(db, 'users', user.uid), {
        email: newEmail
      });
      
      Alert.alert(
        'Successo', 
        'Email cambiata con successo.'
      );
      
      setEmail(newEmail);
      setNewEmail('');
      setEmailPassword('');
      setChangingEmail(false);
    } catch (error) {
      __DEV__ && console.error('Errore nel cambio email:', error);
      
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Errore', 'La password non è corretta');
      } else if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Errore', 'Questa email è già in uso da un altro account');
      } else {
        Alert.alert('Errore', 'Impossibile cambiare l\'email');
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { marginTop: (styles.title?.marginTop ?? 0) + (insets.top + 8) / 2 }]}>Il Tuo Profilo</Text>
        
        {isMandatory && (
          <Text style={[styles.mandatoryText, { marginTop: (styles.mandatoryText?.marginTop ?? 0) + 2 }]}>
            Completa il tuo profilo per continuare
          </Text>
        )}
        
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
              <TouchableOpacity 
                style={styles.changeButton}
                onPress={() => setChangingEmail(!changingEmail)}
              >
                <Text style={styles.changeButtonText}>
                  {changingEmail ? 'Annulla' : 'Cambia'}
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
            
            {isMandatory ? (
              // Modalità obbligatoria: mostra direttamente il campo di input
              <View>
                <TextInput
                  style={[styles.input, errors.cellulare && styles.inputError]}
                  value={cellulare}
                  onChangeText={setCellulare}
                  keyboardType="phone-pad"
                  placeholder="Inserisci il tuo numero di cellulare"
                />
                {errors.cellulare && <Text style={styles.errorText}>{errors.cellulare}</Text>}
              </View>
            ) : changingCellulare ? (
              // Modalità modifica: mostra campo di input con pulsanti Conferma/Annulla
              <View>
                <TextInput
                  style={[styles.input, errors.cellulare && styles.inputError]}
                  value={tempCellulare}
                  onChangeText={setTempCellulare}
                  keyboardType="phone-pad"
                  placeholder="Inserisci il tuo numero di cellulare"
                />
                {errors.cellulare && <Text style={styles.errorText}>{errors.cellulare}</Text>}
                
                <View style={styles.buttonRow}>
                  <TouchableOpacity 
                    style={[styles.confirmButton, styles.halfButton]}
                    onPress={handleSaveCellulare}
                  >
                    <Text style={styles.confirmButtonText}>Conferma</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.cancelButton, styles.halfButton]}
                    onPress={() => setChangingCellulare(false)}
                  >
                    <Text style={styles.cancelButtonText}>Annulla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Modalità visualizzazione: mostra il valore con pulsante Cambia
              <View style={styles.cellulareContainer}>
                <Text style={styles.cellulareText}>{cellulare || 'Non impostato'}</Text>
                <TouchableOpacity 
                  style={styles.changeButton}
                  onPress={() => {
                    setChangingCellulare(true);
                    setTempCellulare(cellulare);
                  }}
                >
                  <Text style={styles.changeButtonText}>Cambia</Text>
                </TouchableOpacity>
              </View>
            )}
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
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.confirmButtonText}>Conferma Cambio Password</Text>
                )}
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
              <Text style={styles.sectionTitle}>Titolare del Trattamento</Text>
              <Text style={styles.paragraph}>
                <Text style={styles.bold}>A.S.D. T.C. CAPACI</Text>
                {"\n"}Indirizzo sede legale • P.IVA/CF • Email dedicata alla privacy • Tel.
              </Text>

              <Text style={styles.sectionTitle}>Finalità del Trattamento</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Gestione account utente:</Text> Creazione e mantenimento del profilo per l'accesso ai servizi.
                </Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Prenotazione campi:</Text> Gestione calendario, orari e conferme prenotazioni.
                </Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Comunicazioni di servizio:</Text> Invio di notifiche relative alle prenotazioni, agli inviti o alle modifiche tecniche.
                </Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Sicurezza:</Text> Prevenzione di frodi o usi impropri della piattaforma.
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Dati Raccolta</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Dati anagrafici (nome, cognome)</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Email e numero di cellulare (obbligatori per il servizio)</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Credenziali di autenticazione (gestite da Firebase)</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Storico prenotazioni e preferenze (orari, campi selezionati)</Text>
              </View>

              <Text style={styles.sectionTitle}>Base Giuridica</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Esecuzione di un contratto (art. 6.1.b GDPR) per le finalità essenziali (prenotazioni, account).
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Destinatari dei Dati</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Fornitori esterni (Google Firebase) per hosting e autenticazione.</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Società di gestione pagamenti (se aggiunte in futuro).</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Autorità competenti (solo se richiesto per obblighi di legge).</Text>
              </View>

              <Text style={styles.sectionTitle}>Trasferimenti extra-UE</Text>
              <Text style={styles.paragraph}>
                Firebase potrebbe trasferire dati fuori dall'UE, ma solo verso Paesi con adequatie decision (Privacy Shield invalido, ma clausole contrattuali standard).
              </Text>

              <Text style={styles.sectionTitle}>Conservazione Dati</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Account attivi:</Text> fino alla cancellazione da parte dell'utente.
                </Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Storico prenotazioni:</Text> 24 mesi (obblighi contabili).
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Diritti dell'Utente</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Accesso, rettifica, cancellazione (diritto all'oblio)</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Portabilità dati (formato strutturato)</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Revoca del consenso in qualsiasi momento</Text>
              </View>

              <Text style={styles.sectionTitle}>Modalità di Esercizio Diritti</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Richiesta via email all'indirizzo dedicato alla privacy</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Risposta entro 30 giorni</Text>
              </View>

              <Text style={styles.sectionTitle}>Sicurezza</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Crittografia end-to-end per le comunicazioni</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Accessi riservati al personale autorizzato</Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Backup sicuri e protocolli anti-breach</Text>
              </View>

              <Text style={styles.sectionTitle}>Consenso al Trattamento Dati Personali</Text>
              <Text style={styles.paragraph}>
                "Acconsento al trattamento dei miei dati personali da parte di A.S.D. T.C. CAPACI per:
              </Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  La gestione del mio account e delle prenotazioni (necessario)
                </Text>
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  L'invio di comunicazioni via app, via email o SMS
                </Text>
              </View>
              <Text style={styles.paragraph}>
                Sono consapevole dei miei diritti (privacy policy completa consegnata brevi manu agli associati)."
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
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100, // Aumentato il padding bottom per garantire spazio sufficiente
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
    marginBottom: 8,
    textAlign: 'center',
  },
  mandatoryText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  emailText: {
    fontSize: 16,
    color: '#6b7280',
    flex: 1,
  },
  cellulareContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  cellulareText: {
    fontSize: 16,
    color: '#6b7280',
    flex: 1,
  },
  changeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  passwordButton: {
    backgroundColor: ' #f3f4f6',
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
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  halfButton: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#6b7280',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
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
    backgroundColor: '#f3f4f6',
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
    color: '##1e293b',
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
  // Stili per la formattazione del testo della privacy
  paragraph: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
    color: '#374151',
  },
  bulletContainer: {
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 10,
    fontSize: 14,
    marginRight: 5,
    color: '#374151',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  bold: {
    fontWeight: 'bold',
  },
});

export default ProfiloScreen;


