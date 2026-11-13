import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../services/oneBssApi';
import { SafeSelect } from './SafeSelect';

// Safe Web Audio API scanner feedback
const playScannerSound = (type = 'success') => {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'duplicate') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {}
};

// Clean MAC string of common barcode prefixes
const cleanRawMac = (input) => {
  if (!input) return '';
  let s = String(input).trim();
  return s.replace(/^(MAC|HW|LAN\s*MAC|PON\s*MAC)[:=\s-]*/i, '');
};

// Strict check: ONLY allow if it has valid MAC properties (exactly 12 hex digits)
const isValidMacAddress = (input) => {
  if (!input) return false;
  const s = cleanRawMac(input);
  const hexOnly = s.replace(/[^0-9A-Fa-f]/g, '');
  if (hexOnly.length !== 12) return false;
  // If delimiters are used, check that all characters are hex or standard delimiters
  const nonHexOrDelim = s.replace(/[0-9A-Fa-f:\-.\s]/g, '');
  if (nonHexOrDelim.length > 0) return false;
  return true;
};

// Format strictly to XX:XX:XX:XX:XX:XX
const formatMacAddress = (input) => {
  if (!input) return '';
  const s = cleanRawMac(input);
  const hexOnly = s.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (hexOnly.length === 12) {
    return hexOnly.match(/.{1,2}/g).join(':');
  }
  return '';
};

