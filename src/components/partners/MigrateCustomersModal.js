import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, SearchSelect, SearchBox } from '../internet/shared';

/**
 * Super admin: move internet customers of one operator to another (customer_migrate.php).
 * For each account the server first calls OneRadius "Update Customer" with the new operator's
 * partner_id + branch_id, then moves it here; the customer's IPTV and OTT follow once no internet
 * account of theirs is left with the old operator. Sent 25 accounts per call, with progress.
 */
const CHUNK = 25;
const SHOW_MAX = 300;

const fmtDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '—';
};

export const MigrateCustomersModal = ({ visible, partner, onClose, onDone }) => {
  const fromId = partner?.partner_id;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toId, setToId] = useState('');
  const [toBranches, setToBranches] = useState(null); // target operator's branches [{id,name}] when it has several
  const [toBranch, setToBranch] = useState('');
  const [plans, setPlans] = useState(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [results, setResults] = useState(null);

  const load = () => {
    setLoading(true); setError('');
    OneBssApi.getCustomerMigration(fromId).then((res) => {
      setLoading(false);
      if (!res.ok) { setError(res.data?.message || 'Could not load the customers'); return; }
      setInfo(res.data);
    });
  };

  useEffect(() => {
    if (!visible || !fromId) return;
    setInfo(null); setToId(''); setPlans(null); setSearch(''); setPicked({}); setProgress(null); setResults(null);
    load();
  }, [visible, fromId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setToBranches(null); setToBranch('');
    const t = (info?.targets || []).find((x) => String(x.partner_id) === String(toId));
    if (!t || (t.branch_ids || []).length < 2) return;
    // several branches: load their names and ask which one
    setToBranches((t.branch_ids || []).map((id) => ({ id: String(id), name: `Branch #${id}` })));
    OneBssApi.getRadiusBranches(toId).then((res) => {
      if (!res.ok || res.data?.success === false) return;
      const names = {};
      (res.data.branches || []).forEach((b) => { names[String(b.id)] = b.name; });
      setToBranches((t.branch_ids || []).map((id) => ({ id: String(id), name: names[String(id)] || `Branch #${id}` })));
    });
  }, [toId, info]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPlans(null);
    if (!toId || !fromId) return;
    OneBssApi.getCustomerMigration(fromId, toId).then((res) => { if (res.ok) setPlans(res.data.plans || []); });
  }, [toId, fromId]);

  const accounts = info?.accounts || [];
  const targets = info?.targets || [];
  const okTargets = targets.filter((t) => t.same_radius);
  const otherTargets = targets.filter((t) => !t.same_radius);
  const target = targets.find((t) => String(t.partner_id) === String(toId));

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) => [a.username, a.name, a.mobile, a.plan_name].some((v) => String(v || '').toLowerCase().includes(t)));
  }, [accounts, search]);
  const pickedIds = Object.keys(picked).filter((k) => picked[k]).map(Number);
  const allFilteredPicked = filtered.length > 0 && filtered.every((a) => picked[a.internet_id]);
  const toggleAll = () => {
    const next = { ...picked };
    filtered.forEach((a) => { next[a.internet_id] = !allFilteredPicked; });
    setPicked(next);
  };

  const run = async () => {
    if (!toId || !pickedIds.length || running) return;
    if (toBranches && !toBranch) { toast.error('Choose the branch they go into'); return; }
    setRunning(true);
    setResults(null);
    const all = [];
    setProgress({ done: 0, total: pickedIds.length });
    for (let i = 0; i < pickedIds.length; i += CHUNK) {
      const part = pickedIds.slice(i, i + CHUNK);
      const res = await OneBssApi.migrateCustomers(fromId, toId, part, toBranch);
      if (!res.ok) {
        part.forEach((id) => all.push({ internet_id: id, username: accounts.find((a) => a.internet_id === id)?.username, ok: false, message: res.data?.message || 'Request failed', warnings: [] }));
      } else {
        all.push(...(res.data.results || []));
      }
      setProgress({ done: Math.min(i + CHUNK, pickedIds.length), total: pickedIds.length });
    }
    setRunning(false);
    setResults(all);
    const moved = all.filter((r) => r.ok).length;
    if (moved) toast.success(`${moved} customer account(s) moved to ${target?.partner_name}`);
    if (moved < all.length) toast.error(`${all.length - moved} could not be moved — see the list`);
    setPicked({});
    load();
    onDone && onDone();
  };

  const movedRows = results ? results.filter((r) => r.ok) : [];
  const failedRows = results ? results.filter((r) => !r.ok) : [];
  const warnRows = movedRows.filter((r) => (r.warnings || []).length);

  return (
    <ModalShell
      visible={visible}
      title={`Migrate customers · ${partner?.partner_name || ''}`}
      icon="users"
      iconColor="#0284c7"
      onClose={onClose}
      maxWidth={760}
      busy={running}
      footer={(
        <>
          <Btn label={results ? 'Close' : 'Cancel'} kind="ghost" onPress={onClose} disabled={running} />
          {!results ? (
            <Btn
              label={running ? `Moving ${progress?.done || 0} / ${progress?.total || 0}…` : `Move ${pickedIds.length || ''} account(s)`}
              icon="arrow-right"
              onPress={run}
              loading={false}
              disabled={running || !toId || !pickedIds.length || (!!toBranches && !toBranch)}
            />
          ) : null}
        </>
      )}
    >
      {loading && !info ? <ActivityIndicator color="#0284c7" style={{ marginVertical: 24 }} /> : null}
      {error ? <Note tone="error" text={error} /> : null}

      {info && !results ? (
        <View style={{ gap: 14 }}>
          {!info.source.configured ? <Note tone="error" text="This operator has no internet (RADIUS) partner and branch set up." /> : null}

          <View>
            <Text style={s.label}>Move to operator</Text>
            {okTargets.length ? (
              <SearchSelect
                value={toId}
                options={okTargets.map((t) => ({ value: String(t.partner_id), label: t.partner_name, sub: t.label, search: t.partner_name }))}
                onChange={(v) => setToId(String(v))}
                placeholder="Pick the operator…"
                searchPlaceholder="Search operators…"
                accent="#0284c7"
              />
            ) : (
              <Note tone="warn" text="No other operator is on the same RADIUS server." />
            )}
            {otherTargets.length ? (
              <Text style={s.hint}>{otherTargets.length} other operator(s) are not listed: they are on a different RADIUS server or have no RADIUS partner / branch set up.</Text>
            ) : null}
          </View>

          {target && toBranches ? (
            <View>
              <Text style={s.label}>Into which of {target.partner_name}'s branches?</Text>
              <SearchSelect
                value={toBranch}
                options={toBranches.map((b) => ({ value: b.id, label: b.name, sub: `Branch id ${b.id}`, search: `${b.name} ${b.id}` }))}
                onChange={(v) => setToBranch(String(v))}
                placeholder="Pick the branch…"
                searchPlaceholder="Search branches…"
                accent="#0284c7"
              />
            </View>
          ) : null}

          {target && plans ? (
            <View style={s.planBox}>
              <Text style={s.planTitle}>Plans on {target.partner_name}</Text>
              {plans.map((p, i) => (
                <View key={i} style={s.planRow}>
                  <Text style={s.planFrom} numberOfLines={1}>{p.plan_name} <Text style={s.muted}>({p.accounts})</Text></Text>
                  <Feather name="arrow-right" size={13} color="#94a3b8" />
                  {p.target_plan_name
                    ? <Text style={s.planTo} numberOfLines={1}>{p.target_plan_name}</Text>
                    : <Text style={[s.planTo, { color: '#b45309' }]} numberOfLines={1}>not in its plans — map it before the next recharge</Text>}
                </View>
              ))}
            </View>
          ) : null}

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Text style={[s.label, { marginBottom: 0, flex: 1 }]}>Internet customers ({accounts.length})</Text>
              <TouchableOpacity onPress={toggleAll} style={s.selAll} disabled={!filtered.length}>
                <Feather name={allFilteredPicked ? 'check-square' : 'square'} size={14} color="#0284c7" />
                <Text style={s.selAllText}>{allFilteredPicked ? 'Clear' : 'Select'} {search ? 'shown' : 'all'} ({filtered.length})</Text>
              </TouchableOpacity>
            </View>
            <SearchBox value={search} onChange={setSearch} placeholder="Search username, name, mobile, plan…" />
            <ScrollView style={s.list} nestedScrollEnabled>
              {filtered.slice(0, SHOW_MAX).map((a) => {
                const on = !!picked[a.internet_id];
                return (
                  <TouchableOpacity key={a.internet_id} style={[s.row, on && s.rowOn]} onPress={() => setPicked((p) => ({ ...p, [a.internet_id]: !on }))}>
                    <Feather name={on ? 'check-square' : 'square'} size={16} color={on ? '#0284c7' : '#94a3b8'} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowMain} numberOfLines={1}>{a.username} <Text style={s.muted}>· {a.name || 'No name'} · {a.mobile || '—'}</Text></Text>
                      <Text style={s.rowSub} numberOfLines={1}>{a.plan_name || 'No package'} · expires {fmtDate(a.expiration)}</Text>
                    </View>
                    {a.iptv ? <View style={[s.chip, { backgroundColor: '#f5f3ff' }]}><Text style={[s.chipText, { color: '#7c3aed' }]}>IPTV {a.iptv}</Text></View> : null}
                    {a.ott ? <View style={[s.chip, { backgroundColor: '#f0f9ff' }]}><Text style={[s.chipText, { color: '#0284c7' }]}>OTT {a.ott}</Text></View> : null}
                  </TouchableOpacity>
                );
              })}
              {filtered.length > SHOW_MAX ? <Text style={s.more}>{filtered.length - SHOW_MAX} more — search to narrow, or use Select all.</Text> : null}
              {!filtered.length ? <Text style={s.more}>{accounts.length ? 'No match.' : 'This operator has no internet customers.'}</Text> : null}
            </ScrollView>
          </View>

          <Note tone="info" text="Each account is moved on RADIUS first (new partner and branch). Its IPTV and OTT move with it when the customer has no other internet account left here. Wallets and recharge history stay where they are." />

          {progress && running ? (
            <View style={s.progTrack}><View style={[s.progFill, { width: `${Math.round((progress.done / progress.total) * 100)}%` }]} /></View>
          ) : null}
        </View>
      ) : null}

      {results ? (
        <View style={{ gap: 10 }}>
          <Note tone={failedRows.length ? 'warn' : 'success'} text={`${movedRows.length} moved to ${target?.partner_name}${failedRows.length ? `, ${failedRows.length} not moved` : ''}.`} />
          <ScrollView style={{ maxHeight: 380 }}>
            {failedRows.map((r) => (
              <View key={`f${r.internet_id}`} style={s.resRow}>
                <Feather name="x-circle" size={14} color="#dc2626" />
                <Text style={s.resText}><Text style={{ fontWeight: '700' }}>{r.username || `#${r.internet_id}`}</Text> — {r.message}</Text>
              </View>
            ))}
            {warnRows.map((r) => (
              <View key={`w${r.internet_id}`} style={s.resRow}>
                <Feather name="alert-triangle" size={14} color="#d97706" />
                <Text style={s.resText}><Text style={{ fontWeight: '700' }}>{r.username}</Text> — {(r.warnings || []).join(' ')}</Text>
              </View>
            ))}
            {movedRows.filter((r) => !(r.warnings || []).length).map((r) => (
              <View key={`o${r.internet_id}`} style={s.resRow}>
                <Feather name="check-circle" size={14} color="#16a34a" />
                <Text style={s.resText}><Text style={{ fontWeight: '700' }}>{r.username}</Text> — {r.message}{r.moved?.iptv || r.moved?.ott ? ` · with ${[r.moved.iptv ? `${r.moved.iptv} IPTV` : '', r.moved.ott ? `${r.moved.ott} OTT` : ''].filter(Boolean).join(' + ')}` : ''}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  hint: { fontSize: 11.5, color: '#64748b', marginTop: 6 },
  muted: { color: '#64748b', fontWeight: '400' },
  planBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, gap: 6, backgroundColor: '#f8fafc' },
  planTitle: { fontSize: 12, fontWeight: '700', color: '#475569' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planFrom: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' },
  planTo: { flex: 1.3, fontSize: 13, color: '#166534', fontWeight: '600' },
  selAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f0f9ff' },
  selAllText: { fontSize: 12, fontWeight: '700', color: '#0284c7' },
  list: { maxHeight: 300, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowOn: { backgroundColor: '#f0f9ff' },
  rowMain: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  chipText: { fontSize: 11, fontWeight: '700' },
  more: { padding: 12, fontSize: 12, color: '#64748b', textAlign: 'center' },
  progTrack: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  progFill: { height: 6, backgroundColor: '#0284c7' },
  resRow: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  resText: { flex: 1, fontSize: 12.5, color: '#334155', lineHeight: 18 },
});
