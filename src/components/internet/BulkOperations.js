import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi, newClientRef } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, SearchSelect } from './shared';

/**
 * Bulk Operations on the Internet customers list.
 *   rows: the ticked accounts [{ internet_id, username, full_name, partner_id, partner_name }]
 *
 *   BulkOperationsMenu   — the grid of operations (like the old system's popup)
 *   BulkMigrateModal     — "Update Partner & Branch": moves the accounts to another operator
 *                          (customer_migrate.php, grouped per current operator, 25 per call)
 *   BulkRechargeModal    — "Renew": checks each account's current plan + price
 *                          (internet_bulk_recharge_preview.php, nothing charged), asks to confirm,
 *                          then renews one account at a time with internet_recharge.php
 */

const fmtDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return '';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${m[3]} ${mon} ${m[1]}`;
};
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---------------------------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------------------------
export const BulkOperationsMenu = ({ visible, count, canMigrate, onClose, onPick }) => {
  const { width } = useWindowDimensions();
  const ops = [
    { key: 'recharge', label: 'Renew', icon: 'refresh-cw', sub: 'On the current plan' },
    ...(canMigrate ? [{ key: 'migrate', label: 'Update Partner & Branch', icon: 'shuffle', sub: 'Move to another operator' }] : []),
  ];
  const cols = width < 560 ? 1 : 2;
  return (
    <ModalShell
      visible={visible}
      title={`Bulk Operations · ${count} selected`}
      icon="layers"
      onClose={onClose}
      maxWidth={560}
      footer={<Btn label="Cancel" kind="ghost" onPress={onClose} />}
    >
      <View style={s.grid}>
        {ops.map((o) => (
          <TouchableOpacity key={o.key} style={[s.opBtn, { width: cols === 1 ? '100%' : '48.5%' }]} onPress={() => onPick(o.key)}>
            <Feather name={o.icon} size={16} color="#1d4ed8" />
            <View style={{ flex: 1 }}>
              <Text style={s.opLabel}>{o.label}</Text>
              <Text style={s.opSub}>{o.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[s.muted, { marginTop: 12 }]}>More bulk operations (IPTV, OTT and others) will be added here.</Text>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------------------------
// Update Partner & Branch (bulk migrate) — super admin
// ---------------------------------------------------------------------------------------------
export const BulkMigrateModal = ({ visible, rows = [], onClose, onDone }) => {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [toId, setToId] = useState('');
  const [branches, setBranches] = useState(null);
  const [toBranch, setToBranch] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);

  const sourceIds = useMemo(() => [...new Set(rows.map((r) => String(r.partner_id)).filter(Boolean))], [rows]);

  useEffect(() => {
    if (!visible) return;
    setInfo(null); setError(''); setToId(''); setBranches(null); setToBranch(''); setProgress(null); setResults(null);
    OneBssApi.getMigrationTargets(sourceIds).then((res) => {
      if (!res.ok) { setError(res.data?.message || 'Could not load the operators'); return; }
      setInfo(res.data);
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets = info?.targets || [];
  const okTargets = targets.filter((t) => t.same_radius);
  const target = targets.find((t) => String(t.partner_id) === String(toId));

  useEffect(() => {
    setBranches(null); setToBranch('');
    if (!target) return;
    const ids = (target.branch_ids || []).map(String);
    if (ids.length < 2) return;
    setBranches(ids.map((id) => ({ id, name: `Branch #${id}` })));
    OneBssApi.getRadiusBranches(target.partner_id).then((res) => {
      if (!res.ok || res.data?.success === false) return;
      const names = {};
      (res.data.branches || []).forEach((b) => { names[String(b.id)] = b.name; });
      setBranches(ids.map((id) => ({ id, name: names[id] || `Branch #${id}` })));
    });
  }, [toId]); // eslint-disable-line react-hooks/exhaustive-deps

  const already = rows.filter((r) => String(r.partner_id) === String(toId));
  const toMove = rows.filter((r) => String(r.partner_id) !== String(toId));
  const needBranch = branches && branches.length > 1;
  const canRun = !!target && toMove.length > 0 && (!needBranch || !!toBranch) && !running;

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    const out = already.map((r) => ({ internet_id: r.internet_id, username: r.username, ok: true, skipped: true, message: `Already under ${target.partner_name}` }));
    setResults([...out]);
    const groups = {};
    toMove.forEach((r) => { (groups[r.partner_id] = groups[r.partner_id] || []).push(r); });
    let done = 0;
    setProgress({ done, total: toMove.length });
    for (const [fromId, list] of Object.entries(groups)) {
      for (const part of chunk(list, 25)) {
        const res = await OneBssApi.migrateCustomers(fromId, toId, part.map((r) => Number(r.internet_id)), needBranch ? toBranch : '');
        if (res.ok && Array.isArray(res.data?.results)) {
          res.data.results.forEach((x) => {
            const r = part.find((p) => String(p.internet_id) === String(x.internet_id));
            out.push({ internet_id: x.internet_id, username: x.username || r?.username, ok: !!x.ok, message: [x.message, ...(x.warnings || [])].filter(Boolean).join(' · ') });
          });
        } else {
          part.forEach((r) => out.push({ internet_id: r.internet_id, username: r.username, ok: false, message: res.data?.message || 'Request failed' }));
        }
        done += part.length;
        setProgress({ done, total: toMove.length });
        setResults([...out]);
      }
    }
    setRunning(false);
    const moved = out.filter((x) => x.ok && !x.skipped).length;
    const failed = out.filter((x) => !x.ok).length;
    if (failed) toast.warning(`${moved} moved, ${failed} failed`);
    else toast.success(`${moved} customer(s) moved to ${target.partner_name}`);
    onDone && onDone();
  };

  const finished = results && !running;
  return (
    <ModalShell
      visible={visible}
      title="Update Partner & Branch"
      icon="shuffle"
      onClose={onClose}
      maxWidth={680}
      busy={running}
      footer={finished ? <Btn label="Close" kind="ghost" onPress={onClose} /> : (
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={running} />
          <Btn label={`Move ${toMove.length} customer(s)`} icon="shuffle" onPress={run} loading={running} disabled={!canRun} />
        </>
      )}
    >
      {error ? <Note tone="error" text={error} /> : null}
      {!info && !error ? <ActivityIndicator color="#1d4ed8" style={{ marginVertical: 24 }} /> : null}
      {info ? (
        <View style={{ gap: 12 }}>
          {!results ? (
            <>
              <Note
                tone="info"
                text={`${rows.length} internet account(s) selected from ${sourceIds.length} operator(s). Each is moved on RADIUS first, then here. The customer's IPTV and OTT move with it once no internet account of theirs is left with the old operator. Wallets and recharge history stay where they are.`}
              />
              {info.mixed_radius ? <Note tone="error" text="The selected customers are on different RADIUS servers. Select customers of one RADIUS server at a time." /> : null}
              <View>
                <Text style={s.label}>NEW OPERATOR (PARTNER) *</Text>
                {okTargets.length ? (
                  <SearchSelect
                    value={toId}
                    onChange={(v) => setToId(String(v))}
                    options={okTargets.map((t) => ({ value: String(t.partner_id), label: t.partner_name, sub: t.label, search: t.partner_name }))}
                    placeholder="Choose the operator"
                    searchPlaceholder="Search operators…"
                    accent="#1d4ed8"
                  />
                ) : <Note tone="warn" text="No enabled operator on the same RADIUS server can take these customers." />}
              </View>
              {needBranch ? (
                <View>
                  <Text style={s.label}>BRANCH *</Text>
                  <SearchSelect
                    value={toBranch}
                    onChange={(v) => setToBranch(String(v))}
                    options={branches.map((b) => ({ value: b.id, label: b.name, sub: `Branch id ${b.id}`, search: `${b.name} ${b.id}` }))}
                    placeholder={`Into which of ${target?.partner_name}'s branches?`}
                    accent="#1d4ed8"
                  />
                </View>
              ) : target && (target.branch_ids || []).length === 1 ? (
                <Text style={s.muted}>Branch: #{target.branch_ids[0]} (the operator's only branch)</Text>
              ) : null}
              {already.length ? <Note tone="warn" text={`${already.length} selected customer(s) are already under ${target?.partner_name} and will be left as they are.`} /> : null}
              <View style={s.table}>
                <View style={[s.tr, s.thRow]}>
                  <Text style={[s.th, { flex: 1.3 }]}>USERNAME</Text>
                  <Text style={[s.th, { flex: 1.6 }]}>NAME</Text>
                  <Text style={[s.th, { flex: 1.6 }]}>CURRENT OPERATOR</Text>
                </View>
                {rows.slice(0, 200).map((r) => (
                  <View key={r.internet_id} style={s.tr}>
                    <Text style={[s.tdB, { flex: 1.3 }]} numberOfLines={1}>{r.username}</Text>
                    <Text style={[s.td, { flex: 1.6 }]} numberOfLines={1}>{r.full_name || '—'}</Text>
                    <Text style={[s.td, { flex: 1.6 }]} numberOfLines={1}>{r.partner_name || `#${r.partner_id}`}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <ResultTable progress={progress} results={results} running={running} verb="Moving" />
          )}
        </View>
      ) : null}
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------------------------
// Renew (bulk internet recharge)
// ---------------------------------------------------------------------------------------------
export const BulkRechargeModal = ({ visible, rows = [], onClose, onDone }) => {
  const [phase, setPhase] = useState('check'); // check | confirm | run | done
  const [checked, setChecked] = useState(0);
  const [items, setItems] = useState([]);
  const [wallets, setWallets] = useState({});
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState(0);
  const stopRef = useRef(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setPhase('check'); setChecked(0); setItems([]); setWallets({}); setError(''); setResults([]); setCurrent(0);
    stopRef.current = false; setStopping(false);
    (async () => {
      const all = [];
      let w = {};
      // one by one, so the progress is visible; the server checks Aadhaar live on RADIUS
      for (let i = 0; i < rows.length; i += 1) {
        const res = await OneBssApi.previewBulkInternetRecharge([rows[i].internet_id]);
        if (!live) return;
        if (res.ok && Array.isArray(res.data?.items)) {
          all.push(...res.data.items.map((x) => ({ ...x, name: x.name || rows[i].full_name })));
          w = { ...w, ...(res.data.wallets || {}) };
        } else {
          all.push({ internet_id: rows[i].internet_id, username: rows[i].username, name: rows[i].full_name, ok: false, reason: res.data?.message || 'Could not check this account' });
        }
        setChecked(i + 1);
      }
      if (!live) return;
      setItems(all);
      setWallets(w);
      setPhase('confirm');
    })();
    return () => { live = false; };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const okItems = items.filter((x) => x.ok);
  const skipped = items.filter((x) => !x.ok);
  const total = okItems.reduce((a, x) => a + Number(x.price || 0), 0);
  const perOperator = useMemo(() => {
    const m = {};
    okItems.forEach((x) => {
      const k = String(x.partner_id);
      m[k] = m[k] || { partner_name: x.partner_name, total: 0, count: 0, balance: Number(wallets[k]?.balance || 0) };
      m[k].total += Number(x.price || 0);
      m[k].count += 1;
    });
    return Object.values(m);
  }, [items, wallets]); // eslint-disable-line react-hooks/exhaustive-deps
  const short = perOperator.filter((o) => o.total > o.balance);
  const walletTotal = perOperator.reduce((a, o) => a + o.balance, 0);

  const run = async () => {
    setPhase('run');
    const out = okItems.map((x) => ({ internet_id: x.internet_id, username: x.username, state: 'waiting', message: 'Waiting' }));
    setResults([...out]);
    for (let i = 0; i < okItems.length; i += 1) {
      if (stopRef.current) {
        for (let j = i; j < out.length; j += 1) out[j] = { ...out[j], state: 'stopped', message: 'Not renewed (stopped)' };
        break;
      }
      const x = okItems[i];
      setCurrent(i + 1);
      out[i] = { ...out[i], state: 'running', message: 'Recharging…' };
      setResults([...out]);
      let res;
      try {
        res = await OneBssApi.rechargeInternetAccount(x.internet_id, x.package_id, x.sub_plan_id, newClientRef());
      } catch (e) {
        res = { ok: false, status: 0, data: {} };
      }
      const d = res.data || {};
      if (res.ok && d.success !== false && !d.recheck && !d.pending) {
        out[i] = { ...out[i], state: 'success', message: d.new_expiry_date ? `Renewed successfully · new expiry ${fmtDate(d.new_expiry_date)}` : 'Renewed successfully' };
      } else if (d.recheck || d.pending) {
        out[i] = { ...out[i], state: 'check', message: d.message || 'Paid, but RADIUS did not confirm — open the customer and use Recheck.' };
      } else if (res.status === 0 || res.status >= 500) {
        out[i] = { ...out[i], state: 'check', message: 'No clear answer from the server — open the customer and check before trying again.' };
      } else {
        let reason = d.message || `HTTP ${res.status}`;
        if (res.status === 402 && d.amount_required !== undefined) reason += ` (needs ₹${d.amount_required}, wallet has ₹${d.wallet_balance ?? 0})`;
        out[i] = { ...out[i], state: 'failed', message: reason };
      }
      setResults([...out]);
    }
    setPhase('done');
    try { window.dispatchEvent(new Event('onebss:wallet-changed')); } catch (e) {}
    onDone && onDone();
  };

  const okCount = results.filter((r) => r.state === 'success').length;
  const failCount = results.filter((r) => r.state === 'failed').length;
  const checkCount = results.filter((r) => r.state === 'check').length;
  const busy = phase === 'run';

  let footer = null;
  if (phase === 'confirm') {
    footer = (
      <>
        <Btn label="Cancel" kind="ghost" onPress={onClose} />
        <Btn label={`Yes, recharge ${okItems.length} · ${rupees(total)}`} icon="check" onPress={run} disabled={!okItems.length} />
      </>
    );
  } else if (phase === 'run') {
    footer = (
      <TouchableOpacity onPress={() => { stopRef.current = true; setStopping(true); }} disabled={stopping} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: stopping ? '#94a3b8' : '#0f172a' }}>{stopping ? 'Stopping after this one…' : 'Stop after this one'}</Text>
      </TouchableOpacity>
    );
  } else if (phase === 'done') {
    footer = <Btn label="Close" kind="ghost" onPress={onClose} />;
  }

  const title = phase === 'check' ? 'Checking customers' : phase === 'confirm' ? 'Bulk Internet Recharge' : 'Bulk Recharge Progress';
  return (
    <ModalShell visible={visible} title={title} icon="refresh-cw" onClose={phase === 'check' ? onClose : onClose} maxWidth={760} busy={busy} footer={footer}>
      {error ? <Note tone="error" text={error} /> : null}

      {phase === 'check' ? (
        <View style={{ gap: 10 }}>
          <Text style={s.body}>Checking current plans… {checked} of {rows.length}</Text>
          <Bar value={checked} total={rows.length} />
          <Text style={s.muted}>Nothing is charged yet. Each customer's current plan and price is read first.</Text>
        </View>
      ) : null}

      {phase === 'confirm' ? (
        <View style={{ gap: 12 }}>
          <View style={s.ask}>
            <Text style={s.askTitle}>Are you sure you want to recharge {okItems.length} customer{okItems.length === 1 ? '' : 's'}?</Text>
            <Text style={s.askSub}>Each is renewed on the plan they have now — no plan change.</Text>
          </View>
          <View style={s.stats}>
            <Stat label="CUSTOMERS" value={String(okItems.length)} />
            <Stat label="TOTAL" value={rupees(total)} />
            <Stat
              label={perOperator.length > 1 ? 'WALLET BALANCE (ALL)' : String(Object.values(wallets)[0]?.wallet_label || 'Wallet').toUpperCase().replace('WALLET', 'WALLET BALANCE').replace(/^WALLET BALANCE$/, 'WALLET BALANCE')}
              value={rupees(walletTotal)}
            />
          </View>
          {perOperator.length > 1 ? (
            <View style={{ gap: 4 }}>
              {perOperator.map((o) => (
                <Text key={o.partner_name} style={[s.muted, o.total > o.balance && { color: '#b91c1c' }]}>
                  {o.partner_name}: {o.count} customer(s) · {rupees(o.total)} · wallet {rupees(o.balance)}
                </Text>
              ))}
            </View>
          ) : null}
          {short.length ? (
            <Note tone="error" text={`Not enough wallet balance${perOperator.length > 1 ? ` for ${short.map((o) => o.partner_name).join(', ')}` : ''}. The recharges that don't fit will fail and nothing is charged for them.`} />
          ) : null}
          <View style={s.table}>
            <View style={[s.tr, s.thRow]}>
              <Text style={[s.th, { flex: 1.4 }]}>USERNAME</Text>
              <Text style={[s.th, { flex: 1.7 }]}>CURRENT PLAN</Text>
              <Text style={[s.th, { flex: 1.3 }]}>TYPE</Text>
              <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>PRICE</Text>
            </View>
            {okItems.map((x) => (
              <View key={x.internet_id} style={s.tr}>
                <View style={{ flex: 1.4 }}>
                  <Text style={s.tdB} numberOfLines={1}>{x.username}</Text>
                  {x.name ? <Text style={s.sub} numberOfLines={1}>{x.name}</Text> : null}
                </View>
                <Text style={[s.td, { flex: 1.7 }]}>{x.plan_name}</Text>
                <View style={{ flex: 1.3, gap: 2 }}>
                  <Pill text={x.type === 'advance' ? 'Advance' : 'Recharge'} tone={x.type === 'advance' ? 'violet' : 'blue'} />
                  {x.type === 'advance' && x.expiration ? <Text style={s.sub}>after {fmtDate(x.expiration)}</Text> : null}
                </View>
                <Text style={[s.td, { flex: 0.7, textAlign: 'right' }]}>{rupees(x.price)}</Text>
              </View>
            ))}
            {skipped.map((x) => (
              <View key={x.internet_id} style={[s.tr, { backgroundColor: '#f8fafc' }]}>
                <View style={{ flex: 1.4 }}>
                  <Text style={s.tdB} numberOfLines={1}>{x.username}</Text>
                  {x.name ? <Text style={s.sub} numberOfLines={1}>{x.name}</Text> : null}
                </View>
                <View style={{ flex: 3.7, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Pill text="Skipped" tone="grey" />
                  <Text style={[s.td, { flex: 1 }]}>{x.reason}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {phase === 'run' || phase === 'done' ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.body}>{phase === 'run' ? `Processing ${current} of ${results.length}` : `Processed ${okCount + failCount + checkCount} of ${results.length}`}</Text>
            <Text style={s.body}>
              <Text style={{ color: '#16a34a', fontWeight: '800' }}>{okCount}</Text> success · <Text style={{ color: '#dc2626', fontWeight: '800' }}>{failCount}</Text> failed
              {checkCount ? <> · <Text style={{ color: '#b45309', fontWeight: '800' }}>{checkCount}</Text> to check</> : null}
            </Text>
          </View>
          <Bar value={phase === 'done' ? results.length : Math.max(0, current - 1)} total={results.length} />
          <View style={s.table}>
            <View style={[s.tr, s.thRow]}>
              <Text style={[s.th, { flex: 1.2 }]}>USERNAME</Text>
              <Text style={[s.th, { flex: 1 }]}>STATUS</Text>
              <Text style={[s.th, { flex: 2.4 }]}>MESSAGE</Text>
            </View>
            {results.map((r) => (
              <View key={r.internet_id} style={s.tr}>
                <Text style={[s.tdB, { flex: 1.2 }]} numberOfLines={1}>{r.username}</Text>
                <View style={{ flex: 1 }}><StatePill state={r.state} /></View>
                <Text style={[s.td, { flex: 2.4, color: r.state === 'success' ? '#15803d' : r.state === 'failed' ? '#b91c1c' : r.state === 'check' ? '#b45309' : '#64748b' }]}>{r.message}</Text>
              </View>
            ))}
          </View>
          {phase === 'done' && results.some((r) => r.state === 'check') ? (
            <Note tone="warn" text="'Check' rows may already be paid but were not confirmed. Open those customers and use Recheck (or look at Recharge history) — do not recharge them again." />
          ) : null}
        </View>
      ) : null}
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------------------------
const ResultTable = ({ progress, results, running, verb }) => (
  <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={s.body}>{running ? `${verb} ${progress?.done || 0} of ${progress?.total || 0}` : 'Finished'}</Text>
      <Text style={s.body}>
        <Text style={{ color: '#16a34a', fontWeight: '800' }}>{results.filter((r) => r.ok && !r.skipped).length}</Text> done ·{' '}
        <Text style={{ color: '#dc2626', fontWeight: '800' }}>{results.filter((r) => !r.ok).length}</Text> failed
      </Text>
    </View>
    <Bar value={progress?.done || 0} total={progress?.total || 1} />
    <View style={s.table}>
      <View style={[s.tr, s.thRow]}>
        <Text style={[s.th, { flex: 1.2 }]}>USERNAME</Text>
        <Text style={[s.th, { flex: 1 }]}>STATUS</Text>
        <Text style={[s.th, { flex: 2.4 }]}>MESSAGE</Text>
      </View>
      {results.map((r) => (
        <View key={r.internet_id} style={s.tr}>
          <Text style={[s.tdB, { flex: 1.2 }]} numberOfLines={1}>{r.username}</Text>
          <View style={{ flex: 1 }}><StatePill state={r.skipped ? 'skipped' : r.ok ? 'success' : 'failed'} /></View>
          <Text style={[s.td, { flex: 2.4, color: r.skipped ? '#64748b' : r.ok ? '#15803d' : '#b91c1c' }]}>{r.message}</Text>
        </View>
      ))}
    </View>
  </View>
);

const Bar = ({ value, total }) => (
  <View style={s.barBg}><View style={[s.barFg, { width: `${total ? Math.min(100, (value / total) * 100) : 0}%` }]} /></View>
);

const Stat = ({ label, value }) => (
  <View style={s.stat}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={s.statValue}>{value}</Text>
  </View>
);

const PILL = {
  blue: ['#dbeafe', '#1d4ed8'], violet: ['#ede9fe', '#6d28d9'], grey: ['#f1f5f9', '#334155'],
  green: ['#dcfce7', '#15803d'], red: ['#fee2e2', '#b91c1c'], amber: ['#fef3c7', '#b45309'],
};
const Pill = ({ text, tone = 'grey' }) => (
  <View style={[s.pill, { backgroundColor: PILL[tone][0] }]}><Text style={[s.pillText, { color: PILL[tone][1] }]}>{text}</Text></View>
);
const StatePill = ({ state }) => {
  const m = {
    waiting: ['Waiting', 'grey'], running: ['Running', 'blue'], success: ['Success', 'green'], failed: ['Failed', 'red'],
    check: ['Check', 'amber'], stopped: ['Stopped', 'grey'], skipped: ['Skipped', 'grey'],
  }[state] || [state, 'grey'];
  return <Pill text={m[0]} tone={m[1]} />;
};

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  opBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#dbe3ee', backgroundColor: '#fff' },
  opLabel: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  opSub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', letterSpacing: 0.4, marginBottom: 6 },
  muted: { fontSize: 12, color: '#64748b' },
  body: { fontSize: 13.5, color: '#334155' },
  ask: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 10, padding: 14 },
  askTitle: { fontSize: 14.5, fontWeight: '800', color: '#0f172a' },
  askSub: { fontSize: 12.5, color: '#475569', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  stat: { flex: 1, minWidth: 150, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 },
  statLabel: { fontSize: 10.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden' },
  thRow: { backgroundColor: '#f8fafc' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  th: { fontSize: 10.5, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  td: { fontSize: 12.5, color: '#334155' },
  tdB: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 11, color: '#64748b' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '800' },
  barBg: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFg: { height: 6, borderRadius: 3, backgroundColor: '#1e3a8a' },
});
