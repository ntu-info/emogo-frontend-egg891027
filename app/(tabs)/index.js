import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator, PanResponder, ScrollView, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; 
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { db, dbAll, dbRun, ensureSchema } from '../../utils/db'; // Ensure path is correct: ../../utils/db
import * as Notifications from 'expo-notifications';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

// --- 1. Notification Configuration ---
// Use non-deprecated handler keys: shouldShowBanner / shouldShowList
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Database operations are provided by utils/db

// Mood Constants
const moodTicks = [0, 20, 40, 60, 80, 100];
const moodLabels = ['Very Bad', 'Bad', 'Neutral', 'Good', 'Very Good'];

// --- Helper: Scroll Picker Component for Time ---
function AddReminderRow({ onAdd }) {
    const [hour, setHour] = useState(9);
    const [minute, setMinute] = useState(0);
    const [showPicker, setShowPicker] = useState(false);
    const [tempH, setTempH] = useState(hour);
    const [tempM, setTempM] = useState(minute);
    
    const ITEM_HEIGHT = 40; 
    
    const openPicker = () => {
      setTempH(hour);
      setTempM(minute);
      setShowPicker(true);
    };
  
    const confirmPicker = () => {
      setHour(tempH);
      setMinute(tempM);
      setShowPicker(false);
      onAdd(tempH, tempM);
    };
  
    const onHourScroll = (event) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        setTempH(Math.max(0, Math.min(23, index)));
    };

    const onMinuteScroll = (event) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        setTempM(Math.max(0, Math.min(59, index)));
    };
  
    return (
      <View style={{marginTop:8}}>
        <View style={{flexDirection:'row', alignItems:'center', justifyContent: 'space-between'}}>
          <Text style={{color: '#666'}}>Set Time:</Text>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity style={styles.timeDisplay} onPress={openPicker}>
              <Text style={{fontWeight:'700', fontSize:18}}>{String(hour).padStart(2,'0')}:{String(minute).padStart(2,'0')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addTimeBtn} onPress={() => onAdd(hour, minute)}>
                <MaterialIcons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
  
        <Modal visible={showPicker} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}><Text style={{color:'#666'}}>Cancel</Text></TouchableOpacity>
                <Text style={{fontWeight:'700'}}>Select Time</Text>
                <TouchableOpacity onPress={confirmPicker}><Text style={{color:'#4e944f', fontWeight:'700'}}>Confirm</Text></TouchableOpacity>
              </View>
              <View style={styles.pickerBody}>
                {/* Hour Wheel */}
                <View style={styles.wheelContainer}>
                    <Text style={styles.wheelLabel}>Hour</Text>
                    <ScrollView snapToInterval={ITEM_HEIGHT} showsVerticalScrollIndicator={false} onMomentumScrollEnd={onHourScroll} style={{height: ITEM_HEIGHT * 3}} contentContainerStyle={{paddingVertical: ITEM_HEIGHT}}>
                        {Array.from({length:24}).map((_, i) => (
                            <View key={i} style={{height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center'}}>
                                <Text style={{fontSize: 20, fontWeight: i === tempH ? 'bold' : 'normal'}}>{String(i).padStart(2,'0')}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
                <Text style={{fontSize: 24, fontWeight: 'bold', marginTop: 20}}>:</Text>
                {/* Minute Wheel */}
                <View style={styles.wheelContainer}>
                    <Text style={styles.wheelLabel}>Minute</Text>
                    <ScrollView snapToInterval={ITEM_HEIGHT} showsVerticalScrollIndicator={false} onMomentumScrollEnd={onMinuteScroll} style={{height: ITEM_HEIGHT * 3}} contentContainerStyle={{paddingVertical: ITEM_HEIGHT}}>
                        {Array.from({length:60}).map((_, i) => (
                            <View key={i} style={{height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center'}}>
                                <Text style={{fontSize: 20, fontWeight: i === tempM ? 'bold' : 'normal'}}>{String(i).padStart(2,'0')}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
              </View>
              <View style={styles.pickerSelectionOverlay} pointerEvents="none" />
            </View>
          </View>
        </Modal>
      </View>
    );
}

// --- Main Component ---
export default function UnifiedTracker() {
  const router = useRouter(); 
  // Steps: 1 = Info & Notifications, 2 = Vlog & Save
  const [step, setStep] = useState(1);
  // Form State
  const [name, setName] = useState('');
  const [mood, setMood] = useState(50);
  const [activity, setActivity] = useState('');
  // Vlog State
  const [videoUri, setVideoUri] = useState(null);
  const [vlogRecorded, setVlogRecorded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState('front');
  const [isSaving, setIsSaving] = useState(false);
  // Notification State
  const [remindersList, setRemindersList] = useState([]);
  const REMINDERS_FILE = FileSystem.documentDirectory + 'emogo_reminders.json';
  // Refs & Layout
  const cameraRef = useRef(null);
  const [trackLayout, setTrackLayout] = useState({ x: 0, width: 0 });
  const pan = useRef(null);
  const trackRef = useRef(null);
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicrophonePerm] = useMicrophonePermissions();

  // --- Initialization ---
  useEffect(() => {
    // Ensure DB schema exists before anything else
    ensureSchema().catch(e => console.error("DB Schema Init Failed:", e));
    // Load Reminders
    loadRemindersFromFile();
  }, []);

  // --- Notification Logic ---
  const loadRemindersFromFile = async () => {
    try {
      const info = await FileSystem.getInfoAsync(REMINDERS_FILE);
      if (info.exists) {
        const txt = await FileSystem.readAsStringAsync(REMINDERS_FILE);
        setRemindersList(JSON.parse(txt || '[]'));
      }
    } catch (e) { console.warn('Load reminders failed', e); }
  };

  const saveRemindersToFile = async (list) => {
    try {
      await FileSystem.writeAsStringAsync(REMINDERS_FILE, JSON.stringify(list));
      setRemindersList(list);
    } catch (e) { console.warn('Save reminders failed', e); }
  };

  // --- FIX: Ensure Numbers for Trigger Time ---
  const addReminder = async (h, m) => {
    // 1. Force cast to integer (CRITICAL FIX)
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);

    if (isNaN(hour) || isNaN(minute)) {
        Alert.alert('Error', 'Invalid time format');
        return;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission', 'Notifications permission required'); return; }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { 
            title: 'EmoGo Reminder', 
            body: `Time to record your mood & vlog! (${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')})`,
            sound: true,
        },
        trigger: { 
            hour: hour, 
            minute: minute, 
            repeats: true 
        }
      });

      const newItem = { id: Date.now(), hour: hour, minute: minute, notificationId: id };
      const newList = [...remindersList, newItem];
      await saveRemindersToFile(newList);
      Alert.alert('Success', `Reminder set for ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
    } catch (e) {
      console.error('[Debug] Schedule failed:', e);
      Alert.alert('Error', e.message);
    }
  };

  const removeReminder = async (item) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(item.notificationId);
      const newList = remindersList.filter(r => r.id !== item.id);
      await saveRemindersToFile(newList);
    } catch (e) { console.warn('Remove failed', e); }
  };

  // --- Mood Slider Logic ---
  useEffect(() => {
    pan.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (!trackLayout.width) return;
        const pageX = evt.nativeEvent.pageX != null ? evt.nativeEvent.pageX : evt.nativeEvent.locationX;
        const pad = 12; 
        const inner = Math.max(0, trackLayout.width - pad * 2);
        const rel = Math.max(0, Math.min(inner, pageX - (trackLayout.x + pad)));
        const ratio = inner > 0 ? rel / inner : 0;
        setMood(Math.round(ratio * 100));
      },
      onPanResponderRelease: () => {}
    });
  }, [trackLayout.width, trackLayout.x]);

  const moodLabelFor = (score) => {
    const idx = Math.min(moodLabels.length - 1, Math.floor(score / 20));
    return moodLabels[idx] || '';
  };
  const thumbLeftPx = trackLayout.width ? (12 + (Math.max(0, Math.min(100, mood)) / 100) * Math.max(0, trackLayout.width - 24)) : 0;

  // --- Navigation & Actions ---
  const goNext = () => {
      if (!name.trim()) { Alert.alert('Missing Info', 'Please enter your name'); return; }
      if (!activity.trim()) { Alert.alert('Missing Info', 'Please describe what you are doing'); return; }
      setStep(2);
  };
  const goBack = () => { setStep(1); };
  const toggleCameraFacing = () => setFacing(c => (c === 'back' ? 'front' : 'back'));

  const recordVlog = async () => {
    if (!cameraPerm?.granted || !micPerm?.granted) {
      const c = await requestCameraPerm();
      const m = await requestMicrophonePerm();
      if (!c.granted || !m.granted) return;
    }
    if (cameraRef.current) {
      setIsRecording(true);
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 1, quality: '480p' });
        if (video.uri) {
          try { await MediaLibrary.saveToLibraryAsync(video.uri); } catch (e) {}
          setVideoUri(video.uri);
          setVlogRecorded(true);
        }
      } catch(e) { console.log(e); } finally { setIsRecording(false); }
    }
  };

  const saveAll = async () => {
      if (!videoUri) { Alert.alert('Vlog Missing', 'Please record a vlog first.'); return; }
      setIsSaving(true);
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission', 'Location needed'); setIsSaving(false); return; }
        const loc = await Location.getCurrentPositionAsync({});
        const moodLabel = moodLabelFor(mood);
        const timestamp = new Date().toISOString();

        // Save to DB 
        await dbRun(
            'INSERT INTO records (name, mood_label, mood_score, activity, video_uri, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
            [name.trim(), moodLabel, mood, activity.trim(), videoUri, loc.coords.latitude, loc.coords.longitude, timestamp]
        );

        Alert.alert('Success', 'Entry Saved!', [
            { text: 'OK', onPress: () => {
                setName('');
                setActivity('');
                setMood(50);
                setVideoUri(null);
                setVlogRecorded(false);
                setStep(1); 
                router.push('/(tabs)/history'); 
            }}
        ]);
      } catch (e) {
          Alert.alert('Error', 'Save failed: ' + e.message);
          console.error(e);
      } finally { setIsSaving(false); }
  };

  return (
    <View style={styles.container}>
      {/* Global Status Bar Setting (Black background) */}
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* --- HEADER --- */}
      <SafeAreaView style={{backgroundColor: '#fff'}}>
        <View style={styles.header}>
            <Text style={styles.headerTitle}>EmoGo Tracker</Text>
            {/* Link to History page */}
            <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/(tabs)/history')}>
                <Text style={styles.historyText}>History</Text>
                <MaterialIcons name="history" size={24} color="#4e944f" />
            </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* === STEP 1: INFO & NOTIFICATIONS === */}
        {step === 1 && (
            <View>
                {/* Name */}
                <View style={styles.card}>
                    <Text style={styles.label}>1. Who are you?</Text>
                    <TextInput style={styles.input} placeholder="Enter Name" value={name} onChangeText={setName} />
                </View>
                {/* Mood */}
                <View style={styles.card}>
                    <Text style={styles.label}>2. How do you feel? ({mood})</Text>
                    <Text style={{textAlign:'center', color:'#4e944f', fontWeight:'bold', marginBottom:10}}>{moodLabelFor(mood)}</Text>
                    <View style={{height: 40, justifyContent:'center'}} ref={trackRef} onLayout={() => { if (trackRef.current) { trackRef.current.measureInWindow((x, y, w, h) => setTrackLayout({x, width: w})); } }} {...(pan.current ? pan.current.panHandlers : {})}>
                        <View style={styles.sliderTrack}><View style={[styles.sliderFill, {width: `${mood}%`}]} /></View>
                        <View style={[styles.thumb, {left: thumbLeftPx}]} pointerEvents="none" />
                    </View>
                </View>
                {/* Activity */}
                <View style={styles.card}>
                    <Text style={styles.label}>3. What are you doing?</Text>
                    <TextInput style={styles.input} placeholder="e.g., Coding, Eating..." value={activity} onChangeText={setActivity} />
                </View>

                {/* Notifications (Rolling Wheel) */}
                <View style={styles.card}>
                    <Text style={styles.label}>Daily Reminders</Text>
                    {remindersList.length === 0 && <Text style={{color:'#999', fontStyle:'italic', marginBottom:10}}>No reminders set.</Text>}
                    {remindersList.map((r) => (
                        <View key={r.id} style={styles.reminderItem}>
                            <Text style={styles.reminderText}>{String(r.hour).padStart(2,'0')}:{String(r.minute).padStart(2,'0')}</Text>
                            <TouchableOpacity onPress={() => removeReminder(r)}><MaterialIcons name="delete" size={20} color="#d9534f" /></TouchableOpacity>
                        </View>
                    ))}
                    <AddReminderRow onAdd={addReminder} />
                </View>

                {/* Next Button */}
                <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                    <Text style={styles.btnText}>Next: Record Vlog</Text>
                    <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
            </View>
        )}

        {/* === STEP 2: VLOG & SAVE === */}
        {step === 2 && (
            <View>
                <View style={[styles.card, {height: 400}]}>
                    <Text style={styles.label}>4. Record 1s Vlog</Text>
                    <View style={styles.cameraContainer}>
                        {!cameraPerm?.granted ? ( <View style={styles.placeholder}><Text>No Camera Permission</Text></View> ) : ( <CameraView ref={cameraRef} style={{flex:1}} facing={facing} mode="video" /> )}
                        <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}><MaterialIcons name="flip-camera-ios" size={24} color="#fff" /></TouchableOpacity>
                    </View>
                    
                    <TouchableOpacity 
                        style={[styles.recordBtn, isRecording && {backgroundColor:'red'}, vlogRecorded && {backgroundColor:'#4e944f'}]} 
                        onPress={recordVlog}
                        disabled={isRecording}
                    >
                        <Text style={styles.btnText}>{isRecording ? 'Recording...' : vlogRecorded ? 'Re-record Vlog' : 'Start Recording'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.step2Actions}>
                    <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={isSaving}><Text style={{color:'#666'}}>Back</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, (!vlogRecorded || isSaving) && {backgroundColor:'#ccc'}]} onPress={saveAll} disabled={!vlogRecorded || isSaving}>
                        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Entry</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  header: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  historyLink: { flexDirection: 'row', alignItems: 'center' },
  historyText: { marginRight: 5, color: '#4e944f', fontWeight: '600' },
  scrollContent: { padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:5, elevation:2 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  input: { borderWidth: 1, borderColor: '#eee', backgroundColor:'#fafafa', borderRadius: 8, padding: 12, fontSize: 16 },
  sliderTrack: { height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden' },
  sliderFill: { height: 10, backgroundColor: '#4e944f' },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 2, borderColor: '#4e944f', top: -5, marginLeft: -10 },
  nextBtn: { backgroundColor: '#333', flexDirection: 'row', justifyContent:'center', alignItems:'center', padding: 15, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginRight: 5 },
  cameraContainer: { flex: 1, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee' },
  flipBtn: { position: 'absolute', top: 10, right: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  recordBtn: { backgroundColor: '#ff9800', padding: 15, borderRadius: 10, alignItems: 'center' },
  step2Actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 30 },
  backBtn: { padding: 15 },
  saveBtn: { backgroundColor: '#4e944f', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, minWidth: 150, alignItems:'center' },
  reminderItem: { flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  reminderText: { fontSize: 16, color: '#555' },
  timeDisplay: { padding: 8, backgroundColor: '#f9f9f9', borderRadius: 6, borderWidth: 1, borderColor: '#eee' },
  addTimeBtn: { backgroundColor: '#4e944f', padding: 8, borderRadius: 6, marginLeft: 10 },
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  pickerBody: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 150 },
  wheelContainer: { width: 80, height: 120, overflow: 'hidden' },
  wheelLabel: { textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 5 },
  pickerSelectionOverlay: { position: 'absolute', top: 60 + 20, left: 0, right: 0, height: 40, backgroundColor: 'rgba(0,0,0,0.05)', zIndex: -1 },
});