export const InwardStockModal = ({
  visible = true,
  onClose,
  onOpenScannerForBatch,
  onFilterByBatch,
  isFullPage = false,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active view: 'list' (History) | 'create' (New Inward 2-Step Flow)
  const [activeTab, setActiveTab] = useState('list');
  // 2-Step flow within 'create': Step 1 (Consignment Details) -> Step 2 (Scan & Match Devices)
  const [createStep, setCreateStep] = useState(1);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data lists
  const [shipments, setShipments] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [models, setModels] = useState([]);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');

  // Step 1: Consignment Details Form State
  const [productId, setProductId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [modelId, setModelId] = useState('');
  const [ponType, setPonType] = useState('GPON');
  const [quantity, setQuantity] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [deliveryPartner, setDeliveryPartner] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [deliveryPartnerPhno, setDeliveryPartnerPhno] = useState('');

  // Step 2: Active Consignment & Device Scanner State
  const [activeBatch, setActiveBatch] = useState(null); // { batch_id, vendor_id, model_id, vendor_name, model_name, pon_type, quantity, lr_number }
  const [scanMode, setScanMode] = useState('gun'); // 'gun' | 'paste' | 'manual'
  const [gunSerialInput, setGunSerialInput] = useState('');
  const [gunMacInput, setGunMacInput] = useState('');
  const [holdingSerial, setHoldingSerial] = useState(''); // When scanning serial first, holds it awaiting MAC
  const [pasteText, setPasteText] = useState('');
  const [manualSerial, setManualSerial] = useState('');
  const [manualMac, setManualMac] = useState('');
  const [queue, setQueue] = useState([]); // [{ id, serial_no, mac_address }]
  const [isImporting, setIsImporting] = useState(false);

  const gunSerialRef = useRef(null);
  const gunMacRef = useRef(null);

  // Reliable focus keeper for barcode gun scanning (prevent focus loss on scan/enter)
  const refocusGunInput = useCallback(() => {
    const applyFocus = () => {
      try {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const el = document.getElementById('inward-barcode-gun-input');
          if (el) {
            el.focus();
            if (typeof el.select === 'function') el.select();
            return;
          }
        }
        if (gunSerialRef.current) {
          gunSerialRef.current.focus?.();
          const node = gunSerialRef.current?.node || gunSerialRef.current?._node || gunSerialRef.current;
          if (node && typeof node.focus === 'function') {
            node.focus();
            if (typeof node.select === 'function') {
              node.select();
            }
          }
        }
      } catch (e) {}
    };

    applyFocus();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(applyFocus);
    }
    setTimeout(applyFocus, 20);
    setTimeout(applyFocus, 70);
    setTimeout(applyFocus, 160);
  }, []);

  // Ensure gun input is focused on step 2, when holdingSerial changes, or queue changes
  useEffect(() => {
    if (createStep === 2 && scanMode === 'gun') {
      refocusGunInput();
    }
  }, [createStep, scanMode, holdingSerial, queue.length, refocusGunInput]);

  // Inline Quick Add Modals
  const [quickAddType, setQuickAddType] = useState(null); // 'product' | 'vendor' | 'model' | 'staff'
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddRole, setQuickAddRole] = useState('Store Staff');
  const [quickAddPonType, setQuickAddPonType] = useState('GPON');
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Fetch Metadata & Shipments
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, shipRes] = await Promise.all([
        OneBssApi.getInventoryMeta(),
        OneBssApi.getInwardShipments({ search }),
      ]);

      if (metaRes.ok && metaRes.data?.success) {
        const d = metaRes.data;
        setProducts(d.products || []);
        setVendors(d.vendors || []);
        setModels(d.all_models || []);
        setStaff(d.staff || []);

        if (d.products?.length > 0 && !productId) {
          setProductId(String(d.products[0].product_id));
        }
        if (d.staff?.length > 0 && !receivedBy) {
          setReceivedBy(String(d.staff[0].id));
        }
      }

      if (shipRes.ok && shipRes.data?.success) {
        setShipments(shipRes.data.shipments || []);
      }
    } catch (err) {
      toast.error('Failed to load inward inventory data');
    } finally {
      setLoading(false);
    }
  }, [search, productId, receivedBy]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  // Filter vendors based on selected product
  const availableVendors = useMemo(() => {
    if (!productId) return vendors;
    return vendors.filter((v) => String(v.product_id) === String(productId));
  }, [vendors, productId]);

  // Filter models based on selected vendor
  const availableModels = useMemo(() => {
    if (!vendorId) return models;
    return models.filter((m) => String(m.vendor_id) === String(vendorId));
  }, [models, vendorId]);

  // Keep vendor selection valid
  useEffect(() => {
    if (availableVendors.length > 0) {
      if (!vendorId || !availableVendors.some((v) => String(v.vendor_id) === String(vendorId))) {
        setVendorId(String(availableVendors[0].vendor_id));
      }
    } else {
      setVendorId('');
    }
  }, [availableVendors, vendorId]);

  // Keep model selection valid
  useEffect(() => {
    if (availableModels.length > 0) {
      if (!modelId || !availableModels.some((m) => String(m.id) === String(modelId))) {
        setModelId(String(availableModels[0].id));
        if (availableModels[0].type) {
          setPonType(availableModels[0].type);
        }
      }
    } else {
      setModelId('');
    }
  }, [availableModels, modelId]);

  // STEP 1 -> STEP 2: Submit Consignment Details & Advance to Device Scanner
  const handleProceedToScanning = async () => {
    const qtyNum = parseInt(quantity, 10);
    if (!productId) return toast.error('Please select a Product category');
    if (!vendorId) return toast.error('Please select a Vendor');
    if (!modelId) return toast.error('Please select a Model');
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return toast.error('Please enter a valid Consignment Quantity (> 0)');
    }
    if (!receivedBy) return toast.error('Please select Receiving Staff');
    if (!receivedFrom.trim()) return toast.error('Please enter Received From (Supplier / Sender)');
    if (!deliveryPartner.trim()) return toast.error('Please enter Delivery Partner (Courier / Transport)');
    if (!lrNumber.trim()) return toast.error('Please enter LR Number / Waybill #');

    setSubmitting(true);
    try {
      const payload = {
        product: Number(productId),
        vendor: Number(vendorId),
        model: Number(modelId),
        type: ponType,
        quantity: qtyNum,
        received_by: Number(receivedBy),
        received_from: receivedFrom.trim(),
        delivery_partner: deliveryPartner.trim(),
        lr_number: lrNumber.trim(),
        delivery_partner_phno: deliveryPartnerPhno.trim(),
      };

      const res = await OneBssApi.createInwardShipment(payload);
      if (res.ok && res.data?.success) {
        const newBatchId = res.data.batch_id;
        const selectedModel = models.find((m) => String(m.id) === String(modelId));
        const selectedVendor = vendors.find((v) => String(v.vendor_id) === String(vendorId));

        toast.success(`Consignment #${newBatchId} registered! Now scan the ${qtyNum} devices.`);

        // Store active batch info
        setActiveBatch({
          batch_id: newBatchId,
          product_id: productId,
          vendor_id: vendorId,
          model_id: modelId,
          vendor_name: selectedVendor?.vendor_name || 'Vendor',
          model_name: selectedModel?.model_name || 'Model',
          pon_type: ponType,
          quantity: qtyNum,
          lr_number: payload.lr_number,
          received_from: payload.received_from,
        });

        // Initialize queue and move directly to Step 2!
        setQueue([]);
        setHoldingSerial('');
        setGunSerialInput('');
        setGunMacInput('');
        setPasteText('');
        setCreateStep(2);

        // Reload consignment list in the background
        loadData();
      } else {
        toast.error(res.data?.message || 'Failed to record consignment');
      }
    } catch (err) {
      toast.error('Network error creating inward consignment');
    } finally {
      setSubmitting(false);
    }
  };

  // Resume Scanning for an existing shipment from the list
  const handleResumeConsignmentScanning = (ship) => {
    setActiveBatch({
      batch_id: ship.id,
      product_id: ship.product_id,
      vendor_id: ship.vendor_id,
      model_id: ship.model_id,
      vendor_name: ship.vendor_name || 'Vendor',
      model_name: ship.model_name || 'Model',
      pon_type: ship.pon_type || 'GPON',
      quantity: Number(ship.quantity || 0),
      scanned_count: Number(ship.scanned_count || 0),
      lr_number: ship.lr_number,
      received_from: ship.received_from,
    });
    setQueue([]);
    setHoldingSerial('');
    setCreateStep(2);
    setActiveTab('create');
  };

  // Add a single device to queue with strict limit & duplicate/update check
  const addDeviceToQueue = (serialNo, macAddr) => {
    const s = String(serialNo || '').trim().toUpperCase();
    let m = '';

    if (macAddr) {
      if (!isValidMacAddress(macAddr)) {
        playScannerSound('error');
        toast.error(`Invalid MAC address: "${macAddr}". Must be 12 hexadecimal characters.`);
        return false;
      }
      m = formatMacAddress(macAddr);
    }

    if (!s) {
      playScannerSound('error');
      toast.warn('Serial number cannot be empty');
      return false;
    }

    if (!activeBatch) return false;

    // Check if device is ALREADY in active queue: if so, replace/update its MAC!
    const existingIndex = queue.findIndex((d) => d.serial_no.toLowerCase() === s.toLowerCase());
    if (existingIndex >= 0) {
      const updatedQueue = [...queue];
      const oldMac = updatedQueue[existingIndex].mac_address;
      updatedQueue[existingIndex] = {
        ...updatedQueue[existingIndex],
        mac_address: m || oldMac,
      };
      setQueue(updatedQueue);
      playScannerSound('success');
      toast.success(`Updated device "${s}": MAC changed from "${oldMac || 'none'}" to "${m || 'none'}"`);
      return true;
    }

    // Strict Consignment Quantity Check
    const targetQty = activeBatch.quantity || 0;
    const currentTotal = (activeBatch.scanned_count || 0) + queue.length;
    if (currentTotal >= targetQty) {
      playScannerSound('error');
      toast.error(`Consignment limit reached! Exactly ${targetQty} devices expected.`);
      return false;
    }

    // Check duplicate MAC in active queue
    if (m) {
      const isDupMac = queue.some((d) => d.mac_address && d.mac_address.toLowerCase() === m.toLowerCase());
      if (isDupMac) {
        playScannerSound('duplicate');
        toast.error(`Duplicate MAC: "${m}" already scanned in this session!`);
        return false;
      }
    }

    // Add new device to queue
    const newDevice = {
      id: Date.now() + Math.random(),
      serial_no: s,
      mac_address: m,
      status: 'not_configured',
    };

    setQueue((prev) => [...prev, newDevice]);
    playScannerSound('success');
    return true;
  };

  // Remove device from queue
  const removeDeviceFromQueue = (devId) => {
    setQueue((prev) => prev.filter((d) => d.id !== devId));
    refocusGunInput();
  };

  // Handler for Barcode Gun / Rapid input
  const handleGunInputSubmit = () => {
    const rawVal = gunSerialInput.trim();
    if (!rawVal) {
      refocusGunInput();
      return;
    }

    // Check if scanned value contains both serial and MAC (e.g. space, comma or tab separated)
    const tokens = rawVal.split(/[\s,;|]+/).filter(Boolean);
    if (tokens.length >= 2) {
      let sPart = tokens[0];
      let mPart = tokens[1];
      if (isValidMacAddress(tokens[0]) && !isValidMacAddress(tokens[1])) {
        mPart = tokens[0];
        sPart = tokens[1];
      }
      if (mPart && !isValidMacAddress(mPart)) {
        playScannerSound('error');
        toast.error(`Invalid MAC address: "${mPart}". Must be 12 hexadecimal characters.`);
        setGunSerialInput('');
        refocusGunInput();
        return;
      }
      const success = addDeviceToQueue(sPart, mPart);
      if (success) {
        setHoldingSerial('');
        setGunSerialInput('');
      }
      refocusGunInput();
      return;
    }

    // STEP 2: When holding a serial and waiting for MAC
    if (holdingSerial) {
      // Check if scanned input has valid MAC address properties (12 hex digits)
      if (isValidMacAddress(rawVal)) {
        const formattedMac = formatMacAddress(rawVal);
        const success = addDeviceToQueue(holdingSerial, formattedMac);
        if (success) {
          setHoldingSerial('');
          setGunSerialInput('');
        }
        refocusGunInput();
        return;
      }

      // Check if the user accidentally scanned the same serial number again
      if (rawVal.toUpperCase() === holdingSerial.toUpperCase()) {
        playScannerSound('error');
        toast.warn(`"${rawVal.toUpperCase()}" is the Serial Number you just scanned. Now scan the 12-digit MAC address.`);
        setGunSerialInput('');
        refocusGunInput();
        return;
      }

      // STRICT VALIDATION: MAC address MUST be 12 hexadecimal characters
      const cleaned = cleanRawMac(rawVal);
      const hexCount = cleaned.replace(/[^0-9A-Fa-f]/g, '').length;
      playScannerSound('error');
      toast.error(
        `Invalid MAC address! MAC address must be exactly 12 hexadecimal characters (0-9, A-F). You entered "${rawVal}" (${hexCount} hex digit${hexCount === 1 ? '' : 's'}). Please scan a valid MAC.`
      );
      setGunSerialInput('');
      refocusGunInput();
      return;
    }

    // STEP 1: No serial held yet. Scan is for Serial Number.
    // If the operator accidentally scanned a MAC barcode first:
    if (isValidMacAddress(rawVal)) {
      playScannerSound('error');
      toast.warn(`"${rawVal}" is a MAC address. Please scan device Serial Number first.`);
      setGunSerialInput('');
      refocusGunInput();
      return;
    }

    // Check if device with this Serial is already in queue
    const alreadyInQueue = queue.some((d) => d.serial_no.toLowerCase() === rawVal.toLowerCase());
    setHoldingSerial(rawVal.toUpperCase());
    setGunSerialInput('');
    refocusGunInput();
    playScannerSound('success');
    if (alreadyInQueue) {
      toast.info(`Device "${rawVal.toUpperCase()}" is already in queue. Scan new MAC to replace old MAC, or re-scan Serial.`);
    } else {
      toast.info(`Serial "${rawVal.toUpperCase()}" recorded. Now scan MAC address...`);
    }
  };

  // Handler for Bulk Paste input
  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return toast.warn('Please paste serials/MACs to import');
    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    let addedCount = 0;
    const targetQty = activeBatch?.quantity || 0;

    for (const line of lines) {
      const currentTotal = (activeBatch?.scanned_count || 0) + queue.length + addedCount;
      if (currentTotal >= targetQty) {
        toast.warn(`Stopped paste: reached consignment target of ${targetQty} units.`);
        break;
      }

      const tokens = line.split(/[\s,\t;|]+/).filter(Boolean);
      if (tokens.length >= 2) {
        const s = tokens[0];
        const m = tokens[1];
        if (addDeviceToQueue(s, m)) {
          addedCount += 1;
        }
      } else if (tokens.length === 1) {
        const s = tokens[0];
        if (addDeviceToQueue(s, '')) {
          addedCount += 1;
        }
      }
    }

    if (addedCount > 0) {
      toast.success(`Parsed & added ${addedCount} devices to consignment queue.`);
      setPasteText('');
    }
  };

  // Handler for Manual Single Device Form
  const handleManualAddSubmit = () => {
    if (!manualSerial.trim()) return toast.error('Serial number is required');
    const success = addDeviceToQueue(manualSerial.trim(), manualMac.trim());
    if (success) {
      setManualSerial('');
      setManualMac('');
    }
  };

  // FINAL STEP 2 COMPLETION: Strictly import matched devices into `onu` table
  const handleFinalizeConsignmentImport = async () => {
    if (!activeBatch) return;

    const targetQty = activeBatch.quantity || 0;
    const totalScanned = (activeBatch.scanned_count || 0) + queue.length;

    // Strict matching check
    if (totalScanned !== targetQty) {
      playScannerSound('error');
      return toast.error(
        `Consignment count mismatch! Expected: ${targetQty}, Scanned: ${totalScanned}. Must match exactly before final completion.`
      );
    }

    setIsImporting(true);
    try {
      const payload = {
        batch_id: Number(activeBatch.batch_id),
        devices: queue.map((d) => ({
          serial_no: d.serial_no,
          mac_address: d.mac_address || '',
        })),
      };

      const res = await OneBssApi.bulkInwardOnus(payload);
      if (res.ok && res.data?.success) {
        toast.success(
          `🎉 Consignment #${activeBatch.batch_id} fully inwarded! ${res.data.inserted_count} devices added to stock.`
        );

        // Reset flow and return to consignment list
        setQueue([]);
        setActiveBatch(null);
        setCreateStep(1);
        setActiveTab('list');

        // Reset step 1 inputs
        setQuantity('');
        setReceivedFrom('');
        setDeliveryPartner('');
        setLrNumber('');
        setDeliveryPartnerPhno('');

        // Reload consignments list
        await loadData();
      } else {
        toast.error(res.data?.message || 'Failed to complete consignment import');
      }
    } catch (err) {
      toast.error('Network error during final consignment import');
    } finally {
      setIsImporting(false);
    }
  };

  // Submit Quick Add (Product / Vendor / Model / Staff)
  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return toast.error('Name is required');

    setQuickAddLoading(true);
    try {
      let payload = {};
      if (quickAddType === 'product') {
        payload = { action: 'add_product', name: quickAddName.trim() };
      } else if (quickAddType === 'vendor') {
        if (!productId) return toast.error('Please select a product first');
        payload = { action: 'add_vendor', product_id: Number(productId), name: quickAddName.trim() };
      } else if (quickAddType === 'model') {
        if (!productId || !vendorId) return toast.error('Please select product & vendor first');
        payload = {
          action: 'add_model',
          product_id: Number(productId),
          vendor_id: Number(vendorId),
          name: quickAddName.trim(),
          type: quickAddPonType,
        };
      } else if (quickAddType === 'staff') {
        if (!quickAddPhone || quickAddPhone.length !== 10) {
          return toast.error('Please enter a valid 10-digit phone number');
        }
        payload = {
          action: 'add_staff',
          name: quickAddName.trim(),
          phone: quickAddPhone.trim(),
          role: quickAddRole,
        };
      }

      const res = await OneBssApi.manageInventoryCatalog(payload);
      if (res.ok && res.data?.success) {
        toast.success(res.data.message || 'Added successfully');
        setQuickAddType(null);
        setQuickAddName('');
        setQuickAddPhone('');
        await loadData();
      } else {
        toast.error(res.data?.message || 'Failed to add item');
      }
    } catch (err) {
      toast.error('Network error adding catalog item');
    } finally {
      setQuickAddLoading(false);
    }
  };

  // Render Quick Add Modal
  const renderQuickAddModal = () => (
    <Modal visible={true} transparent animationType="fade" onRequestClose={() => setQuickAddType(null)}>
      <View style={styles.quickModalBackdrop}>
        <View style={styles.quickModalBox}>
          <View style={styles.quickModalHeader}>
            <Text style={styles.quickModalTitle}>
              + Add New {quickAddType?.toUpperCase()}
            </Text>
            <TouchableOpacity onPress={() => setQuickAddType(null)}>
              <Feather name="x" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16 }}>
            <Text style={styles.fieldLabel}>Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <TextInput
              style={styles.textInput}
              placeholder={`e.g. ${quickAddType === 'product' ? 'Fiber Router' : quickAddType === 'vendor' ? 'TP-Link' : quickAddType === 'model' ? 'XC220-G3v' : 'Ramesh Kumar'}`}
              placeholderTextColor="#94a3b8"
              value={quickAddName}
              onChangeText={setQuickAddName}
              autoFocus
            />

            {quickAddType === 'model' && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>PON Type</Text>
                <SafeSelect
                  value={quickAddPonType}
                  onChange={setQuickAddPonType}
                  options={['GPON', 'EPON', 'XPON']}
                  title="Select PON Type"
                />
              </View>
            )}

            {quickAddType === 'staff' && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>Phone Number <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="10 digit mobile"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={quickAddPhone}
                  onChangeText={setQuickAddPhone}
                />
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Staff Role</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Store Manager"
                  placeholderTextColor="#94a3b8"
                  value={quickAddRole}
                  onChangeText={setQuickAddRole}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={styles.quickCancelBtn}
                onPress={() => setQuickAddType(null)}
              >
                <Text style={styles.quickCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickSaveBtn, quickAddLoading && styles.submitBtnDisabled]}
                onPress={handleQuickAdd}
                disabled={quickAddLoading}
              >
                {quickAddLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.quickSaveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Step 2 Calculation helpers
  const targetQuantity = activeBatch?.quantity || 0;
  const alreadyInwarded = activeBatch?.scanned_count || 0;
  const currentScannedTotal = alreadyInwarded + queue.length;
  const remainingToScan = Math.max(0, targetQuantity - currentScannedTotal);
  const isExactMatch = currentScannedTotal === targetQuantity && targetQuantity > 0;
  const progressPercent = targetQuantity > 0 ? Math.min(100, Math.round((currentScannedTotal / targetQuantity) * 100)) : 0;

  const mainView = (
    <View style={[styles.modalBox, isMobile && styles.modalBoxMobile, isFullPage && styles.fullPageView]}>
      {/* Header */}
      <View style={[styles.modalHead, isFullPage && styles.modalHeadFullPage]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="truck-delivery" size={20} color="#0284c7" />
          </View>
          <View>
            <Text style={styles.modalTitle}>Inward Stock Management</Text>
            <Text style={styles.modalSubtitle}>Consignment shipments, LR tracking & integrated device scanning</Text>
          </View>
        </View>
        {isFullPage ? (
          <TouchableOpacity onPress={onClose} style={styles.backBtnFullPage}>
            <Feather name="arrow-left" size={14} color="#0284c7" />
            <Text style={styles.backBtnFullPageText}>Back to Device Inventory</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          onPress={() => {
            setActiveTab('list');
            setCreateStep(1);
          }}
        >
          <Feather name="list" size={14} color={activeTab === 'list' ? '#0284c7' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'list' && styles.tabTextActive]}>
            Consignment History ({shipments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'create' && styles.tabBtnActive]}
          onPress={() => setActiveTab('create')}
        >
          <Feather name="plus-circle" size={14} color={activeTab === 'create' ? '#0284c7' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
            + New Inward Consignment
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Body */}
      <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
        {activeTab === 'list' ? (
          /* ======================================================== */
          /* 1. CONSIGNMENT HISTORY TAB                               */
          /* ======================================================== */
          <View>
            {/* Search Bar */}
            <View style={styles.filterRow}>
              <View style={styles.searchBar}>
                <Feather name="search" size={14} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by LR number, supplier, courier, or model..."
                  placeholderTextColor="#94a3b8"
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Feather name="x-circle" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity style={styles.reloadBtn} onPress={loadData}>
                <Feather name="refresh-cw" size={14} color="#0284c7" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={styles.loadingText}>Loading inward shipments...</Text>
              </View>
            ) : shipments.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="package-variant-closed" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No Inward Consignments Yet</Text>
                <Text style={styles.emptySubtitle}>Log your first incoming stock shipment to start tracking hardware units.</Text>
                <TouchableOpacity style={styles.emptyActionBtn} onPress={() => setActiveTab('create')}>
                  <Text style={styles.emptyActionText}>+ Record First Consignment</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.shipmentList}>
                {shipments.map((ship) => {
                  const scanned = Number(ship.scanned_count || 0);
                  const total = Number(ship.quantity || 0);
                  const isComplete = scanned >= total && total > 0;
                  const progressPct = Math.min(100, Math.round((scanned / Math.max(1, total)) * 100));

                  return (
                    <View key={ship.id} style={styles.shipmentCard}>
                      <View style={styles.cardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.batchPill}>
                            <Text style={styles.batchPillText}>CONSIGNMENT #{ship.id}</Text>
                          </View>
                          <Text style={styles.dateText}>
                            {ship.received_date ? new Date(ship.received_date).toLocaleDateString('en-GB') : '—'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isComplete ? styles.statusBadgeDone : styles.statusBadgePending,
                          ]}
                        >
                          <Feather
                            name={isComplete ? 'check-circle' : 'clock'}
                            size={12}
                            color={isComplete ? '#047857' : '#b45309'}
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isComplete ? { color: '#047857' } : { color: '#b45309' },
                            ]}
                          >
                            {isComplete ? '100% MATCHED (COMPLETED)' : `${scanned} / ${total} SCANNED (${progressPct}%)`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardContent}>
                        <View style={styles.infoCol}>
                          <Text style={styles.infoLabel}>DEVICE SPEC</Text>
                          <Text style={styles.deviceTitle}>
                            {ship.vendor_name || 'Vendor'} · {ship.model_name || 'Model'}
                          </Text>
                          <View style={styles.tagRow}>
                            <View style={styles.ponTag}>
                              <Text style={styles.ponTagText}>{ship.pon_type || 'GPON'}</Text>
                            </View>
                            <Text style={styles.productTag}>{ship.product_name || 'Hardware'}</Text>
                          </View>
                        </View>

                        <View style={styles.infoCol}>
                          <Text style={styles.infoLabel}>LOGISTICS & COURIER</Text>
                          <Text style={styles.infoValue}>
                            <Text style={{ fontWeight: '700' }}>LR / Tracking:</Text> {ship.lr_number || '—'}
                          </Text>
                          <Text style={styles.infoValue}>
                            <Text style={{ fontWeight: '700' }}>Courier:</Text> {ship.delivery_partner || '—'}
                            {ship.delivery_partner_phno ? ` (${ship.delivery_partner_phno})` : ''}
                          </Text>
                          <Text style={styles.infoValue}>
                            <Text style={{ fontWeight: '700' }}>From:</Text> {ship.received_from || '—'}
                          </Text>
                          <Text style={styles.infoValue}>
                            <Text style={{ fontWeight: '700' }}>Received By:</Text> {ship.staff_name || 'Staff'}
                          </Text>
                        </View>
                      </View>

                      {/* Visual Progress Bar */}
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${progressPct}%` },
                            isComplete && { backgroundColor: '#047857' },
                          ]}
                        />
                      </View>

                      {/* Action Buttons */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.viewUnitsBtn}
                          onPress={() => {
                            onClose();
                            if (onFilterByBatch) onFilterByBatch(ship.id);
                          }}
                        >
                          <Feather name="layers" size={13} color="#0284c7" />
                          <Text style={styles.viewUnitsBtnText}>View {scanned} Registered Devices</Text>
                        </TouchableOpacity>

                        {!isComplete ? (
                          <TouchableOpacity
                            style={styles.scanActionBtn}
                            onPress={() => handleResumeConsignmentScanning(ship)}
                          >
                            <Feather name="maximize" size={13} color="#ffffff" />
                            <Text style={styles.scanActionBtnText}>
                              Scan Devices ({total - scanned} Remaining)
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.completedBadgePill}>
                            <Feather name="check" size={13} color="#047857" />
                            <Text style={styles.completedBadgeText}>Consignment Matched & Stored</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : createStep === 1 ? (
          /* ======================================================== */
          /* 2. STEP 1: CONSIGNMENT DETAILS FORM                      */
          /* ======================================================== */
          <View style={styles.formContainer}>
            {/* Step Wizard Header */}
            <View style={styles.wizardHeader}>
              <View style={[styles.wizardStepBadge, styles.wizardStepActive]}>
                <Text style={styles.wizardStepNumActive}>1</Text>
                <Text style={styles.wizardStepTextActive}>Consignment Details</Text>
              </View>
              <View style={styles.wizardLine} />
              <View style={[styles.wizardStepBadge, styles.wizardStepInactive]}>
                <Text style={styles.wizardStepNumInactive}>2</Text>
                <Text style={styles.wizardStepTextInactive}>Scan & Match Devices ({quantity || '0'})</Text>
              </View>
            </View>

            <View style={styles.formSectionHeader}>
              <Feather name="package" size={14} color="#0284c7" />
              <Text style={styles.formSectionTitle}>1. Hardware Specification</Text>
            </View>

            {/* Product Dropdown + Add */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Product Category <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TouchableOpacity onPress={() => setQuickAddType('product')}>
                  <Text style={styles.quickAddLink}>+ New Product</Text>
                </TouchableOpacity>
              </View>
              <SafeSelect
                value={productId}
                onChange={setProductId}
                options={products.map((p) => ({ value: p.product_id, label: p.product_name }))}
                placeholder="Select Product Category"
                title="Select Product"
              />
            </View>

            {/* Vendor Dropdown + Add */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Vendor / Manufacturer <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TouchableOpacity onPress={() => setQuickAddType('vendor')}>
                  <Text style={styles.quickAddLink}>+ New Vendor</Text>
                </TouchableOpacity>
              </View>
              <SafeSelect
                value={vendorId}
                onChange={setVendorId}
                options={availableVendors.map((v) => ({ value: v.vendor_id, label: v.vendor_name }))}
                placeholder={availableVendors.length === 0 ? 'No vendors for selected product' : 'Select Vendor'}
                title="Select Vendor"
              />
            </View>

            {/* Model Dropdown + Add */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Hardware Model <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TouchableOpacity onPress={() => setQuickAddType('model')}>
                  <Text style={styles.quickAddLink}>+ New Model</Text>
                </TouchableOpacity>
              </View>
              <SafeSelect
                value={modelId}
                onChange={(mId) => {
                  setModelId(mId);
                  const m = models.find((item) => String(item.id) === String(mId));
                  if (m?.type) setPonType(m.type);
                }}
                options={availableModels.map((m) => ({ value: m.id, label: `${m.model_name} (${m.type})` }))}
                placeholder={availableModels.length === 0 ? 'No models for selected vendor' : 'Select Model'}
                title="Select Model"
              />
            </View>

            {/* Consignment Quantity */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Consignment Quantity (Units) <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '600' }}>Strict Match Enforced</Text>
              </View>
              <TextInput
                style={[styles.textInput, { fontSize: 15, fontWeight: '700' }]}
                placeholder="e.g. 50"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>

            <View style={styles.formSectionHeader}>
              <Feather name="truck" size={14} color="#0284c7" />
              <Text style={styles.formSectionTitle}>2. Logistics & Warehouse Reception</Text>
            </View>

            {/* Receiving Staff + Add */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Received By (Office Staff) <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TouchableOpacity onPress={() => setQuickAddType('staff')}>
                  <Text style={styles.quickAddLink}>+ New Staff</Text>
                </TouchableOpacity>
              </View>
              <SafeSelect
                value={receivedBy}
                onChange={setReceivedBy}
                options={staff.map((s) => ({ value: s.id, label: `${s.staff_name} (${s.staff_role})` }))}
                placeholder="Select Receiving Staff"
                title="Select Office Staff"
              />
            </View>

            {/* Received From (Supplier) */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Received From (Supplier / Sender) <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Optics Distribution Pvt Ltd / Factory Warehouse"
                placeholderTextColor="#94a3b8"
                value={receivedFrom}
                onChangeText={setReceivedFrom}
              />
            </View>

            {/* Delivery Partner */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Delivery Partner (Courier / Transport) <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. VRL Logistics / Blue Dart / DTDC"
                placeholderTextColor="#94a3b8"
                value={deliveryPartner}
                onChangeText={setDeliveryPartner}
              />
            </View>

            {/* LR Number */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>LR Number / Consignment / Waybill # <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. LR-984210"
                placeholderTextColor="#94a3b8"
                value={lrNumber}
                onChangeText={setLrNumber}
              />
            </View>

            {/* Courier Phone */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Delivery Driver / Courier Phone (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={deliveryPartnerPhno}
                onChangeText={setDeliveryPartnerPhno}
              />
            </View>

            {/* Proceed Action Button */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleProceedToScanning}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
              ) : (
                <Feather name="arrow-right-circle" size={16} color="#ffffff" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.submitBtnText}>
                {submitting ? 'Creating Consignment...' : `Proceed to Scan Devices (${quantity || '0'} Units) →`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ======================================================== */
          /* 3. STEP 2: SCAN & MATCH DEVICES INTEGRATED VIEW          */
          /* ======================================================== */
          <View style={styles.scanContainer}>
            {/* Step Wizard Header */}
            <View style={styles.wizardHeader}>
              <TouchableOpacity
                style={[styles.wizardStepBadge, styles.wizardStepCompleted]}
                onPress={() => setCreateStep(1)}
              >
                <Feather name="check" size={13} color="#047857" />
                <Text style={styles.wizardStepTextCompleted}>Consignment #{activeBatch?.batch_id}</Text>
              </TouchableOpacity>
              <View style={styles.wizardLineActive} />
              <View style={[styles.wizardStepBadge, styles.wizardStepActive]}>
                <Text style={styles.wizardStepNumActive}>2</Text>
                <Text style={styles.wizardStepTextActive}>Scan & Match Devices</Text>
              </View>
            </View>

            {/* Consignment Target & Progress Banner */}
            <View style={styles.batchBanner}>
              <View style={styles.batchBannerHead}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.batchPill}>
                      <Text style={styles.batchPillText}>CONSIGNMENT #{activeBatch?.batch_id}</Text>
                    </View>
                    <Text style={styles.batchMetaSub}>LR: {activeBatch?.lr_number}</Text>
                  </View>
                  <Text style={styles.batchBannerTitle}>
                    {activeBatch?.vendor_name} · {activeBatch?.model_name} ({activeBatch?.pon_type})
                  </Text>
                </View>

                {/* Match Counter Badge */}
                <View style={[styles.counterBox, isExactMatch ? styles.counterBoxMatched : styles.counterBoxPending]}>
                  <Text style={styles.counterLabel}>SCAN PROGRESS</Text>
                  <Text style={[styles.counterValue, isExactMatch ? { color: '#047857' } : { color: '#0369a1' }]}>
                    {currentScannedTotal} <Text style={{ fontSize: 13, color: '#64748b' }}>/ {targetQuantity}</Text>
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.bannerProgressTrack}>
                <View
                  style={[
                    styles.bannerProgressFill,
                    { width: `${progressPercent}%` },
                    isExactMatch && { backgroundColor: '#10b981' },
                  ]}
                />
              </View>

              {/* Alert Status Pill */}
              <View style={[styles.statusAlertPill, isExactMatch ? styles.statusAlertMatched : styles.statusAlertPending]}>
                <Feather
                  name={isExactMatch ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={isExactMatch ? '#047857' : '#b45309'}
                />
                <Text style={[styles.statusAlertText, isExactMatch ? { color: '#047857' } : { color: '#b45309' }]}>
                  {isExactMatch
                    ? `✓ Consignment count perfectly matched! All ${targetQuantity} devices scanned and ready to import.`
                    : `⚠️ ${remainingToScan} device(s) remaining to match consignment quantity (${currentScannedTotal}/${targetQuantity}).`}
                </Text>
              </View>
            </View>

            {/* Scanner Mode Selector */}
            <View style={styles.scannerModeRow}>
              <TouchableOpacity
                style={[styles.modeTabBtn, scanMode === 'gun' && styles.modeTabBtnActive]}
                onPress={() => setScanMode('gun')}
              >
                <Feather name="maximize" size={14} color={scanMode === 'gun' ? '#0284c7' : '#64748b'} />
                <Text style={[styles.modeTabText, scanMode === 'gun' && styles.modeTabTextActive]}>
                  Barcode Gun / Rapid Scan
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTabBtn, scanMode === 'paste' && styles.modeTabBtnActive]}
                onPress={() => setScanMode('paste')}
              >
                <Feather name="clipboard" size={14} color={scanMode === 'paste' ? '#0284c7' : '#64748b'} />
                <Text style={[styles.modeTabText, scanMode === 'paste' && styles.modeTabTextActive]}>
                  Bulk Paste
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTabBtn, scanMode === 'manual' && styles.modeTabBtnActive]}
                onPress={() => setScanMode('manual')}
              >
                <Feather name="edit-3" size={14} color={scanMode === 'manual' ? '#0284c7' : '#64748b'} />
                <Text style={[styles.modeTabText, scanMode === 'manual' && styles.modeTabTextActive]}>
                  Manual Entry
                </Text>
              </TouchableOpacity>
            </View>

            {/* Scanner Input Panel */}
            <View style={styles.scannerInputPanel}>
              {scanMode === 'gun' ? (
                <View>
                  <View style={styles.gunPromptRow}>
                    <Text style={styles.gunPromptTitle}>
                      {holdingSerial ? 'STEP 2: SCAN MAC BARCODE' : 'STEP 1: SCAN SERIAL NUMBER'}
                    </Text>
                    <Text style={styles.gunPromptSub}>Barcode gun auto-submits on enter</Text>
                  </View>

                  {holdingSerial ? (
                    <View style={styles.holdingBanner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Feather name="check-circle" size={15} color="#0284c7" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.holdingBannerText}>
                            Serial: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{holdingSerial}</Text>
                          </Text>
                          <Text style={{ fontSize: 11, color: '#0369a1', marginTop: 1 }}>
                            Awaiting MAC. Scan MAC to complete, or re-scan Serial to replace.
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fee2e2' }}
                        onPress={() => {
                          setHoldingSerial('');
                          setGunSerialInput('');
                          refocusGunInput();
                        }}
                      >
                        <Text style={[styles.holdingCancelText, { color: '#dc2626' }]}>Cancel / Change Serial</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      ref={gunSerialRef}
                      nativeID="inward-barcode-gun-input"
                      id="inward-barcode-gun-input"
                      style={[styles.gunInput, holdingSerial && { borderColor: '#0284c7', backgroundColor: '#f0f9ff' }]}
                      placeholder={
                        holdingSerial
                          ? `Scan 12-digit MAC address for Serial: ${holdingSerial}...`
                          : 'Point barcode gun and scan device Serial Number...'
                      }
                      placeholderTextColor="#94a3b8"
                      value={gunSerialInput}
                      onChangeText={setGunSerialInput}
                      onSubmitEditing={handleGunInputSubmit}
                      onKeyPress={(e) => {
                        if (e.nativeEvent?.key === 'Escape') {
                          if (holdingSerial) {
                            setHoldingSerial('');
                            setGunSerialInput('');
                            refocusGunInput();
                            toast.info('Cancelled serial scan.');
                          }
                        }
                      }}
                      blurOnSubmit={false}
                      selectTextOnFocus={true}
                      autoFocus={true}
                      autoCapitalize="characters"
                      onFocus={() => {
                        try {
                          const node = gunSerialRef.current?.node || gunSerialRef.current?._node || gunSerialRef.current;
                          if (node && typeof node.select === 'function') {
                            node.select();
                          }
                        } catch (e) {}
                      }}
                    />
                    <TouchableOpacity style={styles.gunAddBtn} onPress={handleGunInputSubmit}>
                      <Feather name={holdingSerial ? 'check' : 'plus'} size={16} color="#ffffff" />
                      <Text style={styles.gunAddBtnText}>{holdingSerial ? 'Save MAC' : 'Next (MAC)'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : scanMode === 'paste' ? (
                <View>
                  <Text style={styles.fieldLabel}>Paste Devices (Serial [Space/Tab/Comma] MAC per line):</Text>
                  <TextInput
                    style={styles.pasteTextArea}
                    placeholder={"e.g.\nZTEGC1234567 00:1A:2B:3C:4D:5E\nZTEGC1234568 00:1A:2B:3C:4D:5F"}
                    placeholderTextColor="#94a3b8"
                    value={pasteText}
                    onChangeText={setPasteText}
                    multiline={true}
                    numberOfLines={4}
                  />
                  <TouchableOpacity style={styles.pasteSubmitBtn} onPress={handlePasteSubmit}>
                    <Feather name="upload" size={14} color="#ffffff" />
                    <Text style={styles.pasteSubmitBtnText}>Parse & Add to Consignment Queue</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Serial Number <Text style={{ color: '#dc2626' }}>*</Text></Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. ZTEGC8812300"
                        placeholderTextColor="#94a3b8"
                        value={manualSerial}
                        onChangeText={setManualSerial}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>MAC Address (Optional)</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 00:11:22:33:44:55"
                        placeholderTextColor="#94a3b8"
                        value={manualMac}
                        onChangeText={setManualMac}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.pasteSubmitBtn, { marginTop: 12 }]} onPress={handleManualAddSubmit}>
                    <Feather name="plus-circle" size={14} color="#ffffff" />
                    <Text style={styles.pasteSubmitBtnText}>Add Device to Queue</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Queue Devices Table */}
            <View style={styles.queueCard}>
              <View style={styles.queueHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="list" size={15} color="#0f172a" />
                  <Text style={styles.queueTitle}>
                    Scanned Consignment Queue ({queue.length} of {targetQuantity})
                  </Text>
                </View>
                {queue.length > 0 && (
                  <TouchableOpacity onPress={() => setQueue([])}>
                    <Text style={styles.queueClearText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>

              {queue.length === 0 ? (
                <View style={styles.queueEmptyBox}>
                  <Feather name="maximize" size={28} color="#cbd5e1" />
                  <Text style={styles.queueEmptyText}>No devices scanned yet.</Text>
                  <Text style={styles.queueEmptySub}>Scan barcodes above to fill this consignment.</Text>
                </View>
              ) : (
                <View style={styles.queueTable}>
                  <View style={styles.queueTableRowHead}>
                    <Text style={[styles.queueTh, { width: 36 }]}>#</Text>
                    <Text style={[styles.queueTh, { flex: 1.2 }]}>SERIAL NUMBER</Text>
                    <Text style={[styles.queueTh, { flex: 1.2 }]}>MAC ADDRESS</Text>
                    <Text style={[styles.queueTh, { width: 95 }]}>STATUS</Text>
                    <Text style={[styles.queueTh, { width: 65, textAlign: 'center' }]}>ACTIONS</Text>
                  </View>

                  {queue.map((dev, idx) => (
                    <View key={dev.id} style={styles.queueTableRow}>
                      <Text style={[styles.queueTd, { width: 36, color: '#94a3b8' }]}>{idx + 1}</Text>
                      <Text style={[styles.queueTd, { flex: 1.2, fontWeight: '700', color: '#0f172a' }]}>
                        {dev.serial_no}
                      </Text>
                      <Text style={[styles.queueTd, { flex: 1.2, color: '#475569' }]}>
                        {dev.mac_address || '—'}
                      </Text>
                      <View style={{ width: 95 }}>
                        <View style={[styles.inStockBadge, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}>
                          <Text style={[styles.inStockBadgeText, { color: '#475569' }]}>NOT CONFIGURED</Text>
                        </View>
                      </View>
                      <View style={{ width: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setHoldingSerial(dev.serial_no);
                            setGunSerialInput(dev.mac_address || '');
                            refocusGunInput();
                            toast.info(`Editing device ${dev.serial_no}. Re-scan MAC or Serial to update.`);
                          }}
                          title="Re-scan / Edit"
                        >
                          <Feather name="edit-2" size={13} color="#0284c7" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeDeviceFromQueue(dev.id)}
                          title="Remove from queue"
                        >
                          <Feather name="trash-2" size={13} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Bottom Actions Bar */}
            <View style={styles.finalActionsBar}>
              <TouchableOpacity
                style={styles.abortBtn}
                onPress={() => {
                  setActiveTab('list');
                  setCreateStep(1);
                }}
              >
                <Text style={styles.abortBtnText}>Finish Later / Back to List</Text>
              </TouchableOpacity>

              {/* STRICT COMPLETION BUTTON: Enabled ONLY when exact match! */}
              <TouchableOpacity
                style={[
                  styles.finalizeBtn,
                  !isExactMatch && styles.finalizeBtnDisabled,
                  isImporting && styles.submitBtnDisabled,
                ]}
                onPress={handleFinalizeConsignmentImport}
                disabled={!isExactMatch || isImporting}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                ) : (
                  <Feather
                    name={isExactMatch ? 'check-circle' : 'lock'}
                    size={16}
                    color="#ffffff"
                    style={{ marginRight: 8 }}
                  />
                )}
                <Text style={styles.finalizeBtnText}>
                  {isImporting
                    ? 'Importing Devices...'
                    : isExactMatch
                    ? `✓ Complete & Import Consignment (${queue.length}/${targetQuantity} Units)`
                    : `Scan ${remainingToScan} more device(s) to match consignment`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );

  if (isFullPage) {
    return (
      <View style={{ flex: 1, width: '100%' }}>
        {mainView}
        {quickAddType && renderQuickAddModal()}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        {mainView}
        {quickAddType && renderQuickAddModal()}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalBox: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '92%',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalBoxMobile: {
    maxHeight: '98%',
    borderRadius: 8,
  },
  fullPageView: {
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    borderWidth: 0,
    flex: 1,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalHeadFullPage: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
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
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  backBtnFullPage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f9ff',
  },
  backBtnFullPageText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 16,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#0284c7',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    color: '#0f172a',
  },
  reloadBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 380,
  },
  emptyActionBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  shipmentList: {
    gap: 14,
  },
  shipmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  batchPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeDone: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  infoCol: {
    flex: 1,
    minWidth: 200,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  deviceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  ponTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ponTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  productTag: {
    fontSize: 12,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0284c7',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
    flexWrap: 'wrap',
  },
  viewUnitsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  viewUnitsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284c7',
  },
  scanActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  scanActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  completedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },

  /* Wizard Step Navigation */
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  wizardStepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  wizardStepActive: {
    backgroundColor: '#0284c7',
  },
  wizardStepCompleted: {
    backgroundColor: '#dcfce7',
  },
  wizardStepInactive: {
    backgroundColor: '#f1f5f9',
  },
  wizardStepNumActive: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 20,
  },
  wizardStepTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  wizardStepNumInactive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    textAlign: 'center',
    lineHeight: 20,
  },
  wizardStepTextInactive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  wizardStepTextCompleted: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  wizardLine: {
    width: 32,
    height: 2,
    backgroundColor: '#e2e8f0',
  },
  wizardLineActive: {
    width: 32,
    height: 2,
    backgroundColor: '#047857',
  },

  /* Form Container */
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 14,
    marginTop: 8,
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
  },
  formGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  quickAddLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  textInput: {
    height: 42,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    height: 46,
    borderRadius: 8,
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Step 2: Scanner Container */
  scanContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  batchBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  batchBannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  batchMetaSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  batchBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  counterBox: {
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  counterBoxPending: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  counterBoxMatched: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  counterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  bannerProgressTrack: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 12,
  },
  bannerProgressFill: {
    height: '100%',
    backgroundColor: '#0284c7',
  },
  statusAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  statusAlertPending: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  statusAlertMatched: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusAlertText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  /* Scanner Mode Selector */
  scannerModeRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ffffff',
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modeTabBtnActive: {
    backgroundColor: '#f0f9ff',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  modeTabTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },

  /* Scanner Input Panel */
  scannerInputPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  gunPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gunPromptTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  gunPromptSub: {
    fontSize: 11,
    color: '#64748b',
  },
  holdingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
  },
  holdingBannerText: {
    fontSize: 12,
    color: '#0369a1',
  },
  holdingCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444',
  },
  gunInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  gunAddBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  gunAddBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pasteTextArea: {
    height: 90,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
    marginTop: 6,
  },
  pasteSubmitBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 6,
    marginTop: 8,
  },
  pasteSubmitBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Queue Table */
  queueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  queueClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  queueEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  queueEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 8,
  },
  queueEmptySub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  queueTable: {
    display: 'flex',
    flexDirection: 'column',
  },
  queueTableRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  queueTh: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  queueTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  queueTd: {
    fontSize: 12,
  },
  inStockBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  inStockBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },

  /* Final Actions Bar */
  finalActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  abortBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  abortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  finalizeBtn: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857', // Emerald for matched & ready
    height: 48,
    borderRadius: 8,
  },
  finalizeBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.7,
  },
  finalizeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Quick Add Modal */
  quickModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
  },
  quickModalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  quickModalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  quickCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickCancelBtnText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  quickSaveBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  quickSaveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
