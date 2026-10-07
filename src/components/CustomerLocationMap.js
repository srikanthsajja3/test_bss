import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';

// Ensures Leaflet JS is available in the browser window
const ensureLeaflet = async () => {
  if (typeof window === 'undefined') return null;
  if (window.L) return window.L;

  // Add Leaflet CSS if not already attached
  if (!document.getElementById('leaflet-cdn-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-cdn-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  // Load Leaflet JS
  if (!window.L) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'leaflet-cdn-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('Failed to load Leaflet maps library'));
      document.body.appendChild(script);
    });
  }

  return window.L;
};

// SVG Pin Icon for high-contrast crisp rendering
const createPinIcon = (L, color = '#2563eb') => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      <path fill="${color}" stroke="#ffffff" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>
  `;
  return L.divIcon({
    className: 'custom-map-pin',
    html: svg,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

export const CustomerLocationMap = ({
  mobile,
  customerName = 'Subscriber',
  custId = '',
  onLocationSaved,
  isCard = false,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Coordinates state (Default to Hyderabad matching prompt: 17.385044, 78.486671)
  const [latitude, setLatitude] = useState(17.385044);
  const [longitude, setLongitude] = useState(78.486671);
  const [hasServerLocation, setHasServerLocation] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);

  const mapContainerId = useRef(`map-container-${custId || mobile || Math.floor(Math.random() * 100000)}`);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);

  // 1. Fetch Location from GET /customer_location.php?mobile=...
  const fetchLocationData = async () => {
    if (!cleanMobile || cleanMobile.length !== 10) {
      setLoadingLocation(false);
      return;
    }

    setLoadingLocation(true);
    try {
      const res = await OneBssApi.getCustomerLocation(cleanMobile);
      const dataArr = res?.data?.data || res?.data || [];
      const rec = Array.isArray(dataArr) ? dataArr[0] : (typeof dataArr === 'object' ? dataArr : null);

      if (rec && rec.latitude !== null && rec.longitude !== null && rec.latitude !== undefined && rec.longitude !== undefined) {
        const lat = parseFloat(rec.latitude);
        const lng = parseFloat(rec.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          setLatitude(lat);
          setLongitude(lng);
          setHasServerLocation(true);
          updateMapMarker(lat, lng, true);
        } else {
          setHasServerLocation(false);
        }
      } else {
        setHasServerLocation(false);
      }
    } catch (err) {
      console.warn('Error fetching customer location:', err);
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    fetchLocationData();
  }, [cleanMobile]);

  // Helper to move marker and pan map
  const updateMapMarker = (lat, lng, pan = true) => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], {
        icon: createPinIcon(L, '#2563eb'),
        draggable: true,
      }).addTo(mapRef.current);

      markerRef.current.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setLatitude(Number(pos.lat.toFixed(6)));
        setLongitude(Number(pos.lng.toFixed(6)));
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }

    markerRef.current.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
        <strong style="color: #0f172a; font-size: 13px;">${customerName}</strong><br/>
        <span style="color: #64748b;">Mobile: ${cleanMobile}</span><br/>
        <span style="color: #2563eb; font-weight: 600;">Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</span>
      </div>
    `).openPopup();

    if (pan) {
      mapRef.current.setView([lat, lng], 15);
    }
  };

  // 2. Initialize Leaflet Map
  useEffect(() => {
    let isCancelled = false;

    ensureLeaflet().then((L) => {
      if (isCancelled || !L) return;

      const container = document.getElementById(mapContainerId.current);
      if (!container) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }

      const map = L.map(container, {
        center: [latitude, longitude],
        zoom: hasServerLocation ? 15 : 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const marker = L.marker([latitude, longitude], {
        icon: createPinIcon(L, '#2563eb'),
        draggable: true,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
          <strong style="color: #0f172a; font-size: 13px;">${customerName}</strong><br/>
          <span style="color: #64748b;">Mobile: ${cleanMobile}</span><br/>
          <span style="color: #2563eb; font-weight: 600;">Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}</span>
        </div>
      `);

      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setLatitude(Number(pos.lat.toFixed(6)));
        setLongitude(Number(pos.lng.toFixed(6)));
      });

      map.on('click', (e) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        marker.setLatLng([lat, lng]);
        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
            <strong style="color: #0f172a; font-size: 13px;">${customerName}</strong><br/>
            <span style="color: #64748b;">Mobile: ${cleanMobile}</span><br/>
            <span style="color: #2563eb; font-weight: 600;">Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</span>
          </div>
        `).openPopup();
      });

      mapRef.current = map;
      markerRef.current = marker;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }).catch((err) => {
      console.error('Failed to init Leaflet:', err);
    });

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const handleManualCoordChange = (newLat, newLng) => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setLatitude(lat);
      setLongitude(lng);
      updateMapMarker(lat, lng, true);
    }
  };

  // 3. Search location via OpenStreetMap Nominatim
  const handleSearchAddress = async () => {
    if (!addressSearch.trim()) return;
    setSearchingPlace(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch.trim())}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setLatitude(Number(lat.toFixed(6)));
        setLongitude(Number(lng.toFixed(6)));
        updateMapMarker(lat, lng, true);
        toast.info(`Found location: ${data[0].display_name.split(',').slice(0, 3).join(',')}`);
      } else {
        toast.warn('No places found matching that search. Try a nearby landmark or city name.');
      }
    } catch (e) {
      toast.error('Search failed. Check your internet connection.');
    } finally {
      setSearchingPlace(false);
    }
  };

  // 4. Use Current Device GPS
  const handleUseCurrentGps = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = Number(position.coords.latitude.toFixed(6));
          const lng = Number(position.coords.longitude.toFixed(6));
          setLatitude(lat);
          setLongitude(lng);
          updateMapMarker(lat, lng, true);
          toast.success('Centered on your current GPS location!');
        },
        (error) => {
          toast.warn('Could not retrieve GPS location: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      toast.warn('Geolocation is not supported by your browser.');
    }
  };

  // 5. Save location to POST /customer_location.php
  const handleSaveLocation = async () => {
    if (!cleanMobile || cleanMobile.length !== 10) {
      toast.error('Cannot save: Customer does not have a valid 10-digit mobile number.');
      return;
    }

    setSavingLocation(true);
    try {
      const res = await OneBssApi.saveCustomerLocation(cleanMobile, latitude, longitude);
      if (res.ok || res.data?.success) {
        toast.success(`Location saved successfully for ${customerName} (${cleanMobile})!`);
        setHasServerLocation(true);
        if (onLocationSaved) {
          onLocationSaved({ latitude, longitude });
        }
      } else {
        toast.error(res.data?.message || 'Failed to save customer location.');
      }
    } catch (e) {
      toast.error('Network error saving customer location.');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <View style={[styles.card, isCard && styles.cardElevated]}>
      {/* Header Bar */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.iconCircle}>
            <Feather name="map-pin" size={18} color="#2563eb" />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.title}>Customer GPS Location & Map</Text>
              {loadingLocation ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : hasServerLocation ? (
                <View style={styles.badgeSuccess}>
                  <Feather name="check-circle" size={12} color="#15803d" />
                  <Text style={styles.badgeSuccessText}>Location Pinned</Text>
                </View>
              ) : (
                <View style={styles.badgeWarning}>
                  <Feather name="alert-circle" size={12} color="#b45309" />
                  <Text style={styles.badgeWarningText}>Not Set</Text>
                </View>
              )}
            </View>
            <Text style={styles.subtitle}>
              Live geographic mapping & install coordinates for {customerName} · {cleanMobile || 'No mobile'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={handleUseCurrentGps}
            title="Pin Current GPS"
          >
            <Feather name="crosshair" size={13} color="#2563eb" />
            <Text style={styles.btnSecondaryText}>My GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnExternal}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
              }
            }}
            title="Open in Google Maps"
          >
            <Feather name="external-link" size={13} color="#475569" />
            <Text style={styles.btnExternalText}>Google Maps</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Controls & Search Row */}
      <View style={[styles.controlsRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
        {/* Address Search */}
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search city, area, landmark (e.g. Madhapur, Hyderabad)..."
            placeholderTextColor="#94a3b8"
            value={addressSearch}
            onChangeText={setAddressSearch}
            onSubmitEditing={handleSearchAddress}
          />
          {searchingPlace ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <TouchableOpacity onPress={handleSearchAddress} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Find</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lat / Lng Display & Edit */}
        <View style={styles.coordsGroup}>
          <View style={styles.coordInputWrap}>
            <Text style={styles.coordLabel}>LAT:</Text>
            <TextInput
              style={styles.coordInput}
              value={String(latitude)}
              onChangeText={(v) => handleManualCoordChange(v, longitude)}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.coordInputWrap}>
            <Text style={styles.coordLabel}>LNG:</Text>
            <TextInput
              style={styles.coordInput}
              value={String(longitude)}
              onChangeText={(v) => handleManualCoordChange(latitude, v)}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, savingLocation && { opacity: 0.7 }]}
            onPress={handleSaveLocation}
            disabled={savingLocation}
          >
            {savingLocation ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather name="save" size={14} color="#ffffff" />
            )}
            <Text style={styles.saveBtnText}>{savingLocation ? 'Saving...' : 'Save Location'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map Interactive Canvas */}
      <View style={styles.mapFrame}>
        <div
          id={mapContainerId.current}
          style={{
            width: '100%',
            height: isMobile ? 320 : 420,
            borderRadius: 10,
            zIndex: 1,
          }}
        />
        <View style={styles.mapTipBar}>
          <Feather name="info" size={12} color="#475569" />
          <Text style={styles.mapTipText}>
            Click anywhere on the map or drag the blue pin to set the exact installation point. Then click <Text style={{ fontWeight: '700', color: '#16a34a' }}>Save Location</Text>.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 20,
  },
  cardElevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  badgeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeWarningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  btnExternal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnExternalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  controlsRow: {
    gap: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    width: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 0,
    outlineStyle: 'none',
  },
  searchBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  searchBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  coordsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  coordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 38,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  coordInput: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    minWidth: 80,
    outlineStyle: 'none',
    paddingVertical: 0,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  mapFrame: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    position: 'relative',
  },
  mapTipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  mapTipText: {
    fontSize: 11,
    color: '#475569',
  },
});
