import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, SearchSelect } from '../internet/shared';

/**
 * Super admin: change where a partner sits in the hierarchy (partner_move.php).
 * A partner may sit under any partner of a higher level (levels can be skipped):
 *   super admin > Super Distributor > Distributor > Sub Distributor > Operator.
 *   mode 'role' — distributors only: pick the new level, then the partner it goes under (the
 *                 current parent is kept when it is still above the new level).
 *   mode 'move' — distributors and operators: pick the new parent directly.
 * Every choice is checked with a dry run first, so the impact (levels below, margins) is shown
 * before anything is saved.
 */
const LEVELS = [
  { level: 1, label: 'Super Distributor', hint: 'under the super admin' },
  { level: 2, label: 'Distributor', hint: 'under the super admin or a Super Distributor' },
  { level: 3, label: 'Sub Distributor', hint: 'under the super admin, a Super Distributor or a Distributor' },
];
const LEVEL_NAME = { 1: 'Super Distributor', 2: 'Distributor', 3: 'Sub Distributor' };
// reasons that rule a parent out whatever the new level is
const HARD_REASONS = ['itself', 'below this partner', 'disabled'];

// Why this level is not possible, in words.
const whyNot = (level, minChild, parents) => {
  if (minChild && level >= minChild) {
    return `It has a ${LEVEL_NAME[minChild]} directly under it, so it must stay above that level. Move or change that partner first.`;
  }
  const disabled = parents.filter((o) => o.reason === 'disabled').map((o) => o.parent_name);
  if (disabled.length) return `Every possible parent is disabled (${disabled.join(', ')}). Enable one first.`;
  return 'There is no partner above this level it can go under.';
};

