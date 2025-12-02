import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; 
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { db, dbAll, dbRun, ensureSchema, resequenceRecords } from '../../utils/db';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons'; 

// Database helpers are provided by utils/db

export default function HistoryPage() {
  const router = useRouter(); 
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load records whenever the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadRecords();
    }, [])
  );

  const loadRecords = async () => {
    setLoading(true);
    try {
      await ensureSchema();
      const rows = await dbAll('SELECT * FROM records ORDER BY timestamp DESC;');
      console.log('loadRecords: found', rows ? rows.length : 0, 'rows');
      setRecords(rows || []);
    } catch (e) {
      console.log('Load records note:', e.message); 
      setRecords([]);
    } finally { 
      setLoading(false); 
    }
  };

  const deleteRecord = async (id) => {
    Alert.alert('Delete Record', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await ensureSchema();
          await dbRun('DELETE FROM records WHERE id = ?;', [id]);
          // resequence ids so they are contiguous
          try { await resequenceRecords(); } catch (e) { console.warn('Resequence failed', e); }
          await loadRecords(); 
        } catch (e) { Alert.alert('Delete Failed', e.message); }
      } }
    ]);
  };

  const formatDisplayDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString(); 
  };

  const exportRecord = async (row) => {
    try {
      const csvHeader = 'ID,NAME,MOOD_LABEL,MOOD_SCORE,ACTIVITY,VIDEO_URI,LAT,LON,TIME\n';
      const csvRow = `${row.id},"${row.name}","${row.mood_label}",${row.mood_score},"${row.activity}","${row.video_uri}",${row.latitude},${row.longitude},"${row.timestamp}"\n`;
      const csvContent = csvHeader + csvRow;
      
      const fileUri = FileSystem.documentDirectory + `emogo_record_${row.id}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Saved', `File saved to documents.`);
      }
    } catch (e) { Alert.alert('Export Failed', e.message); }
  };

  const exportAll = async () => {
    try {
      await ensureSchema();
      const rows = await dbAll('SELECT * FROM records ORDER BY timestamp DESC;');
      
      if (!rows || rows.length === 0) {
        return Alert.alert('No Data', 'No records found to export.');
      }

      let csv = 'ID,NAME,MOOD_LABEL,MOOD_SCORE,ACTIVITY,VIDEO_URI,LAT,LON,TIME\n';
      for (const r of rows) {
        csv += `${r.id},"${r.name}","${r.mood_label}",${r.mood_score},"${r.activity}","${r.video_uri}",${r.latitude},${r.longitude},"${r.timestamp}"\n`;
      }
      
      const fileUri = FileSystem.documentDirectory + 'emogo_history_export.csv';
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Saved', `File saved to documents.`);
      }
    } catch (e) { Alert.alert('Export Failed', e.message); }
  };

  const clearAll = async () => {
    Alert.alert('Clear History', 'This will permanently delete ALL records. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => {
        try {
          await ensureSchema();
          await dbRun('DELETE FROM records;');
          try { await dbRun("DELETE FROM sqlite_sequence WHERE name='records';"); } catch(e){}
          await loadRecords();
        } catch (e) { Alert.alert('Clear Failed', e.message); }
      } }
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
           <MaterialIcons name={getMoodIconName(item.mood_label)} size={32} style={{marginRight:10}} color="#4e944f" />
           <View>
             <Text style={styles.moodLabel}>{item.mood_label} ({item.mood_score})</Text>
             <Text style={styles.dateText}>{formatDisplayDate(item.timestamp)}</Text>
           </View>
        </View>
        <TouchableOpacity onPress={() => deleteRecord(item.id)}>
           <MaterialIcons name="delete-outline" size={24} color="#d9534f" />
        </TouchableOpacity>
      </View>

      <Text style={styles.activityText}>Activity: {item.activity}</Text>
      
      <View style={styles.metaRow}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
          <MaterialIcons name="person" size={14} color="#999" />
          <Text style={styles.metaText}> {item.name}</Text>
        </View>
        {item.latitude && (
          <View style={{flexDirection:'row', alignItems:'center'}}>
            <MaterialIcons name="place" size={14} color="#999" />
            <Text style={styles.metaText}> {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</Text>
          </View>
        )}
      </View>
      
      {item.video_uri && (
        <View style={styles.badgeContainer}>
          <MaterialIcons name="videocam" size={14} color="#1976d2" />
          <Text style={[styles.vlogBadge, {marginLeft:6}]}>Vlog Recorded</Text>
        </View>
      )}

      <View style={styles.cardActions}>
         <TouchableOpacity style={styles.exportBtnSmall} onPress={() => exportRecord(item)}>
            <Text style={styles.exportBtnText}>Share CSV</Text>
         </TouchableOpacity>
      </View>
    </View>
  );

  const getEmojiForLabel = (label) => {
      if (!label) return '?';
      if (label.includes('Very Good')) return '?';
      if (label.includes('Good')) return '?';
      if (label.includes('Bad')) return '?';
      if (label.includes('Very Bad')) return '?';
      return '?';
  };

  const getMoodIconName = (label) => {
    if (!label) return 'sentiment-neutral';
    if (label.includes('Very Good')) return 'sentiment-very-satisfied';
    if (label.includes('Good')) return 'sentiment-satisfied';
    if (label.includes('Neutral')) return 'sentiment-neutral';
    if (label.includes('Bad')) return 'sentiment-dissatisfied';
    if (label.includes('Very Bad')) return 'sentiment-very-dissatisfied';
    return 'sentiment-neutral';
  };


  return (
    <View style={styles.container}>             
        <View style={styles.headerRow}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity onPress={() => router.back()} style={{marginRight: 10, padding: 5}}>
                    <Ionicons name="arrow-back" size={24} color="#333" /> 
                </TouchableOpacity>
                <Text style={styles.pageTitle}>Your History</Text>
            </View>
            
            <View style={styles.headerButtons}>
                <TouchableOpacity style={styles.headerBtn} onPress={loadRecords}>
                <MaterialIcons name="refresh" size={24} color="#333" />
                </TouchableOpacity>
            </View>
        </View>

      {/* 內容區 */}
      {loading ? (
        <ActivityIndicator size="large" color="#4e944f" style={{marginTop: 50}} />
      ) : (
        <FlatList 
          data={records} 
          keyExtractor={(item) => String(item.id)} 
          renderItem={renderItem} 
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <Text style={styles.emptyText}>No records found yet.</Text>
               <Text style={styles.emptySubText}>Go to the main page to track your mood!</Text>
            </View>
          } 
        />
      )}

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.actionBtn, styles.exportAllBtn]} onPress={exportAll}>
           <MaterialIcons name="file-download" size={20} color="#fff" />
           <Text style={styles.actionBtnLabel}>Export All</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionBtn, styles.clearAllBtn]} onPress={clearAll}>
           <MaterialIcons name="delete-forever" size={20} color="#fff" />
           <Text style={styles.actionBtnLabel}>Clear History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  
  // --- Header 樣式 (白色內容，但被 SafeAreaView 覆蓋) ---
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 15, // 調整 padding
    paddingBottom: 15,
    backgroundColor: '#fff', // 內容區塊背景白色
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    elevation: 1,
  },
  pageTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#333' // 文字深色
  },
  headerButtons: { flexDirection: 'row' },
  headerBtn: { padding: 5 },
  
  // ... (其餘樣式保持不變)
  listContent: { padding: 15, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  moodEmoji: { fontSize: 32, marginRight: 10 },
  moodLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  dateText: { fontSize: 12, color: '#888', marginTop: 2 },
  activityText: { fontSize: 15, color: '#555', marginBottom: 10, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metaText: { fontSize: 12, color: '#999' },
  badgeContainer: { flexDirection: 'row', marginBottom: 10 },
  vlogBadge: { backgroundColor: '#e3f2fd', color: '#1976d2', fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, overflow:'hidden', fontWeight:'600' },
  cardActions: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, alignItems: 'flex-end' },
  exportBtnSmall: { flexDirection: 'row', alignItems: 'center' },
  exportBtnText: { color: '#4e944f', fontWeight: '600', fontSize: 13 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 18, color: '#888', fontWeight: 'bold' },
  emptySubText: { fontSize: 14, color: '#aaa', marginTop: 5 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', flexDirection: 'row', paddingVertical: 15, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#ddd', justifyContent: 'space-between' },
  actionBtn: { flex: 0.48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  exportAllBtn: { backgroundColor: '#333' },
  clearAllBtn: { backgroundColor: '#d9534f' },
  actionBtnLabel: { color: '#fff', fontWeight: 'bold', marginLeft: 5 },
});