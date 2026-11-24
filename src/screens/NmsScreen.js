import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../services/oneBssApi';
import { can } from '../services/staffAccess';
import { ModalShell, Btn, Note } from '../components/internet/shared';
import { ScrollTabs } from '../components/ScrollTabs';

/**
 * Super admin › Networking › NMS (olt/nms_module.php -> the NMS "BSS integration API").
 * Overview · Devices (ports / ONUs / MACs, sync, terminal, web, add / edit) · ONUs (search, power
 * history, live power) · Alerts (acknowledge) · Events · Netwatch (ping / port / web monitors).
 *
 * The NMS answers are read field by field with fallbacks (pick), so a renamed field shows "—"
 * instead of breaking the page; every detail view also lists all the fields the NMS sent.
 */

const ACCENT = '#46689c';
const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';

// ------------------------------------------------------------------------------------------------
// small helpers
// ------------------------------------------------------------------------------------------------
const pick = (o, ...keys) => {
  if (!o) return undefined;
  for (const k of keys) {
    const v = k.includes('.') ? k.split('.').reduce((a, p) => (a == null ? a : a[p]), o) : o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};
const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const fmtNum = (v) => (num(v) === null ? '—' : Number(v).toLocaleString('en-IN'));
const human = (k) => String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (v) => {
  if (!v) return '—';
  const d = typeof v === 'number' ? new Date(v < 2e10 ? v * 1000 : v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const ago = (v) => {
  if (!v) return '—';
  const d = typeof v === 'number' ? new Date(v < 2e10 ? v * 1000 : v) : new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(v);
};
const show = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const STATUS = {
  good: { fg: '#047857', bg: '#dcfce7', dot: '#10b981' },
  bad: { fg: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  warn: { fg: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  idle: { fg: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
};
const statusTone = (s) => {
  const t = String(s || '').toLowerCase();
  if (/^(up|online|ok|working|active|healthy|done|finished|success)/.test(t)) return 'good';
  if (/(down|offline|los|dying|fail|error|critical|lost)/.test(t)) return 'bad';
  if (/(warn|degraded|running|pending|syncing)/.test(t)) return 'warn';
  return 'idle';
};
const Pill = ({ text, tone }) => {
  const c = STATUS[tone || statusTone(text)];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <View style={[s.dot, { backgroundColor: c.dot }]} />
      <Text style={[s.pillText, { color: c.fg }]} numberOfLines={1}>{String(text || 'unknown').toUpperCase()}</Text>
    </View>
  );
};

// ONU receive power: green -8..-25 dBm, amber to -27, red beyond (TX and switch SFPs are not judged)
const powerTone = (v) => {
  const n = num(v);
  if (n === null) return 'idle';
  if (n > -8 || n < -27) return 'bad';
  if (n < -25) return 'warn';
  return 'good';
};
const Power = ({ v, rx }) => {
  const n = num(v);
  if (n === null) return <Text style={s.td}>—</Text>;
  return <Text style={[s.td, rx ? { color: STATUS[powerTone(n)].fg, fontWeight: '700' } : { color: '#334155', fontWeight: '600' }]}>{n.toFixed(2)} dBm</Text>;
};

// The ONU's receive / transmit power wherever the NMS put it (rx, rx_power, rx_power_dbm,
// optical.rx_dbm, result.onu_rx ...). Values like "-19.5 dBm" are read as numbers.
const POWER_KEY = {
  rx: /^(onu_?)?rx(_?(optical|opt))?(_?power)?(_?dbm)?$|^(optical_?)?rx_?power(_?dbm)?$|^rx_?dbm$|^rxpower$|^recv_?power$|^receive_?power$/i,
  tx: /^(onu_?)?tx(_?(optical|opt))?(_?power)?(_?dbm)?$|^(optical_?)?tx_?power(_?dbm)?$|^tx_?dbm$|^txpower$|^send_?power$|^transmit_?power$/i,
};
const powerNum = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = parseFloat(String(v).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) && n > -60 && n < 15 ? n : null;
};
const findPower = (obj, which, depth = 0) => {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (POWER_KEY[which].test(k) && !/olt/i.test(k)) { const n = powerNum(v); if (n !== null) return n; }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { const n = findPower(v, which, depth + 1); if (n !== null) return n; }
  }
  return null;
};

const Select = ({ value, onChange, options, width = 150, placeholder }) => (isWeb ? (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, color: '#0f172a', width, maxWidth: '100%' }}>
    {placeholder ? <option value="">{placeholder}</option> : null}
    {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
  </select>
) : null);

const Search = ({ value, onChange, placeholder, onSubmit, style }) => (
  <View style={[s.search, style]}>
    <Feather name="search" size={14} color="#94a3b8" />
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94a3b8" style={s.searchInput} onSubmitEditing={onSubmit} returnKeyType="search" />
    {value ? <TouchableOpacity onPress={() => onChange('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
  </View>
);

/** Every field the NMS sent, as label / value rows (nested objects one level deep). */
const AllFields = ({ obj, skip = [] }) => {
  const rows = [];
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (skip.includes(k) || k === 'ok' || k === 'success') return;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.entries(v).forEach(([k2, v2]) => { if (!(v2 && typeof v2 === 'object')) rows.push([`${human(k)} · ${human(k2)}`, v2]); });
    } else if (!Array.isArray(v)) rows.push([human(k), v]);
  });
  if (!rows.length) return <Text style={s.muted}>Nothing to show.</Text>;
  return (
    <View style={s.kvGrid}>
      {rows.map(([k, v]) => (
        <View key={k} style={s.kvCell}>
          <Text style={s.kvLabel} numberOfLines={1}>{k}</Text>
          <Text style={s.kvValue} selectable>{show(v)}</Text>
        </View>
      ))}
    </View>
  );
};

/** A small line chart (web SVG). points: [{ t, v }] */
const LineChart = ({ series, height = 180, unit = '' }) => {
  const [w, setW] = useState(600);
  const all = series.flatMap((sr) => sr.points.map((p) => p.v)).filter((v) => v !== null);
  if (!isWeb || all.length < 2) return <Text style={s.muted}>{all.length ? 'Not enough points for a graph yet.' : 'No history yet.'}</Text>;
  const ts = series.flatMap((sr) => sr.points.map((p) => p.t));
  const t0 = Math.min(...ts); const t1 = Math.max(...ts) || t0 + 1;
  let lo = Math.min(...all); let hi = Math.max(...all);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const pad = { l: 64, r: 10, t: 10, b: 22 };
  const X = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <View onLayout={(e) => setW(Math.max(260, e.nativeEvent.layout.width))}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 6} y={Y(v) + 4} fontSize="10" textAnchor="end" fill="#64748b">{v.toFixed(1)}{unit}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 4} fontSize="10" fill="#64748b">{fmtDate(t0)}</text>
        <text x={w - pad.r} y={height - 4} fontSize="10" textAnchor="end" fill="#64748b">{fmtDate(t1)}</text>
        {series.map((sr) => {
          const pts = sr.points.filter((p) => p.v !== null);
          return <polyline key={sr.name} fill="none" stroke={sr.color} strokeWidth="2" points={pts.map((p) => `${X(p.t)},${Y(p.v)}`).join(' ')} />;
        })}
      </svg>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
        {series.map((sr) => (
          <View key={sr.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 3, backgroundColor: sr.color, borderRadius: 2 }} />
            <Text style={s.muted}>{sr.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
// one "last results" entry -> good / warn / bad / idle (true/false, 1/0, rtt in ms, null = lost,
// "up"/"down", { ok }, { status }, { sent, lost }, { rtt } ...)
const resultTone = (x) => {
  if (x === null || x === undefined || x === false) return 'bad';
  if (x === true) return 'good';
  if (typeof x === 'number') return x > 0 ? 'good' : 'bad';
  if (typeof x === 'string') {
    if (/^(up|ok|true|success|alive)$/i.test(x)) return 'good';
    if (/^(down|lost|timeout|false|fail|error)$/i.test(x)) return 'bad';
    const n = parseFloat(x);
    return Number.isFinite(n) ? (n > 0 ? 'good' : 'bad') : 'idle';
  }
  if (typeof x === 'object') {
    for (const k of ['ok', 'up', 'success', 'alive']) if (k in x) return x[k] ? 'good' : 'bad';
    if ('status' in x || 'state' in x) return statusTone(x.status ?? x.state) === 'good' ? 'good' : 'bad';
    if ('sent' in x && 'lost' in x) { const se = Number(x.sent); const lo = Number(x.lost); if (!se) return 'idle'; return lo >= se ? 'bad' : lo > 0 ? 'warn' : 'good'; }
    const rt = pick(x, 'rtt', 'rtt_ms', 'rtt_avg', 'ms');
    return rt !== undefined ? (Number(rt) > 0 ? 'good' : 'bad') : 'idle';
  }
  return 'idle';
};

const toTime = (p) => {
  const t = pick(p, 't', 'ts', 'time', 'timestamp', 'at', 'created_at', 'checked_at', 'bucket');
  if (typeof t === 'number') return t < 2e10 ? t * 1000 : t;
  const d = new Date(String(t || '').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

// a table with fixed column widths, header + rows scrolling sideways together on small screens
const Table = ({ cols, rows, onRow, keyOf, empty = 'Nothing found.', maxHeight }) => {
  const minWidth = cols.reduce((a, c) => a + (c.w || 120), 0);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth, width: '100%' }}>
      <View style={{ width: '100%' }}>
        <View style={[s.tr, s.thRow]}>
          {cols.map((c) => <View key={c.key} style={[s.cell, { flexBasis: c.w || 120, flexGrow: c.grow ?? 1 }]}><Text style={s.th} numberOfLines={1}>{c.title}</Text></View>)}
        </View>
        <ScrollView style={maxHeight ? { maxHeight } : null} nestedScrollEnabled>
          {rows.map((r, i) => {
            const Row = onRow ? TouchableOpacity : View;
            return (
              <Row key={keyOf ? keyOf(r, i) : i} style={s.tr} onPress={onRow ? () => onRow(r) : undefined}>
                {cols.map((c) => (
                  <View key={c.key} style={[s.cell, { flexBasis: c.w || 120, flexGrow: c.grow ?? 1 }]}>
                    {c.render ? c.render(r) : <Text style={s.td} numberOfLines={2}>{show(pick(r, ...(c.keys || [c.key])))}</Text>}
                  </View>
                ))}
              </Row>
            );
          })}
          {!rows.length ? <Text style={[s.muted, { padding: 16 }]}>{empty}</Text> : null}
        </ScrollView>
      </View>
    </ScrollView>
  );
};

const useNms = () => {
  const call = useCallback(async (op, params, { post = false, quiet = false } = {}) => {
    const res = post ? await OneBssApi.nmsPost(op, params) : await OneBssApi.nmsGet(op, params);
    const ok = res.ok && res.data?.success !== false;
    if (!ok && !quiet) toast.error(res.data?.message || 'NMS request failed');
    return ok ? res.data : null;
  }, []);
  return call;
};

const LIST_MAX = isWeb ? 'calc(100vh - 330px)' : 520;

// ------------------------------------------------------------------------------------------------
// Overview
// ------------------------------------------------------------------------------------------------
const flatNumbers = (o, prefix = '') => {
  const out = [];
  Object.entries(o || {}).forEach(([k, v]) => {
    if (k === 'ok' || k === 'success') return;
    if (typeof v === 'number') out.push([prefix ? `${prefix} ${human(k)}` : human(k), v]);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) out.push(...flatNumbers(v, human(k)));
  });
  return out;
};

const Overview = ({ user, isMobile, onOpen }) => {
  const call = useNms();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await OneBssApi.nmsGet('overview');
    if (res.ok && res.data?.success) { setD(res.data); setErr(''); } else setErr(res.data?.message || 'Could not reach the NMS');
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  // sync-all job: poll every 4 s while it runs
  useEffect(() => {
    const id = pick(job, 'job_id', 'id');
    if (!id || ['done', 'finished', 'failed', 'error', 'completed'].includes(String(pick(job, 'state', 'status') || '').toLowerCase())) return undefined;
    const t = setTimeout(async () => {
      const r = await call('sync_job', { job_id: id }, { quiet: true });
      if (r?.job) setJob({ ...r.job, job_id: id });
    }, 4000);
    return () => clearTimeout(t);
  }, [job, call]);

  const syncAll = async (type) => {
    setBusy(true);
    const r = await call('sync_all', type ? { type } : {}, { post: true });
    setBusy(false);
    if (r) { toast.success(r.message); setJob(r.job || {}); }
  };

  if (err) return <Note tone="error" text={`${err}. Check NMS_API_BASE_URL / NMS_API_KEY in onebss-secrets.php.`} />;
  if (!d) return <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={ACCENT} /></View>;
  const stats = flatNumbers(d.stats);
  const alertNums = flatNumbers(d.alerts);
  const health = d.health || {};
  const healthText = pick(health, 'status', 'state') || (health.ok ? 'ok' : health.error ? 'error' : '');
  const jobState = pick(job, 'state', 'status');
  const jobDone = num(pick(job, 'done', 'finished', 'completed', 'progress.done'));
  const jobTotal = num(pick(job, 'total', 'count', 'devices', 'progress.total'));
  return (
    <View style={{ gap: 16 }}>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={s.cardTitle}>NMS server</Text>
            {healthText ? <Pill text={healthText} /> : null}
          </View>
          {can(user, 'nms.sync') ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn label="Sync all OLTs" icon="refresh-cw" onPress={() => syncAll('olt')} loading={busy} />
              <Btn label="Sync everything" kind="ghost" onPress={() => syncAll('')} disabled={busy} />
            </View>
          ) : null}
        </View>
        {health.error ? <Text style={[s.muted, { color: '#b91c1c', marginTop: 6 }]}>{health.error}</Text> : null}
        <View style={{ marginTop: 8 }}><AllFields obj={Object.fromEntries(Object.entries(health).filter(([k, v]) => typeof v !== 'object' && !['ok', 'status', 'state'].includes(k)))} /></View>
        {job ? (
          <View style={[s.jobBox]}>
            {['done', 'finished', 'completed'].includes(String(jobState || '').toLowerCase()) ? <Feather name="check-circle" size={15} color="#16a34a" /> : <ActivityIndicator size="small" color={ACCENT} />}
            <Text style={s.td}>Sync job {pick(job, 'job_id', 'id') || ''} · {jobState || 'started'}{jobTotal ? ` · ${jobDone ?? 0}/${jobTotal} devices` : ''}</Text>
          </View>
        ) : null}
      </View>

      <View>
        <Text style={s.group}>TOTALS</Text>
        <View style={s.tiles}>
          {stats.length ? stats.map(([k, v]) => (
            <View key={k} style={[s.tile, isMobile && { flexBasis: '46%' }]}>
              <Text style={s.tileValue}>{fmtNum(v)}</Text>
              <Text style={s.tileLabel} numberOfLines={2}>{k}</Text>
            </View>
          )) : <Text style={s.muted}>The NMS sent no totals.</Text>}
        </View>
      </View>

      <View>
        <View style={s.rowBetween}>
          <Text style={s.group}>OPEN ALERTS</Text>
          {onOpen ? <TouchableOpacity onPress={() => onOpen('alerts')}><Text style={s.link}>Open alerts ›</Text></TouchableOpacity> : null}
        </View>
        <View style={s.tiles}>
          {alertNums.length ? alertNums.map(([k, v]) => {
            const tone = /critical/i.test(k) ? 'bad' : /warn/i.test(k) ? 'warn' : 'idle';
            return (
              <View key={k} style={[s.tile, isMobile && { flexBasis: '46%' }, v > 0 && tone !== 'idle' && { borderColor: STATUS[tone].dot }]}>
                <Text style={[s.tileValue, v > 0 && tone !== 'idle' && { color: STATUS[tone].fg }]}>{fmtNum(v)}</Text>
                <Text style={s.tileLabel} numberOfLines={2}>{k}</Text>
              </View>
            );
          }) : <Text style={s.muted}>{d.alerts?.error || 'No open alerts.'}</Text>}
        </View>
      </View>
    </View>
  );
};

// ------------------------------------------------------------------------------------------------
// Devices
// ------------------------------------------------------------------------------------------------
const devId = (d) => pick(d, 'device_id', 'id');
const devName = (d) => pick(d, 'device_name', 'name') || pick(d, 'device_ip', 'host') || `#${devId(d)}`;

// "D-Link" / "DLINK", "Huawei" / "HUAWEI" are one vendor
const vendorKey = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'other';

const DeviceForm = ({ visible, device, onClose, onSaved, operators }) => {
  const call = useNms();
  const editing = !!device;
  // the NMS device models: only these work, so vendor -> model are picked from them
  const [models, setModels] = useState(null); // null = loading, false = could not load
  const [vendor, setVendor] = useState('');
  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    setModels(null);
    call('models', {}, { quiet: true }).then((r) => { if (live) setModels(r && Array.isArray(r.models) ? r.models : false); });
    return () => { live = false; };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const blank = { type: 'olt', protocol: 'telnet', enabled: true, auto_sync: false, sync_every_min: 0, timeout_s: 20, sync_now: true };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setF(device ? {
      type: pick(device, 'device_type', 'type') || 'olt', model: pick(device, 'model') || '', host: pick(device, 'device_ip', 'host') || '',
      protocol: pick(device, 'protocol') || 'telnet', port: pick(device, 'port') ?? '', web_url: pick(device, 'web_url') || '',
      username: pick(device, 'username') || '', password: '', enable_password: '', pons: pick(device, 'pons') || '',
      name: pick(device, 'device_name', 'name') || '', description: pick(device, 'description') || '', location: pick(device, 'location') || '',
      operator_id: pick(device, 'operator_id') || '', operator_name: pick(device, 'operator_name') || '', operator_phone: pick(device, 'operator_phone') || '',
      timeout_s: pick(device, 'timeout_s') ?? 20, enabled: pick(device, 'enabled') !== false, auto_sync: !!pick(device, 'auto_sync'),
      sync_every_min: pick(device, 'sync_every_min') ?? 0, sync_at: pick(device, 'sync_at') || '',
    } : blank);
  }, [visible, device]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // vendors and models of the chosen type
  const ofType = Array.isArray(models) ? models.filter((m) => !f.type || m.type === f.type) : [];
  const vendors = [];
  ofType.forEach((m) => {
    const k = vendorKey(m.vendor);
    const have = vendors.find((v) => v.key === k);
    if (!have) vendors.push({ key: k, label: m.vendor });
    else if (have.label === have.label.toUpperCase() && m.vendor !== m.vendor.toUpperCase()) have.label = m.vendor; // nicer spelling
  });
  vendors.sort((a, b) => (a.key === 'generic') - (b.key === 'generic') || a.label.localeCompare(b.label));
  const vendorModels = ofType.filter((m) => vendorKey(m.vendor) === vendor)
    .sort((a, b) => (b.verified - a.verified) || a.name.localeCompare(b.name));
  const chosen = Array.isArray(models) ? models.find((m) => m.name === f.model) : null;
  // editing: start on the device's vendor
  useEffect(() => {
    if (!Array.isArray(models)) return;
    const m = models.find((x) => x.name === f.model);
    setVendor(m ? vendorKey(m.vendor) : '');
  }, [models]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickType = (t) => { setF((x) => ({ ...x, type: t, model: '' })); setVendor(''); };
  const pickVendor = (v) => {
    setVendor(v);
    const list = ofType.filter((m) => vendorKey(m.vendor) === v);
    setF((x) => ({ ...x, model: list.length === 1 ? list[0].name : '' }));
  };
  const pickModel = (name) => {
    const m = (models || []).find((x) => x.name === name);
    setF((x) => ({ ...x, model: name, pons: x.pons || (m && m.uses_pon ? m.pons : '') }));
  };

  const save = async () => {
    if (Array.isArray(models) && !chosen) {
      toast.error('Choose the vendor and model — only the NMS models can read a device.');
      return;
    }
    setBusy(true);
    const r = await call('device_save', { id: editing ? devId(device) : undefined, device: f }, { post: true });
    setBusy(false);
    if (r) { toast.success(r.message); onSaved(); }
  };
  const field = (k, label, opts = {}) => (
    <View style={[s.field, opts.half && s.half]}>
      <Text style={s.label}>{label}</Text>
      {opts.select ? Select({ value: f[k], onChange: set(k), options: opts.select, width: '100%' }) : (
        <TextInput value={f[k] === undefined || f[k] === null ? '' : String(f[k])} onChangeText={set(k)} style={s.input} placeholder={opts.ph || ''} placeholderTextColor="#94a3b8"
          secureTextEntry={!!opts.secret} keyboardType={opts.numeric ? 'numeric' : 'default'} autoCapitalize="none" />
      )}
      {opts.hint ? <Text style={s.hint}>{opts.hint}</Text> : null}
    </View>
  );
  const check = (k, label) => (
    <TouchableOpacity style={s.check} onPress={() => set(k)(!f[k])}>
      <Feather name={f[k] ? 'check-square' : 'square'} size={16} color={f[k] ? ACCENT : '#94a3b8'} />
      <Text style={s.td}>{label}</Text>
    </TouchableOpacity>
  );
  const pickOperator = (pid) => {
    const op = operators.find((o) => String(o.partner_id) === String(pid));
    setF((x) => ({ ...x, operator_id: op ? String(op.partner_id) : '', operator_name: op ? (op.company_name || op.partner_name) : '', operator_phone: op ? String(op.partner_mobile || '').slice(-10) : '' }));
  };
  return (
    <ModalShell visible={visible} title={editing ? `Edit ${devName(device)}` : 'Add device to the NMS'} icon="cpu" iconColor={ACCENT} onClose={() => !busy && onClose()} busy={busy} maxWidth={760}
      footer={<><Btn label="Cancel" kind="ghost" onPress={onClose} disabled={busy} /><Btn label={editing ? 'Save' : 'Add device'} icon="check" onPress={save} loading={busy} /></>}>
      <ScrollView style={{ maxHeight: isWeb ? '65vh' : 520 }}>
        <Text style={s.section}>DEVICE</Text>
        <View style={s.formRow}>
          <View style={[s.field, s.half]}>
            <Text style={s.label}>Type</Text>
            {Select({ value: f.type, onChange: pickType, options: [['olt', 'OLT'], ['switch', 'Switch'], ['router', 'Router']], width: '100%' })}
          </View>
          {models === false ? (
            field('model', 'Model (command set)', { half: true, ph: 'exact NMS model name', hint: 'Could not load the model list from the NMS — type the model name.' })
          ) : (
            <>
              <View style={[s.field, s.half]}>
                <Text style={s.label}>Vendor *</Text>
                {models === null ? <ActivityIndicator size="small" color={ACCENT} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
                  : Select({ value: vendor, onChange: pickVendor, options: vendors.map((v) => [v.key, v.label]), placeholder: vendors.length ? 'Choose vendor' : 'No models for this type', width: '100%' })}
              </View>
              <View style={[s.field, s.half]}>
                <Text style={s.label}>Model *</Text>
                {Select({ value: chosen ? f.model : '', onChange: pickModel, options: vendorModels.map((m) => [m.name, `${m.name}${m.verified ? '  ✓ verified' : ''}`]), placeholder: vendor ? 'Choose model' : 'Choose a vendor first', width: '100%' })}
              </View>
              {chosen ? (
                <View style={[s.field, s.half, { justifyContent: 'flex-end' }]}>
                  <View style={[s.modelNote, chosen.verified && { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
                    <Feather name={chosen.verified ? 'check-circle' : 'info'} size={12} color={chosen.verified ? '#16a34a' : '#64748b'} style={{ marginTop: 1 }} />
                    <Text style={s.modelNoteText} numberOfLines={3}>{chosen.verified ? 'Checked on a real device. ' : 'Not yet checked on a real device. '}{chosen.description}</Text>
                  </View>
                </View>
              ) : editing && f.model && Array.isArray(models) ? (
                <View style={[s.field, s.half, { justifyContent: 'flex-end' }]}>
                  <Text style={[s.hint, { color: '#b45309' }]}>This device uses "{f.model}", which is not in the NMS model list — choose a model.</Text>
                </View>
              ) : null}
            </>
          )}
          {field('name', 'Name', { half: true })}
          {field('location', 'Location', { half: true })}
          {field('description', 'Description')}
          {f.type === 'olt' && (!chosen || chosen.uses_pon) ? field('pons', 'PONs', { ph: chosen?.pons ? `e.g. ${chosen.pons}` : 'e.g. 0/1-0/8', hint: chosen ? 'This model reads one PON at a time — list the PONs to read' : 'Only for models whose commands use {pon}' }) : null}
        </View>
        <Text style={s.section}>LOGIN (TELNET / SSH)</Text>
        <View style={s.formRow}>
          {field('host', 'Host / IP *', { half: true })}
          {field('protocol', 'Protocol', { half: true, select: [['telnet', 'Telnet'], ['ssh', 'SSH']] })}
          {field('port', 'Port', { half: true, numeric: true, ph: f.protocol === 'ssh' ? '22' : '23' })}
          {field('timeout_s', 'Timeout (s)', { half: true, numeric: true })}
          {field('username', 'Username *', { half: true })}
          {field('password', 'Password', { half: true, secret: true, ph: editing && pick(device, 'password_set') ? 'stored — leave empty to keep' : '' })}
          {field('enable_password', 'Enable password', { half: true, secret: true, ph: editing ? 'leave empty to keep' : '' })}
          {field('web_url', 'Web page', { half: true, ph: '8081 or 192.168.10.2:80', hint: 'As the NMS server reaches it' })}
        </View>
        <Text style={s.section}>OPERATOR</Text>
        <View style={s.formRow}>
          <View style={[s.field]}>
            <Text style={s.label}>OneBSS operator</Text>
            {Select({ value: f.operator_id, onChange: pickOperator, options: operators.map((o) => [String(o.partner_id), `${o.company_name || o.partner_name} · #${o.partner_id}${o.partner_mobile ? ` · ${String(o.partner_mobile).slice(-10)}` : ''}`]), width: '100%', placeholder: '— none —' })}
            <Text style={s.hint}>Fills the operator id, name and phone the NMS stores (operators see their devices by this phone).</Text>
          </View>
          {field('operator_phone', 'Operator phone', { half: true, numeric: true })}
          {field('operator_name', 'Operator name', { half: true })}
        </View>
        <Text style={s.section}>SYNC</Text>
        <View style={s.formRow}>
          {field('sync_every_min', 'Sync every (min)', { half: true, numeric: true, hint: '0 = off' })}
          {field('sync_at', 'Sync at', { half: true, ph: '02:00,14:30' })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 }}>
          {check('enabled', 'Enabled (off = no syncs)')}
          {check('auto_sync', 'Auto sync')}
          {!editing ? check('sync_now', 'Read the device right after adding') : null}
        </View>
      </ScrollView>
    </ModalShell>
  );
};

const DevicePage = ({ user, device, onClose, onEdit, onChanged, isMobile }) => {
  const call = useNms();
  const id = devId(device);
  const [tab, setTab] = useState('info');
  const [info, setInfo] = useState(null);
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState({ pon: '', status: '', vlan: '', port: '' });
  const [busy, setBusy] = useState('');
  const [portHist, setPortHist] = useState(null);
  const [edit, setEdit] = useState(null); // { kind: 'port'|'onu', key, text }
  const isOlt = String(pick(device, 'device_type', 'type') || '').toLowerCase() === 'olt';

  useEffect(() => { (async () => { const r = await call('device', { id }); if (r) setInfo(r.device); })(); }, [id, call]);
  const loadList = useCallback(async () => {
    if (!['ports', 'onus', 'macs'].includes(tab)) return;
    setList(null);
    const r = await call(`device_${tab}`, { id, ...(tab === 'onus' ? { pon: filter.pon, status: filter.status } : tab === 'macs' ? { vlan: filter.vlan, port: filter.port, pon: filter.pon } : {}) });
    setList(r ? r.items || [] : []);
  }, [tab, id, filter, call]);
  useEffect(() => { loadList(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (force) => {
    setBusy('sync');
    const r = await call('device_sync', { id, force }, { post: true });
    setBusy('');
    if (r) { toast.success(r.message); onChanged(); const d = await call('device', { id }, { quiet: true }); if (d) setInfo(d.device); loadList(); }
  };
  const openLink = async (kind) => {
    setBusy(kind);
    const res = kind === 'terminal' ? await OneBssApi.getNmsDeviceTerminal(id) : await OneBssApi.getNmsDeviceWebUrl(id);
    setBusy('');
    const url = res?.data?.url || res?.data?.terminal_url || res?.data?.web_url;
    if (url && isWeb) window.open(url, '_blank', 'noopener');
    else toast.error(res?.data?.message || 'Could not open the link');
  };

  const showPortHistory = async (p) => {
    const pid = pick(p, 'port_id', 'id');
    if (!pid) return;
    setPortHist({ port: p, items: null });
    const r = await call('port_history', { port_id: pid, hours: 168 });
    setPortHist({ port: p, items: r ? r.items || [] : [] });
  };

  const d = info || device;
  const tabs = [['info', 'Info'], ['ports', 'Ports'], ...(isOlt ? [['onus', 'ONUs']] : []), ['macs', 'MAC table'],
  ];
  const canEditDev = can(user, 'nms.devices', 'edit');

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onClose} style={s.backBtn}>
        <Feather name="arrow-left" size={15} color="#0f172a" />
        <Text style={s.backText}>Back to devices</Text>
      </TouchableOpacity>
      <View style={[s.card, { gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={s.devIcon}><Feather name={isOlt ? 'cpu' : 'server'} size={20} color={ACCENT} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Text style={s.pageTitle} numberOfLines={1}>{devName(d)}</Text>
              <Pill text={pick(d, 'enabled') === false ? 'disabled' : pick(d, 'status')} />
            </View>
            <Text style={s.muted}>{pick(d, 'device_ip', 'host')} · {String(pick(d, 'device_type', 'type') || '').toUpperCase()} {pick(d, 'model') || ''} · last sync {ago(pick(d, 'last_sync'))}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {can(user, 'nms.sync') ? <Btn label="Sync now" icon="refresh-cw" onPress={() => sync(false)} loading={busy === 'sync'} /> : null}
          {can(user, 'nms.sync') ? <Btn label="Force full sync" kind="ghost" onPress={() => sync(true)} disabled={!!busy} /> : null}
          {can(user, 'nms.terminal') ? <Btn label="Terminal" icon="terminal" kind="ghost" onPress={() => openLink('terminal')} loading={busy === 'terminal'} /> : null}
          {can(user, 'nms.terminal') && pick(d, 'web_available', 'web_url') ? <Btn label="Web page" icon="external-link" kind="ghost" onPress={() => openLink('web')} loading={busy === 'web'} /> : null}
          {canEditDev ? <Btn label="Edit" icon="edit-2" kind="ghost" onPress={() => onEdit(d)} /> : null}
        </View>
        {pick(d, 'last_error', 'status_reason') ? <Note tone="error" text={String(pick(d, 'last_error', 'status_reason'))} /> : null}
      </View>
      <View style={[s.card, { gap: 12 }]}>
        <ScrollTabs style={s.subTabs}>
          {tabs.map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.subTab, tab === k && s.subTabOn]}>
              <Text style={[s.subTabText, tab === k && { color: ACCENT }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollTabs>

        {tab === 'info' ? (info ? <AllFields obj={info} skip={['ports', 'onus', 'macs']} /> : <ActivityIndicator color={ACCENT} />) : null}

        {['onus', 'macs'].includes(tab) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <TextInput value={filter.pon} onChangeText={(v) => setFilter((x) => ({ ...x, pon: v }))} placeholder="PON e.g. 0/1" placeholderTextColor="#94a3b8" style={[s.input, { width: 130 }]} />
            {tab === 'onus' ? Select({ value: filter.status, onChange: (v) => setFilter((x) => ({ ...x, status: v })), options: [['online', 'Online'], ['offline', 'Offline']], placeholder: 'All statuses', width: 140 }) : null}
            {tab === 'macs' ? <TextInput value={filter.vlan} onChangeText={(v) => setFilter((x) => ({ ...x, vlan: v }))} placeholder="VLAN" placeholderTextColor="#94a3b8" style={[s.input, { width: 90 }]} /> : null}
            {tab === 'macs' ? <TextInput value={filter.port} onChangeText={(v) => setFilter((x) => ({ ...x, port: v }))} placeholder="Port" placeholderTextColor="#94a3b8" style={[s.input, { width: 110 }]} /> : null}
            <Btn label="Apply" kind="ghost" icon="filter" onPress={loadList} />
          </View>
        ) : null}

        {['ports', 'onus', 'macs'].includes(tab) ? (list === null ? <ActivityIndicator color={ACCENT} /> : (
          <>
            <Text style={s.muted}>{list.length} row(s)</Text>
            {tab === 'ports' ? (
              <Table maxHeight={420} rows={list} keyOf={(p, i) => pick(p, 'port_id', 'id', 'port', 'name') || i}
                cols={[
                  { key: 'port', title: 'Port', keys: ['port', 'name', 'interface', 'ifname'], w: 120 },
                  { key: 'status', title: 'Status', w: 110, render: (p) => <Pill text={pick(p, 'status', 'oper_status', 'link')} /> },
                  { key: 'speed', title: 'Speed', keys: ['speed', 'speed_mbps', 'rate'], w: 90 },
                  { key: 'rx', title: 'SFP RX', w: 110, render: (p) => <Power v={pick(p, 'rx_power_dbm', 'rx_power', 'rx')} /> },
                  { key: 'tx', title: 'SFP TX', w: 110, render: (p) => <Power v={pick(p, 'tx_power_dbm', 'tx_power', 'tx')} /> },
                  { key: 'desc', title: 'Description', w: 200, render: (p) => (
                    <TouchableOpacity disabled={!canEditDev} onPress={() => setEdit({ kind: 'port', key: pick(p, 'port', 'name', 'interface'), text: pick(p, 'description', 'desc') || '' })} style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                      <Text style={s.td} numberOfLines={2}>{show(pick(p, 'description', 'desc'))}</Text>
                      {canEditDev ? <Feather name="edit-2" size={11} color="#94a3b8" /> : null}
                    </TouchableOpacity>
                  ) },
                  { key: 'hist', title: '', w: 70, grow: 0, render: (p) => (pick(p, 'port_id', 'id') ? <TouchableOpacity onPress={() => showPortHistory(p)}><Text style={s.link}>History</Text></TouchableOpacity> : null) },
                ]} />
            ) : tab === 'onus' ? (
              <Table maxHeight={420} rows={list} keyOf={(o, i) => pick(o, 'onu_id', 'id') || i}
                cols={[
                  { key: 'if', title: 'Interface', keys: ['interface', 'onu_interface'], w: 120 },
                  { key: 'status', title: 'Status', w: 110, render: (o) => <Pill text={pick(o, 'status', 'onu_status')} /> },
                  { key: 'name', title: 'Name / description', w: 190, render: (o) => (
                    <Text style={s.td} numberOfLines={2}>{show(pick(o, 'description', 'name', 'onu_name'))}</Text>
                  ) },
                  { key: 'serial', title: 'Serial / MAC', keys: ['serial', 'onu_serial', 'onu_mac', 'mac'], w: 150 },
                  { key: 'rx', title: 'RX', w: 105, render: (o) => <Power rx v={findPower(o, 'rx')} /> },
                  { key: 'tx', title: 'TX', w: 105, render: (o) => <Power v={findPower(o, 'tx')} /> },
                  { key: 'seen', title: 'Last seen', w: 110, render: (o) => <Text style={s.td}>{ago(pick(o, 'last_seen', 'updated_at'))}</Text> },
                ]} />
            ) : (
              <Table maxHeight={420} rows={list} keyOf={(m, i) => `${pick(m, 'mac')}-${i}`}
                cols={[
                  { key: 'mac', title: 'MAC', keys: ['mac', 'mac_address'], w: 160 },
                  { key: 'vlan', title: 'VLAN', keys: ['vlan', 'vlan_id'], w: 80 },
                  { key: 'port', title: 'Port / ONU', keys: ['port', 'interface', 'onu_interface'], w: 140 },
                  { key: 'type', title: 'Type', keys: ['type', 'kind'], w: 90 },
                  { key: 'seen', title: 'Last seen', w: 120, render: (m) => <Text style={s.td}>{ago(pick(m, 'last_seen', 'seen_at', 'updated_at'))}</Text> },
                ]} />
            )}
          </>
        )) : null}

        {portHist ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>SFP power · {show(pick(portHist.port, 'port', 'name'))} · last 7 days</Text>
              <TouchableOpacity onPress={() => setPortHist(null)}><Feather name="x" size={16} color="#64748b" /></TouchableOpacity>
            </View>
            {portHist.items === null ? <ActivityIndicator color={ACCENT} /> : (
              <LineChart unit=" dBm" series={[
                { name: 'RX', color: '#2563eb', points: portHist.items.map((p) => ({ t: toTime(p), v: num(pick(p, 'rx', 'rx_power_dbm', 'rx_power')) })).filter((p) => p.t) },
                { name: 'TX', color: '#d97706', points: portHist.items.map((p) => ({ t: toTime(p), v: num(pick(p, 'tx', 'tx_power_dbm', 'tx_power')) })).filter((p) => p.t) },
              ]} />
            )}
          </View>
        ) : null}

      </View>
      <DescriptionModal visible={!!edit} initial={edit?.text}
        title={edit ? `Port ${edit.key} — description` : ''}
        onSubmit={edit ? descSubmit('port_description', { id, port: edit.key }) : async () => ({ ok: false })}
        onClose={(saved) => { setEdit(null); if (saved) loadList(); }} />
    </View>
  );
};

// edit a port / ONU description (saved on the NMS and on the device)
// edit a port / ONU description. onSubmit(text, onDevice) -> { ok, message }.
// When the device's model has no "description" command in the NMS, the NMS refuses to write it
// on the OLT: the window shows why and offers "Save in NMS only" (on_device = false).
const DescriptionModal = ({ visible, title, initial, onSubmit, onClose }) => {
  const [text, setText] = useState('');
  const [onDevice, setOnDevice] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setText(initial || ''); setOnDevice(true); setErr(''); } }, [visible, initial]);
  const save = async (dev) => {
    setBusy(true); setErr('');
    const res = await onSubmit(text, dev);
    setBusy(false);
    if (res.ok) { toast.success(res.message || 'Saved'); onClose(true); return; }
    setErr(res.message || 'Could not save');
  };
  const deviceRefused = onDevice && /on_device|has no .*action|provisioning/i.test(err);
  return (
    <ModalShell visible={visible} title={title} icon="edit-2" iconColor={ACCENT} onClose={() => !busy && onClose(false)} busy={busy} maxWidth={500}
      footer={(
        <>
          <Btn label="Cancel" kind="ghost" onPress={() => onClose(false)} disabled={busy} />
          {deviceRefused ? <Btn label="Save in NMS only" icon="database" onPress={() => { setOnDevice(false); save(false); }} loading={busy} />
            : <Btn label="Save" icon="check" onPress={() => save(onDevice)} loading={busy} />}
        </>
      )}>
      <Text style={s.label}>Description</Text>
      <TextInput value={text} onChangeText={setText} style={[s.input, { marginTop: 6 }]} maxLength={120} autoFocus />
      <TouchableOpacity style={[s.check, { marginTop: 10 }]} onPress={() => { setOnDevice(!onDevice); setErr(''); }}>
        <Feather name={onDevice ? 'check-square' : 'square'} size={16} color={onDevice ? ACCENT : '#94a3b8'} />
        <Text style={s.td}>Also write it on the OLT / switch</Text>
      </TouchableOpacity>
      <Text style={[s.hint, { marginTop: 4 }]}>{onDevice ? 'Saved in the NMS and on the device.' : 'Saved in the NMS only (the device keeps its own name).'} Up to 120 characters.</Text>
      {err ? (
        <View style={{ marginTop: 10 }}>
          <Note tone={deviceRefused ? 'warn' : 'error'} text={deviceRefused
            ? `The NMS cannot write descriptions on this device: ${err}\n\nUse "Save in NMS only", or add the description action to this model in the NMS (Device models → Provisioning actions).`
            : err} />
        </View>
      ) : null}
    </ModalShell>
  );
};
const descSubmit = (op, params) => async (text, onDevice) => {
  const res = await OneBssApi.nmsPost(op, { ...params, description: text, on_device: onDevice });
  return { ok: !!(res.ok && res.data?.success !== false), message: res.data?.message };
};

const Devices = ({ user, isMobile }) => {
  const call = useNms();
  const [f, setF] = useState({ q: '', type: '', status: '', model: '', location: '', sort: 'type' });
  const [qText, setQText] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null); // null | 'new' | device
  const [operators, setOperators] = useState([]);
  const PAGE = 50;
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: qText.trim() })), 400); return () => clearTimeout(t); }, [qText]);
  useEffect(() => setPage(0), [f]);
  const load = useCallback(async () => {
    setData(null);
    const r = await call('devices', { ...f, limit: PAGE, offset: page * PAGE });
    setData(r ? { items: r.items || [], total: r.total || 0 } : { items: [], total: 0 });
  }, [f, page, call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { (async () => { const r = await call('facets', {}, { quiet: true }); if (r) setFacets(r.facets || {}); })(); }, [call]);
  useEffect(() => {
    if (!can(user, 'nms.devices', 'add') && !can(user, 'nms.devices', 'edit')) return;
    (async () => {
      const res = await OneBssApi.getPartners('operator', '', 'all');
      const list = res?.ok ? res.data : [];
      setOperators(Array.isArray(list) ? list.filter((p) => !p.role || String(p.role).toLowerCase() === 'operator') : []);
    })();
  }, [user]);

  const facetList = (k) => {
    const v = facets && (facets[k] || facets[`${k}s`]);
    if (!Array.isArray(v)) return [];
    return v.map((x) => (typeof x === 'object' ? [String(pick(x, 'value', 'name', k) ?? ''), `${pick(x, 'name', 'value', k)}${x.count != null ? ` (${x.count})` : ''}`] : [String(x), String(x)])).filter((x) => x[0]);
  };
  const statusCounts = facets && (facets.status || facets.statuses || facets.by_status);
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const formEl = <DeviceForm visible={!!form} device={form && form !== 'new' ? form : null} operators={operators} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />;
  if (open) {
    return (
      <>
        <DevicePage user={user} device={open} isMobile={isMobile} onClose={() => setOpen(null)} onEdit={(d) => setForm(d)} onChanged={load} />
        {formEl}
      </>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Search value={qText} onChange={setQText} placeholder="Search name, IP, location, operator…" style={isMobile ? null : { flex: 1 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Select({ value: f.type, onChange: (v) => setF((x) => ({ ...x, type: v })), options: [['olt', 'OLTs'], ['switch', 'Switches'], ['router', 'Routers']], placeholder: 'All types', width: 120 })}
          {Select({ value: f.status, onChange: (v) => setF((x) => ({ ...x, status: v })), options: [['up', 'Up'], ['down', 'Down'], ['error', 'Last sync failed'], ['never', 'Never synced'], ['unknown', 'Unknown'], ['disabled', 'Disabled']], placeholder: 'All statuses', width: 150 })}
          {facetList('model').length ? Select({ value: f.model, onChange: (v) => setF((x) => ({ ...x, model: v })), options: facetList('model'), placeholder: 'All models', width: 150 }) : null}
          {facetList('location').length ? Select({ value: f.location, onChange: (v) => setF((x) => ({ ...x, location: v })), options: facetList('location'), placeholder: 'All locations', width: 160 }) : null}
          {Select({ value: f.sort, onChange: (v) => setF((x) => ({ ...x, sort: v })), options: [['type', 'Sort: type'], ['name', 'Name'], ['status', 'Status'], ['-offline', 'Most offline ONUs'], ['-onus', 'Most ONUs'], ['-last_sync', 'Last synced']], width: 160 })}
          {can(user, 'nms.devices', 'add') ? <Btn label="Add device" icon="plus" onPress={() => setForm('new')} /> : null}
        </View>
      </View>
      {statusCounts && typeof statusCounts === 'object' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(statusCounts).map(([k, v]) => (
            <TouchableOpacity key={k} onPress={() => setF((x) => ({ ...x, status: x.status === k ? '' : k }))} style={[s.chip, f.status === k && { backgroundColor: '#eef2ff', borderColor: ACCENT }]}>
              <View style={[s.dot, { backgroundColor: STATUS[statusTone(k)].dot }]} />
              <Text style={s.chipText}>{human(k)} {typeof v === 'object' ? show(pick(v, 'count')) : v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={s.tableCard}>
        <View style={[s.rowBetween, { padding: 10 }]}>
          <Text style={s.muted}>{data ? `${fmtNum(total)} device(s)` : 'Loading…'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={[s.pg, page <= 0 && { opacity: 0.4 }]} disabled={page <= 0} onPress={() => setPage(page - 1)}><Feather name="chevron-left" size={15} color="#0f172a" /></TouchableOpacity>
            <Text style={s.td}>{page + 1} / {pages}</Text>
            <TouchableOpacity style={[s.pg, page + 1 >= pages && { opacity: 0.4 }]} disabled={page + 1 >= pages} onPress={() => setPage(page + 1)}><Feather name="chevron-right" size={15} color="#0f172a" /></TouchableOpacity>
            <TouchableOpacity style={s.pg} onPress={load}><Feather name="refresh-cw" size={13} color="#0f172a" /></TouchableOpacity>
          </View>
        </View>
        {!data ? <ActivityIndicator color={ACCENT} style={{ padding: 20 }} /> : (
          <Table maxHeight={LIST_MAX} rows={data.items} onRow={setOpen} keyOf={(d) => devId(d)}
            cols={[
              { key: 'name', title: 'Device', w: 220, render: (d) => (
                <View>
                  <Text style={s.tdStrong} numberOfLines={1}>{devName(d)}</Text>
                  <Text style={s.muted} numberOfLines={1}>{pick(d, 'device_ip', 'host')} · {String(pick(d, 'device_type', 'type') || '').toUpperCase()} {pick(d, 'model') || ''}</Text>
                </View>
              ) },
              { key: 'status', title: 'Status', w: 120, render: (d) => <Pill text={pick(d, 'enabled') === false ? 'disabled' : pick(d, 'status')} /> },
              { key: 'onus', title: 'ONUs online', w: 120, render: (d) => {
                const on = num(pick(d, 'onus_online')); const tot = num(pick(d, 'onus_total', 'onus'));
                if (tot === null) return <Text style={s.td}>—</Text>;
                const off = num(pick(d, 'onus_offline', 'offline')) ?? (on !== null ? tot - on : null);
                return <View><Text style={s.td}>{fmtNum(on)} / {fmtNum(tot)}</Text>{off ? <Text style={[s.muted, { color: '#b91c1c' }]}>{fmtNum(off)} offline</Text> : null}</View>;
              } },
              { key: 'ports', title: 'Ports up', w: 100, render: (d) => <Text style={s.td}>{num(pick(d, 'ports_total')) !== null ? `${fmtNum(pick(d, 'ports_up'))} / ${fmtNum(pick(d, 'ports_total'))}` : '—'}</Text> },
              { key: 'operator', title: 'Operator', w: 170, render: (d) => (
                <View><Text style={s.td} numberOfLines={1}>{show(pick(d, 'operator_name'))}</Text><Text style={s.muted}>{pick(d, 'operator_phone') || ''}</Text></View>
              ) },
              { key: 'location', title: 'Location', keys: ['location'], w: 140 },
              { key: 'sync', title: 'Last sync', w: 130, render: (d) => (
                <View><Text style={s.td}>{ago(pick(d, 'last_sync'))}</Text>{pick(d, 'last_error') ? <Text style={[s.muted, { color: '#b91c1c' }]} numberOfLines={1}>{pick(d, 'last_error')}</Text> : null}</View>
              ) },
            ]} />
        )}
      </View>

      {formEl}
    </View>
  );
};

// ------------------------------------------------------------------------------------------------
// ONUs
// ------------------------------------------------------------------------------------------------
const OnuDetail = ({ user, onu, onClose }) => {
  const call = useNms();
  const id = pick(onu, 'onu_id', 'id');
  const [info, setInfo] = useState(null);
  const [hours, setHours] = useState('72');
  const [hist, setHist] = useState(null);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { (async () => { const r = await call('onu', { id }); setInfo(r ? r.onu : onu); })(); }, [id, call]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { setHist(null); const r = await call('onu_history', { id, hours }); setHist(r ? r.items || [] : []); })(); }, [id, hours, call]);
  const readLive = async () => {
    setBusy('live');
    const r = await call('onu_live', { id }, { post: true });
    setBusy('');
    if (r) setLive(r.live || {});
  };

  const o = info || onu;
  // power: the live reading when there is one, else what the NMS has stored, else the last history point
  const lastHist = hist && hist.length ? hist[hist.length - 1] : null;
  const liveRx = live ? findPower(live, 'rx') : null;
  const liveTx = live ? findPower(live, 'tx') : null;
  const rx = liveRx ?? findPower(o, 'rx') ?? (lastHist ? findPower(lastHist, 'rx') : null);
  const tx = liveTx ?? findPower(o, 'tx') ?? (lastHist ? findPower(lastHist, 'tx') : null);
  const isLive = liveRx !== null || liveTx !== null;
  const temp = (live && pick(live, 'temperature_c', 'temperature', 'temp', 'optical.temperature_c')) ?? pick(o, 'temperature_c', 'temperature', 'optical.temperature_c');
  const liveMsg = live && !isLive ? (pick(live, 'message', 'error', 'detail', 'result.message', 'result.error') || 'The OLT did not return a power reading for this ONU.') : '';
  const since = isLive ? (pick(live, 'updated_at', 'read_at', 'result.updated_at') || Date.now()) : (pick(o, 'optical.updated_at', 'power_updated_at', 'updated_at', 'last_seen') || (lastHist ? toTime(lastHist) : null));
  return (
    <ModalShell visible title={`ONU ${show(pick(o, 'interface', 'onu_interface', 'serial'))}`} icon="radio" iconColor={ACCENT} onClose={onClose} maxWidth={980} footer={<Btn label="Close" kind="ghost" onPress={onClose} />}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Pill text={pick(o, 'status', 'onu_status')} />
          <Text style={s.muted}>{[pick(o, 'olt_name', 'device_name', 'olt') || (pick(o, 'device_id') ? `Device #${pick(o, 'device_id')}` : null), pick(o, 'description', 'name', 'onu_name', 'customer_name'), pick(o, 'serial', 'onu_serial', 'sn', 'onu_mac', 'mac')].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn label="Read live power" icon="activity" onPress={readLive} loading={busy === 'live'} />
        </View>
        <View style={[s.card, { flexDirection: 'row', gap: 26, flexWrap: 'wrap', alignItems: 'flex-end' }]}>
          <View><Text style={s.kvLabel}>RX power</Text><View style={{ marginTop: 3 }}>{rx === null && !info ? <ActivityIndicator size="small" color={ACCENT} /> : <Power rx v={rx} />}</View></View>
          <View><Text style={s.kvLabel}>TX power</Text><View style={{ marginTop: 3 }}><Power v={tx} /></View></View>
          {temp != null ? <View><Text style={s.kvLabel}>Temperature</Text><Text style={[s.td, { marginTop: 3 }]}>{show(temp)} °C</Text></View> : null}
          <View>
            <Text style={s.kvLabel}>{isLive ? 'Live reading' : 'Last known'}</Text>
            <Text style={[s.td, { marginTop: 3 }]}>{since ? ago(since) : '—'}</Text>
          </View>
          {liveMsg ? <Text style={[s.muted, { color: '#b45309', flexBasis: '100%' }]}>{String(liveMsg)}</Text> : null}
        </View>
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Optical power history</Text>
            {Select({ value: hours, onChange: setHours, options: [['24', 'Last 24 h'], ['72', 'Last 3 days'], ['168', 'Last 7 days'], ['720', 'Last 30 days']], width: 140 })}
          </View>
          <View style={{ marginTop: 8 }}>
            {hist === null ? <ActivityIndicator color={ACCENT} /> : (
              <LineChart unit=" dBm" series={[
                { name: 'RX', color: '#2563eb', points: hist.map((p) => ({ t: toTime(p), v: findPower(p, 'rx') ?? powerNum(pick(p, 'rx_avg')) })).filter((p) => p.t) },
                { name: 'TX', color: '#d97706', points: hist.map((p) => ({ t: toTime(p), v: findPower(p, 'tx') ?? powerNum(pick(p, 'tx_avg')) })).filter((p) => p.t) },
              ]} />
            )}
          </View>
        </View>
        <Text style={s.section}>ALL DETAILS</Text>
        {info ? <AllFields obj={info} /> : <ActivityIndicator color={ACCENT} />}
      </View>
    </ModalShell>
  );
};

// "By customer": pick a OneBSS internet account -> its router MAC from RADIUS -> the ONU it sits
// behind (the same lookup as the account's "ONU Details") -> that ONU's window.
const CustomerOnuPicker = ({ onOpen }) => {
  const [text, setText] = useState('');
  const [opts, setOpts] = useState(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const t = text.trim();
    if (picked && t === pickLabel(picked)) return undefined;
    if (t.length < 2) { setOpts(null); return undefined; }
    const my = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await OneBssApi.getCustomersList(1, 15, 'internet', t);
      if (my !== seq.current) return;
      setSearching(false);
      const list = r.ok ? (r.data?.data || r.data?.customers || []) : [];
      setOpts(Array.isArray(list) ? list : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const lookup = async (acct, sync = false) => {
    setBusy(true); setRes(null);
    const r = await OneBssApi.getOnuDetails(acct.internet_id, sync);
    setBusy(false);
    setRes({ ok: r.ok && r.data?.success !== false, data: r.data || {} });
  };
  const choose = (acct) => { setPicked(acct); setText(pickLabel(acct)); setOpts(null); lookup(acct); };
  const d = res?.data || {};
  const onu = d.onu || {};
  const onuId = pick(onu, 'id', 'onu_id');
  return (
    <View style={{ gap: 12 }}>
      <View style={{ position: 'relative', zIndex: 20 }}>
        <Search value={text} onChange={(v) => { setText(v); if (picked) { setPicked(null); setRes(null); } }} placeholder="Customer username, name, mobile or account ID" />
        {searching ? <ActivityIndicator size="small" color={ACCENT} style={{ position: 'absolute', right: 40, top: 11 }} /> : null}
        {opts ? (
          <View style={s.dropdown}>
            <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {opts.length ? opts.map((c) => (
                <TouchableOpacity key={c.internet_id} style={s.dropItem} onPress={() => choose(c)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.tdStrong} numberOfLines={1}>{c.username}{c.acc_id ? <Text style={s.muted}>  · acc {c.acc_id}</Text> : null}</Text>
                    <Text style={s.muted} numberOfLines={1}>{[custName(c), c.mobile || c.cust_mobileno, c.company_name || c.partner_name].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Pill text={c.online === 1 || c.online === '1' || /online/i.test(String(c.connectivity || c.online_status || '')) ? 'online' : (c.status_text || c.status || 'offline')} />
                </TouchableOpacity>
              )) : <Text style={[s.muted, { padding: 12 }]}>No internet customer matches.</Text>}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {!picked ? <Note tone="info" text="Type a customer's username, name or mobile and pick the account: its router MAC is read from RADIUS and the NMS finds the OLT, PON and ONU it is behind." /> : null}
      {busy ? <View style={[s.card, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}><ActivityIndicator color={ACCENT} /><Text style={s.td}>Finding {picked?.username}'s ONU…</Text></View> : null}
      {res && !busy ? (
        res.ok && onuId ? (
          <View style={[s.card, { gap: 10 }]}>
            <View style={s.rowBetween}>
              <View style={{ flexShrink: 1 }}>
                <Text style={s.cardTitle}>{picked.username} · {show(pick(onu, 'interface', 'onu_interface'))}</Text>
                <Text style={s.muted}>{[pick(d, 'olt.name', 'olt.ip'), pick(onu, 'name'), pick(onu, 'serial', 'onu_mac')].filter(Boolean).join(' · ')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="Open ONU" icon="radio" onPress={() => onOpen({ onu_id: onuId, interface: pick(onu, 'interface', 'onu_interface'), olt_name: pick(d, 'olt.name', 'olt.device_name'), ...onu })} />
                <Btn label="Read again" kind="ghost" icon="refresh-cw" onPress={() => lookup(picked, true)} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22 }}>
              <View><Text style={s.kvLabel}>Status</Text><View style={{ marginTop: 3 }}><Pill text={pick(onu, 'status') || (d.found ? 'found' : '')} /></View></View>
              <View><Text style={s.kvLabel}>RX power</Text><View style={{ marginTop: 3 }}><Power rx v={findPower(d.optical || onu, 'rx')} /></View></View>
              <View><Text style={s.kvLabel}>TX power</Text><View style={{ marginTop: 3 }}><Power v={findPower(d.optical || onu, 'tx')} /></View></View>
              {pick(d, 'onu.customer_mac') ? <View><Text style={s.kvLabel}>Customer MAC</Text><Text style={[s.td, { marginTop: 3 }]}>{d.onu.customer_mac}{pick(d, 'onu.vlan') ? ` · VLAN ${d.onu.vlan}` : ''}</Text></View> : null}
              {pick(d, 'switch.device_name', 'switch.port') ? <View><Text style={s.kvLabel}>Switch</Text><Text style={[s.td, { marginTop: 3 }]}>{[pick(d, 'switch.device_name', 'switch.device_ip'), pick(d, 'switch.port')].filter(Boolean).join(' · port ')}</Text></View> : null}
              <View><Text style={s.kvLabel}>Last seen</Text><Text style={[s.td, { marginTop: 3 }, pick(d, 'freshness.stale') ? { color: '#b45309' } : null]}>{ago(pick(d, 'freshness.last_seen', 'optical.updated_at'))}</Text></View>
            </View>
          </View>
        ) : (
          <Note tone={res.ok ? 'warn' : 'error'} text={d.message || (res.ok ? `No ONU found for ${picked.username}${d.mac ? ` (router MAC ${d.mac})` : ''}.` : 'Could not look up the ONU.')} />
        )
      ) : null}
    </View>
  );
};
const custName = (c) => [c.cust_first_name || c.first_name, c.cust_last_name || c.last_name].filter(Boolean).join(' ') || c.customer_name || c.full_name || '';
const pickLabel = (c) => `${c.username}${custName(c) ? ` — ${custName(c)}` : ''}`;

const Onus = ({ user }) => {
  const call = useNms();
  const [mode, setMode] = useState('onu');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const find = async () => {
    if (q.trim().length < 2) { toast.info('Type at least 2 characters'); return; }
    setBusy(true);
    const r = await call('onu_search', { q: q.trim(), limit: 100 });
    setBusy(false);
    setRows(r ? r.items || [] : []);
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={s.segWrap}>
        {[['onu', 'By ONU', 'radio'], ['customer', 'By customer', 'user']].map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setMode(k)} style={[s.seg, mode === k && s.segOn]}>
            <Feather name={ic} size={13} color={mode === k ? '#ffffff' : '#475569'} />
            <Text style={[s.segText, mode === k && { color: '#ffffff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'customer' ? <CustomerOnuPicker onOpen={setOpen} /> : (
        <>
          <View style={[s.toolbar]}>
            <Search value={q} onChange={setQ} onSubmit={find} placeholder="Name, serial, ONU MAC, customer MAC or interface (EPON0/1:5)" style={{ flex: 1 }} />
            <Btn label="Search" icon="search" onPress={find} loading={busy} />
          </View>
          {rows === null ? <Note tone="info" text="Find an ONU on any OLT by its name, serial, MAC (ONU or customer router) or interface. Open it for power history and a live reading." /> : (
            <View style={s.tableCard}>
              <Text style={[s.muted, { padding: 10 }]}>{rows.length} ONU(s)</Text>
              <Table maxHeight={LIST_MAX} rows={rows} onRow={setOpen} keyOf={(o, i) => pick(o, 'onu_id', 'id') || i}
                cols={[
                  { key: 'if', title: 'Interface', keys: ['interface', 'onu_interface'], w: 130 },
                  { key: 'olt', title: 'OLT', keys: ['olt_name', 'device_name', 'olt_ip'], w: 160 },
                  { key: 'status', title: 'Status', w: 110, render: (o) => <Pill text={pick(o, 'status', 'onu_status')} /> },
                  { key: 'name', title: 'Name', keys: ['name', 'onu_name', 'description'], w: 180 },
                  { key: 'serial', title: 'Serial / MAC', keys: ['serial', 'onu_serial', 'onu_mac', 'mac'], w: 160 },
                  { key: 'rx', title: 'RX', w: 105, render: (o) => <Power rx v={findPower(o, 'rx')} /> },
                  { key: 'seen', title: 'Last seen', w: 110, render: (o) => <Text style={s.td}>{ago(pick(o, 'last_seen', 'updated_at'))}</Text> },
                ]} />
            </View>
          )}
        </>
      )}
      {open ? <OnuDetail user={user} onu={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
};

// ------------------------------------------------------------------------------------------------
// Alerts / Events
// ------------------------------------------------------------------------------------------------
const sevTone = (v) => (/critical/i.test(v) ? 'bad' : /warn/i.test(v) ? 'warn' : 'idle');

const Alerts = ({ user, isMobile }) => {
  const call = useNms();
  const [f, setF] = useState({ severity: '', source: '', acked: 'false', q: '' });
  const [qText, setQText] = useState('');
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState('');
  const canAck = can(user, 'nms.alerts', 'edit');
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: qText.trim() })), 400); return () => clearTimeout(t); }, [qText]);
  const load = useCallback(async () => {
    setRows(null); setSel({});
    const r = await call('alerts', { ...f, limit: 500 });
    setRows(r ? r.items || [] : []);
  }, [f, call]);
  useEffect(() => { load(); }, [load]);
  const ack = async (a, unack) => {
    const id = pick(a, 'alert_id', 'id');
    setBusy(`a${id}`);
    const r = await call('alert_ack', { id, unack }, { post: true });
    setBusy('');
    if (r) { toast.success(r.message); load(); }
  };
  const ackSel = async () => {
    const ids = Object.keys(sel).filter((k) => sel[k]).map(Number);
    if (!ids.length) return;
    setBusy('bulk');
    const r = await call('alerts_ack', { ids }, { post: true });
    setBusy('');
    if (r) { toast.success(r.message); load(); }
  };
  const selCount = Object.values(sel).filter(Boolean).length;
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Search value={qText} onChange={setQText} placeholder="Search alerts…" style={isMobile ? null : { flex: 1 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Select({ value: f.severity, onChange: (v) => setF((x) => ({ ...x, severity: v })), options: [['critical', 'Critical'], ['warning', 'Warning']], placeholder: 'All severities', width: 140 })}
          {Select({ value: f.source, onChange: (v) => setF((x) => ({ ...x, source: v })), options: [['telnet', 'Telnet / SSH sync'], ['snmp', 'SNMP'], ['netwatch', 'Netwatch'], ['system', 'System']], placeholder: 'All sources', width: 150 })}
          {Select({ value: f.acked, onChange: (v) => setF((x) => ({ ...x, acked: v })), options: [['false', 'Not acknowledged'], ['true', 'Acknowledged']], placeholder: 'Acknowledged or not', width: 170 })}
          {canAck && selCount ? <Btn label={`Acknowledge ${selCount}`} icon="check" onPress={ackSel} loading={busy === 'bulk'} /> : null}
        </View>
      </View>
      <View style={s.tableCard}>
        <Text style={[s.muted, { padding: 10 }]}>{rows ? `${rows.length} open alert(s)` : 'Loading…'}</Text>
        {!rows ? <ActivityIndicator color={ACCENT} style={{ padding: 20 }} /> : (
          <Table maxHeight={LIST_MAX} rows={rows} keyOf={(a, i) => pick(a, 'alert_id', 'id') || i}
            cols={[
              ...(canAck ? [{ key: 'x', title: '', w: 40, grow: 0, render: (a) => { const k = pick(a, 'alert_id', 'id'); return <TouchableOpacity onPress={() => setSel((x) => ({ ...x, [k]: !x[k] }))}><Feather name={sel[k] ? 'check-square' : 'square'} size={16} color={sel[k] ? ACCENT : '#94a3b8'} /></TouchableOpacity>; } }] : []),
              { key: 'sev', title: 'Severity', w: 110, render: (a) => <Pill text={pick(a, 'severity', 'level')} tone={sevTone(pick(a, 'severity', 'level'))} /> },
              { key: 'msg', title: 'Alert', w: 300, render: (a) => (
                <View><Text style={s.tdStrong} numberOfLines={2}>{show(pick(a, 'message', 'title', 'text', 'type'))}</Text><Text style={s.muted} numberOfLines={1}>{show(pick(a, 'type'))} · {show(pick(a, 'source'))}</Text></View>
              ) },
              { key: 'dev', title: 'Device / ONU', w: 190, render: (a) => (
                <View><Text style={s.td} numberOfLines={1}>{show(pick(a, 'device_name', 'olt_name', 'entity_name'))}</Text><Text style={s.muted} numberOfLines={1}>{pick(a, 'interface', 'onu_interface', 'port', 'host') || ''}</Text></View>
              ) },
              { key: 'since', title: 'Since', w: 120, render: (a) => <Text style={s.td}>{ago(pick(a, 'since', 'created_at', 'first_seen', 'raised_at'))}</Text> },
              ...(canAck ? [{ key: 'ack', title: '', w: 120, grow: 0, render: (a) => {
                const acked = !!pick(a, 'acked', 'acknowledged', 'acked_at');
                return <TouchableOpacity onPress={() => ack(a, acked)} disabled={!!busy}><Text style={s.link}>{busy === `a${pick(a, 'alert_id', 'id')}` ? '…' : acked ? 'Reopen' : 'Acknowledge'}</Text></TouchableOpacity>;
              } }] : []),
            ]} />
        )}
      </View>
    </View>
  );
};

const Events = ({ isMobile }) => {
  const call = useNms();
  const [f, setF] = useState({ hours: '24', severity: '', q: '' });
  const [qText, setQText] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const PAGE = 100;
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: qText.trim() })), 400); return () => clearTimeout(t); }, [qText]);
  useEffect(() => setPage(0), [f]);
  useEffect(() => { (async () => { setRows(null); const r = await call('events', { ...f, limit: PAGE, offset: page * PAGE }); setRows(r ? r.items || [] : []); })(); }, [f, page, call]);
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Search value={qText} onChange={setQText} placeholder="Search events…" style={isMobile ? null : { flex: 1 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Select({ value: f.hours, onChange: (v) => setF((x) => ({ ...x, hours: v })), options: [['1', 'Last hour'], ['24', 'Last 24 h'], ['72', 'Last 3 days'], ['168', 'Last 7 days'], ['720', 'Last 30 days']], width: 140 })}
          {Select({ value: f.severity, onChange: (v) => setF((x) => ({ ...x, severity: v })), options: [['problem', 'Problems only'], ['critical', 'Critical'], ['warning', 'Warning'], ['info', 'Info']], placeholder: 'All events', width: 150 })}
        </View>
      </View>
      <View style={s.tableCard}>
        <View style={[s.rowBetween, { padding: 10 }]}>
          <Text style={s.muted}>{rows ? `${rows.length} event(s) on this page` : 'Loading…'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={[s.pg, page <= 0 && { opacity: 0.4 }]} disabled={page <= 0} onPress={() => setPage(page - 1)}><Feather name="chevron-left" size={15} color="#0f172a" /></TouchableOpacity>
            <Text style={s.td}>Page {page + 1}</Text>
            <TouchableOpacity style={[s.pg, (rows?.length || 0) < PAGE && { opacity: 0.4 }]} disabled={(rows?.length || 0) < PAGE} onPress={() => setPage(page + 1)}><Feather name="chevron-right" size={15} color="#0f172a" /></TouchableOpacity>
          </View>
        </View>
        {!rows ? <ActivityIndicator color={ACCENT} style={{ padding: 20 }} /> : (
          <Table maxHeight={LIST_MAX} rows={rows} keyOf={(e, i) => pick(e, 'event_id', 'id') || i}
            cols={[
              { key: 'at', title: 'When', w: 140, render: (e) => <Text style={s.td}>{fmtDate(pick(e, 'at', 'created_at', 'ts', 'time'))}</Text> },
              { key: 'sev', title: 'Severity', w: 110, render: (e) => <Pill text={pick(e, 'severity', 'level') || 'info'} tone={sevTone(pick(e, 'severity', 'level'))} /> },
              { key: 'msg', title: 'Event', w: 320, render: (e) => <Text style={s.td} numberOfLines={3}>{show(pick(e, 'message', 'text', 'title', 'type'))}</Text> },
              { key: 'dev', title: 'Device', keys: ['device_name', 'olt_name', 'entity_name'], w: 170 },
              { key: 'type', title: 'Type', keys: ['type', 'event_type'], w: 140 },
            ]} />
        )}
      </View>
    </View>
  );
};

// ------------------------------------------------------------------------------------------------
// Netwatch
// ------------------------------------------------------------------------------------------------
const NetwatchForm = ({ visible, host, onClose, onSaved }) => {
  const call = useNms();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setF(host ? { name: pick(host, 'name') || '', host: pick(host, 'host') || '', kind: pick(host, 'kind') || 'icmp', port: pick(host, 'port') ?? '', url: pick(host, 'url') || '',
      group_name: pick(host, 'group_name', 'group') || '', interval_s: pick(host, 'interval_s') ?? 30, enabled: pick(host, 'enabled') !== false }
      : { name: '', host: '', kind: 'icmp', port: '', url: '', group_name: '', interval_s: 30, enabled: true });
  }, [visible, host]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const r = await call('netwatch_save', { id: host ? pick(host, 'id', 'nid', 'netwatch_id') : undefined, host: f }, { post: true });
    setBusy(false);
    if (r) { toast.success(r.message); onSaved(); }
  };
  const field = (k, label, ph, numeric) => (
    <View style={[s.field, s.half]}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={f[k] === undefined || f[k] === null ? '' : String(f[k])} onChangeText={set(k)} style={s.input} placeholder={ph || ''} placeholderTextColor="#94a3b8" keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize="none" />
    </View>
  );
  return (
    <ModalShell visible={visible} title={host ? `Edit ${pick(host, 'name', 'host')}` : 'Add a monitor'} icon="activity" iconColor={ACCENT} onClose={() => !busy && onClose()} busy={busy} maxWidth={620}
      footer={<><Btn label="Cancel" kind="ghost" onPress={onClose} disabled={busy} /><Btn label="Save" icon="check" onPress={save} loading={busy} /></>}>
      <View style={s.formRow}>
        {field('name', 'Name')}
        <View style={[s.field, s.half]}>
          <Text style={s.label}>Check</Text>
          {Select({ value: f.kind, onChange: set('kind'), options: [['icmp', 'Ping (ICMP)'], ['tcp', 'TCP port'], ['http', 'Web page (HTTP)']], width: '100%' })}
        </View>
        {f.kind === 'http' ? field('url', 'URL', 'https://…') : field('host', 'Host / IP', '10.0.0.1')}
        {f.kind === 'tcp' ? field('port', 'Port', '80', true) : null}
        {field('group_name', 'Group', 'e.g. POPs')}
        {field('interval_s', 'Every (seconds)', '30', true)}
      </View>
      <TouchableOpacity style={[s.check, { marginTop: 8 }]} onPress={() => set('enabled')(!f.enabled)}>
        <Feather name={f.enabled ? 'check-square' : 'square'} size={16} color={f.enabled ? ACCENT : '#94a3b8'} />
        <Text style={s.td}>Enabled</Text>
      </TouchableOpacity>
    </ModalShell>
  );
};

// one monitor: graph + loss incidents + per-minute readings
const NW_RANGES = [['1', 'Last hour'], ['6', 'Last 6 h'], ['24', 'Last 24 h'], ['72', 'Last 3 days'], ['168', 'Last 7 days']];
const dur = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
};
const NetwatchPage = ({ user, host, isMobile, onBack, onCheck, checking, onEdit }) => {
  const call = useNms();
  const id = pick(host, 'id', 'nid', 'netwatch_id');
  const [hours, setHours] = useState('6');
  const [items, setItems] = useState(null);
  const [minutesPage, setMinutesPage] = useState(0);
  const [onlyLoss, setOnlyLoss] = useState(false);
  const load = useCallback(async () => {
    setItems(null);
    const r = await call('netwatch_history', { id, hours });
    setItems(r ? r.items || [] : []);
  }, [id, hours, call]);
  useEffect(() => { load(); setMinutesPage(0); }, [load]);

  // NMS buckets: { ts, sent, lost, rtt_avg, rtt_max } (older names kept as fallbacks)
  const pts = useMemo(() => (items || []).map((p) => ({
    t: toTime(p), avg: num(pick(p, 'rtt_avg', 'avg_rtt_ms', 'rtt_ms', 'rtt', 'value')), max: num(pick(p, 'rtt_max', 'max_rtt_ms')),
    sent: num(pick(p, 'sent')), lost: num(pick(p, 'lost')),
  })).filter((p) => p.t).sort((a, b) => a.t - b.t), [items]);
  const sent = pts.reduce((a, p) => a + (p.sent || 0), 0);
  const lost = pts.reduce((a, p) => a + (p.lost || 0), 0);
  const avgs = pts.map((p) => p.avg).filter((v) => v !== null);
  const avg = avgs.length ? avgs.reduce((a, v) => a + v, 0) / avgs.length : null;
  const peak = pts.reduce((a, p) => Math.max(a, p.max ?? p.avg ?? 0), 0);
  const downMin = pts.filter((p) => p.sent > 0 && p.lost >= p.sent).length;
  const uptime = pts.length ? ((pts.length - downMin) / pts.length) * 100 : null;
  // consecutive minutes with loss -> one incident
  const incidents = useMemo(() => {
    const out = [];
    let cur = null;
    const step = pts.length > 1 ? Math.min(...pts.slice(1).map((p, i) => p.t - pts[i].t).filter((d) => d > 0)) || 60000 : 60000;
    pts.forEach((p) => {
      const bad = (p.lost || 0) > 0;
      if (bad && cur && p.t - cur.endT <= step * 1.5) {
        cur.endT = p.t; cur.lost += p.lost; cur.sent += p.sent || 0; cur.minutes += 1; cur.down = cur.down || (p.sent > 0 && p.lost >= p.sent); cur.peak = Math.max(cur.peak, p.max ?? p.avg ?? 0);
      } else if (bad) {
        cur = { startT: p.t, endT: p.t, lost: p.lost, sent: p.sent || 0, minutes: 1, down: p.sent > 0 && p.lost >= p.sent, peak: p.max ?? p.avg ?? 0, step };
        out.push(cur);
      } else cur = null;
    });
    return out.reverse();
  }, [pts]);
  const MPAGE = 60;
  const minutes = useMemo(() => [...pts].reverse().filter((p) => !onlyLoss || (p.lost || 0) > 0), [pts, onlyLoss]);
  const mPages = Math.max(1, Math.ceil(minutes.length / MPAGE));
  const status = pick(host, 'status', 'state');

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onBack} style={s.backBtn}>
        <Feather name="arrow-left" size={15} color="#0f172a" />
        <Text style={s.backText}>Back to monitors</Text>
      </TouchableOpacity>

      <View style={[s.card, { gap: 12 }]}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            <View style={s.devIcon}><Feather name="activity" size={20} color={ACCENT} /></View>
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Text style={s.pageTitle} numberOfLines={1}>{show(pick(host, 'name', 'host'))}</Text>
                <Pill text={status} />
              </View>
              <Text style={s.muted} numberOfLines={2}>
                {String(pick(host, 'kind') || 'icmp').toUpperCase()} · {pick(host, 'url', 'host')}{pick(host, 'port') ? `:${pick(host, 'port')}` : ''}
                {pick(host, 'group_name', 'group') ? ` · ${pick(host, 'group_name', 'group')}` : ''} · {status ? `${String(status).toLowerCase()} since ${ago(pick(host, 'since', 'status_since', 'changed_at'))}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn label="Check now" icon="zap" onPress={onCheck} loading={checking} />
            {can(user, 'nms.netwatch', 'edit') ? <Btn label="Edit" icon="edit-2" kind="ghost" onPress={onEdit} /> : null}
          </View>
        </View>
      </View>

      <View style={[s.card, { gap: 12 }]}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>Round trip</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {Select({ value: hours, onChange: setHours, options: NW_RANGES, width: 150 })}
            <TouchableOpacity style={s.pg} onPress={load}><Feather name="refresh-cw" size={13} color="#0f172a" /></TouchableOpacity>
          </View>
        </View>
        {items === null ? <ActivityIndicator color={ACCENT} style={{ padding: 20 }} /> : (
          <>
            <View style={s.tiles}>
              {[
                ['Average', avg !== null ? `${avg.toFixed(1)} ms` : '—'],
                ['Peak', peak ? `${peak.toFixed(1)} ms` : '—'],
                ['Packet loss', sent ? `${((lost / sent) * 100).toFixed(2)}%` : '—', lost ? 'warn' : null, sent ? `${fmtNum(lost)} of ${fmtNum(sent)} packets` : ''],
                ['Uptime', uptime !== null ? `${uptime.toFixed(2)}%` : '—', downMin ? 'bad' : null, downMin ? `${fmtNum(downMin)} min fully down` : 'no full outage'],
                ['Loss incidents', fmtNum(incidents.length), incidents.length ? 'warn' : null],
              ].map(([k, v, tone, sub]) => (
                <View key={k} style={[s.tile, isMobile && { flexBasis: '46%' }, tone && { borderColor: STATUS[tone].dot }]}>
                  <Text style={[s.tileValue, { fontSize: 19 }, tone && { color: STATUS[tone].fg }]}>{v}</Text>
                  <Text style={s.tileLabel}>{k}</Text>
                  {sub ? <Text style={[s.muted, { marginTop: 2 }]}>{sub}</Text> : null}
                </View>
              ))}
            </View>
            <LineChart unit=" ms" height={220} series={[
              { name: 'Average round trip', color: '#0f766e', points: pts.map((p) => ({ t: p.t, v: p.avg })) },
              ...(pts.some((p) => p.max !== null) ? [{ name: 'Max round trip', color: '#cbd5e1', points: pts.map((p) => ({ t: p.t, v: p.max })) }] : []),
            ]} />
          </>
        )}
      </View>

      {items ? (
        <View style={s.tableCard}>
          <View style={[s.rowBetween, { padding: 12 }]}>
            <Text style={s.cardTitle}>Packet loss incidents</Text>
            <Text style={s.muted}>back-to-back minutes with loss are one incident</Text>
          </View>
          <Table maxHeight={340} rows={incidents} keyOf={(x) => x.startT} empty="No packet loss in this period."
            cols={[
              { key: 'start', title: 'Started', w: 150, render: (x) => <Text style={s.td}>{fmtDate(x.startT)}</Text> },
              { key: 'end', title: 'Ended', w: 150, render: (x) => <Text style={s.td}>{fmtDate(x.endT + x.step)}</Text> },
              { key: 'dur', title: 'Duration', w: 110, render: (x) => <Text style={s.td}>{dur(x.endT + x.step - x.startT)}</Text> },
              { key: 'kind', title: 'Type', w: 120, render: (x) => <Pill text={x.down ? 'down' : 'loss'} tone={x.down ? 'bad' : 'warn'} /> },
              { key: 'lost', title: 'Packets lost', w: 130, render: (x) => <Text style={s.td}>{fmtNum(x.lost)} of {fmtNum(x.sent)} ({x.sent ? ((x.lost / x.sent) * 100).toFixed(0) : 0}%)</Text> },
              { key: 'peak', title: 'Peak round trip', w: 130, render: (x) => <Text style={s.td}>{x.peak ? `${x.peak.toFixed(1)} ms` : '—'}</Text> },
            ]} />
        </View>
      ) : null}

      {items && pts.length ? (
        <View style={s.tableCard}>
          <View style={[s.rowBetween, { padding: 12 }]}>
            <Text style={s.cardTitle}>Readings</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity style={s.check} onPress={() => { setOnlyLoss(!onlyLoss); setMinutesPage(0); }}>
                <Feather name={onlyLoss ? 'check-square' : 'square'} size={15} color={onlyLoss ? ACCENT : '#94a3b8'} />
                <Text style={s.td}>Only with loss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.pg, minutesPage <= 0 && { opacity: 0.4 }]} disabled={minutesPage <= 0} onPress={() => setMinutesPage(minutesPage - 1)}><Feather name="chevron-left" size={15} color="#0f172a" /></TouchableOpacity>
              <Text style={s.td}>{minutesPage + 1} / {mPages}</Text>
              <TouchableOpacity style={[s.pg, minutesPage + 1 >= mPages && { opacity: 0.4 }]} disabled={minutesPage + 1 >= mPages} onPress={() => setMinutesPage(minutesPage + 1)}><Feather name="chevron-right" size={15} color="#0f172a" /></TouchableOpacity>
            </View>
          </View>
          <Table maxHeight={LIST_MAX} rows={minutes.slice(minutesPage * MPAGE, (minutesPage + 1) * MPAGE)} keyOf={(p) => p.t} empty="No readings with loss."
            cols={[
              { key: 'ts', title: 'Time', w: 150, render: (p) => <Text style={s.td}>{fmtDate(p.t)}</Text> },
              { key: 'avg', title: 'Avg round trip', w: 120, render: (p) => <Text style={s.td}>{p.avg !== null ? `${p.avg.toFixed(1)} ms` : '—'}</Text> },
              { key: 'max', title: 'Max round trip', w: 120, render: (p) => <Text style={[s.td, p.max > (avg || 0) * 2 && { color: '#b45309', fontWeight: '700' }]}>{p.max !== null ? `${p.max.toFixed(1)} ms` : '—'}</Text> },
              { key: 'sent', title: 'Sent', keys: ['sent'], w: 70, render: (p) => <Text style={s.td}>{p.sent ?? '—'}</Text> },
              { key: 'lost', title: 'Lost', w: 70, render: (p) => <Text style={[s.td, p.lost > 0 && { color: p.sent && p.lost >= p.sent ? '#b91c1c' : '#b45309', fontWeight: '700' }]}>{p.lost ?? '—'}</Text> },
            ]} />
        </View>
      ) : null}
    </View>
  );
};

const Netwatch = ({ user, isMobile }) => {
  const call = useNms();
  const [f, setF] = useState({ status: '', group: '', q: '' });
  const [qText, setQText] = useState('');
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: qText.trim() })), 400); return () => clearTimeout(t); }, [qText]);
  const load = useCallback(async () => { const r = await call('netwatch', f); setRows(r ? r.items || [] : []); }, [f, call]);
  useEffect(() => { setRows(null); load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const nid = (h) => pick(h, 'id', 'nid', 'netwatch_id');
  const check = async (h) => {
    setBusy(`c${nid(h)}`);
    const r = await call('netwatch_check', { id: nid(h) }, { post: true });
    setBusy('');
    if (r) { toast.success(`${pick(h, 'name', 'host')}: ${show(pick(r.result, 'status', 'state'))}${pick(r.result, 'rtt_ms', 'rtt') != null ? ` · ${pick(r.result, 'rtt_ms', 'rtt')} ms` : ''}`); load(); }
  };
  const openHist = (h) => setHist(h);
  const groups = [...new Set((rows || []).map((h) => pick(h, 'group_name', 'group')).filter(Boolean))];
  const formEl = <NetwatchForm visible={!!form} host={form && form !== 'new' ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />;
  if (hist) {
    // the monitor's own page; the row is refreshed from the list (every 30 s)
    const fresh = (rows || []).find((h) => nid(h) === nid(hist)) || hist;
    return (
      <>
        <NetwatchPage user={user} host={fresh} isMobile={isMobile} onBack={() => setHist(null)} onCheck={() => check(fresh)} checking={busy === `c${nid(fresh)}`} onEdit={() => setForm(fresh)} />
        {formEl}
      </>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Search value={qText} onChange={setQText} placeholder="Search monitors…" style={isMobile ? null : { flex: 1 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Select({ value: f.status, onChange: (v) => setF((x) => ({ ...x, status: v })), options: [['up', 'Up'], ['down', 'Down'], ['unknown', 'Unknown'], ['off', 'Off']], placeholder: 'All statuses', width: 130 })}
          {groups.length ? Select({ value: f.group, onChange: (v) => setF((x) => ({ ...x, group: v })), options: groups, placeholder: 'All groups', width: 140 }) : null}
          {can(user, 'nms.netwatch', 'add') ? <Btn label="Add monitor" icon="plus" onPress={() => setForm('new')} /> : null}
        </View>
      </View>
      <View style={s.tableCard}>
        <Text style={[s.muted, { padding: 10 }]}>{rows ? `${rows.length} monitor(s) · refreshes every 30 s` : 'Loading…'}</Text>
        {!rows ? <ActivityIndicator color={ACCENT} style={{ padding: 20 }} /> : (
          <Table maxHeight={LIST_MAX} rows={rows} keyOf={(h, i) => nid(h) || i}
            cols={[
              { key: 'name', title: 'Monitor', w: 210, render: (h) => (
                <TouchableOpacity onPress={() => openHist(h)} accessibilityLabel="Open monitor"><Text style={[s.tdStrong, { color: '#1d4ed8' }]} numberOfLines={1}>{show(pick(h, 'name', 'host'))}</Text><Text style={s.muted} numberOfLines={1}>{String(pick(h, 'kind') || 'icmp').toUpperCase()} · {pick(h, 'url', 'host')}{pick(h, 'port') ? `:${pick(h, 'port')}` : ''}</Text></TouchableOpacity>
              ) },
              { key: 'status', title: 'Status', w: 110, render: (h) => <TouchableOpacity onPress={() => openHist(h)}><Pill text={pick(h, 'status', 'state')} /></TouchableOpacity> },
              { key: 'since', title: 'Since', w: 110, render: (h) => <Text style={s.td}>{ago(pick(h, 'since', 'status_since', 'changed_at'))}</Text> },
              { key: 'rtt', title: 'Round trip', w: 120, render: (h) => <Text style={s.td}>{pick(h, 'last_rtt_ms', 'rtt_ms', 'last_rtt') != null ? `${pick(h, 'last_rtt_ms', 'rtt_ms', 'last_rtt')} ms` : '—'}{pick(h, 'avg_rtt_ms', 'avg_rtt') != null ? ` (avg ${pick(h, 'avg_rtt_ms', 'avg_rtt')})` : ''}</Text> },
              { key: 'loss', title: 'Loss', w: 80, render: (h) => <Text style={s.td}>{pick(h, 'loss_pct', 'loss') != null ? `${pick(h, 'loss_pct', 'loss')}%` : '—'}</Text> },
              { key: 'last', title: 'Last results', w: 160, render: (h) => {
                const r = pick(h, 'last', 'results', 'last_results', 'recent');
                if (!Array.isArray(r) || !r.length) return <Text style={s.td}>—</Text>;
                return <View style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>{r.slice(-30).map((x, i) => {
                  const tone = resultTone(x);
                  return <View key={i} style={{ width: 4, height: 14, borderRadius: 1, backgroundColor: tone === 'good' ? '#10b981' : tone === 'warn' ? '#f59e0b' : tone === 'bad' ? '#ef4444' : '#cbd5e1' }} />;
                })}</View>;
              } },
              { key: 'group', title: 'Group', keys: ['group_name', 'group'], w: 110 },
              { key: 'act', title: '', w: 160, grow: 0, render: (h) => (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => check(h)}><Text style={s.link}>{busy === `c${nid(h)}` ? '…' : 'Check'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => openHist(h)}><Text style={s.link}>History</Text></TouchableOpacity>
                  {can(user, 'nms.netwatch', 'edit') ? <TouchableOpacity onPress={() => setForm(h)}><Text style={s.link}>Edit</Text></TouchableOpacity> : null}
                </View>
              ) },
            ]} />
        )}
      </View>
      {formEl}
    </View>
  );
};

// ------------------------------------------------------------------------------------------------
// the page
// ------------------------------------------------------------------------------------------------
export const NmsScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const tabs = useMemo(() => [
    ['overview', 'Overview', 'grid', can(user, 'nms.dashboard')],
    ['devices', 'Devices', 'cpu', can(user, 'nms.devices', 'view')],
    ['onus', 'ONUs', 'radio', can(user, 'nms.onus', 'view')],
    ['alerts', 'Alerts', 'bell', can(user, 'nms.alerts', 'view')],
    ['events', 'Events', 'list', can(user, 'nms.events', 'view')],
    ['netwatch', 'Netwatch', 'activity', can(user, 'nms.netwatch', 'view')],
  ].filter((t) => t[3]), [user]);
  const initial = () => {
    const m = isWeb ? /[?&]view=(\w+)/.exec(window.location.hash || '') : null;
    return m && tabs.some((t) => t[0] === m[1]) ? m[1] : tabs[0]?.[0];
  };
  const [tab, setTab] = useState(initial);
  const go = (t) => {
    setTab(t);
    if (isWeb) { try { window.history.replaceState(null, '', `#nms?view=${t}`); } catch (e) { /* ignore */ } }
  };
  const key = `${tab}-${refreshSignal || 0}`;
  if (!tabs.length) return <View style={{ padding: 24 }}><Note tone="info" text="Your staff role has no NMS pages. Ask your admin (Staff & Roles › NMS)." /></View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 16 }}>
      <ScrollTabs style={s.tabs} contentContainerStyle={{ padding: 4, gap: 6 }}>
        {tabs.map(([k, l, icon]) => (
          <TouchableOpacity key={k} onPress={() => go(k)} style={[s.tab, tab === k && s.tabOn]}>
            <Feather name={icon} size={14} color={tab === k ? ACCENT : '#64748b'} />
            <Text style={[s.tabText, tab === k && { color: ACCENT }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollTabs>
      <View key={key}>
        {tab === 'overview' ? <Overview user={user} isMobile={isMobile} onOpen={tabs.some((t) => t[0] === 'alerts') ? go : null} /> : null}
        {tab === 'devices' ? <Devices user={user} isMobile={isMobile} /> : null}
        {tab === 'onus' ? <Onus user={user} /> : null}
        {tab === 'alerts' ? <Alerts user={user} isMobile={isMobile} /> : null}
        {tab === 'events' ? <Events isMobile={isMobile} /> : null}
        {tab === 'netwatch' ? <Netwatch user={user} isMobile={isMobile} /> : null}
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  modelNote: { flexDirection: 'row', gap: 6, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  modelNoteText: { flex: 1, fontSize: 11.5, color: '#475569', lineHeight: 16 },
  tabs: { backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'flex-start', maxWidth: '100%' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  backText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  devIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#eef2f8', alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  tabOn: { backgroundColor: '#eef2f8' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  subTabs: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  subTab: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabOn: { borderBottomColor: ACCENT },
  subTabText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  tableCard: { backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  group: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 8 },
  section: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: 170, flexGrow: 1, maxWidth: 260, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  tileValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  tileLabel: { fontSize: 11.5, color: '#64748b', marginTop: 4, fontWeight: '600' },
  jobBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', minWidth: 220 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', outlineStyle: 'none' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 10, minHeight: 46 },
  thRow: { backgroundColor: '#f8fafc', minHeight: 38, borderBottomColor: '#e2e8f0' },
  cell: { flexShrink: 0, minWidth: 0, paddingRight: 12, paddingVertical: 6, overflow: 'hidden' },
  th: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.4, textTransform: 'uppercase' },
  td: { fontSize: 12.5, color: '#334155' },
  tdStrong: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 11.5, color: '#64748b' },
  link: { fontSize: 12.5, fontWeight: '700', color: '#1d4ed8' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  pg: { width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#f1f5f9' },
  kvCell: { flexBasis: 220, flexGrow: 1, padding: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  kvLabel: { fontSize: 10.5, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 },
  kvValue: { fontSize: 12.5, color: '#0f172a', marginTop: 2 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexBasis: '100%', gap: 4 },
  half: { flexBasis: '47%', flexGrow: 1, minWidth: 200 },
  label: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  input: { height: 38, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#ffffff' },
  hint: { fontSize: 11, color: '#94a3b8' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segWrap: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  segOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  segText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  dropdown: { position: 'absolute', top: 42, left: 0, right: 0, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
});

export default NmsScreen;
