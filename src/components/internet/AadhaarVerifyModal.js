import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Image, Platform, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, sharedStyles } from './shared';

/**
 * Aadhaar verification of ONE internet account (each account of a customer is verified on its own).
 * Same methods as Add Customer — Aadhaar OTP (ScoreMe) / DigiLocker, whichever the account's operator
 * has. On success the server tells RADIUS aadhar_verified=1 for the account and uploads the photo
 * (type 4) + Aadhaar XML (type 1); this shows what went through, with Retry (no new OTP) if not.
 *
 * Props: visible, onClose, account (raw internet account: internet_id, username, partner_id,
 *        aadhar_verified, kyc), customerName, onVerified(result)
 */
const BLUE = '#2563eb';
const POLL_EARLY_MS = 3000;
const POLL_LATE_MS = 8000;
const EARLY_WINDOW_MS = 2 * 60 * 1000;
const POLL_TIMEOUT_MS = 25 * 60 * 1000;
const RESEND_SECONDS = 120;

const isOk = (res) => !!(res && res.ok && res.data && res.data.success);
const cleanText = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
const errMsg = (res, fallback) => cleanText(res && res.data && (res.data.error || res.data.message)) || fallback;
const METHODS = {
  scoreme: { label: 'Aadhaar OTP', icon: 'smartphone', hint: 'OTP to the mobile linked with Aadhaar' },
  digilocker: { label: 'DigiLocker', icon: 'shield', hint: 'Customer signs in to DigiLocker' },
};
const STEP_LABEL = { flag: 'Aadhaar verified in RADIUS', photo: 'Customer photo uploaded', xml: 'Aadhaar XML uploaded' };

const PushRow = ({ label, state }) => {
  const conf = state === 'done'
    ? { icon: 'check-circle', color: '#059669', text: 'Done' }
    : state === 'skipped'
      ? { icon: 'minus-circle', color: '#94a3b8', text: 'Not available' }
      : state === 'failed'
        ? { icon: 'x-circle', color: '#dc2626', text: 'Failed' }
        : { icon: 'clock', color: '#d97706', text: 'Pending' };
  return (
    <View style={s.pushRow}>
      <Feather name={conf.icon} size={15} color={conf.color} />
      <Text style={s.pushLabel}>{label}</Text>
      <Text style={[s.pushState, { color: conf.color }]}>{conf.text}</Text>
    </View>
  );
};

