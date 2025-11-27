import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert, TextInput, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';

// Initialize database
let db;
try {
  db = SQLite.openDatabaseSync('emogo.db');
} catch (e) {
  console.log("Error opening DB:", e);
}

const faces = [
  { value: 1, label: 'Very Good', color: '#7ed957' },
  { value: 2, label: 'Good', color: '#b6e36c' },
  { value: 3, label: 'Neutral', color: '#ffe066' },
  { value: 4, label: 'Bad', color: '#ffb347' },
  { value: 5, label: 'Very Bad', color: '#ff5c5c' },
];

export default function UnifiedTracker() {
  // --- State Management ---
  const [name, setName] = useState(''); 
  const [selectedMood, setSelectedMood] = useState(null);
  // Location state is no longer needed for display, but we fetch it during save
  const [vlogRecorded, setVlogRecorded] = useState(false); 
  
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // New: Loading state for GPS fetch
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState('front');

  const cameraRef = useRef(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();

  // Initialize ONE table
  useEffect(() => {
    if (db) {
      try {
        db.execSync(`
          CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT,
            sentiment TEXT, 
            latitude REAL, 
            longitude REAL, 
            timestamp TEXT
          );
        `);
      } catch (e) {
        console.error("Table creation failed:", e);
      }
    }
  }, []);

  // Clear all data
  const clearAllData = async () => {
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM records;');
      await db.runAsync("DELETE FROM sqlite_sequence WHERE name='records';");
      Alert.alert('Data Cleared', 'All records removed.');
      resetForm();
    } catch (e) {
      Alert.alert('Clear Failed', e.message);
    }
  };

  const resetForm = () => {
    setName(''); 
    setSelectedMood(null);
    setVlogRecorded(false);
    setIsSaved(false);
    setIsSaving(false);
  };

  const toggleCameraFacing = () => setFacing(c => (c === 'back' ? 'front' : 'back'));
  
  const handleMoodSelect = (value) => {
    if (isSaved) return; 
    setSelectedMood(value);
  };

  // Removed independent getGPS function

  const recordVlog = async () => {
    if (isSaved) return;
    if (!cameraPerm?.granted || !micPerm?.granted || !mediaPerm?.granted) {
      if (!cameraPerm?.granted) await requestCameraPerm();
      if (!micPerm?.granted) await requestMicPerm();
      if (!mediaPerm?.granted) await requestMediaPerm();
      return;
    }
    if (cameraRef.current) {
      setIsRecording(true);
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 1, quality: '480p' });
        if (video.uri) {
          await MediaLibrary.saveToLibraryAsync(video.uri);
          setVlogRecorded(true);
          Alert.alert("Vlog Recorded", "Video saved to gallery.");
        }
      } catch(e){} finally { setIsRecording(false); }
    }
  };

  // Helper: Format Date
  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  // 4. SAVE ENTRY (Now includes GPS capture)
  const saveEntry = async () => {
    // 1. Validation Checks
    if (!name.trim()) { Alert.alert("Missing Info", "Please enter your name."); return; }
    if (selectedMood === null) { Alert.alert("Missing Info", "Please select a mood."); return; }
    // if (!vlogRecorded) { Alert.alert("Missing Info", "Please record a 1s vlog."); return; }
    
    // 2. Start Saving Process (Show loading)
    setIsSaving(true);

    try {
      // 3. Capture GPS
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { 
          setIsSaving(false);
          Alert.alert("Permission Denied", "Location permission is required to save."); 
          return; 
      }
      
      // Get location
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      const selectedMoodLabel = faces.find(f => f.value === selectedMood)?.label || '';
      const timestamp = new Date().toISOString();

      // 4. Write to DB
      if (db) {
        await db.runAsync(
          'INSERT INTO records (name, sentiment, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?);',
          [name, selectedMoodLabel, lat, lng, timestamp]
        );
        
        setIsSaved(true);
        setModalMessage(`Data Saved!\nLocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setModalVisible(true);
      }
    } catch (e) { 
        Alert.alert("Save Failed", e.message); 
    } finally {
        setIsSaving(false); // Stop loading
    }
  };

  // Export Data
  const exportAllData = async () => {
    if (!db) return;
    try {
      const rows = await db.getAllAsync('SELECT * FROM records ORDER BY timestamp DESC;');
      
      if (rows.length === 0) { 
          Alert.alert("No Data", "No records found in database. Please save an entry first."); 
          return; 
      }

      let csv = 'ID,NAME,SENTIMENT,LAT,LON,TIME\n';
      
      for (const row of rows) { 
        const formattedTime = formatDateTime(row.timestamp);
        csv += `${row.id},${row.name},${row.sentiment},${row.latitude},${row.longitude},${formattedTime}\n`; 
      }

      const fileName = 'emogo_records.csv';
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(fileUri); }
    } catch (e) { Alert.alert("Export Failed", e.message); }
  };

  return (
    <View style={styles.screen}>
      
      {/* Name Input Section */}
      <View style={styles.section}>
         <Text style={styles.sectionTitle}>Name</Text>
         <TextInput 
            style={styles.input} 
            placeholder="Enter your name" 
            value={name} 
            onChangeText={setName} 
            editable={!isSaved}
         />
      </View>

      {/* Mood Selection Section */}
      <View style={styles.section}>
         <Text style={styles.sectionTitle}>How do you feel?</Text>
         <View style={styles.moodRow}>
            {faces.map(face => (
                <TouchableOpacity 
                    key={face.value} 
                    style={[styles.faceBtn, {backgroundColor: selectedMood === face.value ? face.color : '#f4f4f4'}]} 
                    onPress={() => handleMoodSelect(face.value)} disabled={isSaved}>
                    <Text style={styles.faceText}>{face.label}</Text>
                </TouchableOpacity>
            ))}
         </View>
      </View>

      {/* Vlog Recording Section (Expanded) */}
      <View style={[styles.section, styles.vlogSection]}>
         <Text style={styles.sectionTitle}>Vlog</Text>
         <View style={styles.cameraContainer}>
            {(!cameraPerm?.granted) ? <View style={styles.cameraPlaceholder}><Text>Permission Needed</Text></View> : 
            <React.Fragment>
                <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video" />
                <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}><MaterialIcons name="flip-camera-ios" size={24} color="white"/></TouchableOpacity>
            </React.Fragment>
            }
         </View>
         <TouchableOpacity style={[styles.recordBtn, isRecording && {backgroundColor:'red'}, isSaved && styles.lockedBtn]} onPress={recordVlog} disabled={isRecording || isSaved}>
            <Text style={styles.actionBtnText}>{vlogRecorded ? 'Vlog Recorded (Ready)' : (isRecording ? 'Recording...' : 'Record 1s Vlog')}</Text>
         </TouchableOpacity>
      </View>

      {/* Save, Clear, Export Button Row */}
      <View style={styles.bottomIconRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.saveBtn, (isSaved || isSaving) && styles.lockedBtn]}
          onPress={saveEntry}
          disabled={isSaved || isSaving}
          accessibilityLabel={isSaved ? 'Entry Saved' : 'Save Entry'}
        >
          {/* Show loading spinner when saving GPS */}
          {isSaving ? (
             <ActivityIndicator size="small" color="#fff" />
          ) : (
             <Text style={styles.actionBtnText}>{isSaved ? 'Saved' : 'Save'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.clearBtn]}
          onPress={clearAllData}
          accessibilityLabel="Clear All"
        >
            <Text style={styles.actionBtnText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.exportBtn]}
          onPress={exportAllData}
          accessibilityLabel="Export CSV"
        >
            <Text style={styles.actionBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} transparent={true}><View style={styles.modalBg}><View style={styles.modalBox}><Text style={styles.modalText}>Success</Text><Text style={{textAlign:'center'}}>{modalMessage}</Text><Pressable style={styles.modalBtn} onPress={()=>setModalVisible(false)}><Text style={styles.btnText}>OK</Text></Pressable></View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', padding: 10, paddingTop: 20 },
  
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginBottom: 10 },
  
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa' },

  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  faceBtn: { width: 60, height: 45, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  faceText: { fontSize: 11, fontWeight: '600' },
  
  // Vlog section expanded (Min Height increased)
  vlogSection: { flex: 1, minHeight: 300 }, 
  cameraContainer: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', position: 'relative', minHeight: 200, marginBottom: 10 },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  flipButton: { position: 'absolute', top: 10, right: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  recordBtn: { backgroundColor: '#ffb347', padding: 12, borderRadius: 8, alignItems: 'center' },

  // Buttons
  actionBtn: { minWidth: 120, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginHorizontal: 7, shadowColor: "#000", shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2 },
  saveBtn: { backgroundColor: '#4e944f' }, // Make save button slightly larger/flexible
  clearBtn: { backgroundColor: '#d9534f' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
  lockedBtn: { backgroundColor: '#bbb' },

  bottomIconRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  exportBtn: { backgroundColor: '#333' },

  modalBg: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBox: { backgroundColor: '#fff', width: '80%', padding: 25, borderRadius: 15, alignItems: 'center', elevation: 5 },
  modalText: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#4e944f', textAlign: 'center' },
  modalBtn: { backgroundColor: '#4e944f', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, alignSelf: 'center', marginTop: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
});