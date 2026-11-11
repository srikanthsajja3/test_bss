import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';

/**
 * Super admin: the OneRadius branches an operator works in (partner_radius_branches.php).
 * Every branch of the operator's RADIUS partner is listed live; tick as many as needed.
 * The first ticked one (top of the list) is the default branch. When adding an internet
 * customer the operator then picks one of these.
 */
export const RadiusBranchesModal = ({ visible, partner, readOnly = false, onClose, onSaved }) => {
  const pid = partner?.partner_id;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState([]); // ordered ids
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !pid) return;
    setData(null); setError(''); setPicked([]);
    setLoading(true);
    OneBssApi.getRadiusBranches(pid).then((res) => {
      setLoading(false);
      if (!res.ok || res.data?.success === false) { setError(res.data?.message || 'Could not load branches'); return; }
      setData(res.data);
      setPicked((res.data.selected || []).map(String));
    });
  }, [visible, pid]);

  const branches = data?.branches || [];
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allOn = branches.length > 0 && branches.every((b) => picked.includes(String(b.id)));

  const save = async () => {
    if (!picked.length || saving) return;
    setSaving(true);
    const res = await OneBssApi.saveRadiusBranches(pid, picked);
    setSaving(false);
    if (!res.ok || res.data?.success === false) { toast.error(res.data?.message || 'Could not save'); return; }
    toast.success(res.data.message || 'Saved');
    onSaved && onSaved(picked);
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      title={`RADIUS branches · ${partner?.partner_name || ''}`}
      icon="git-branch"
      iconColor="#0284c7"
      onClose={onClose}
      maxWidth={520}
      busy={saving}
      footer={readOnly ? <Btn label="Close" kind="ghost" onPress={onClose} /> : (
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label={`Save ${picked.length} branch(es)`} icon="check" onPress={save} loading={saving} disabled={!picked.length} />
        </>
      )}
    >
      {loading ? <ActivityIndicator color="#0284c7" style={{ marginVertical: 24 }} /> : null}
      {error ? <Note tone="error" text={error} /> : null}
      {data ? (
        <View style={{ gap: 10 }}>
          {!data.live && data.message ? <Note tone="warn" text={`${data.message}. Only the saved branches are shown.`} /> : null}
          <Note tone="info" text="Tick every branch this operator adds customers in. When adding an internet customer, the operator chooses one of them. The first ticked branch is the default." />
          {!readOnly && branches.length > 1 ? (
            <TouchableOpacity style={s.allRow} onPress={() => setPicked(allOn ? [] : branches.map((b) => String(b.id)))}>
              <Feather name={allOn ? 'check-square' : 'square'} size={16} color="#0284c7" />
              <Text style={s.allText}>{allOn ? 'Clear all' : `Select all ${branches.length} branches`}</Text>
            </TouchableOpacity>
          ) : null}
          {branches.length ? branches.map((b) => {
            const id = String(b.id);
            const on = picked.includes(id);
            const first = picked[0] === id;
            return (
              <TouchableOpacity key={id} style={[s.row, on && s.rowOn]} onPress={() => !readOnly && toggle(id)} disabled={readOnly}>
                <Feather name={on ? 'check-square' : 'square'} size={16} color={on ? '#0284c7' : '#94a3b8'} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{b.name}</Text>
                  <Text style={s.sub}>Branch id {id}</Text>
                </View>
                {first ? <View style={s.def}><Text style={s.defText}>DEFAULT</Text></View> : null}
              </TouchableOpacity>
            );
          }) : <Note tone="warn" text="RADIUS lists no branches for this operator's partner." />}
        </View>
      ) : null}
    </ModalShell>
  );
};

/** "2 branches" style hint from partner.internet_branch_id ("328,329"). */
export const radiusBranchCount = (p) => String(p?.internet_branch_id || '').split(/[\s,;]+/).filter(Boolean).length;

const s = StyleSheet.create({
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  allText: { fontSize: 13, fontWeight: '700', color: '#0284c7' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  rowOn: { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
  name: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 11.5, color: '#64748b' },
  def: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: '#e0f2fe' },
  defText: { fontSize: 10, fontWeight: '800', color: '#0369a1' },
});
