import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';

// 1. 開啟資料庫 (使用新版同步 API)
let db;
try {
  db = SQLite.openDatabaseSync('emogo.db');
} catch (e) {
  console.log("Error opening DB:", e);
}

export default function GPSCollector() {
  const [location, setLocation] = useState(null);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // 2. 初始化資料表 (使用新版 execSync)
  useEffect(() => {
    if (db) {
      try {
        db.execSync(
          'CREATE TABLE IF NOT EXISTS gps (id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL, longitude REAL, timestamp TEXT);'
        );
      } catch (e) {
        console.error("Table creation failed:", e);
      }
    }
  }, []);

  const getLocation = async () => {
    // 請求 GPS 權限
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Permission to access location was denied');
      return;
    }

    try {
      // 獲取當前位置
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);

      // 3. 儲存資料 (使用新版 runAsync)
      if (db) {
        const timestamp = new Date().toISOString();
        const result = await db.runAsync(
          'INSERT INTO gps (latitude, longitude, timestamp) VALUES (?, ?, ?);',
          [loc.coords.latitude, loc.coords.longitude, timestamp]
        );
        console.log('GPS Saved:', result);
        
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } catch (e) {
      setErrorMsg('Error fetching/saving location: ' + e.message);
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Get your GPS location</Text>
      
      <TouchableOpacity style={styles.button} onPress={getLocation}>
        <Text style={styles.buttonText}>Get Location & Save</Text>
      </TouchableOpacity>
      
      {location && (
        <Text style={styles.coords}>
          Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)}
        </Text>
      )}
      
      {saved && <Text style={styles.saved}>Saved to Database!</Text>}
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, marginBottom: 20, color: '#3b6ea5', fontWeight: 'bold' },
  button: { backgroundColor: '#3b6ea5', padding: 12, borderRadius: 8, margin: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  coords: { marginTop: 16, fontSize: 16 },
  saved: { color: '#4e944f', fontWeight: 'bold', marginTop: 10 },
  error: { color: 'red', marginTop: 10 },
});