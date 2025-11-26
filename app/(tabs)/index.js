import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert } from 'react-native';

import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// Use legacy FileSystem to avoid writeAsStringAsync deprecation error
import * as FileSystem from 'expo-file-system/legacy';

import * as SQLite from 'expo-sqlite';
import { MaterialIcons } from '@expo/vector-icons';

// Initialize database (new API)
let db;
try {
  db = SQLite.openDatabaseSync('emogo.db');
} catch (e) {
  console.log("Error opening DB:", e);
}

// Mood options
const faces = [
  { value: 1, label: 'Very Good', color: '#7ed957' },
  { value: 2, label: 'Good', color: '#b6e36c' },
  { value: 3, label: 'Neutral', color: '#ffe066' },
  { value: 4, label: 'Bad', color: '#ffb347' },
  { value: 5, label: 'Very Bad', color: '#ff5c5c' },
];

export default function UnifiedTracker() {
  // Clear all database data
  const clearAllData = async () => {
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM sentiment;');
      await db.runAsync('DELETE FROM gps;');
      Alert.alert('Data Cleared', 'All records have been removed from the database');
      setSelectedMood(null);
      setIsMoodSaved(false);
      setIsGpsSaved(false);
    } catch (e) {
      Alert.alert('Clear Failed', e.message);
    }
  };
  // --- State Management ---
  const [selectedMood, setSelectedMood] = useState(null);
  const [isMoodSaved, setIsMoodSaved] = useState(false); // Sentiment 鎖定狀態
  const [isGpsSaved, setIsGpsSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState('front'); // 鏡頭朝向狀態
  
  const cameraRef = useRef(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();

  // Initialize tables
  useEffect(() => {
    if (db) {
      try {
        db.execSync(`
          CREATE TABLE IF NOT EXISTS sentiment (id INTEGER PRIMARY KEY AUTOINCREMENT, value INTEGER, timestamp TEXT);
          CREATE TABLE IF NOT EXISTS gps (id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL, longitude REAL, timestamp TEXT);
        `);
      } catch (e) {
        console.error("Table creation failed:", e);
      }
    }
  }, []);

  // Camera flip function
  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // Mood selection UI handler
  const handleMoodSelect = (value) => {
    // Prevent changing selection if already saved (lock logic)
    if (isMoodSaved) return; 
    setSelectedMood(value);
  };

  // Save mood
  const saveMood = async () => {
    if (selectedMood === null) { Alert.alert("Please select", "Please select a mood icon"); return; }
    const timestamp = new Date().toISOString();
    try {
      if (db) {
        await db.runAsync('INSERT INTO sentiment (value, timestamp) VALUES (?, ?);', [selectedMood, timestamp]);
        setIsMoodSaved(true); 
        setModalMessage("Mood saved!\n(Wait for next notification)");
        setModalVisible(true);
      }
    } catch (e) { Alert.alert("Error", "Save failed: " + e.message); }
  };

  // Save GPS
  const captureGPS = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert("Permission Denied", "Location permission is required to record GPS"); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      if (db) {
        const timestamp = new Date().toISOString();
        await db.runAsync('INSERT INTO gps (latitude, longitude, timestamp) VALUES (?, ?, ?);', [loc.coords.latitude, loc.coords.longitude, timestamp]);
        setIsGpsSaved(true);
        setTimeout(() => setIsGpsSaved(false), 2000); 
      }
    } catch (e) { Alert.alert("GPS Error", e.message); }
  };

  // Vlog recording
  const recordOneSecondVlog = async () => {
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
          setModalMessage("1-second Vlog has been saved to gallery!");
          setModalVisible(true);
        }
      } catch (e) { Alert.alert("Recording Error", e.message); } finally { setIsRecording(false); }
    }
  };

  // Export all data logic
  const exportAllData = async () => {
    if (!db) return;
    try {
      const sentiments = await db.getAllAsync('SELECT * FROM sentiment ORDER BY timestamp DESC;');
      const gpsLogs = await db.getAllAsync('SELECT * FROM gps ORDER BY timestamp DESC;');
      
      if (sentiments.length === 0 && gpsLogs.length === 0) { Alert.alert("No Data", "There are currently no records to export"); return; }

      let csv = 'TYPE,ID,VALUE_OR_LAT,INFO_OR_LNG,TIMESTAMP,READABLE_TIME\n';
      for (const row of sentiments) { const time = new Date(row.timestamp).toLocaleString(); csv += `SENTIMENT,${row.id},${row.value},N/A,${row.timestamp},"${time}"\n`; }
      for (const row of gpsLogs) { const time = new Date(row.timestamp).toLocaleString(); csv += `GPS,${row.id},${row.latitude},${row.longitude},${row.timestamp},"${time}"\n`; }

      const fileName = 'emogo_full_export.csv';
      const fileUri = FileSystem.documentDirectory + fileName;
      
      // 使用 legacy 引入的 writeAsStringAsync，這裡應該可以正常運作了
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(fileUri); } else { Alert.alert("Export", "File created: " + fileUri); }
    } catch (e) { Alert.alert("Export Failed", e.message); }
  };


  // --- UI Render ---
  return (
    <View style={styles.screen}> 
      
      <Text style={styles.headerTitle}>EmoGo Tracker</Text>

      {/* 1. Sentiment (Mood Form) */}
      <TouchableOpacity style={styles.exportBtn} onPress={clearAllData}>
        <Text style={styles.exportText}>Clear All Data</Text>
      </TouchableOpacity>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. How do you feel?</Text>
        <View style={styles.moodRow}>
          {faces.map(face => {
            let bgColor = '#fff'; let borderColor = face.color; let opacity = 1;
            if (selectedMood !== null) {
              if (selectedMood === face.value) { bgColor = face.color; } 
              else { bgColor = '#f4f4f4'; borderColor = '#ddd'; opacity = 0.5; }
            }
            return (
              <TouchableOpacity
                key={face.value}
                style={[styles.faceBtn, { backgroundColor: bgColor, borderColor: borderColor, opacity: opacity }]}
                onPress={() => handleMoodSelect(face.value)}
                disabled={isMoodSaved}
              >
                 <Text style={styles.faceText}>{face.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        
        {/* Mood Save/Status */}
        {selectedMood !== null && !isMoodSaved && (
          <TouchableOpacity style={[styles.actionBtn, {marginTop: 10}]} onPress={saveMood}>
            <Text style={styles.btnText}>Save Mood</Text>
          </TouchableOpacity>
        )}
        {isMoodSaved && <Text style={styles.successText}>Mood Locked & Saved.</Text>}
      </View>

      {/* 2. GPS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Where are you?</Text>
        <TouchableOpacity style={styles.gpsBtn} onPress={captureGPS}>
          <Text style={styles.btnText}>Get & Save Location</Text>
        </TouchableOpacity>
        
        {isGpsSaved && <Text style={styles.successText}>GPS Saved!</Text>}
      </View>
      
      {/* 3. Vlog */}
      <View style={[styles.section, styles.vlogSection]}> 
        <Text style={styles.sectionTitle}>3. 1-Second Vlog</Text>
        
        <View style={styles.cameraContainer}>
          {(!cameraPerm || !cameraPerm.granted) ? (
            <View style={styles.cameraPlaceholder}>
               <Text style={{color:'#888'}}>Waiting for Camera Permission...</Text>
               <TouchableOpacity onPress={requestCameraPerm}><Text style={{color:'blue'}}>Grant Permission</Text></TouchableOpacity>
            </View>
          ) : (
            <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video">
                <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
                    <MaterialIcons name="flip-camera-ios" size={24} color="white" />
                </TouchableOpacity>
            </CameraView>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.recordBtn, isRecording && { backgroundColor: 'red' }]} 
          onPress={recordOneSecondVlog}
          disabled={isRecording}
        >
          <Text style={styles.btnText}>{isRecording ? 'Recording...' : 'Record 1s Vlog'}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom: Export button */}
      <TouchableOpacity style={styles.exportBtn} onPress={exportAllData}>
        <Text style={styles.exportText}>Export All Data (CSV)</Text>
      </TouchableOpacity>
      
      {/* Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalText}>Success</Text>
            <Text style={{marginBottom: 15, fontSize: 16, textAlign: 'center'}}>{modalMessage}</Text>
            <Pressable style={styles.modalBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// --- 樣式表 ---
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', padding: 10, paddingTop: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 10, textAlign: 'center' },
  
  section: { 
    backgroundColor: '#fff', 
    borderRadius: 10, 
    padding: 15, 
    marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginBottom: 10 },

  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  faceBtn: { 
    width: 60, height: 45, 
    marginHorizontal: 2, 
    borderRadius: 8, borderWidth: 2, 
    alignItems: 'center', justifyContent: 'center',
  },
  faceText: { fontSize: 11, fontWeight: '600', paddingHorizontal: 2, textAlign: 'center' },
  successText: { color: '#4e944f', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },

  gpsBtn: { backgroundColor: '#3b6ea5', padding: 10, borderRadius: 8, alignItems: 'center' },

  vlogSection: { flex: 1, minHeight: 180 }, 
  cameraContainer: { flex: 1, minHeight: 130, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', marginBottom: 10 },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  recordBtn: { backgroundColor: '#ffb347', padding: 12, borderRadius: 8, alignItems: 'center' },

  flipButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },

  actionBtn: { backgroundColor: '#4e944f', padding: 12, borderRadius: 8, alignItems: 'center' },
  exportBtn: { backgroundColor: '#333', padding: 12, borderRadius: 30, alignItems: 'center', marginTop: 5, marginBottom: 5 },
  exportText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#fff', width: '80%', padding: 25, borderRadius: 15, alignItems: 'center', elevation: 5 },
  modalText: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#4e944f', textAlign: 'center' },
  modalBtn: { backgroundColor: '#4e944f', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, alignSelf: 'center' },
});