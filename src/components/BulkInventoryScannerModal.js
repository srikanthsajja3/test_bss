import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

// Helper: Normalize MAC address into standard uppercase XX:XX:XX:XX:XX:XX format
export const formatMacAddress = (input) => {
  if (!input) return '';
  const clean = input.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g).join(':');
  }
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(input)) {
    return input.replace(/-/g, ':').toUpperCase();
  }
  return input.trim().toUpperCase();
};

// Helper: Check if string looks like a MAC address
export const isMacPattern = (str) => {
  if (!str) return false;
  const clean = str.replace(/[^0-9A-Fa-f]/g, '');
  if (clean.length === 12) {
    if (str.includes(':') || str.includes('-')) return true;
    // Pure 12 hex chars with no letters past F
    return true;
  }
  return false;
};

// Web Audio API feedback for scanner beeps
const playScannerBeep = (type = 'success') => {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5 beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'duplicate') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Audio contexts may be blocked by autoplay policies until first user click
  }
};

export const BulkInventoryScannerModal = ({
  visible,
  onClose,
  vendors = [],
  allModels = [],
  onSuccess,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Batch Defaults
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id ? String(vendors[0].id) : '');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [defaultStatus, setDefaultStatus] = useState('in_stock');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Scanner Mode & Target
  const [activeTab, setActiveTab] = useState('gun'); // 'gun' | 'camera' | 'paste'
  const [scanTarget, setScanTarget] = useState('auto'); // 'auto' | 'serial' | 'mac' | 'paired'
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Gun / Rapid input state
  const [scannedInput, setScannedInput] = useState('');
  const [pairedSerialHolding, setPairedSerialHolding] = useState('');
  const inputRef = useRef(null);

  // Camera scanner state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanningLoopRef = useRef(null);

  // Paste mode text
  const [pasteText, setPasteText] = useState('');

  // Queue of scanned devices: [{ id, serial_no, mac_address, status, importStatus: 'pending'|'success'|'error', errorMsg: '' }]
  const [queue, setQueue] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Filtered models for selected vendor
  const availableModels = useMemo(() => {
    if (!selectedVendorId) return allModels;
    return allModels.filter((m) => String(m.vendor_id) === String(selectedVendorId));
  }, [selectedVendorId, allModels]);

  // Set default model when vendor changes
  useEffect(() => {
    if (availableModels.length > 0) {
      if (!availableModels.some((m) => String(m.id) === String(selectedModelId))) {
        setSelectedModelId(String(availableModels[0].id));
      }
    } else {
      setSelectedModelId('');
    }
  }, [availableModels, selectedModelId]);

  // Focus gun input when modal opens or tab changes to gun
  useEffect(() => {
    if (visible && activeTab === 'gun') {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus?.();
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [visible, activeTab]);

  // Clean up camera stream on unmount or tab switch
  const stopCameraStream = useCallback(() => {
    if (scanningLoopRef.current) {
      cancelAnimationFrame(scanningLoopRef.current);
      scanningLoopRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!visible || activeTab !== 'camera') {
      stopCameraStream();
    }
  }, [visible, activeTab, stopCameraStream]);

  // Camera start handler with BarcodeDetector
  const startCamera = async () => {
    setCameraError('');
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);

      // Start BarcodeDetector loop if supported
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix', 'upc_a'],
        });

        let lastScannedVal = '';
        let lastScannedTime = 0;

        const scanFrame = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            scanningLoopRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue.trim();
              const now = Date.now();
              // Prevent duplicate triggers within 2 seconds
              if (code && (code !== lastScannedVal || now - lastScannedTime > 2000)) {
                lastScannedVal = code;
                lastScannedTime = now;
                handleCodeDetected(code);
              }
            }
          } catch (err) {
            // Frame detection error, continue next frame
          }

          scanningLoopRef.current = requestAnimationFrame(scanFrame);
        };

        scanningLoopRef.current = requestAnimationFrame(scanFrame);
      } else {
        setCameraError('Direct live barcode reading requires Chrome/Edge/Safari with BarcodeDetector. Use Barcode Gun or type above.');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(err.message || 'Unable to open camera stream. Check camera permissions.');
      setCameraActive(false);
    }
  };

  // Add a device to the queue
  const addDeviceToQueue = useCallback((serialNo = '', macAddr = '') => {
    const s = (serialNo || '').trim().toUpperCase();
    const m = formatMacAddress(macAddr);

    if (!s && !m) {
      toast.warn('Please provide a Serial Number or MAC Address');
      return false;
    }

    // Check for duplicates in the current queue
    const isDup = queue.some((item) => {
      if (s && item.serial_no && item.serial_no.toUpperCase() === s) return true;
      if (m && item.mac_address && item.mac_address.toUpperCase() === m) return true;
      return false;
    });

    if (isDup) {
      if (soundEnabled) playScannerBeep('duplicate');
      toast.error(`Duplicate device: ${s || m} is already in the batch!`);
      return false;
    }

    if (soundEnabled) playScannerBeep('success');

    const newItem = {
      tempId: Date.now() + Math.random().toString(36).substring(2, 7),
      serial_no: s || null,
      mac_address: m || null,
      status: defaultStatus,
      importStatus: 'pending', // 'pending' | 'success' | 'error'
      errorMsg: '',
    };

    setQueue((prev) => [newItem, ...prev]);
    toast.success(`Scanned: ${s || m} (Batch: ${queue.length + 1})`);
    return true;
  }, [queue, defaultStatus, soundEnabled]);

  // Central handler when any raw code is detected (by Gun, Camera, etc.)
  const handleCodeDetected = useCallback((rawCode) => {
    const code = (rawCode || '').trim();
    if (!code) return;

    if (scanTarget === 'paired') {
      // Paired mode: 1st scan = Serial, 2nd scan = MAC
      if (!pairedSerialHolding) {
        setPairedSerialHolding(code.toUpperCase());
        if (soundEnabled) playScannerBeep('success');
        toast.info(`Serial captured: ${code.toUpperCase()}. Now scan MAC address for this device.`);
      } else {
        const formattedMac = formatMacAddress(code);
        addDeviceToQueue(pairedSerialHolding, formattedMac);
        setPairedSerialHolding('');
      }
    } else if (scanTarget === 'mac') {
      addDeviceToQueue('', formatMacAddress(code));
    } else if (scanTarget === 'serial') {
      addDeviceToQueue(code.toUpperCase(), '');
    } else {
      // Auto-detect mode
      if (isMacPattern(code)) {
        addDeviceToQueue('', formatMacAddress(code));
      } else {
        addDeviceToQueue(code.toUpperCase(), '');
      }
    }
  }, [scanTarget, pairedSerialHolding, soundEnabled, addDeviceToQueue]);

  // Barcode Gun key handler (Enter key triggers addition)
  const handleGunInputSubmit = () => {
    if (!scannedInput.trim()) return;
    handleCodeDetected(scannedInput);
    setScannedInput('');
    // Ensure input keeps focus
    if (inputRef.current) {
      inputRef.current.focus?.();
    }
  };

  // Bulk paste parser
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      toast.warn('Paste list is empty');
      return;
    }

    const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let addedCount = 0;

    lines.forEach((line) => {
      // Support comma, tab, semicolon or pipe separated: "SERIAL, MAC"
      const parts = line.split(/[,\t;|]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const p1 = parts[0];
        const p2 = parts[1];
        let s = '';
        let m = '';
        if (isMacPattern(p2)) {
          s = p1;
          m = formatMacAddress(p2);
        } else if (isMacPattern(p1)) {
          m = formatMacAddress(p1);
          s = p2;
        } else {
          s = p1;
          m = p2;
        }
        if (addDeviceToQueue(s, m)) addedCount += 1;
      } else if (parts.length === 1) {
        const single = parts[0];
        if (isMacPattern(single)) {
          if (addDeviceToQueue('', formatMacAddress(single))) addedCount += 1;
        } else {
          if (addDeviceToQueue(single.toUpperCase(), '')) addedCount += 1;
        }
      }
    });

    if (addedCount > 0) {
      setPasteText('');
      toast.success(`Parsed and queued ${addedCount} devices`);
    }
  };

  // Remove single item from queue
  const handleRemoveItem = (tempId) => {
    setQueue((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // Clear entire queue
  const handleClearAll = () => {
    if (queue.length === 0) return;
    if (confirm(`Clear all ${queue.length} devices from the scan batch?`)) {
      setQueue([]);
      setPairedSerialHolding('');
    }
  };

  // Execute bulk import to the server
  const handleImportBatch = async () => {
    if (!selectedModelId) {
      toast.error('Please select an ONU model for this batch');
      return;
    }
    if (queue.length === 0) {
      toast.warn('No devices in the batch to import');
      return;
    }

    const pendingItems = queue.filter((i) => i.importStatus !== 'success');
    if (pendingItems.length === 0) {
      toast.info('All devices in this batch have already been imported');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: pendingItems.length });

    let successCount = 0;
    let failCount = 0;
    const modelIdNum = Number(selectedModelId);

    // Process sequentially so we don't overwhelm the backend and can report exact progress
    for (let i = 0; i < pendingItems.length; i += 1) {
      const item = pendingItems[i];
      setImportProgress({ current: i + 1, total: pendingItems.length });

      try {
        const payload = {
          model_id: modelIdNum,
          serial_no: item.serial_no || null,
          mac_address: item.mac_address || null,
          status: item.status || defaultStatus,
          purchase_date: purchaseDate || null,
        };

        const res = await OneBssApi.addInventoryOnu(payload);
        if (res.ok) {
          successCount += 1;
          setQueue((prev) =>
            prev.map((row) => (row.tempId === item.tempId ? { ...row, importStatus: 'success', errorMsg: '' } : row))
          );
        } else {
          failCount += 1;
          const errMsg = res.data?.message || 'Server rejected device';
          setQueue((prev) =>
            prev.map((row) => (row.tempId === item.tempId ? { ...row, importStatus: 'error', errorMsg: errMsg } : row))
          );
        }
      } catch (err) {
        failCount += 1;
        setQueue((prev) =>
          prev.map((row) =>
            row.tempId === item.tempId ? { ...row, importStatus: 'error', errorMsg: 'Network error adding ONU' } : row
          )
        );
      }
    }

    setIsImporting(false);

    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} devices to inventory!`);
      if (soundEnabled) playScannerBeep('success');
      if (onSuccess) {
        onSuccess(successCount);
      }
    }

    if (failCount > 0) {
      toast.error(`${failCount} device(s) failed. Check red errors in the list.`);
      if (soundEnabled) playScannerBeep('error');
    } else {
      // If all succeeded, clear queue and offer to close
      setTimeout(() => {
        setQueue([]);
        onClose();
      }, 1200);
    }
  };

  const selectedVendorObj = vendors.find((v) => String(v.id) === String(selectedVendorId));
  const selectedModelObj = availableModels.find((m) => String(m.id) === String(selectedModelId));

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalBox, isMobile && styles.modalBoxMobile]}>
          {/* 1. Modal Header */}
          <View style={styles.modalHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.headIconBox}>
                <Feather name="maximize" size={18} color="#0284c7" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Bulk Inventory Scanner</Text>
                <Text style={styles.modalSub}>Scan & import ONUs in batch using barcode gun, camera or paste</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Sound Toggle */}
              <TouchableOpacity
                style={[styles.iconToolBtn, !soundEnabled && { opacity: 0.5 }]}
                onPress={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'Scanner Beep: ON' : 'Scanner Beep: OFF'}
              >
                <Feather name={soundEnabled ? 'volume-2' : 'volume-x'} size={15} color="#334155" />
              </TouchableOpacity>

              {/* Close Button */}
              <TouchableOpacity onPress={onClose} disabled={isImporting} style={styles.iconToolBtn}>
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Modal Main Scroll Container */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* 2. Top Config Card: Batch Defaults (Vendor, Model, Status, Date) */}
            <View style={styles.batchConfigCard}>
              <View style={styles.sectionTitleRow}>
                <Feather name="settings" size={13} color="#0284c7" />
                <Text style={styles.sectionTitle}>1. BATCH CONFIGURATION</Text>
              </View>

              <View style={styles.configGrid}>
                {/* Vendor Dropdown */}
                <View style={styles.configCol}>
                  <Text style={styles.configLabel}>Vendor <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <select
                    style={styles.formSelect}
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    disabled={isImporting}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </View>

                {/* Model Dropdown */}
                <View style={styles.configCol}>
                  <Text style={styles.configLabel}>Model <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <select
                    style={styles.formSelect}
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={isImporting || availableModels.length === 0}
                  >
                    <option value="">{availableModels.length === 0 ? 'No models for vendor' : 'Select Model'}</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.type})</option>
                    ))}
                  </select>
                </View>

                {/* Default Status */}
                <View style={styles.configColSmall}>
                  <Text style={styles.configLabel}>Status</Text>
                  <select
                    style={styles.formSelect}
                    value={defaultStatus}
                    onChange={(e) => setDefaultStatus(e.target.value)}
                    disabled={isImporting}
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="reserved">Reserved</option>
                    <option value="assigned">Assigned</option>
                    <option value="faulty">Faulty</option>
                  </select>
                </View>

                {/* Purchase Date */}
                <View style={styles.configColSmall}>
                  <Text style={styles.configLabel}>Date</Text>
                  <input
                    type="date"
                    style={styles.nativeDateInput}
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    disabled={isImporting}
                  />
                </View>
              </View>
            </View>

            {/* 3. Input Method Tabs & Scan Trigger */}
            <View style={styles.scanMethodCard}>
              <View style={styles.scanTabsRow}>
                <TouchableOpacity
                  style={[styles.scanTab, activeTab === 'gun' && styles.scanTabActive]}
                  onPress={() => setActiveTab('gun')}
                >
                  <Feather name="crosshair" size={13} color={activeTab === 'gun' ? '#0284c7' : '#64748b'} />
                  <Text style={[styles.scanTabText, activeTab === 'gun' && styles.scanTabTextActive]}>
                    Barcode Gun / Rapid Input
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.scanTab, activeTab === 'camera' && styles.scanTabActive]}
                  onPress={() => setActiveTab('camera')}
                >
                  <Feather name="camera" size={13} color={activeTab === 'camera' ? '#0284c7' : '#64748b'} />
                  <Text style={[styles.scanTabText, activeTab === 'camera' && styles.scanTabTextActive]}>
                    Camera Scanner
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.scanTab, activeTab === 'paste' && styles.scanTabActive]}
                  onPress={() => setActiveTab('paste')}
                >
                  <Feather name="clipboard" size={13} color={activeTab === 'paste' ? '#0284c7' : '#64748b'} />
                  <Text style={[styles.scanTabText, activeTab === 'paste' && styles.scanTabTextActive]}>
                    Bulk Paste
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mode Target Pills (Auto, Serial Only, MAC Only, Paired) */}
              <View style={styles.targetPillRow}>
                <Text style={styles.targetPillLabel}>Scan Target:</Text>
                {[
                  { id: 'auto', label: 'Auto-Detect' },
                  { id: 'serial', label: 'Serial Only' },
                  { id: 'mac', label: 'MAC Only' },
                  { id: 'paired', label: 'Paired (Serial + MAC)' },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.targetPill, scanTarget === t.id && styles.targetPillActive]}
                    onPress={() => {
                      setScanTarget(t.id);
                      setPairedSerialHolding('');
                    }}
                  >
                    <Text style={[styles.targetPillText, scanTarget === t.id && styles.targetPillTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* TAB 1: Hardware Gun / Fast Keyboard Scanner */}
              {activeTab === 'gun' && (
                <View style={styles.gunScanBox}>
                  {scanTarget === 'paired' && pairedSerialHolding ? (
                    <View style={styles.pairedAlertBanner}>
                      <Feather name="check-circle" size={14} color="#047857" />
                      <Text style={styles.pairedAlertText}>
                        Serial locked: <Text style={{ fontWeight: '800' }}>{pairedSerialHolding}</Text> → Now scan MAC address!
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.gunInputWrap}>
                    <Feather name="maximize" size={18} color="#0284c7" style={{ marginRight: 8 }} />
                    <TextInput
                      ref={inputRef}
                      style={styles.gunInput}
                      placeholder={
                        scanTarget === 'paired'
                          ? pairedSerialHolding
                            ? 'Scan MAC Address now (then press Enter)...'
                            : 'Scan Serial Number first (then press Enter)...'
                          : scanTarget === 'mac'
                          ? 'Scan or type MAC Address (press Enter)...'
                          : scanTarget === 'serial'
                          ? 'Scan or type Serial Number (press Enter)...'
                          : 'Scan barcode/QR or type Serial/MAC and press Enter...'
                      }
                      placeholderTextColor="#94a3b8"
                      value={scannedInput}
                      onChangeText={setScannedInput}
                      onSubmitEditing={handleGunInputSubmit}
                      returnKeyType="done"
                      autoFocus
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={styles.gunAddBtn} onPress={handleGunInputSubmit}>
                      <Feather name="plus" size={14} color="#ffffff" />
                      <Text style={styles.gunAddBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.gunHintRow}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.gunHintText}>
                      Ready for Barcode Gun. Trigger laser scanner at label to automatically add.
                    </Text>
                  </View>
                </View>
              )}

              {/* TAB 2: Camera Scanner */}
              {activeTab === 'camera' && (
                <View style={styles.cameraBox}>
                  {cameraActive ? (
                    <View style={styles.videoContainer}>
                      <video
                        ref={videoRef}
                        style={{
                          width: '100%',
                          height: 240,
                          objectFit: 'cover',
                          borderRadius: 8,
                          backgroundColor: '#0f172a',
                        }}
                        autoPlay
                        playsInline
                        muted
                      />
                      {/* Targeting Reticle Overlay */}
                      <View style={styles.viewfinderFrame}>
                        <View style={styles.viewfinderBox}>
                          <View style={styles.viewfinderScanLine} />
                        </View>
                      </View>

                      <TouchableOpacity style={styles.cameraStopBtn} onPress={stopCameraStream}>
                        <Feather name="video-off" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.cameraStopBtnText}>Stop Camera</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.cameraPlaceholder}>
                      <Feather name="camera" size={36} color="#94a3b8" />
                      <Text style={styles.cameraPlaceholderTitle}>Camera Scanner</Text>
                      <Text style={styles.cameraPlaceholderSub}>
                        Use your webcam or mobile camera to read QR codes and 1D/2D barcodes on ONU boxes.
                      </Text>
                      {cameraError ? (
                        <View style={styles.cameraErrorBanner}>
                          <Feather name="alert-circle" size={14} color="#dc2626" />
                          <Text style={styles.cameraErrorText}>{cameraError}</Text>
                        </View>
                      ) : null}
                      <TouchableOpacity style={styles.cameraStartBtn} onPress={startCamera}>
                        <Feather name="video" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.cameraStartBtnText}>Start Camera Scanner</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* TAB 3: Bulk Paste */}
              {activeTab === 'paste' && (
                <View style={styles.pasteBox}>
                  <Text style={styles.pasteHint}>
                    Paste multiple devices from Excel or Notepad (one device per line, or comma-separated: <Text style={{ fontWeight: '700' }}>SERIAL, MAC</Text>):
                  </Text>
                  <textarea
                    style={styles.pasteTextarea}
                    placeholder={`HWTC1A2B3C01, 48:57:02:1A:3B:01\nHWTC1A2B3C02, 48:57:02:1A:3B:02\nHWTC1A2B3C03, 48:57:02:1A:3B:03`}
                    rows={4}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <TouchableOpacity style={styles.pasteAddBtn} onPress={handleParsePaste}>
                    <Feather name="check" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.pasteAddBtnText}>Parse & Add to Queue</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 4. Staging Queue Table */}
            <View style={styles.queueCard}>
              <View style={styles.queueHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.queueTitle}>2. SCANNED BATCH QUEUE</Text>
                  <View style={styles.queueCountBadge}>
                    <Text style={styles.queueCountText}>{queue.length} device{queue.length === 1 ? '' : 's'}</Text>
                  </View>
                </View>

                {queue.length > 0 && (
                  <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll} disabled={isImporting}>
                    <Feather name="trash-2" size={12} color="#dc2626" style={{ marginRight: 4 }} />
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>

              {queue.length === 0 ? (
                <View style={styles.queueEmptyBox}>
                  <Feather name="inbox" size={32} color="#cbd5e1" />
                  <Text style={styles.queueEmptyText}>Batch queue is currently empty</Text>
                  <Text style={styles.queueEmptySub}>Scan a barcode above or paste a list to populate devices</Text>
                </View>
              ) : (
                <View style={styles.queueTableWrap}>
                  {/* Table Header */}
                  <View style={styles.qThRow}>
                    <Text style={[styles.qTh, { width: 40 }]}>#</Text>
                    <Text style={[styles.qTh, { flex: 1.5, minWidth: 140 }]}>SERIAL NUMBER</Text>
                    <Text style={[styles.qTh, { flex: 1.5, minWidth: 140 }]}>MAC ADDRESS</Text>
                    <Text style={[styles.qTh, { width: 85 }]}>STATUS</Text>
                    <Text style={[styles.qTh, { width: 100 }]}>RESULT</Text>
                    <Text style={[styles.qTh, { width: 45, textAlign: 'center' }]}></Text>
                  </View>

                  {/* Table Rows */}
                  {queue.map((item, idx) => (
                    <View key={item.tempId} style={[styles.qTr, idx % 2 === 1 && styles.qTrEven]}>
                      <Text style={[styles.qTdNum, { width: 40 }]}>{idx + 1}</Text>

                      {/* Serial */}
                      <View style={{ flex: 1.5, minWidth: 140 }}>
                        <Text style={styles.qTdCode} selectable>{item.serial_no || '—'}</Text>
                      </View>

                      {/* MAC */}
                      <View style={{ flex: 1.5, minWidth: 140 }}>
                        <Text style={styles.qTdCode} selectable>{item.mac_address || '—'}</Text>
                      </View>

                      {/* Status */}
                      <View style={{ width: 85 }}>
                        <View style={styles.qStatusBadge}>
                          <Text style={styles.qStatusText}>{item.status.toUpperCase()}</Text>
                        </View>
                      </View>

                      {/* Result */}
                      <View style={{ width: 100 }}>
                        {item.importStatus === 'success' ? (
                          <View style={styles.qSuccessBadge}>
                            <Feather name="check" size={11} color="#059669" />
                            <Text style={styles.qSuccessText}>Imported</Text>
                          </View>
                        ) : item.importStatus === 'error' ? (
                          <View style={styles.qErrorBadge} title={item.errorMsg}>
                            <Feather name="alert-circle" size={11} color="#dc2626" />
                            <Text style={styles.qErrorText} numberOfLines={1}>
                              {item.errorMsg || 'Failed'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.qPendingText}>Ready</Text>
                        )}
                      </View>

                      {/* Remove Row Button */}
                      <View style={{ width: 45, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={styles.qRemoveBtn}
                          onPress={() => handleRemoveItem(item.tempId)}
                          disabled={isImporting}
                          title="Remove from batch"
                        >
                          <Feather name="x" size={14} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Progress Bar when importing */}
            {isImporting && (
              <View style={styles.progressCard}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>
                    Importing device {importProgress.current} of {importProgress.total}...
                  </Text>
                  <Text style={styles.progressPercent}>
                    {Math.round((importProgress.current / Math.max(1, importProgress.total)) * 100)}%
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.round((importProgress.current / Math.max(1, importProgress.total)) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* 5. Modal Footer Actions */}
          <View style={styles.modalFooter}>
            <View style={styles.footerSummary}>
              {selectedModelObj ? (
                <Text style={styles.footerModelText} numberOfLines={1}>
                  Target: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{selectedVendorObj?.name}</Text> · {selectedModelObj.name} ({selectedModelObj.type})
                </Text>
              ) : (
                <Text style={[styles.footerModelText, { color: '#dc2626' }]}>
                  ⚠️ Please select a Vendor & Model
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={isImporting}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.importBtn,
                  (queue.length === 0 || !selectedModelId || isImporting) && styles.importBtnDisabled,
                ]}
                onPress={handleImportBatch}
                disabled={queue.length === 0 || !selectedModelId || isImporting}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
                ) : (
                  <Feather name="upload-cloud" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.importBtnText}>
                  {isImporting
                    ? `Importing (${importProgress.current}/${importProgress.total})...`
                    : `Import ${queue.length} Device${queue.length === 1 ? '' : 's'}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalBox: {
    width: 820,
    maxWidth: '100%',
    maxHeight: '92%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  modalBoxMobile: {
    width: '100%',
    maxHeight: '96%',
    borderRadius: 12,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  headIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  iconToolBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 16,
    flex: 1,
  },

  // 1. Batch Config Card
  batchConfigCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5,
  },
  configGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  configCol: {
    flex: 1.5,
    minWidth: 160,
  },
  configColSmall: {
    flex: 1,
    minWidth: 120,
  },
  configLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  formSelect: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0f172a',
    outlineStyle: 'none',
    cursor: 'pointer',
    height: 34,
  },
  nativeDateInput: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: '#0f172a',
    outlineStyle: 'none',
    height: 34,
    boxSizing: 'border-box',
  },

  // 2. Scan Method Card
  scanMethodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 14,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  scanTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    gap: 4,
    marginBottom: 12,
  },
  scanTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  scanTabActive: {
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  scanTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
  },
  scanTabTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  targetPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  targetPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 4,
  },
  targetPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  targetPillActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  targetPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  targetPillTextActive: {
    color: '#0369a1',
    fontWeight: '700',
  },

  // Gun Input UI
  gunScanBox: {
    gap: 8,
  },
  pairedAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  pairedAlertText: {
    fontSize: 12,
    color: '#047857',
  },
  gunInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    boxShadow: '0 0 0 3px rgba(2, 132, 199, 0.15)',
  },
  gunInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0f172a',
    outlineStyle: 'none',
  },
  gunAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gunAddBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  gunHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  gunHintText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },

  // Camera UI
  cameraBox: {
    padding: 6,
  },
  videoContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
  },
  viewfinderFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  viewfinderBox: {
    width: 220,
    height: 140,
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
  },
  viewfinderScanLine: {
    position: 'absolute',
    top: '48%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#ef4444',
  },
  cameraStopBtn: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cameraStopBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    gap: 8,
  },
  cameraPlaceholderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  cameraPlaceholderSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 380,
  },
  cameraErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    maxWidth: 420,
  },
  cameraErrorText: {
    fontSize: 11,
    color: '#b91c1c',
  },
  cameraStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    marginTop: 4,
  },
  cameraStartBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Paste UI
  pasteBox: {
    gap: 8,
  },
  pasteHint: {
    fontSize: 11.5,
    color: '#475569',
  },
  pasteTextarea: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: '#0f172a',
    fontFamily: 'monospace',
    outlineStyle: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  pasteAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  pasteAddBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // 3. Staging Queue Table
  queueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    marginBottom: 10,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  queueTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5,
  },
  queueCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
  },
  queueCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0369a1',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#fee2e2',
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  queueEmptyBox: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  queueEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  queueEmptySub: {
    fontSize: 11.5,
    color: '#94a3b8',
    textAlign: 'center',
  },
  queueTableWrap: {
    maxHeight: 280,
    overflow: 'auto',
  },
  qThRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  qTh: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.4,
  },
  qTr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  qTrEven: {
    backgroundColor: '#fafbfc',
  },
  qTdNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  qTdCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  qStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    alignSelf: 'flex-start',
  },
  qStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  qSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  qSuccessText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  qErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  qErrorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
    maxWidth: 75,
  },
  qPendingText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  qRemoveBtn: {
    padding: 3,
  },

  // Progress Bar
  progressCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 10,
    marginTop: 6,
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369a1',
  },
  progressPercent: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0369a1',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0284c7',
    borderRadius: 3,
  },

  // Modal Footer
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexWrap: 'wrap',
    gap: 10,
  },
  footerSummary: {
    flex: 1,
    minWidth: 200,
  },
  footerModelText: {
    fontSize: 12,
    color: '#475569',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
  },
  importBtnDisabled: {
    backgroundColor: '#94a3b8',
    boxShadow: 'none',
    opacity: 0.6,
  },
  importBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
