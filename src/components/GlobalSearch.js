// GlobalSearch.js — customer / partner search in the top header, on every page.
// Type a username, mobile, name, account id...: matching subscribers (and, for admins, partners)
// drop down under the box. Enter = open the subscriber list filtered by the text.
// Web: "/" or Ctrl+K jumps to the box, Esc closes it. Phones: a search icon opens a full-width bar.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { OneBssApi } from '../services/oneBssApi';

const web = Platform.OS === 'web';
const STATUS = {
  active: ['#dcfce7', '#15803d'], expired: ['#fee2e2', '#b91c1c'], suspended: ['#fef3c7', '#b45309'],
  disabled: ['#f1f5f9', '#475569'], new: ['#ede9fe', '#6d28d9'],
};

export const GlobalSearch = ({ user, onNavigateToCustomers, onNavigateToPartners, mobile, onClose, autoFocus }) => {
  const role = String(user?.role || '').toLowerCase();
  const canPartners = role === 'superadmin' || role === 'admin';
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState({ customers: [], partners: [] });
  const partnersRef = useRef(null); // loaded once, on the first search
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const term = q.trim();
  const open = !!term && (focused || mobile);

  // "/" or Ctrl+K focuses the box (not while typing somewhere else)
  useEffect(() => {
    if (!web || mobile) return undefined;
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile]);

  // close the dropdown when clicking outside it
  useEffect(() => {
    if (!web || !focused) return undefined;
    const onDown = (e) => {
      const el = boxRef.current;
      if (el && typeof el.contains === 'function' && !el.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [focused]);

  useEffect(() => {
    if (!term) {
      setRes({ customers: [], partners: [] });
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    let live = true;
    const t = setTimeout(async () => {
      let partners = [];
      if (canPartners) {
        try {
          if (!partnersRef.current) {
            const pr = await OneBssApi.getPartners();
            partnersRef.current = Array.isArray(pr.data) ? pr.data : (pr.data?.data || []);
          }
          const l = term.toLowerCase();
          partners = partnersRef.current.filter((p) => [p.partner_name, p.name, p.company_name, p.partner_mobile, p.mobile, p.partner_email, p.partner_username, p.partner_region, p.partner_id]
            .some((v) => String(v || '').toLowerCase().includes(l))).slice(0, 5);
        } catch (e) { /* partners are optional */ }
      }
      let customers = [];
      try {
        const r = await OneBssApi.getCustomersList(1, 8, '', term);
        if (r.ok && r.data) {
          const raw = Array.isArray(r.data.data) ? r.data.data : (Array.isArray(r.data) ? r.data : (r.data.customers || []));
          customers = raw.slice(0, 8);
        }
      } catch (e) { /* shown as "nothing found" */ }
      if (live) {
        setRes({ customers, partners });
        setBusy(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [term, canPartners]);

  const done = () => {
    setQ('');
    setFocused(false);
    inputRef.current?.blur?.();
    onClose?.();
  };

  const viewAll = () => {
    if (!term) return;
    const found = res.customers || [];
    const onlyIptv = found.length > 0 && found.every((c) => c.account_type === 'iptv' || c.type === 'iptv');
    const t = term;
    done();
    onNavigateToCustomers?.(onlyIptv ? 'iptv_all' : 'all', '', t);
  };

  const openCustomer = (c) => {
    done();
    const custId = c.cust_id || c.id || c.customer_id;
    const isIptv = Boolean(c.account_type === 'iptv' || c.type === 'iptv' || c.is_iptv);
    onNavigateToCustomers?.(isIptv ? 'iptv_all' : 'all', '', '');
    if (web && custId) {
      setTimeout(() => {
        const opn = isIptv ? (c.iptv_id ? `&open=iptv_${encodeURIComponent(c.iptv_id)}` : '')
          : (c.internet_id ? `&open=int_${encodeURIComponent(c.internet_id)}` : c.username ? `&open=int_${encodeURIComponent(c.username)}` : '');
        window.location.hash = `${isIptv ? 'iptv_customers' : 'customers'}?sub_id=${encodeURIComponent(custId)}${opn}`;
      }, 50);
    }
  };

  const openPartner = (p) => {
    done();
    const pId = p.partner_id || p.id;
    onNavigateToPartners?.();
    if (web && pId) setTimeout(() => { window.location.hash = `partners?partner_id=${encodeURIComponent(pId)}`; }, 50);
  };

  return (
    <View ref={boxRef} style={[s.wrap, mobile && { maxWidth: '100%' }]}>
      <View style={[s.box, focused && s.boxFocus]}>
        <Feather name="search" size={15} color={focused ? '#0f766e' : '#94a3b8'} />
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          onFocus={() => setFocused(true)}
          onSubmitEditing={viewAll}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') done(); }}
          placeholder={canPartners ? 'Search customers, mobile, username, partners…' : 'Search customers, mobile, username…'}
          placeholderTextColor="#94a3b8"
          style={s.input}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search customers"
        />
        {busy ? <ActivityIndicator size="small" color="#0f766e" style={{ transform: [{ scale: 0.75 }] }} /> : null}
        {q ? (
          <TouchableOpacity onPress={() => { setQ(''); inputRef.current?.focus?.(); }} accessibilityLabel="Clear search">
            <Feather name="x" size={15} color="#94a3b8" />
          </TouchableOpacity>
        ) : (!mobile && web ? <View style={s.kbd}><Text style={s.kbdText}>/</Text></View> : null)}
        {mobile ? (
          <TouchableOpacity onPress={done} style={{ paddingLeft: 4 }} accessibilityLabel="Close search">
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {open ? (
        <View style={[s.drop, mobile && s.dropMobile]}>
          <ScrollView style={{ maxHeight: mobile ? 420 : 440 }} keyboardShouldPersistTaps="handled">
            {res.customers.length ? <Text style={s.group}>Subscribers</Text> : null}
            {res.customers.map((c, i) => {
              const sts = String(c.status_key || c.status || c.status_text || '').toLowerCase();
              const [bg, fg] = STATUS[sts] || STATUS.disabled;
              const isIptv = c.account_type === 'iptv' || c.type === 'iptv';
              return (
                <TouchableOpacity key={c.id || `c${i}`} style={s.item} onPress={() => openCustomer(c)}>
                  <View style={[s.icon, { backgroundColor: isIptv ? '#f5f3ff' : '#f0fdfa' }]}>
                    <Feather name={isIptv ? 'tv' : 'user'} size={14} color={isIptv ? '#7c3aed' : '#0f766e'} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.itemTitle} numberOfLines={1}>{c.username || c.stb_box || c.name || `#${c.id || i}`}{c.full_name ? <Text style={s.itemName}>  ·  {c.full_name}</Text> : null}</Text>
                    <Text style={s.itemSub} numberOfLines={1}>{[c.mobile, c.package_name, c.company_name].filter(Boolean).join('  ·  ') || '—'}</Text>
                  </View>
                  {sts ? <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{sts.toUpperCase()}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
            {res.partners.length ? <Text style={[s.group, res.customers.length && { marginTop: 6 }]}>Partners</Text> : null}
            {res.partners.map((p, i) => (
              <TouchableOpacity key={p.partner_id || `p${i}`} style={s.item} onPress={() => openPartner(p)}>
                <View style={[s.icon, { backgroundColor: '#ecfdf5' }]}><Feather name="briefcase" size={14} color="#059669" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemTitle} numberOfLines={1}>{p.company_name || p.partner_name}<Text style={s.itemName}>  #{p.partner_id}</Text></Text>
                  <Text style={s.itemSub} numberOfLines={1}>{[p.partner_name, p.partner_mobile].filter(Boolean).join('  ·  ')}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: '#f1f5f9' }]}><Text style={[s.pillText, { color: '#475569' }]}>{String(p.account_role || p.role || 'partner').toUpperCase()}</Text></View>
              </TouchableOpacity>
            ))}
            {!busy && !res.customers.length && !res.partners.length ? (
              <Text style={s.empty}>Nothing found for “{term}”.</Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={s.all} onPress={viewAll}>
            <Feather name="list" size={13} color="#0f766e" />
            <Text style={s.allText} numberOfLines={1}>Show all subscribers matching “{term}”</Text>
            <Feather name="corner-down-left" size={12} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { position: 'relative', flex: 1, maxWidth: 520, minWidth: 0, zIndex: 100 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  boxFocus: { borderColor: '#5eead4', backgroundColor: '#ffffff', ...(web ? { boxShadow: '0 0 0 3px rgba(20,184,166,0.12)' } : null) },
  input: { flex: 1, minWidth: 0, fontSize: 13.5, color: '#0f172a', ...(web ? { outlineStyle: 'none' } : null) },
  kbd: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, paddingHorizontal: 5, backgroundColor: '#ffffff' },
  kbdText: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700' },
  cancel: { fontSize: 13, fontWeight: '600', color: '#0f766e' },
  drop: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingTop: 6, overflow: 'hidden', zIndex: 200, ...(web ? { boxShadow: '0 12px 32px rgba(15,23,42,0.16)' } : { elevation: 12 }) },
  dropMobile: { left: -4, right: -4 },
  group: { fontSize: 10.5, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  itemName: { fontWeight: '500', color: '#475569' },
  itemSub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  empty: { fontSize: 12.5, color: '#64748b', padding: 14, textAlign: 'center' },
  all: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#f8fafc', marginTop: 4 },
  allText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#0f766e' },
});