export const PartnerMoveModal = ({ visible, partner, mode = 'move', onClose, onDone }) => {
  const pid = partner?.partner_id;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(null);
  const [parentId, setParentId] = useState('');
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !pid) return;
    setInfo(null); setError(''); setLevel(null); setParentId(''); setImpact(null); setCheckError('');
    setLoading(true);
    OneBssApi.getPartnerMoveOptions(pid).then((res) => {
      setLoading(false);
      if (!res.ok) { setError(res.data?.message || 'Could not load the hierarchy'); return; }
      setInfo(res.data);
    });
  }, [visible, pid]);

  const isAdmin = info?.partner?.role === 'admin';
  const options = info?.options || [];

  const minChild = info?.subtree?.min_child_level ? Number(info.subtree.min_child_level) : null;
  // parents a partner of level L can go under: any higher level (role mode keeps the current parent available)
  const parentsForLevel = (L) => options.filter((o) => Number(o.parent_level) < L && !HARD_REASONS.includes(o.reason));
  const levelPossible = (L) => !(minChild && L >= minChild) && parentsForLevel(L).length > 0;

  // parents the chosen level can go under
  const parentChoices = useMemo(() => {
    if (mode === 'role') return level ? parentsForLevel(level).map((o) => ({ ...o, allowed: true })) : [];
    return options.filter((o) => !o.current);
  }, [options, mode, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowedChoices = parentChoices.filter((o) => o.allowed);

  // keep the current parent when it is still above the new level; otherwise the only choice, if one
  useEffect(() => {
    if (mode !== 'role' || !level) return;
    const cur = allowedChoices.find((o) => o.current);
    setParentId(cur ? String(cur.parent_id) : allowedChoices.length === 1 ? String(allowedChoices[0].parent_id) : '');
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  // dry run whenever the target changes
  useEffect(() => {
    setImpact(null); setCheckError('');
    if (!visible || !pid || !parentId) return;
    let live = true;
    setChecking(true);
    OneBssApi.movePartner(pid, parentId, true, mode === 'role' ? level : null).then((res) => {
      if (!live) return;
      setChecking(false);
      if (!res.ok) { setCheckError(res.data?.message || 'This change is not possible'); return; }
      setImpact(res.data.impact);
    });
    return () => { live = false; };
  }, [visible, pid, parentId, level]);

  const save = async () => {
    if (!impact || saving) return;
    setSaving(true);
    const res = await OneBssApi.movePartner(pid, parentId, false, mode === 'role' ? level : null);
    setSaving(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not save the change'); return; }
    toast.success(res.data.message || 'Saved');
    onDone && onDone(res.data.impact);
    onClose();
  };

  const currentLevel = info?.partner?.level;
  const title = mode === 'role' ? `Change role · ${partner?.partner_name || ''}` : `Move ${partner?.partner_name || ''}`;
  const parentOptions = parentChoices.map((o) => ({
    value: String(o.parent_id),
    label: `${o.parent_name} · ${o.parent_label}${o.current ? ' (current)' : ''}${o.allowed ? '' : ` — not possible (${o.reason})`}`,
    sub: mode === 'move' && isAdmin && o.new_label ? `becomes ${o.new_label}` : undefined,
    search: `${o.parent_name} ${o.parent_label}`,
  })).filter((o, i) => parentChoices[i].allowed);

  return (
    <ModalShell
      visible={visible}
      title={title}
      icon={mode === 'role' ? 'award' : 'git-branch'}
      iconColor="#7c3aed"
      onClose={onClose}
      maxWidth={560}
      busy={saving}
      footer={(
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn
            label={mode === 'role' ? 'Change role' : 'Move'}
            icon={mode === 'role' ? 'award' : 'git-branch'}
            onPress={save}
            loading={saving}
            disabled={!impact || checking}
          />
        </>
      )}
    >
      {loading ? <ActivityIndicator color="#7c3aed" style={{ marginVertical: 24 }} /> : null}
      {error ? <Note tone="error" text={error} /> : null}

      {info ? (
        <View style={{ gap: 14 }}>
          <View style={s.nowBox}>
            <Text style={s.nowLabel}>Now</Text>
            <Text style={s.nowText}>
              <Text style={{ fontWeight: '700' }}>{info.partner.label}</Text>
              {info.partner.parent ? ` under ${info.partner.parent.partner_name} (${info.partner.parent.label})` : ''}
            </Text>
            {info.subtree.partners_below ? (
              <Text style={s.nowSub}>{info.subtree.partners_below} partner(s) below it stay under it.</Text>
            ) : null}
          </View>

          {mode === 'role' ? (
            <View>
              <Text style={s.label}>New role</Text>
              <View style={{ gap: 8 }}>
                {LEVELS.map((l) => {
                  const current = l.level === currentLevel;
                  const parentsAtLevel = options.filter((o) => Number(o.parent_level) < l.level);
                  const possible = levelPossible(l.level);
                  const picked = level === l.level;
                  return (
                    <TouchableOpacity
                      key={l.level}
                      style={[s.roleRow, picked && s.roleRowOn, (current || !possible) && { opacity: 0.5 }]}
                      disabled={current || !possible}
                      onPress={() => setLevel(l.level)}
                    >
                      <Feather name={picked ? 'check-circle' : 'circle'} size={16} color={picked ? '#7c3aed' : '#94a3b8'} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.roleName}>{l.label}{current ? '  (current)' : ''}</Text>
                        <Text style={s.roleHint}>
                          {current ? 'This is its role now' : possible ? l.hint : whyNot(l.level, minChild, parentsAtLevel)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {(mode === 'move' || (level && level > 1)) ? (
            <View>
              <Text style={s.label}>{mode === 'role' ? `Under whom? (super admin or a higher level than ${LEVEL_NAME[level]})` : 'New parent'}</Text>
              {parentOptions.length ? (
                <SearchSelect
                  value={parentId}
                  options={parentOptions}
                  onChange={(v) => setParentId(String(v))}
                  placeholder="Pick a partner…"
                  searchPlaceholder="Search by name…"
                  accent="#7c3aed"
                />
              ) : (
                <Note tone="warn" text="There is nowhere it can go: every option is disabled, below it, or too deep." />
              )}
            </View>
          ) : null}

          {checking ? <ActivityIndicator color="#7c3aed" /> : null}
          {checkError ? <Note tone="error" text={checkError} /> : null}

          {impact ? (
            <View style={s.impact}>
              <Text style={s.impactTitle}>
                {impact.partner_name}: {impact.from_label} → <Text style={{ color: '#7c3aed' }}>{impact.to_label}</Text> under {impact.to_parent.partner_name}
              </Text>
              {impact.level_changes.filter((c) => Number(c.partner_id) !== Number(pid)).map((c) => (
                <Text key={c.partner_id} style={s.impactLine}>• {c.partner_name}: {c.from} → {c.to}</Text>
              ))}
              {impact.operators_moved && Number(impact.from_parent?.partner_id) !== Number(impact.to_parent?.partner_id) ? (
                <Text style={s.impactLine}>• {impact.operators_moved} operator(s) move with it; their customers' prices stay the same.</Text>
              ) : null}
              {impact.admins_losing_margins.length ? (
                <Text style={[s.impactLine, { color: '#b45309' }]}>
                  • {impact.admins_losing_margins.join(', ')} will stop earning margins on these operators ({impact.margin_rows_removed} margin row(s) removed).
                </Text>
              ) : null}
              {impact.admins_new_above.length ? (
                <Text style={[s.impactLine, { color: '#1e40af' }]}>
                  • {impact.admins_new_above.join(', ')} will be above them with no margin until you set it in the operator's plan screens.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  nowBox: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  nowLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
  nowText: { fontSize: 13.5, color: '#0f172a' },
  nowSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  roleRowOn: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  roleName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  roleHint: { fontSize: 12, color: '#64748b', marginTop: 1 },
  impact: { borderRadius: 10, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#faf5ff', padding: 12, gap: 4 },
  impactTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  impactLine: { fontSize: 12.5, color: '#334155', lineHeight: 18 },
});
