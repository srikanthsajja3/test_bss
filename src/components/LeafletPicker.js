import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

/**
 * Pick-a-point map that needs NO API key (used when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set).
 * Leaflet is loaded from unpkg once; tiles: Esri World Imagery + place labels ("Satellite") or
 * OpenStreetMap ("Street"). Tap the map to place the pin, drag the pin to adjust.
 *
 * Props: lat, lng (pin or null), center {lat,lng}, zoom, mapType 'hybrid'|'roadmap',
 *        focus {lat,lng,zoom,seq} (pan when seq changes), onPick(lat, lng), height
 */
const LEAFLET_VERSION = '1.9.4';
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

let leafletPromise = null;
const loadLeaflet = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = CSS_URL;
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = JS_URL;
    js.async = true;
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet did not load')));
    js.onerror = () => {
      leafletPromise = null;
      reject(new Error('Could not load the map'));
    };
    document.head.appendChild(js);
  });
  return leafletPromise;
};

// Pin as an inline SVG (Leaflet's default marker images are not bundled)
const pinIcon = (L) =>
  L.divIcon({
    className: '',
    iconSize: [30, 42],
    iconAnchor: [15, 41],
    html: '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 41 15 41s14-15.7 14-26.1C29 7.2 22.7 1 15 1z" fill="#dc2626" stroke="#ffffff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#ffffff"/></svg>',
  });

/** Place search without a key (OpenStreetMap Nominatim, India only). */
export const osmGeocode = async (query) => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const list = await res.json();
    const r = Array.isArray(list) && list[0];
    return r ? { lat: Number(r.lat), lng: Number(r.lon), name: r.display_name || query } : null;
  } catch (e) {
    return null;
  }
};

export const LeafletPicker = ({ lat, lng, center, zoom = 13, mapType = 'hybrid', focus, onPick, height = 420 }) => {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const layersRef = useRef({});
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [state, setState] = useState('loading'); // loading | ready | error

  // create the map once
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        const start = lat !== null && lat !== undefined ? [lat, lng] : [center.lat, center.lng];
        const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView(start, lat !== null && lat !== undefined ? 18 : zoom);
        layersRef.current = {
          hybrid: L.layerGroup([
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' }),
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
          ]),
          roadmap: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }),
        };
        (layersRef.current[mapType] || layersRef.current.hybrid).addTo(map);
        map.on('click', (e) => pickRef.current && pickRef.current(e.latlng.lat, e.latlng.lng));
        mapRef.current = map;
        setState('ready');
        // the modal may still be animating: re-measure once it has its final size
        setTimeout(() => map.invalidateSize(), 250);
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // street / satellite
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(layersRef.current).forEach((l) => map.hasLayer(l) && map.removeLayer(l));
    (layersRef.current[mapType] || layersRef.current.hybrid).addTo(map);
  }, [mapType, state]);

  // the pin follows lat/lng
  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L) return;
    if (lat === null || lat === undefined) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { draggable: true, icon: pinIcon(L) }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        if (pickRef.current) pickRef.current(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
  }, [lat, lng, state]);

  // pan when asked (search result, GPS, saved location)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.setView([focus.lat, focus.lng], focus.zoom || map.getZoom());
  }, [focus?.seq, state]);

  return (
    <View style={{ width: '100%', height }}>
      <div ref={boxRef} style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
      {state !== 'ready' ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', gap: 8 }}>
          {state === 'loading' ? <ActivityIndicator size="small" color="#2563eb" /> : null}
          <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', paddingHorizontal: 20 }}>
            {state === 'loading' ? 'Loading map…' : 'The map could not load. Check the internet connection, or use My GPS / type LAT and LNG.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
