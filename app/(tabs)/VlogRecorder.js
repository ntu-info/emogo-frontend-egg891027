import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Button, Platform, PermissionsAndroid } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

export default function VlogRecorder() {
    const [cameraFacing, setCameraFacing] = useState('front');

  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  // Ensure camera permissions
  if (!permission || !mediaPermission) {
    // Permissions are still loading
    return <View style={styles.container}><ActivityIndicator /></View>;
  }

  if (!permission.granted || !mediaPermission.granted) {
    // Permissions denied, show request buttons
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 10 }}>Camera and storage permissions are required to record a Vlog.</Text>
        {!permission.granted && <Button onPress={requestPermission} title="Grant Camera Permission" />}
        {!mediaPermission.granted && <Button onPress={requestMediaPermission} title="Grant Storage Permission" />}
      </View>
    );
  }

  const recordVlog = async () => {
    // Check and request microphone permission (required for video with audio)
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Microphone Permission Needed', 'Please allow microphone permission to record videos with sound.');
          return;
        }
      } else if (Camera && typeof Camera.requestMicrophonePermissionsAsync === 'function') {
        const mic = await Camera.requestMicrophonePermissionsAsync();
        if (mic.status !== 'granted') {
          Alert.alert('Microphone Permission Needed', 'Please allow microphone permission to record videos with sound.');
          return;
        }
      }
    } catch (err) {
      Alert.alert('Permission Error', 'Failed to get microphone permission: ' + (err?.message || String(err)) + '\nIf you see a missing manifest permission error, please rebuild the Dev Build with EAS and add RECORD_AUDIO to app.json.');
      return;
    }

    if (cameraRef.current) {
      setRecording(true);
      try {
        // New API: call recordAsync directly on ref
        const video = await cameraRef.current.recordAsync({ 
          maxDuration: 1, // Limit to 1 second
          quality: '480p' // Use string directly, not Constants
        });
        setVideoUri(video.uri);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Recording failed: ' + e.message);
      } finally {
        setRecording(false);
      }
    }
  };

  const stopRecording = () => {
    if (cameraRef.current && recording) {
      cameraRef.current.stopRecording();
    }
  };

  const saveToGallery = async () => {
    if (videoUri) {
      setSaving(true);
      try {
        await MediaLibrary.saveToLibraryAsync(videoUri);
        Alert.alert('Saved', 'Video has been saved to your gallery!');
      } catch (e) {
        Alert.alert('Error', 'Failed to save video');
      }
      setSaving(false);
    }
  };

  const shareVideo = async () => {
    if (videoUri && await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(videoUri);
    }
  };

  return (
    <View style={styles.container}>
      {/* Use CameraView instead of old Camera */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraFacing}
        mode="video"   // Must explicitly set to video mode
      />

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
        >
          <Text style={styles.buttonText}>Switch Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, recording && styles.recordingBtn]} 
          onPress={recording ? stopRecording : recordVlog} 
          disabled={recording}
        >
          <Text style={styles.buttonText}>{recording ? 'Recording...' : 'Record 1 Second Vlog'}</Text>
        </TouchableOpacity>

        {videoUri && (
          <View style={styles.row}>
            <TouchableOpacity style={styles.button} onPress={saveToGallery} disabled={saving}>
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={shareVideo}>
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  camera: { width: 300, height: 300, borderRadius: 20, marginTop: 20 },
  controls: { marginTop: 20, alignItems: 'center' },
  button: { backgroundColor: '#ffb347', padding: 12, borderRadius: 8, margin: 8 },
  recordingBtn: { backgroundColor: 'red' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  row: { flexDirection: 'row' },
});