export const AadhaarVerifyModal = ({ visible, onClose, account, customerName, onVerified }) => {
  const internetId = account?.internet_id;
  const [providers, setProviders] = useState(null); // null = loading
  const [providerError, setProviderError] = useState('');
  const [method, setMethod] = useState(null);
  const [result, setResult] = useState(null); // server answer after verification / retry
  const [pushing, setPushing] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  // ScoreMe
  const [aadhaar, setAadhaar] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendAt, setResendAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // DigiLocker
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollStatus, setPollStatus] = useState('');
  const [pollError, setPollError] = useState('');
  const popupRef = useRef(null);
  const timerRef = useRef(null);
  const deadlineRef = useRef(0);
  const clientIdRef = useRef(null);
  const aliveRef = useRef(true);

  const pendingPush = account?.kyc && !account?.kyc?.radius?.complete ? account.kyc : null;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      stopPolling();
      return;
    }
    setResult(null);
    setPhotoFailed(false);
    setMethod(null);
    setAadhaar('');
    setOtp('');
    setOtpSent(false);
    setResendAt(null);
    setPollError('');
    setPollStatus('');
    setProviders(null);
    setProviderError('');
    (async () => {
      const res = await OneBssApi.getKycProviderMapping(account?.partner_id);
      if (!aliveRef.current) return;
      if (!res.ok) {
        setProviders([]);
        setProviderError(errMsg(res, 'Could not load the verification methods'));
        return;
      }
      const raw = Array.isArray(res.data?.providers) ? res.data.providers : Array.isArray(res.data?.data) ? res.data.data : [];
      const names = raw.map((p) => String(typeof p === 'string' ? p : p?.provider || p?.name || '').toLowerCase());
      const list = ['scoreme', 'digilocker'].filter((m) => names.includes(m));
      setProviders(list);
      setMethod(list.length === 1 ? list[0] : null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, internetId]);

  // resend countdown
  useEffect(() => {
    if (!resendAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);
  const resendLeft = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;

  const finish = (res) => {
    setResult(res.data);
    if (res.data?.account_verified) {
      toast.success(res.data.message || 'Aadhaar verified');
      if (onVerified) onVerified(res.data);
    } else {
      toast.warning(res.data?.message || 'Aadhaar checked, but RADIUS has not accepted it yet');
    }
  };

  // ---------- ScoreMe ----------
  const sendOtp = async () => {
    if (!/^\d{12}$/.test(aadhaar)) return toast.warning('Enter the 12-digit Aadhaar number');
    setSending(true);
    const res = await OneBssApi.accountAadhaarSendOtp(internetId, aadhaar);
    if (!aliveRef.current) return;
    setSending(false);
    if (!isOk(res)) return toast.error(errMsg(res, 'Could not send the OTP'));
    toast.success(res.data.message || 'OTP sent to the mobile linked with Aadhaar');
    setOtpSent(true);
    setOtp('');
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return toast.warning('Enter the OTP');
    setVerifying(true);
    const res = await OneBssApi.accountAadhaarVerifyOtp(internetId, aadhaar, otp.trim());
    if (!aliveRef.current) return;
    setVerifying(false);
    if (!isOk(res)) return toast.error(errMsg(res, 'OTP verification failed'));
    finish(res);
  };

  // ---------- DigiLocker ----------
  function stopPolling() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPolling(false);
  }
  const closePopup = () => {
    try {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    } catch (e) {}
    popupRef.current = null;
  };
  const popupClosed = () => {
    try {
      return !!(popupRef.current && popupRef.current.closed);
    } catch (e) {
      return false;
    }
  };
  const fatal = (res) => res && (res.status === 401 || res.status === 403
    || /not enabled|not configured|not found|date of birth|adult|minor|18 years|required/i.test(errMsg(res, '')));

  const pollOnce = async (final = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const res = await OneBssApi.accountAadhaarDigilockerDownload(internetId, clientIdRef.current);
    if (!aliveRef.current) return;
    if (isOk(res)) {
      stopPolling();
      closePopup();
      finish(res);
      return;
    }
    if (fatal(res)) {
      stopPolling();
      closePopup();
      setPollError(errMsg(res, 'Aadhaar verification failed'));
      return;
    }
    if (final) {
      stopPolling();
      toast.info('DigiLocker window was closed before it finished.');
      return;
    }
    setPollStatus(errMsg(res, 'Waiting for the customer to finish DigiLocker…'));
    if (Date.now() > deadlineRef.current) {
      stopPolling();
      setPollError("DigiLocker didn't answer in time. Start again.");
      return;
    }
    if (popupClosed()) {
      timerRef.current = setTimeout(() => pollOnce(true), 1500);
      return;
    }
    const elapsed = Date.now() - (deadlineRef.current - POLL_TIMEOUT_MS);
    timerRef.current = setTimeout(() => pollOnce(false), elapsed < EARLY_WINDOW_MS ? POLL_EARLY_MS : POLL_LATE_MS);
  };

  // the DigiLocker done page posts this to us just before it closes
  useEffect(() => {
    if (!polling || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onMessage = (event) => {
      if (!popupRef.current || event.source !== popupRef.current) return;
      if (event.data?.type === 'onebss:digilocker:done') {
        setPollStatus('DigiLocker finished — fetching Aadhaar details…');
        pollOnce(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  const startDigilocker = async () => {
    let popup = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      popup = window.open('', 'digilocker_verify', 'width=480,height=720'); // opened on the tap so it isn't blocked
      if (!popup) return toast.error('Popup blocked — allow popups for this site and try again');
    }
    setStarting(true);
    setPollError('');
    const res = await OneBssApi.digilockerInitialize(account?.partner_id);
    if (!aliveRef.current) return;
    setStarting(false);
    const url = res?.data?.url || res?.data?.data?.url;
    const clientId = res?.data?.client_id || res?.data?.data?.client_id;
    if (!isOk(res) || !url || !clientId) {
      if (popup) popup.close();
      return toast.error(errMsg(res, 'Could not start DigiLocker'));
    }
    if (popup) {
      popup.location.href = url;
      popupRef.current = popup;
    } else {
      Linking.openURL(url).catch(() => toast.error('Could not open DigiLocker'));
    }
    clientIdRef.current = clientId;
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    setPollStatus('Waiting for the customer to finish DigiLocker…');
    setPolling(true);
    timerRef.current = setTimeout(() => pollOnce(false), POLL_EARLY_MS);
  };

  // ---------- retry push ----------
  const retryPush = async () => {
    setPushing(true);
    const res = await OneBssApi.accountAadhaarPush(internetId);
    if (!aliveRef.current) return;
    setPushing(false);
    const data = res.data || {};
    if (data.kyc) setResult((r) => ({ ...(r || {}), ...data, customer: r?.customer || { full_name: data.kyc.full_name, masked_aadhaar: data.kyc.masked_aadhaar, dob: data.kyc.dob, photo_url: data.kyc.photo_url } }));
    if (data.account_verified) {
      toast.success(data.message || 'Sent to RADIUS');
      if (onVerified) onVerified(data);
    } else {
      toast.error(errMsg(res, 'RADIUS still refused it'));
    }
  };

  const busy = sending || verifying || starting || pushing;
  const kyc = result?.kyc;
  const cust = result?.customer || {};

  return (
    <ModalShell
      visible={visible}
      title={`Verify Aadhaar — ${account?.username || ''}`}
      icon="shield"
      iconColor={BLUE}
      onClose={() => { stopPolling(); closePopup(); onClose(); }}
      busy={busy}
      maxWidth={540}
      footer={
        result ? (
          <>
            {kyc && !kyc.radius?.complete ? <Btn label="Retry sending to RADIUS" kind="ghost" icon="refresh-cw" onPress={retryPush} loading={pushing} /> : null}
            <Btn label="Done" onPress={onClose} disabled={pushing} />
          </>
        ) : (
          <Btn label="Cancel" kind="ghost" onPress={() => { stopPolling(); closePopup(); onClose(); }} disabled={busy} />
        )
      }
    >
      {/* which account */}
      <View style={s.accBox}>
        <View style={s.accIcon}><Feather name="wifi" size={16} color="#059669" /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.accTitle} numberOfLines={1}>{account?.username}</Text>
          <Text style={s.accSub} numberOfLines={1}>{customerName ? `${customerName} · ` : ''}each internet account is verified on its own</Text>
        </View>
      </View>

      {result ? (
        <>
          <View style={[s.resultHead, result.account_verified ? s.resultOk : s.resultWarn]}>
            {cust.photo_url && !photoFailed ? <Image source={{ uri: cust.photo_url }} style={s.photo} onError={() => setPhotoFailed(true)} /> : (
              <View style={[s.photo, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0' }]}><Feather name="user" size={22} color="#64748b" /></View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name={result.account_verified ? 'check-circle' : 'alert-triangle'} size={15} color={result.account_verified ? '#059669' : '#b45309'} />
                <Text style={[s.resultTitle, { color: result.account_verified ? '#065f46' : '#92400e' }]}>
                  {result.account_verified ? 'Aadhaar verified' : 'Checked — RADIUS not updated yet'}
                </Text>
              </View>
              <Text style={s.resultName} numberOfLines={1}>{cust.full_name || '—'}</Text>
              <Text style={s.accSub}>
                {[cust.masked_aadhaar, cust.dob ? `DOB ${cust.dob}` : null, kyc?.channel ? `via ${kyc.channel === 'scoreme' ? 'Aadhaar OTP' : kyc.channel === 'digilocker' ? 'DigiLocker' : kyc.channel}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          {kyc ? (
            <View style={s.pushBox}>
              <PushRow label={STEP_LABEL.flag} state={kyc.radius?.flag} />
              <PushRow label={STEP_LABEL.photo} state={kyc.radius?.photo} />
              <PushRow label={STEP_LABEL.xml} state={kyc.radius?.xml} />
              {kyc.radius?.error ? <Text style={s.pushErr}>{kyc.radius.error}</Text> : null}
            </View>
          ) : null}
          {result.account_verified ? <Note tone="success" text="This internet account can be recharged now." /> : (
            <Note tone="warn" text="The account stays blocked for recharge until RADIUS accepts the Aadhaar flag. Retry — no new OTP is needed." />
          )}
        </>
      ) : (
        <>
          {pendingPush ? (
            <View style={[s.pushBox, { marginBottom: 14, borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
              <Text style={[s.accTitle, { fontSize: 13 }]}>Aadhaar was already checked ({pendingPush.masked_aadhaar || pendingPush.full_name}), but RADIUS didn't get all of it.</Text>
              <PushRow label={STEP_LABEL.flag} state={pendingPush.radius?.flag} />
              <PushRow label={STEP_LABEL.photo} state={pendingPush.radius?.photo} />
              <PushRow label={STEP_LABEL.xml} state={pendingPush.radius?.xml} />
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                <Btn label="Send to RADIUS again" icon="upload-cloud" onPress={retryPush} loading={pushing} />
              </View>
            </View>
          ) : null}

          {providers === null ? (
            <ActivityIndicator size="small" color={BLUE} style={{ marginVertical: 16 }} />
          ) : providerError ? (
            <Note tone="error" text={providerError} />
          ) : providers.length === 0 ? (
            <Note tone="warn" text="No Aadhaar verification method (Aadhaar OTP / DigiLocker) is enabled for this operator. Ask the super admin to enable one under Partners › KYC." />
          ) : !method ? (
            <>
              <Text style={sharedStyles.label}>HOW SHOULD THE CUSTOMER VERIFY?</Text>
              <View style={s.methodRow}>
                {providers.map((m) => (
                  <TouchableOpacity key={m} style={s.methodTile} onPress={() => setMethod(m)}>
                    <View style={s.methodIcon}><Feather name={METHODS[m].icon} size={18} color={BLUE} /></View>
                    <Text style={s.methodLabel}>{METHODS[m].label}</Text>
                    <Text style={s.methodHint}>{METHODS[m].hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : method === 'scoreme' ? (
            <>
              <Text style={sharedStyles.label}>AADHAAR NUMBER</Text>
              <TextInput
                style={[sharedStyles.input, s.mono]}
                value={aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')}
                onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))}
                placeholder="1234 5678 9012"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                editable={!otpSent && !busy}
              />
              {!otpSent ? (
                <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                  <Btn label="Send OTP" icon="send" onPress={sendOtp} loading={sending} disabled={aadhaar.length !== 12} />
                </View>
              ) : (
                <>
                  <Text style={[sharedStyles.label, { marginTop: 14 }]}>OTP SENT TO THE AADHAAR-LINKED MOBILE</Text>
                  <TextInput
                    style={[sharedStyles.input, s.mono, { letterSpacing: 4 }]}
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Enter OTP"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    onSubmitEditing={verifyOtp}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <Btn label="Verify Aadhaar" icon="check" onPress={verifyOtp} loading={verifying} disabled={!otp} />
                    <TouchableOpacity onPress={sendOtp} disabled={resendLeft > 0 || sending}>
                      <Text style={[s.link, (resendLeft > 0 || sending) && { color: '#94a3b8' }]}>{resendLeft > 0 ? `Resend in ${resendLeft}s` : 'Resend OTP'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); setResendAt(null); }} disabled={verifying}>
                      <Text style={s.link}>Change number</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={s.body}>A DigiLocker window opens. The customer signs in there and allows access to their Aadhaar; this window then picks it up by itself.</Text>
              {polling ? (
                <View style={s.waitBox}>
                  <ActivityIndicator size="small" color={BLUE} />
                  <Text style={[s.body, { flex: 1, marginTop: 0 }]}>{pollStatus || 'Waiting for DigiLocker…'}</Text>
                  <TouchableOpacity onPress={() => pollOnce(false)}><Text style={s.link}>Check now</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                  <Btn label={pollError ? 'Start again' : 'Open DigiLocker'} icon="external-link" onPress={startDigilocker} loading={starting} />
                </View>
              )}
              {pollError ? <Note tone="error" text={pollError} /> : null}
            </>
          )}

          {method && providers && providers.length > 1 ? (
            <TouchableOpacity style={{ marginTop: 14 }} onPress={() => { stopPolling(); closePopup(); setMethod(null); setOtpSent(false); setOtp(''); }} disabled={busy}>
              <Text style={s.link}>← Use another method</Text>
            </TouchableOpacity>
          ) : null}
          {method ? <Note tone="info" text="After verification, RADIUS is told this account is Aadhaar verified and gets the customer photo and Aadhaar XML." /> : null}
        </>
      )}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  accBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 16 },
  accIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' },
  accTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textMain },
  accSub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  methodTile: { flexGrow: 1, flexBasis: 200, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#f8fbff', gap: 4 },
  methodIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  methodLabel: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' },
  methodHint: { fontSize: 12, color: '#475569' },
  mono: { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 16 },
  link: { fontSize: 12.5, fontWeight: '700', color: BLUE },
  body: { fontSize: 13, color: '#334155', lineHeight: 19, marginTop: 2 },
  waitBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  resultOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  resultWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  resultTitle: { fontSize: 13, fontWeight: '800' },
  resultName: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginTop: 4 },
  photo: { width: 54, height: 64, borderRadius: 8 },
  pushBox: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pushLabel: { flex: 1, fontSize: 13, color: COLORS.textMain },
  pushState: { fontSize: 12, fontWeight: '700' },
  pushErr: { fontSize: 11.5, color: '#b91c1c' },
});
