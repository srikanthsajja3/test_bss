import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../services/oneBssApi';
import { can } from '../services/staffAccess';
import { ModalShell, Btn, Note, Dropdown, sharedStyles } from '../components/internet/shared';

/**
 * Staff & Roles — every partner level (super admin, super distributor, distributor, sub distributor,
 * operator) manages its OWN office staff and their roles (staff.php, staff_roles.php).
 * A staff member logs in with their own username and works as this partner, limited by the role's
 * permission matrix (checked on the server for every request).
 */

const COLS = [
  { id: 'add', label: 'Add / Allow' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'delete', label: 'Delete' },
];
// 'allow' switches are drawn in the Add / Allow column, like the RADIUS permission page
const colOf = (action) => (action === 'allow' ? 'add' : action);
const actionIn = (item, col) => item.actions.find((a) => colOf(a) === col) || null;

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const permCount = (perms) => Object.values(perms || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);

// =====================================================================
// Role editor — the permission matrix
// =====================================================================
const Check = ({ on, partial, disabled, onPress, color = '#2563eb' }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[s.check, disabled && { opacity: 0.35 }]}>
    <Feather name={on ? 'check-square' : partial ? 'minus-square' : 'square'} size={18} color={on || partial ? color : '#94a3b8'} />
  </TouchableOpacity>
);

