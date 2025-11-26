import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';

// Initialize the database
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

export default function SentimentQuestionnaire() {
  const [selected, setSelected] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // New state to lock the UI

  // Initialize database table
  useEffect(() => {
    if (db) {
      try {
        db.execSync(
          'CREATE TABLE IF NOT EXISTS sentiment (id INTEGER PRIMARY KEY AUTOINCREMENT, value INTEGER, timestamp TEXT);'
        );
      } catch (e) {
        console.error("Table creation failed:", e);
      }
    }
  }, []);

  // 1. Handle selection
  const handleSelect = (value) => {
    // If already saved, do not allow changing selection
    if (isSaved) return;
    setSelected(value);
  };

  // 2. Save and Lock
  const saveRecord = async () => {
    if (selected === null) {
        Alert.alert("Selection Required", "Please select a mood first.");
        return;
    }

    const timestamp = new Date().toISOString();

    if (db) {
      try {
        const result = await db.runAsync(
          'INSERT INTO sentiment (value, timestamp) VALUES (?, ?);',
          [selected, timestamp]
        );
        console.log('Record saved:', result);
        
        // LOCK the interface
        setIsSaved(true); 
        setModalVisible(true);

      } catch (error) {
        Alert.alert('Error', 'Failed to save record: ' + error.message);
      }
    }
  };

  // Export CSV function
  const exportSentiments = async () => {
    if (!db) return;

    try {
      const rows = await db.getAllAsync('SELECT * FROM sentiment ORDER BY timestamp DESC;');
        
      if (rows.length === 0) {
          Alert.alert('No Data', 'No records to export. Please log your mood first.');
          return;
      }

      let csv = 'id,value,timestamp,readable_time\n';
      for (const row of rows) {
        const dateObj = new Date(row.timestamp);
        const readableTime = dateObj.toLocaleString(); 
        csv += `${row.id},${row.value},${row.timestamp},"${readableTime}"\n`;
      }

      const fileName = 'emogo_sentiment_data.csv';
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
           await MediaLibrary.createAssetAsync(fileUri);
           Alert.alert('Exported', 'CSV has been saved to your Media Library/Gallery.');
        } else {
          Alert.alert('Permission Denied', 'Storage permission is required to export the file.');
        }
      }

    } catch (e) {
      Alert.alert('Export Error', e.message);
    }
  };

  const handleCloseModal = () => {
      setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How do you feel now?</Text>
      
      {/* Face Selection Row */}
      <View style={styles.row}>
        {faces.map(face => {
            let backgroundColor = '#fff';
            let borderColor = face.color;
            let opacity = 1;

            if (selected !== null) {
                if (selected === face.value) {
                    backgroundColor = face.color;
                } else {
                    backgroundColor = '#f0f0f0';
                    borderColor = '#ccc';
                    opacity = 0.5;
                }
            }

            return (
              <TouchableOpacity
                key={face.value}
                style={[
                    styles.face, 
                    { 
                        borderColor: borderColor, 
                        borderWidth: 3, 
                        backgroundColor: backgroundColor,
                        opacity: opacity
                    }
                ]}
                onPress={() => handleSelect(face.value)}
                disabled={isSaved} // Disable interaction if saved
              >
                <View style={[
                    styles.circle, 
                    { 
                        backgroundColor: face.color, 
                        opacity: selected === face.value ? 0 : 1 
                    }
                ]} />
                <Text style={[
                    styles.label, 
                    { color: selected === face.value ? '#222' : '#888' }
                ]}>
                    {face.label}
                </Text>
              </TouchableOpacity>
            );
        })}
      </View>

      {/* SAVE BUTTON - Hidden after saving */}
      {selected !== null && !isSaved && (
          <TouchableOpacity style={styles.saveBtn} onPress={saveRecord}>
            <Text style={styles.saveBtnText}>Save Record</Text>
          </TouchableOpacity>
      )}

      {/* COMPLETION MESSAGE - Shown after saving */}
      {isSaved && (
          <View style={styles.completedContainer}>
              <Text style={styles.completedText}>Record Saved.</Text>
              <Text style={styles.completedSubText}>Waiting for next notification...</Text>
          </View>
      )}

      {/* EXPORT BUTTON - Always available */}
      <TouchableOpacity style={styles.exportBtn} onPress={exportSentiments}>
        <Text style={styles.exportText}>Export Data (CSV)</Text>
      </TouchableOpacity>

      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalText}>Success!</Text>
            <Text style={{marginBottom: 15, color: '#666'}}>
                Your mood has been recorded.
            </Text>
            <Pressable style={styles.modalBtn} onPress={handleCloseModal}>
              <Text style={styles.modalBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, marginBottom: 30, color: '#4e944f', fontWeight: 'bold' },
  
  row: { flexDirection: 'row', marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' },
  
  face: { margin: 6, padding: 10, borderRadius: 12, alignItems: 'center', width: 68, justifyContent: 'center' },
  circle: { width: 24, height: 24, borderRadius: 12, marginBottom: 8 },
  label: { fontSize: 12, textAlign: 'center', fontWeight: '600' },

  saveBtn: { 
      marginTop: 20, 
      backgroundColor: '#4e944f', 
      paddingVertical: 14, 
      paddingHorizontal: 40, 
      borderRadius: 10,
      elevation: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },

  // Styles for the completion message
  completedContainer: { marginTop: 20, alignItems: 'center' },
  completedText: { fontSize: 18, color: '#4e944f', fontWeight: 'bold' },
  completedSubText: { fontSize: 14, color: '#888', marginTop: 5 },

  exportBtn: { 
      marginTop: 50, 
      backgroundColor: '#555', 
      paddingVertical: 10, 
      paddingHorizontal: 25, 
      borderRadius: 25 
  },
  exportText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center', elevation: 5, width: '80%' },
  modalText: { fontSize: 20, marginBottom: 8, color: '#4e944f', fontWeight: 'bold' },
  modalBtn: { backgroundColor: '#4e944f', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20 },
  modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});