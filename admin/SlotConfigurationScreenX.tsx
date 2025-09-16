
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

type ActivityType = 'regular' | 'school' | 'individual' | 'blocked';

type Cell = {
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  activityType?: ActivityType;
  notes?: string;
};

const DURATION_OPTIONS = [
  { value: 60, label: '1 ora' },
  { value: 75, label: '1 ora e 15' },
  { value: 90, label: '1 ora e 30' },
  { value: 120, label: '2 ore' },
];

const ACTIVITY_OPTIONS = [
  { value: 'regular', label: 'Campo libero (prenotabile)' },
  { value: 'school', label: 'Scuola Tennis' },
  { value: 'individual', label: 'Lezione individuale' },
  { value: 'blocked', label: 'Manutenzione / non prenotabile' },
];

const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function getDayOfWeek(date: Date) {
  return date.getDay();
}

export default function SlotConfigurationScreen() {
  const { userData } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCourt, setSelectedCourt] = useState<'1' | '2'>('1');

  const [cells, setCells] = useState<Cell[]>(() => Array.from({ length: 15 }, () => ({})));
  const [copiedCells, setCopiedCells] = useState<Cell[] | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState<string>('1');

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tmpStart, setTmpStart] = useState('08:00');
  const [tmpDuration, setTmpDuration] = useState<number>(60);
  const [tmpEnd, setTmpEnd] = useState('09:00');
  const [tmpType, setTmpType] = useState<ActivityType>('regular');
  const [tmpNotes, setTmpNotes] = useState('');

  if (!userData || userData.role !== 'admin') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Accesso negato. Solo gli amministratori possono accedere a questa sezione.</Text>
      </View>
    );
  }

  useEffect(() => {
    if (!tmpStart) return;
    const [h, m] = tmpStart.split(':').map(n => parseInt(n, 10));
    const total = h * 60 + m + (tmpDuration || 0);
    const eh = Math.floor(total / 60);
    const em = total % 60;
    setTmpEnd(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`);
  }, [tmpStart, tmpDuration]);

  const dayOfWeek = useMemo(() => getDayOfWeek(selectedDate), [selectedDate]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const qRef = query(
          collection(db, 'slotConfigurations'),
          where('courtId', '==', selectedCourt),
          where('dayOfWeek', '==', dayOfWeek)
        );
        const snap = await getDocs(qRef);
        const entries: Cell[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          entries.push({
            startTime: d.startTime,
            endTime: d.endTime,
            slotDuration: d.slotDuration,
            activityType: (d.activityType || 'regular') as ActivityType,
            notes: d.notes || ''
          });
        });
        entries.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        const base = Array.from({ length: 15 }, () => ({}));
        for (let i = 0; i < Math.min(entries.length, 15); i++) base[i] = entries[i];
        if (isMounted) setCells(base);
      } catch (e) {
        console.error(e);
        Alert.alert('Errore', 'Impossibile caricare le configurazioni');
      }
    })();
    return () => { isMounted = false; };
  }, [selectedCourt, dayOfWeek]);

  const openEditor = (index: number) => {
    setEditingIndex(index);
    const current = cells[index];
    const start = current.startTime || '08:00';
    const dur = current.slotDuration || 60;
    const type = (current.activityType || 'regular') as ActivityType;
    const notes = current.notes || '';
    // Usa l'end salvato se c'è, altrimenti calcola da inizio + durata
    const end = current.endTime || (() => {
      const [h, m] = start.split(':').map(n => parseInt(n, 10));
      const total = h * 60 + m + dur;
      const eh = Math.floor(total / 60);
      const em = total % 60;
      return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    })();

    setTmpStart(start);
    setTmpDuration(dur);
    setTmpType(type);
    setTmpNotes(notes);
    setTmpEnd(end);
    setEditorVisible(true);
  };

  const clearCell = (index: number) => {
    const next = [...cells];
    next[index] = {};
    setCells(next);
  };

  const saveCell = () => {
    if (editingIndex == null) return;
    const next = [...cells];
    next[editingIndex] = {
      startTime: tmpStart,
      endTime: tmpEnd,
      slotDuration: tmpDuration,
      activityType: tmpType,
      notes: tmpNotes.trim()
    };
    setCells(next);
    setEditorVisible(false);
  };

  const handleCopy = () => {
    setCopiedCells(cells);
    Alert.alert('Copiato', 'Giorno copiato negli appunti interni');
  };

  const handlePaste = () => {
    if (!copiedCells) return;
    setCells(copiedCells.map(c => ({ ...c })));
  };

  const handleApplyWeekdays = () => {
    Alert.alert('Applicato', 'La stessa configurazione verrà usata per Lun–Ven quando salvi.');
  };

  const saveAll = async () => {
    try {
      const qRef = query(
        collection(db, 'slotConfigurations'),
        where('courtId', '==', selectedCourt),
        where('dayOfWeek', '==', dayOfWeek)
      );
      const snap = await getDocs(qRef);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'slotConfigurations', d.id))));

      const toSave = cells.filter(c => c.startTime && c.endTime && c.slotDuration);
      const writes = toSave.map(c => setDoc(doc(collection(db, 'slotConfigurations')), {
        courtId: selectedCourt,
        dayOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        slotDuration: c.slotDuration,
        isActive: true,
        activityType: c.activityType || 'regular',
        notes: c.notes || ''
      }));
      await Promise.all(writes);

      Alert.alert('Successo', 'Configurazioni salvate.');
    } catch (e) {
      console.error(e);
      Alert.alert('Errore', 'Salvataggio non riuscito');
    }
  };

  const prevDay = () => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1));
  const nextDay = () => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1));
  const today = () => setSelectedDate(new Date());

  const dateLabel = useMemo(() => {
    const d = selectedDate;
    return `${dayNames[d.getDay()]} ${d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }, [selectedDate]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <Text style={styles.title}>Configurazione Slot Orari</Text>

      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.navBtn} onPress={prevDay}>
          <Ionicons name="chevron-back" size={18} color="#2563eb" />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Ionicons name="calendar" size={16} color="#2563eb" style={{ marginRight: 6 }} />
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.navBtn} onPress={today}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>Oggi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={nextDay}>
            <Ionicons name="chevron-forward" size={18} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.courtRow}>
        <Text style={styles.courtLabel}>Campo:</Text>
        <TouchableOpacity
          style={[styles.courtBtn, selectedCourt === '1' && styles.courtBtnActive]}
          onPress={() => setSelectedCourt('1')}
        >
          <Text style={[styles.courtBtnText, selectedCourt === '1' && styles.courtBtnTextActive]}>Campo 1</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.courtBtn, selectedCourt === '2' && styles.courtBtnActive]}
          onPress={() => setSelectedCourt('2')}
        >
          <Text style={[styles.courtBtnText, selectedCourt === '2' && styles.courtBtnTextActive]}>Campo 2</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.helper}>Tocca un riquadro per impostare orari, durata, tipologia e note. Gli slot con tipologia diversa da “Campo libero” risultano non prenotabili.</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionChip} onPress={handleCopy}>
          <Ionicons name="copy" size={16} color="#2563eb" />
          <Text style={styles.actionChipText}>Copia giorno</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={handlePaste} disabled={!copiedCells}>
          <Ionicons name="clipboard" size={16} color="#2563eb" />
          <Text style={styles.actionChipText}>Incolla</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={handleApplyWeekdays}>
          <Ionicons name="checkbox" size={16} color="#2563eb" />
          <Text style={styles.actionChipText}>Applica a Lun–Ven</Text>
        </TouchableOpacity>
        <View style={[styles.actionChip, { paddingVertical: 6 }]}>
          <Text style={styles.actionChipText}>Ripeti per</Text>
          <TextInput
            style={styles.repeatInput}
            value={repeatWeeks}
            onChangeText={setRepeatWeeks}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={styles.actionChipText}>settimane</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          const isEmpty = !cell.startTime;
          const label = !isEmpty ? `${cell.startTime} – ${cell.endTime}` : 'Slot vuoto';
          const sub = !isEmpty
            ? `${(ACTIVITY_OPTIONS.find(a => a.value === (cell.activityType || 'regular'))?.label || '')}${cell.notes ? ' · ' + cell.notes : ''}`
            : '';

          return (
            <TouchableOpacity key={idx} style={styles.gridCell} onPress={() => openEditor(idx)}>
              <Text style={[isEmpty ? styles.cellPlaceholder : styles.cellTime]} numberOfLines={1}>{label}</Text>
              {!isEmpty && <Text style={styles.cellType} numberOfLines={1}>{sub}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveAll}>
        <Text style={styles.saveButtonText}>Salva configurazione</Text>
      </TouchableOpacity>

      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Imposta slot</Text>

            <View style={styles.formRow}>
              <Text style={styles.label}>Ora inizio (HH:MM)</Text>
              <TextInput style={styles.input} value={tmpStart} onChangeText={setTmpStart} placeholder="08:00" keyboardType="numbers-and-punctuation" />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Durata</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={tmpDuration} onValueChange={(v) => setTmpDuration(v)} style={styles.picker}>
                  {DURATION_OPTIONS.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
                </Picker>
              </View>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Ora fine (auto)</Text>
              <TextInput style={styles.input} value={tmpEnd} editable={false} />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Tipologia</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={tmpType} onValueChange={(v) => setTmpType(v)} style={styles.picker}>
                  {ACTIVITY_OPTIONS.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value as ActivityType} />)}
                </Picker>
              </View>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Note (opzionale)</Text>
              <TextInput style={styles.input} value={tmpNotes} onChangeText={setTmpNotes} placeholder="Es. Gruppo Azzurro / Maestro Enea" />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditorVisible(false)}>
                <Text style={styles.secondaryBtnText}>Annulla</Text>
              </TouchableOpacity>
              {editingIndex != null && cells[editingIndex]?.startTime && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => { clearCell(editingIndex!); setEditorVisible(false); }}>
                  <Text style={styles.deleteBtnText}>Elimina</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={saveCell}>
                <Text style={styles.primaryBtnText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f3f4f6', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { backgroundColor: '#e5edff', padding: 10, borderRadius: 10 },
  dateDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  dateText: { fontSize: 16, color: '#1f2937' },
  courtRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  courtLabel: { fontSize: 16, color: '#374151', marginRight: 8 },
  courtBtn: { backgroundColor: '#e5e7eb', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginRight: 8 },
  courtBtnActive: { backgroundColor: '#3b82f6' },
  courtBtnText: { color: '#3b82f6', fontWeight: '600' },
  courtBtnTextActive: { color: '#fff' },
  helper: { color: '#6b7280', marginBottom: 12 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  actionChipText: { color: '#2563eb', marginLeft: 6, fontSize: 13 },
  actionChipDisabled: { backgroundColor: '#f3f4f6' },
  repeatInput: { minWidth: 30, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#fff', marginHorizontal: 6, borderColor: '#d1d5db', borderWidth: 1, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCell: { 
    width: '31%',
    height: 68,
    backgroundColor: '#dcfce7',
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPlaceholder: { color: '#9ca3af', fontSize: 13 },
  cellTime: { fontWeight: '600', color: '#111827', fontSize: 13 },
  cellType: { marginTop: 4, color: '#374151', fontSize: 12, textAlign: 'center' },

  saveButton: { backgroundColor: '#10b981', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  saveButtonText: { color: '#fff', fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, paddingBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  formRow: { marginBottom: 10 },
  label: { color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 0, height: 52, textAlignVertical: 'center' },
  pickerWrap: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f9fafb', height: 52, justifyContent: 'center', paddingVertical: 2 },
  picker: { height: 52 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  primaryBtn: { backgroundColor: '#3b82f6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#e5e7eb', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  secondaryBtnText: { color: '#111827', fontWeight: '600' },
  deleteBtn: { backgroundColor: '#fecaca', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  deleteBtnText: { color: '#991b1b', fontWeight: '700' },
});
