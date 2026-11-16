import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { can } from '../services/staffAccess';
import { Note } from '../components/internet/shared';

/**
 * Backups (super admin): Google Drive connection, KYC / DB backup upload queue, database backups.
 * Server side: gdrive/gdrive_admin.php · cron/gdrive_sync.php (every 5 min) · cron/db_backup.php (daily).
 * Google returns here after "Connect" as #backups?drive=connected|error&msg=…
 */
const ACCENT = '#0f766e';

// read Google's answer before the app rewrites the address bar
const DRIVE_RETURN = (() => {
  try {
    if (typeof window === 'undefined') return null;
    const m = window.location.hash.match(/[?&]drive=(connected|error)(?:&msg=([^&]*))?/);
    return m ? { status: m[1], msg: decodeURIComponent((m[2] || '').replace(/\+/g, ' ')) } : null;
  } catch (e) {
    return null;
  }
})();

const fmtSize = (n) => {
  const b = Number(n || 0);
  if (!b) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};
const fmtTime = (t) => {
  if (!t) return '—';
  const d = new Date(String(t).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Check = ({ ok, warn, label, detail }) => (
  <View style={s.checkRow}>
    <Feather name={ok ? 'check-circle' : warn ? 'alert-triangle' : 'x-circle'} size={15} color={ok ? '#059669' : warn ? '#d97706' : '#dc2626'} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.checkLabel}>{label}</Text>
      {detail ? <Text style={[s.sub, s.mono]} selectable numberOfLines={2}>{detail}</Text> : null}
    </View>
  </View>
);

const Stat = ({ label, value, tone }) => (
  <View style={s.stat}>
    <Text style={[s.statValue, tone && { color: tone }]}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

export const BackupsScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const mayEdit = can(user, 'system.backups', 'edit');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const res = await OneBssApi.backupsStatus();
    setLoading(false);
    if (!res.ok || res.data?.success === false) {
      setError(res.data?.message || `Could not load (HTTP ${res.status}).`);
      return;
    }
    setError('');
    setData(res.data);
  }, []);

  useEffect(() => {
    if (DRIVE_RETURN) {
      if (DRIVE_RETURN.status === 'connected') toast.success(`Google Drive connected${DRIVE_RETURN.msg ? ` (${DRIVE_RETURN.msg})` : ''}`);
      else toast.error(DRIVE_RETURN.msg || 'Google Drive was not connected');
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  // while something is on its way, look again every 20 s
  const waiting = !!data && ((data.backups || []).some((b) => b.status === 'requested' || b.status === 'running')
    || Object.values(data.queue || {}).some((q) => (q.pending || 0) > 0));
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const act = async (action, confirmText) => {
    if (confirmText && Platform.OS === 'web' && typeof window !== 'undefined' && !window.confirm(confirmText)) return;
    setBusy(action);
    const res = await OneBssApi.backupsAction(action);
    setBusy('');
    if (!res.ok || res.data?.success === false) return toast.error(res.data?.message || 'Failed');
    if (action === 'connect' && res.data.auth_url) {
      window.location.href = res.data.auth_url; // Google sign-in; it comes back to #backups
      return;
    }
    toast.success(res.data.message || 'Done');
    load(true);
  };

  if (loading && !data) return <ActivityIndicator color={ACCENT} style={{ marginTop: 60 }} />;

  const c = data?.connection;
  const st = data?.setup || {};
  const q = data?.queue || {};
  const kyc = q.kyc || {};
  const dbq = q.db_backup || {};
  const lastBackup = (data?.backups || []).find((b) => b.status === 'done');

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {error ? <Note tone="error" text={error} /> : null}

        {/* Google Drive */}
        <View style={s.card}>
          <View style={[s.cardHead, isMobile && { flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[s.bigIcon, { backgroundColor: c ? '#d1fae5' : '#f1f5f9' }]}>
                <Feather name="cloud" size={20} color={c ? '#047857' : '#64748b'} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.title}>Google Drive</Text>
                <Text style={s.sub} numberOfLines={2}>
                  {c ? `Connected to ${c.email || 'Google'} · since ${fmtTime(c.connected_at)}${c.connected_by ? ` by ${c.connected_by}` : ''}` : 'Not connected — KYC documents and DB backups wait on the server until you connect.'}
                </Text>
              </View>
            </View>
            {mayEdit ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.primaryBtn, !st.oauth_configured && { opacity: 0.5 }]} disabled={!st.oauth_configured || !!busy} onPress={() => act('connect')}>
                  {busy === 'connect' ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={c ? 'refresh-cw' : 'link'} size={14} color="#fff" />}
                  <Text style={s.primaryBtnText}>{c ? 'Reconnect' : 'Connect Google Drive'}</Text>
                </TouchableOpacity>
                {c ? (
                  <TouchableOpacity style={s.ghostBtn} disabled={!!busy} onPress={() => act('disconnect', 'Disconnect Google Drive? New files will wait on the server until you connect again.')}>
                    <Text style={s.ghostBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
          {c?.last_error ? <View style={{ padding: 14, paddingTop: 0 }}><Note tone="error" text={c.last_error} /></View> : null}
          {!st.oauth_configured ? (
            <View style={{ padding: 14, paddingTop: 0 }}>
              <Note tone="warning" text="Add GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET to onebss-secrets.php, then press Connect. The OAuth client's redirect URI must be the one below." />
            </View>
          ) : null}
          <View style={s.stats}>
            <Stat label="KYC files on Drive" value={kyc.done || 0} tone="#047857" />
            <Stat label="Waiting" value={(kyc.pending || 0) + (dbq.pending || 0)} tone={(kyc.pending || 0) + (dbq.pending || 0) ? '#b45309' : undefined} />
            <Stat label="Failed" value={(kyc.failed || 0) + (dbq.failed || 0)} tone={(kyc.failed || 0) + (dbq.failed || 0) ? '#dc2626' : undefined} />
            <Stat label="Last upload" value={fmtTime(data?.last_sync)} />
          </View>
        </View>

        {/* problems */}
        {(data?.problems || []).length ? (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.title}>Uploads that need attention</Text>
              {mayEdit ? (
                <TouchableOpacity style={s.ghostBtn} disabled={!!busy} onPress={() => act('retry_failed')}>
                  {busy === 'retry_failed' ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="rotate-cw" size={13} color={ACCENT} />}
                  <Text style={s.ghostBtnText}>Retry all now</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {data.problems.map((p) => (
              <View key={p.id} style={s.row}>
                <Feather name={p.status === 'pending' ? 'clock' : p.status === 'missing' ? 'file-minus' : 'x-circle'} size={14} color={p.status === 'pending' ? '#d97706' : '#dc2626'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.td} numberOfLines={1}>{p.kind === 'db_backup' ? 'DB backup · ' : 'KYC · '}{p.drive_name}</Text>
                  <Text style={s.sub} numberOfLines={2}>
                    {p.status === 'pending' ? `Try ${p.attempts + 1} at ${fmtTime(p.next_try_at)}` : p.status === 'missing' ? 'File no longer on the server' : `Failed after ${p.attempts} tries`}{p.last_error ? ` · ${p.last_error}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* DB backups */}
        <View style={s.card}>
          <View style={[s.cardHead, isMobile && { flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Database backups</Text>
              <Text style={s.sub}>
                Daily by cron · kept {st.keep_local_days} days on the server and {st.keep_drive_days} days on Drive
                {lastBackup ? ` · last ${fmtTime(lastBackup.finished_at)}` : ''}
              </Text>
            </View>
            {mayEdit ? (
              <TouchableOpacity style={s.primaryBtn} disabled={!!busy} onPress={() => act('backup_now')}>
                {busy === 'backup_now' ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="database" size={14} color="#fff" />}
                <Text style={s.primaryBtnText}>Back up now</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {(data?.backups || []).map((b) => {
            const drive = b.drive_deleted_at ? 'removed from Drive (old)' : b.drive_status === 'done' ? 'on Drive' : b.drive_status === 'failed' ? 'Drive upload failed' : b.drive_status === 'pending' ? 'waiting for Drive' : '';
            const tone = b.status === 'done' ? '#059669' : b.status === 'failed' ? '#dc2626' : '#d97706';
            return (
              <View key={b.id} style={s.row}>
                <Feather name={b.status === 'done' ? 'check-circle' : b.status === 'failed' ? 'x-circle' : 'loader'} size={14} color={tone} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.td} numberOfLines={1}>{b.file_name || (b.status === 'requested' ? 'Requested — runs within 5 minutes' : b.status === 'running' ? 'Running…' : 'Backup')}</Text>
                  <Text style={s.sub} numberOfLines={2}>
                    {fmtTime(b.finished_at || b.created_at)} · {b.requested_by === 'cron' ? 'daily' : `by ${b.requested_by || '—'}`}
                    {b.size ? ` · ${fmtSize(b.size)}` : ''}{drive ? ` · ${drive}` : ''}{b.local_deleted_at ? ' · removed from server (old)' : ''}
                    {b.error ? ` · ${b.error}` : ''}{b.drive_error && b.drive_status !== 'done' ? ` · ${b.drive_error}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
          {!(data?.backups || []).length ? <Text style={[s.sub, { padding: 16 }]}>No backups yet — the first runs tonight, or press Back up now.</Text> : null}
        </View>

        {/* setup */}
        <View style={s.card}>
          <View style={s.cardHead}><Text style={s.title}>Server setup</Text></View>
          <View style={{ padding: 14, paddingTop: 4, gap: 2 }}>
            <Check ok={st.oauth_configured} label="Google OAuth client (GDRIVE_CLIENT_ID / SECRET)" detail={st.oauth_configured ? null : 'Not set in onebss-secrets.php'} />
            <Check ok label="Authorised redirect URI for the OAuth client" detail={st.redirect_uri} />
            <Check ok={st.kyc_storage_ok && !st.kyc_inside_website} warn={st.kyc_storage_ok && st.kyc_inside_website} label={st.kyc_inside_website ? 'KYC storage is inside the website folder — move it outside (KYC_STORAGE_ROOT)' : 'KYC documents (private, outside the website)'} detail={st.kyc_storage} />
            <Check ok label="KYC document links" detail={st.kyc_file_url} />
            <Check ok={st.backup_dir_ok} label="Database backup folder" detail={st.backup_dir} />
            <Check ok={st.shell_ok} label={st.shell_ok ? 'Can run mysqldump' : 'PHP cannot run mysqldump (proc_open disabled)'} />
            <Check ok={st.encrypted} warn={!st.encrypted} label={st.encrypted ? 'Drive copies are encrypted' : 'Drive copies are NOT encrypted — set BACKUP_ENCRYPTION_PASSWORD (recommended for Aadhaar data)'} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, flexWrap: 'wrap' },
  bigIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  mono: { fontFamily: 'monospace' },
  td: { fontSize: 13, color: COLORS.textMain, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  stat: { flexGrow: 1, flexBasis: 140, padding: 14, borderRightWidth: 1, borderRightColor: '#f1f5f9' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.textMain },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 },
  checkLabel: { fontSize: 13, color: COLORS.textMain },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, backgroundColor: ACCENT },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 38, borderRadius: 8, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#ffffff' },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
});
