import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';

const TYPES = {
  internet: { label: 'Internet', color: '#059669', icon: 'wifi' },
  iptv: { label: 'IPTV', color: '#7c3aed', icon: 'tv' },
  // RADIUS branches of each operator (super admin only)
  branches: { label: 'Partner branches', short: 'Branches', color: '#0369a1', icon: 'git-branch', noun: '' },
};

const STATE = {
  pending: { icon: 'clock', color: '#94a3b8', text: 'Waiting' },
  running: { icon: 'loader', color: '#2563eb', text: 'Syncing' },
  done: { icon: 'check-circle', color: '#16a34a', text: 'Done' },
  failed: { icon: 'x-circle', color: '#dc2626', text: 'Failed' },
  skipped: { icon: 'slash', color: '#b45309', text: 'Skipped' },
};

const finishedCount = (c) => (c ? c.done + c.failed + c.skipped : 0);

/**
 * Partners page (super admin + distributors): "Sync Internet customers" / "Sync IPTV customers"
 * for every operator the login covers, one operator after another. The run lives on the server
 * (partners_bulk_sync.php), so the page can be closed; opening it again shows the progress.
 */
export const PartnersBulkSync = ({ isMobile, scopeLabel, showBranches = false }) => {
  const types = showBranches ? ['internet', 'iptv', 'branches'] : ['internet', 'iptv'];
  const [status, setStatus] = useState({ internet: null, iptv: null, branches: null });
  const [openType, setOpenType] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async (type) => {
    const res = await OneBssApi.partnersBulkSyncStatus(type);
    if (res.ok && res.data?.success) setStatus((s) => ({ ...s, [type]: res.data }));
    return res.data;
  }, []);

  useEffect(() => { types.forEach((t) => load(t)); }, [load, showBranches]); // eslint-disable-line react-hooks/exhaustive-deps

  // refresh every 4 s while a run is going or the panel is open
  const anyRunning = types.some((t) => !!status[t]?.running);
  useEffect(() => {
    if (!anyRunning && !openType) return undefined;
    timer.current = setInterval(() => {
      if (openType) load(openType);
      types.forEach((t) => { if (t !== openType && status[t]?.running) load(t); });
    }, 4000);
    return () => clearInterval(timer.current);
  }, [anyRunning, openType, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (type, action) => {
    setBusy(true);
    const res = await OneBssApi.partnersBulkSync(type, action);
    setBusy(false);
    if (res.data && res.data.items) setStatus((s) => ({ ...s, [type]: res.data }));
    if (!res.ok || res.data?.success === false) {
      toast.error(res.data?.message || 'Could not start the sync');
      return;
    }
    toast.success(res.data?.message || 'Done');
    setTimeout(() => load(type), 1500);
  };

  const st = openType ? status[openType] : null;
  const meta = openType ? TYPES[openType] : null;
  const counts = st?.counts;
  const total = counts?.total || 0;
  const finished = finishedCount(counts);
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const leftover = counts ? counts.pending + counts.running : 0;
  const canResume = st && !st.running && leftover > 0;

  const button = (type) => {
    const m = TYPES[type];
    const s = status[type];
    const running = !!s?.running;
    return (
      <TouchableOpacity
        key={type}
        style={[st_.btn, { borderColor: m.color }, isMobile && { flex: 1, justifyContent: 'center' }]}
        onPress={() => setOpenType(type)}
        accessibilityLabel={type === 'branches' ? 'Sync the RADIUS branches of all partners' : `Sync ${m.label} customers of all partners`}
      >
        {running ? <ActivityIndicator size="small" color={m.color} /> : <Feather name="refresh-cw" size={14} color={m.color} />}
        <Text style={[st_.btnText, { color: m.color }]} numberOfLines={1}>
          {type === 'branches' ? (isMobile ? `Sync ${m.short}` : `Sync ${m.label}`) : isMobile ? `Sync ${m.label}` : `Sync ${m.label} customers`}
          {running && s.counts ? ` · ${finishedCount(s.counts)}/${s.counts.total}` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {types.map((t) => button(t))}
      <ModalShell
        visible={!!openType}
        title={meta ? `${meta.label} sync — all ${scopeLabel ? 'my ' : ''}partners` : ''}
        icon="refresh-cw"
        onClose={() => setOpenType(null)}
        footer={(
          <>
            <Btn label="Close" kind="ghost" onPress={() => setOpenType(null)} />
            {st?.running ? (
              <Btn label="Stop" icon="square" kind="danger" onPress={() => act(openType, 'stop')} loading={busy} />
            ) : (
              <>
                {canResume ? <Btn label={`Continue (${leftover} left)`} icon="play" kind="ghost" onPress={() => act(openType, 'resume')} loading={busy} /> : null}
                <Btn label={st?.items?.length ? 'Sync again from the start' : 'Start sync'} icon="refresh-cw" onPress={() => act(openType, 'start')} loading={busy} />
              </>
            )}
          </>
        )}
      >
        {meta ? (
          <>
            <Note
              tone="info"
              text={openType === 'branches'
                ? 'Brings each enabled operator\'s RADIUS branches in line with RADIUS, one operator after another: new branches of its RADIUS partner are added and branches RADIUS no longer lists are removed (at least one always stays). When several operators share one RADIUS partner, a new branch is only reported — assign it in the partner\'s RADIUS branches. It runs on the server; you can close this window.'
                : `Syncs the ${meta.label} customers of every enabled operator ${scopeLabel || ''}one after another, the same as each partner's own "Sync ${meta.label} Users" button. It runs on the server — you can close this window or the page and come back to see the progress.${openType === 'iptv' ? ' IPTV checks every customer mobile with Pioneer, so it can take a long time.' : ''}`}
            />
            {st?.interrupted ? (
              <View style={{ marginTop: 10 }}><Note tone="warn" text="The server stopped this run before it finished. Use Continue to go on with the operators that are left." /></View>
            ) : null}
            {counts ? (
              <View style={{ marginTop: 14 }}>
                <View style={st_.rowBetween}>
                  <Text style={st_.big}>
                    {st.running ? 'Running' : st.stopped ? 'Stopped' : st.interrupted ? 'Interrupted' : 'Last run'} · {finished}/{total} operators
                  </Text>
                  <Text style={st_.small}>{st.running ? `started ${st.started_at || ''}` : st.finished_at ? `finished ${st.finished_at}` : ''}{st.started_by ? ` · by ${st.started_by}` : ''}</Text>
                </View>
                <View style={st_.bar}><View style={[st_.barFill, { width: `${pct}%`, backgroundColor: meta.color }]} /></View>
                <View style={st_.chips}>
                  {['done', 'failed', 'skipped', 'pending'].map((k) => (counts[k] ? (
                    <View key={k} style={[st_.chip, { borderColor: STATE[k].color }]}>
                      <Feather name={STATE[k].icon} size={11} color={STATE[k].color} />
                      <Text style={[st_.chipText, { color: STATE[k].color }]}>{counts[k]} {STATE[k].text.toLowerCase()}</Text>
                    </View>
                  ) : null))}
                </View>
                <ScrollView style={st_.list} nestedScrollEnabled>
                  {st.items.map((it) => {
                    const sm = STATE[it.state] || STATE.pending;
                    return (
                      <View key={it.partner_id} style={st_.item}>
                        {it.state === 'running' ? <ActivityIndicator size="small" color={sm.color} /> : <Feather name={sm.icon} size={15} color={sm.color} />}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={st_.itemName} numberOfLines={1}>{it.name} <Text style={st_.small}>#{it.partner_id}</Text></Text>
                          {it.state === 'running' && it.progress ? (
                            <Text style={st_.small}>{it.progress.done}/{it.progress.total} customers…</Text>
                          ) : it.message ? (
                            <Text style={[st_.small, it.state === 'failed' && { color: '#b91c1c' }]} numberOfLines={2}>{it.message}</Text>
                          ) : null}
                        </View>
                        <Text style={[st_.stateText, { color: sm.color }]}>{sm.text}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text style={[st_.small, { marginTop: 14 }]}>Not run yet.</Text>
            )}
          </>
        ) : null}
      </ModalShell>
    </>
  );
};

const st_ = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: '#ffffff' },
  btnText: { fontSize: 12, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  big: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  small: { fontSize: 11, color: '#64748b' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: 8 },
  barFill: { height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '700' },
  list: { maxHeight: 340, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  stateText: { fontSize: 11, fontWeight: '700' },
});