const RoleEditorModal = ({ visible, role, catalog, myPermissions, onClose, onSaved }) => {
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [perms, setPerms] = useState({});
  const [open, setOpen] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(role?.role_name || '');
    setDesc(role?.description || '');
    setPerms(JSON.parse(JSON.stringify(role?.permissions || {})));
    const o = {};
    (catalog || []).forEach((m) => { o[m.id] = true; });
    setOpen(o);
  }, [visible, role, catalog]);

  // a staff editor can only hand out what they have themselves
  const mayGive = (key, action) => !myPermissions || (Array.isArray(myPermissions[key]) && myPermissions[key].includes(action));
  const has = (key, action) => Array.isArray(perms[key]) && perms[key].includes(action);
  const setOne = (p, key, action, on) => {
    const cur = new Set(p[key] || []);
    if (on) cur.add(action); else cur.delete(action);
    const next = { ...p };
    if (cur.size) next[key] = [...cur]; else delete next[key];
    return next;
  };
  const toggle = (key, action) => setPerms((p) => setOne(p, key, action, !has(key, action)));

  // bulk: every (item, action) of a list of items in one column (or all columns)
  const pairsOf = (items, col) => {
    const out = [];
    items.forEach((i) => i.actions.forEach((a) => { if ((!col || colOf(a) === col) && mayGive(i.key, a)) out.push([i.key, a]); }));
    return out;
  };
  const stateOf = (pairs) => {
    if (!pairs.length) return { on: false, partial: false, none: true };
    const n = pairs.filter(([k, a]) => has(k, a)).length;
    return { on: n === pairs.length, partial: n > 0 && n < pairs.length, none: false };
  };
  const setPairs = (pairs, on) => setPerms((p) => pairs.reduce((acc, [k, a]) => setOne(acc, k, a, on), p));
  const bulk = (pairs) => setPairs(pairs, !stateOf(pairs).on);

  const allItems = useMemo(() => (catalog || []).flatMap((m) => m.items), [catalog]);
  const total = permCount(perms);
  const allOpen = (catalog || []).every((m) => open[m.id]);

  const save = async () => {
    if (name.trim().length < 2) { toast.error('Give the role a name'); return; }
    setSaving(true);
    const res = await OneBssApi.saveStaffRole({ ...(role?.role_id ? { role_id: role.role_id } : {}), role_name: name.trim(), description: desc.trim(), permissions: perms });
    setSaving(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not save the role'); return; }
    toast.success(res.data.message || 'Role saved');
    onSaved();
  };

  const headerCell = (col) => {
    const st = stateOf(pairsOf(allItems, col.id));
    return (
      <View key={col.id} style={s.colCell}>
        <Check on={st.on} partial={st.partial} disabled={st.none} onPress={() => bulk(pairsOf(allItems, col.id))} />
        <Text style={s.colLabel}>{col.label}</Text>
      </View>
    );
  };

  return (
    <ModalShell
      visible={visible}
      title={role?.role_id ? `Permission Rules · ${role.role_name}` : 'New Role'}
      icon="shield"
      iconColor="#2563eb"
      onClose={onClose}
      maxWidth={900}
      busy={saving}
      footer={(
        <>
          <Text style={{ flex: 1, fontSize: 12, color: '#64748b' }}>{total} permission{total === 1 ? '' : 's'} ticked</Text>
          <Btn label="Reset" kind="ghost" onPress={() => setPerms(JSON.parse(JSON.stringify(role?.permissions || {})))} disabled={saving} />
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Save Permissions" icon="check" onPress={save} loading={saving} />
        </>
      )}
    >
      <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 12, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={sharedStyles.label}>ROLE NAME</Text>
          <TextInput style={sharedStyles.input} value={name} onChangeText={setName} placeholder="e.g. Counter, Field Engineer, Accounts" maxLength={100} />
        </View>
        <View style={{ flex: 2 }}>
          <Text style={sharedStyles.label}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput style={sharedStyles.input} value={desc} onChangeText={setDesc} placeholder="What this role is for" maxLength={255} />
        </View>
      </View>
      {myPermissions ? <Note tone="info" text="You can only give permissions you have yourself; the others are greyed out." /> : null}

      <View style={s.matrix}>
        {/* header: expand all + bulk per column */}
        <View style={[s.row, s.headRow]}>
          <View style={[s.modCell, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Check on={allOpen} color="#475569" onPress={() => { const o = {}; (catalog || []).forEach((m) => { o[m.id] = !allOpen; }); setOpen(o); }} />
            <Text style={s.headText}>MODULE</Text>
          </View>
          <View style={s.colCell}>
            {(() => { const st = stateOf(pairsOf(allItems)); return <Check on={st.on} partial={st.partial} onPress={() => bulk(pairsOf(allItems))} />; })()}
            <Text style={s.colLabel}>All</Text>
          </View>
          {COLS.map(headerCell)}
        </View>

        {(catalog || []).map((m) => {
          const mAll = stateOf(pairsOf(m.items));
          return (
            <View key={m.id}>
              <View style={[s.row, s.modRow]}>
                <TouchableOpacity style={[s.modCell, { flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}>
                  <Feather name={open[m.id] ? 'chevron-down' : 'chevron-right'} size={15} color="#334155" />
                  <Text style={s.modText}>{m.label}</Text>
                </TouchableOpacity>
                <View style={s.colCell}><Check on={mAll.on} partial={mAll.partial} disabled={mAll.none} onPress={() => bulk(pairsOf(m.items))} /></View>
                {COLS.map((c) => {
                  const st = stateOf(pairsOf(m.items, c.id));
                  return <View key={c.id} style={s.colCell}>{st.none ? null : <Check on={st.on} partial={st.partial} onPress={() => bulk(pairsOf(m.items, c.id))} />}</View>;
                })}
              </View>
              {open[m.id] ? m.items.map((i) => {
                const iAll = stateOf(pairsOf([i]));
                return (
                  <View key={i.key} style={s.row}>
                    <View style={[s.modCell, { paddingLeft: 30 }]}><Text style={s.itemText}>{i.label}</Text></View>
                    <View style={s.colCell}>{i.actions.length > 1 ? <Check on={iAll.on} partial={iAll.partial} disabled={iAll.none} onPress={() => bulk(pairsOf([i]))} /> : null}</View>
                    {COLS.map((c) => {
                      const a = actionIn(i, c.id);
                      return (
                        <View key={c.id} style={s.colCell}>
                          {a ? <Check on={has(i.key, a)} disabled={!mayGive(i.key, a)} onPress={() => toggle(i.key, a)} /> : null}
                        </View>
                      );
                    })}
                  </View>
                );
              }) : null}
            </View>
          );
        })}
      </View>
    </ModalShell>
  );
};

// =====================================================================
// Staff member add / edit
// =====================================================================
const StaffModal = ({ visible, staff, roles, onClose, onSaved }) => {
  const [f, setF] = useState({});
  const [userMsg, setUserMsg] = useState(null); // { ok, text }
  const [saving, setSaving] = useState(false);
  const isEdit = !!staff?.id;

  useEffect(() => {
    if (!visible) return;
    setF({
      staff_name: staff?.staff_name || '',
      staff_phno: staff?.staff_phno || '',
      role_id: staff?.role_id || (roles[0]?.role_id ?? ''),
      username: staff?.username || '',
      password: '',
      status: staff?.status || 'active',
    });
    setUserMsg(null);
  }, [visible, staff, roles]);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const checkUser = async () => {
    const u = String(f.username || '').trim();
    if (!u || (isEdit && u === staff.username)) { setUserMsg(null); return; }
    const res = await OneBssApi.checkStaffUsername(u, staff?.id);
    if (res.ok) setUserMsg({ ok: !!res.data.available, text: res.data.message });
  };

  const save = async () => {
    if (String(f.staff_name).trim().length < 2) { toast.error('Enter the staff member\'s name'); return; }
    if (!/^[6-9]\d{9}$/.test(String(f.staff_phno).replace(/\D/g, '').slice(-10))) { toast.error('Enter a valid 10-digit mobile number'); return; }
    if (!f.role_id) { toast.error('Choose a role (make one under Roles first)'); return; }
    if (!/^[A-Za-z0-9._@-]{4,50}$/.test(String(f.username).trim())) { toast.error('Username: 4–50 letters, digits, . _ @ -'); return; }
    if (userMsg && !userMsg.ok) { toast.error(userMsg.text); return; }
    if (!isEdit && String(f.password).length < 6) { toast.error('Password: at least 6 characters'); return; }
    if (isEdit && f.password && String(f.password).length < 6) { toast.error('New password: at least 6 characters'); return; }
    setSaving(true);
    const body = { ...f, username: String(f.username).trim(), staff_name: String(f.staff_name).trim(), staff_phno: String(f.staff_phno).replace(/\D/g, '').slice(-10), ...(isEdit ? { id: staff.id } : {}) };
    if (isEdit && !body.password) delete body.password;
    const res = await OneBssApi.saveStaff(body);
    setSaving(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not save'); return; }
    toast.success(res.data.message || 'Saved');
    onSaved();
  };

  return (
    <ModalShell
      visible={visible}
      title={isEdit ? `Edit Staff · ${staff.staff_name}` : 'Add Staff'}
      icon="user-plus"
      onClose={onClose}
      maxWidth={520}
      busy={saving}
      footer={(
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label={isEdit ? 'Save' : 'Add Staff'} icon="check" onPress={save} loading={saving} />
        </>
      )}
    >
      {!roles.length ? <Note tone="warn" text="You have no roles yet. Open the Roles tab and make one first." /> : null}
      <View style={{ gap: 12 }}>
        <View>
          <Text style={sharedStyles.label}>NAME</Text>
          <TextInput style={sharedStyles.input} value={f.staff_name} onChangeText={set('staff_name')} placeholder="Full name" maxLength={100} />
        </View>
        <View>
          <Text style={sharedStyles.label}>MOBILE</Text>
          <TextInput style={sharedStyles.input} value={f.staff_phno} onChangeText={(v) => set('staff_phno')(v.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" keyboardType="phone-pad" />
        </View>
        <View>
          <Text style={sharedStyles.label}>ROLE</Text>
          <Dropdown value={f.role_id} options={roles.map((r) => ({ value: r.role_id, label: r.role_name }))} onChange={set('role_id')} placeholder="Choose a role" />
        </View>
        <View>
          <Text style={sharedStyles.label}>LOGIN USERNAME</Text>
          <TextInput style={sharedStyles.input} value={f.username} onChangeText={(v) => { set('username')(v.replace(/\s/g, '')); setUserMsg(null); }} onBlur={checkUser} placeholder="e.g. ravi.counter" autoCapitalize="none" />
          {userMsg ? <Text style={{ fontSize: 11.5, marginTop: 4, fontWeight: '600', color: userMsg.ok ? '#059669' : '#dc2626' }}>{userMsg.ok ? '✓ ' : '✗ '}{userMsg.text}</Text> : null}
        </View>
        <View>
          <Text style={sharedStyles.label}>{isEdit ? 'NEW PASSWORD (LEAVE EMPTY TO KEEP)' : 'PASSWORD'}</Text>
          <TextInput style={sharedStyles.input} value={f.password} onChangeText={set('password')} placeholder={isEdit ? '••••••' : 'At least 6 characters'} secureTextEntry autoCapitalize="none" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['active', 'disabled'].map((st) => (
            <TouchableOpacity key={st} onPress={() => set('status')(st)} style={[s.pill, f.status === st && (st === 'active' ? s.pillOn : s.pillOff)]}>
              <Feather name={st === 'active' ? 'check-circle' : 'slash'} size={13} color={f.status === st ? (st === 'active' ? '#047857' : '#b91c1c') : '#94a3b8'} />
              <Text style={[s.pillText, f.status === st && { color: st === 'active' ? '#047857' : '#b91c1c' }]}>{st === 'active' ? 'Login active' : 'Login disabled'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ModalShell>
  );
};

// =====================================================================
// Screen
// =====================================================================
export const StaffScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [tab, setTab] = useState('staff');
  const [staff, setStaff] = useState([]);
  const [roleOpts, setRoleOpts] = useState([]);
  const [roleData, setRoleData] = useState(null); // { catalog, roles, my_permissions }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editStaff, setEditStaff] = useState(null); // {} = new
  const [editRole, setEditRole] = useState(null); // {} = new
  const [confirm, setConfirm] = useState(null); // { kind, item }
  const [busy, setBusy] = useState(false);

  const mayAdd = can(user, 'staff.manage', 'add');
  const mayEdit = can(user, 'staff.manage', 'edit');
  const mayDelete = can(user, 'staff.manage', 'delete');

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([OneBssApi.getStaff(), OneBssApi.getStaffRoles()]);
    setLoading(false);
    if (!a.ok || !b.ok) { setError((!a.ok ? a : b).data?.message || 'Could not load staff'); return; }
    setError('');
    setStaff(a.data.staff || []);
    setRoleOpts(a.data.roles || []);
    setRoleData(b.data);
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = confirm.kind === 'role' ? await OneBssApi.deleteStaffRole(confirm.item.role_id) : await OneBssApi.deleteStaff(confirm.item.id);
    setBusy(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not delete'); return; }
    toast[res.data.disabled_instead ? 'info' : 'success'](res.data.message || 'Deleted');
    setConfirm(null);
    load();
  };

  const moduleLabels = useMemo(() => {
    const m = {};
    (roleData?.catalog || []).forEach((mod) => mod.items.forEach((i) => { m[i.key] = mod.label; }));
    return m;
  }, [roleData]);
  const modulesOf = (perms) => [...new Set(Object.keys(perms || {}).map((k) => moduleLabels[k]).filter(Boolean))];

  const tabBtn = (id, label, icon, count) => (
    <TouchableOpacity key={id} onPress={() => setTab(id)} style={[s.tab, tab === id && s.tabOn]}>
      <Feather name={icon} size={14} color={tab === id ? '#047857' : '#64748b'} />
      <Text style={[s.tabText, tab === id && { color: '#047857' }]}>{label}</Text>
      <View style={[s.count, tab === id && { backgroundColor: '#d1fae5' }]}><Text style={[s.countText, tab === id && { color: '#047857' }]}>{count}</Text></View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {tabBtn('staff', 'Staff', 'users', staff.length)}
          {tabBtn('roles', 'Roles', 'shield', roleData?.roles?.length || 0)}
        </View>
        {mayAdd ? (
          <Btn
            label={tab === 'staff' ? 'Add Staff' : 'New Role'}
            icon="plus"
            onPress={() => (tab === 'staff' ? setEditStaff({}) : setEditRole({}))}
            disabled={loading || !!error}
          />
        ) : null}
      </View>
      <Note tone="info" text={tab === 'staff'
        ? `Staff log in with their own username and work as ${user?.partner_name || 'your account'}, limited by their role.`
        : 'A role is a set of permissions. Staff with the role see and do only what is ticked.'} />
      {error ? <Note tone="error" text={error} /> : null}
      {loading ? <ActivityIndicator color="#10b981" style={{ marginVertical: 30 }} /> : null}

      {!loading && !error && tab === 'staff' ? (
        staff.length ? (
          <View style={s.card}>
            {!isMobile ? (
              <View style={[s.tr, s.th]}>
                <Text style={[s.thText, { flex: 2 }]}>NAME</Text>
                <Text style={[s.thText, { flex: 1.3 }]}>USERNAME</Text>
                <Text style={[s.thText, { flex: 1.3 }]}>ROLE</Text>
                <Text style={[s.thText, { flex: 0.9 }]}>STATUS</Text>
                <Text style={[s.thText, { flex: 1.4 }]}>LAST LOGIN</Text>
                <Text style={[s.thText, { width: 80, textAlign: 'right' }]}> </Text>
              </View>
            ) : null}
            {staff.map((m) => (
              <View key={m.id} style={[s.tr, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                <View style={{ flex: isMobile ? undefined : 2 }}>
                  <Text style={s.name}>{m.staff_name}{m.is_me ? <Text style={s.me}>  (you)</Text> : null}</Text>
                  <Text style={s.sub}>{m.staff_phno}</Text>
                </View>
                <Text style={[s.cell, { flex: isMobile ? undefined : 1.3 }]}>{m.username || <Text style={{ color: '#94a3b8' }}>no login</Text>}</Text>
                <View style={{ flex: isMobile ? undefined : 1.3 }}>
                  <View style={s.roleTag}><Feather name="shield" size={11} color="#2563eb" /><Text style={s.roleTagText}>{m.role_name || '—'}</Text></View>
                </View>
                <View style={{ flex: isMobile ? undefined : 0.9 }}>
                  <View style={[s.status, m.status === 'active' ? s.statusOn : s.statusOff]}>
                    <Text style={[s.statusText, { color: m.status === 'active' ? '#047857' : '#b91c1c' }]}>{m.status === 'active' ? 'Active' : 'Disabled'}</Text>
                  </View>
                </View>
                <Text style={[s.cell, { flex: isMobile ? undefined : 1.4, color: '#64748b' }]}>{fmtDate(m.last_login)}</Text>
                <View style={{ width: isMobile ? undefined : 80, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                  {mayEdit && !m.is_me ? <TouchableOpacity style={s.iconBtn} onPress={() => setEditStaff(m)}><Feather name="edit-2" size={14} color="#2563eb" /></TouchableOpacity> : null}
                  {mayDelete && !m.is_me ? <TouchableOpacity style={s.iconBtn} onPress={() => setConfirm({ kind: 'staff', item: m })}><Feather name="trash-2" size={14} color="#dc2626" /></TouchableOpacity> : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Feather name="users" size={28} color="#94a3b8" />
            <Text style={s.emptyTitle}>No staff yet</Text>
            <Text style={s.emptySub}>{roleData?.roles?.length ? 'Add a staff member and give them a role.' : 'Make a role first (Roles tab), then add staff.'}</Text>
          </View>
        )
      ) : null}

      {!loading && !error && tab === 'roles' ? (
        roleData?.roles?.length ? (
          <View style={s.roleGrid}>
            {roleData.roles.map((r) => {
              const mods = modulesOf(r.permissions);
              return (
                <View key={r.role_id} style={[s.roleCard, isMobile && { width: '100%' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={s.roleIcon}><Feather name="shield" size={16} color="#2563eb" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{r.role_name}{r.is_mine ? <Text style={s.me}>  (your role)</Text> : null}</Text>
                      <Text style={s.sub} numberOfLines={1}>{r.description || `${permCount(r.permissions)} permissions`}</Text>
                    </View>
                  </View>
                  <View style={s.chips}>
                    {mods.length ? mods.map((md) => <View key={md} style={s.chip}><Text style={s.chipText}>{md}</Text></View>) : <Text style={s.sub}>No permissions ticked</Text>}
                  </View>
                  <View style={s.roleFoot}>
                    <Text style={s.sub}>{r.staff_count} staff · {permCount(r.permissions)} permissions</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {mayEdit && !r.is_mine ? <Btn label="Permissions" icon="sliders" kind="ghost" onPress={() => setEditRole(r)} /> : null}
                      {mayDelete && !r.is_mine ? <TouchableOpacity style={s.iconBtn} onPress={() => setConfirm({ kind: 'role', item: r })}><Feather name="trash-2" size={14} color="#dc2626" /></TouchableOpacity> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.empty}>
            <Feather name="shield" size={28} color="#94a3b8" />
            <Text style={s.emptyTitle}>No roles yet</Text>
            <Text style={s.emptySub}>Make a role like "Counter" or "Field Engineer" and tick what it may do.</Text>
          </View>
        )
      ) : null}

      <StaffModal visible={!!editStaff} staff={editStaff} roles={roleOpts} onClose={() => setEditStaff(null)} onSaved={() => { setEditStaff(null); load(); }} />
      <RoleEditorModal
        visible={!!editRole}
        role={editRole}
        catalog={roleData?.catalog || []}
        myPermissions={roleData?.my_permissions || null}
        onClose={() => setEditRole(null)}
        onSaved={() => { setEditRole(null); load(); }}
      />
      <ModalShell
        visible={!!confirm}
        title={confirm?.kind === 'role' ? 'Delete role' : 'Remove staff member'}
        icon="trash-2"
        iconColor="#dc2626"
        onClose={() => setConfirm(null)}
        busy={busy}
        footer={(
          <>
            <Btn label="Cancel" kind="ghost" onPress={() => setConfirm(null)} disabled={busy} />
            <Btn label={confirm?.kind === 'role' ? 'Delete role' : 'Remove'} kind="danger" icon="trash-2" onPress={doDelete} loading={busy} />
          </>
        )}
      >
        <Text style={{ fontSize: 13, color: '#0f172a', lineHeight: 20 }}>
          {confirm?.kind === 'role'
            ? `Delete the role "${confirm?.item?.role_name}"? This only works when no staff member has it.`
            : `Remove ${confirm?.item?.staff_name}? Their login stops working at once. If they are linked to inventory records, the login is disabled instead.`}
        </Text>
      </ModalShell>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabOn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  count: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, backgroundColor: '#f1f5f9' },
  countText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  th: { backgroundColor: '#f8fafc', paddingVertical: 10 },
  thText: { fontSize: 10.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.4 },
  name: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  me: { fontSize: 11.5, fontWeight: '600', color: '#059669' },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  cell: { fontSize: 12.5, color: '#0f172a' },
  roleTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#eff6ff' },
  roleTagText: { fontSize: 11.5, fontWeight: '700', color: '#1d4ed8' },
  status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusOn: { backgroundColor: '#d1fae5' },
  statusOff: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '800' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  emptySub: { fontSize: 12.5, color: '#64748b', textAlign: 'center', paddingHorizontal: 20 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  roleCard: { width: 340, flexGrow: 1, maxWidth: 520, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 12 },
  roleIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f1f5f9' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  roleFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  pillOn: { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' },
  pillOff: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 12.5, fontWeight: '700', color: '#94a3b8' },
  // matrix
  matrix: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden', marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 8 },
  headRow: { backgroundColor: '#f8fafc', minHeight: 50 },
  modRow: { backgroundColor: '#f8fafc' },
  modCell: { flex: 1, minWidth: 140, paddingVertical: 7 },
  headText: { fontSize: 11, fontWeight: '800', color: '#334155', letterSpacing: 0.4 },
  modText: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  itemText: { fontSize: 12.5, color: '#334155' },
  colCell: { width: 62, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  colLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 2, textAlign: 'center' },
  check: { padding: 2 },
});
