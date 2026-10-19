import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { CustomerDevicesModal } from './CustomerDevicesModal';

import { APIProvider, Map as GoogleMap, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Google Maps (official React library @vis.gl/react-google-maps): street, satellite and
// satellite-with-labels, licensed for commercial use with your own Google Maps Platform key.
// Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY at build time (Expo inlines process.env.EXPO_PUBLIC_* —
// keep this exact expression). Enable "Maps JavaScript API" and "Geocoding API" for the key and
// restrict it to your site's domain.
// Without a key the map falls back to a read-only Google Maps view; pins can still be set with
// My GPS or by typing the coordinates.
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const MAP_TYPES = [
  { id: 'roadmap', label: 'Street', icon: 'map' },
  { id: 'hybrid', label: 'Satellite', icon: 'globe' },
];

// Moves the map when `focus` changes ({ lat, lng, zoom, seq }).
const MapFocus = ({ focus }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    if (focus.zoom) map.setZoom(focus.zoom);
  }, [map, focus?.seq]);
  return null;
};

// Hands a Google geocoder to the parent (search box + "centre on the address").
const GeocoderBridge = ({ onReady }) => {
  const lib = useMapsLibrary('geocoding');
  useEffect(() => {
    if (!lib) return;
    const geocoder = new lib.Geocoder();
    onReady((query) =>
      geocoder
        .geocode({ address: query, componentRestrictions: { country: 'IN' } })
        .then(({ results }) => {
          const r = results && results[0];
          if (!r) return null;
          return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), name: r.formatted_address || query };
        })
        .catch(() => null)
    );
  }, [lib]);
  return null;
};

// Map centre when a customer has no pin yet (Guntur / Vijayawada region); the address is
// geocoded on open to get closer.
const DEFAULT_CENTER = { lat: 16.3067, lng: 80.4365 };

export const CustomerLocationMap = ({
  mobile,
  customerName = 'Subscriber',
  customerAddress = '',
  customerZipcode = '',
  custId = '',
  onLocationSaved,
  onOpenDevices,
  onClose,
  isCard = false,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);

  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [pinned, setPinned] = useState(false); // a pin is on the map (saved or newly placed)
  const [hasServerLocation, setHasServerLocation] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [devicesModalOpen, setDevicesModalOpen] = useState(false);

  const [mapType, setMapType] = useState('hybrid'); // satellite + labels by default: houses are easy to find
  const [focus, setFocus] = useState(null); // where the map should move: { lat, lng, zoom, seq }
  const [embedQuery, setEmbedQuery] = useState(''); // key-less fallback view: what to show
  const geocoderRef = useRef(null);
  const focusSeq = useRef(0);

  const moveMap = (lat, lng, zoom) => {
    focusSeq.current += 1;
    setFocus({ lat: Number(lat), lng: Number(lng), zoom, seq: focusSeq.current });
  };

  // Place / move the pin. pan: also centre the map on it.
  const placePin = (lat, lng, pan = true) => {
    const nLat = Number(Number(lat).toFixed(6));
    const nLng = Number(Number(lng).toFixed(6));
    setLatitude(nLat);
    setLongitude(nLng);
    setPinned(true);
    if (pan) moveMap(nLat, nLng, 18);
  };

  // Google geocoder when the key is set (none without a key — the fallback view searches itself)
  const geocode = async (query) => (geocoderRef.current ? geocoderRef.current(query) : null);

  // 1. Saved location from the API
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
      const lat = parseFloat(rec?.latitude);
      const lng = parseFloat(rec?.longitude);
      if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
        setHasServerLocation(true);
        placePin(lat, lng, true);
      } else {
        setHasServerLocation(false);
        // No pin yet: centre the map near the installation address
        const q = [customerAddress, customerZipcode].filter(Boolean).join(', ');
        if (q) {
          setEmbedQuery(q);
          const tryGeocode = async (n) => {
            const hit = await geocode(q);
            if (hit) moveMap(hit.lat, hit.lng, 16);
            else if (n > 0 && !geocoderRef.current && GOOGLE_MAPS_KEY) setTimeout(() => tryGeocode(n - 1), 800);
          };
          tryGeocode(5);
        }
      }
    } catch (err) {
      setHasServerLocation(false);
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    setLatitude(null);
    setLongitude(null);
    setPinned(false);
    fetchLocationData();
  }, [cleanMobile]);

  const handleManualCoordChange = (newLat, newLng) => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      placePin(lat, lng, true);
    }
  };

  // 3. Search a place (India only)
  const handleSearchAddress = async () => {
    if (!addressSearch.trim()) return;
    if (!GOOGLE_MAPS_KEY) {
      // key-less view: let Google's own map show the place
      setEmbedQuery(addressSearch.trim());
      setPinned(false);
      return;
    }
    setSearchingPlace(true);
    try {
      const hit = await geocode(addressSearch.trim());
      if (hit) {
        moveMap(hit.lat, hit.lng, 17);
        toast.info(`${hit.name.split(',').slice(0, 3).join(',')} — tap the exact house to place the pin.`);
      } else {
        toast.warn('No places found. Try a landmark, street or village name.');
      }
    } catch (e) {
      toast.error('Search failed. Check the internet connection.');
    } finally {
      setSearchingPlace(false);
    }
  };

  // 4. Current GPS (useful for field staff standing at the customer's house)
  const handleUseCurrentGps = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          placePin(position.coords.latitude, position.coords.longitude, true);
          toast.success(`Pinned at your current position (±${Math.round(position.coords.accuracy)} m).`);
        },
        (error) => toast.warn('Could not get your location: ' + error.message),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      toast.warn('Location is not available in this browser.');
    }
  };

  // 5. Directions in Google Maps
  const handleOpenGoogleMaps = () => {
    if (!pinned) {
      toast.info('Place the pin first.');
      return;
    }
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(mapsUrl).catch(() => toast.error('Unable to open Google Maps on this device.'));
    }
  };

  // 6. Save to POST /customer_location.php
  const handleSaveLocation = async () => {
    if (!cleanMobile || cleanMobile.length !== 10) {
      toast.error('Customer does not have a valid 10-digit mobile number.');
      return;
    }
    if (!pinned || latitude === null || longitude === null) {
      toast.warn('Tap the map (or use My GPS) to place the pin first.');
      return;
    }
    setSavingLocation(true);
    try {
      const res = await OneBssApi.saveCustomerLocation(cleanMobile, latitude, longitude);
      if (res.ok) {
        toast.success(`Location saved for ${customerName}.`);
        setHasServerLocation(true);
        if (onLocationSaved) onLocationSaved({ latitude, longitude });
        if (onClose) onClose();
      } else {
        toast.error(res.data?.message || 'Failed to save location.');
      }
    } catch (e) {
      toast.error('Network error saving location.');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Controls Row */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {hasServerLocation ? (
            <View style={styles.badgeSuccess}>
              <Feather name="check-circle" size={12} color="#15803d" />
              <Text style={styles.badgeSuccessText}>Saved location</Text>
            </View>
          ) : (
            <View style={styles.badgeWarning}>
              <Feather name="alert-circle" size={12} color="#b45309" />
              <Text style={styles.badgeWarningText}>{pinned ? 'New pin — not saved' : 'No location yet'}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={handleUseCurrentGps}
            title="Use Current Device GPS"
          >
            <Feather name="crosshair" size={13} color="#2563eb" />
            <Text style={styles.btnSecondaryText}>My GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnExternal}
            onPress={handleOpenGoogleMaps}
            title="Open in Google Maps (Directions)"
          >
            <Feather name="navigation" size={13} color="#475569" />
            <Text style={styles.btnExternalText}>Directions</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (savingLocation || !pinned) && { opacity: 0.6 }]}
          onPress={handleSaveLocation}
          disabled={savingLocation || !pinned}
        >
          {savingLocation ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Feather name="save" size={14} color="#ffffff" />
          )}
          <Text style={styles.saveBtnText}>{savingLocation ? 'Saving...' : 'Save Location'}</Text>
        </TouchableOpacity>
      </View>

      {/* Search and Lat/Lng Row */}
      <View style={[styles.controlsRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search landmark, city, area..."
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

        <View style={styles.coordsGroup}>
          <View style={styles.coordInputWrap}>
            <Text style={styles.coordLabel}>LAT:</Text>
            <TextInput
              style={styles.coordInput}
              value={latitude === null ? '' : String(latitude)}
              placeholder="—"
              onChangeText={(v) => handleManualCoordChange(v, longitude ?? '')}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.coordInputWrap}>
            <Text style={styles.coordLabel}>LNG:</Text>
            <TextInput
              style={styles.coordInput}
              value={longitude === null ? '' : String(longitude)}
              placeholder="—"
              onChangeText={(v) => handleManualCoordChange(latitude ?? '', v)}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* Map Interactive Canvas */}
      <View style={styles.mapFrame}>
        {/* Street / Satellite */}
        <View style={styles.mapTypeBar}>
          {MAP_TYPES.map((t) => (
            <TouchableOpacity key={t.id} style={[styles.mapTypeBtn, mapType === t.id && styles.mapTypeBtnOn]} onPress={() => setMapType(t.id)}>
              <Feather name={t.icon} size={12} color={mapType === t.id ? '#ffffff' : '#334155'} />
              <Text style={[styles.mapTypeText, mapType === t.id && { color: '#ffffff' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {GOOGLE_MAPS_KEY ? (
          <APIProvider apiKey={GOOGLE_MAPS_KEY} region="IN" language="en">
            <View style={{ width: '100%', height: isMobile ? 320 : 420 }}>
              <GoogleMap
                style={{ width: '100%', height: '100%' }}
                defaultCenter={latitude !== null ? { lat: latitude, lng: longitude } : DEFAULT_CENTER}
                defaultZoom={latitude !== null ? 18 : 13}
                mapTypeId={mapType}
                gestureHandling="greedy"
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl
                clickableIcons={false}
                onClick={(e) => {
                  const ll = e?.detail?.latLng;
                  if (ll) placePin(ll.lat, ll.lng, false);
                }}
              >
                {pinned && latitude !== null ? (
                  <Marker
                    position={{ lat: latitude, lng: longitude }}
                    draggable
                    title={`${customerName} · ${latitude}, ${longitude}`}
                    onDragEnd={(e) => {
                      const ll = e?.latLng;
                      if (ll) placePin(ll.lat(), ll.lng(), false);
                    }}
                  />
                ) : null}
              </GoogleMap>
              <MapFocus focus={focus} />
              <GeocoderBridge onReady={(fn) => (geocoderRef.current = fn)} />
            </View>
          </APIProvider>
        ) : (
          <iframe
            title="Customer location"
            style={{ width: '100%', height: isMobile ? 320 : 420, border: 0, display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(
              pinned && latitude !== null ? `${latitude},${longitude}` : embedQuery || `${DEFAULT_CENTER.lat},${DEFAULT_CENTER.lng}`
            )}&t=${mapType === 'roadmap' ? 'm' : 'k'}&z=${pinned ? 18 : 14}&output=embed`}
          />
        )}
        <View style={styles.mapTipBar}>
          <Feather name="info" size={12} color="#475569" />
          <Text style={styles.mapTipText}>
            {GOOGLE_MAPS_KEY ? (
              <>
                Search the area, use <Text style={{ fontWeight: '700' }}>Satellite</Text> to see houses, tap the exact installation point or drag the pin, then{' '}
                <Text style={{ fontWeight: '700', color: '#16a34a' }}>Save Location</Text>.
              </>
            ) : (
              <>
                View only — set the pin with <Text style={{ fontWeight: '700' }}>My GPS</Text> or type LAT / LNG, then{' '}
                <Text style={{ fontWeight: '700', color: '#16a34a' }}>Save Location</Text>. Add a Google Maps key (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) to tap on the map.
              </>
            )}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    paddingVertical: 3,
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
    gap: 5,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    gap: 5,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnExternalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  controlsRow: {
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
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
    height: 36,
    width: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  coordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  coordInput: {
    width: 92,
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    minWidth: 80,
    outlineStyle: 'none',
    paddingVertical: 0,
  },
  mapFrame: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    position: 'relative',
  },
  mapTypeBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 5,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 3,
    gap: 3,
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  },
  mapTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  mapTypeBtnOn: {
    backgroundColor: '#2563eb',
  },
  mapTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
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
