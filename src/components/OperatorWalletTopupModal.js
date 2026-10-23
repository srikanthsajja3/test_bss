import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import {
  PAYU_CONFIG,
  preparePayUPaymentData,
  calculatePayUHash,
  loadPayUBoltSdk,
  launchPayUHostedCheckout,
  recordPayUWalletTopup,
  generatePayUTxnId,
} from '../services/payuService';

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

export const OperatorWalletTopupModal = ({
  visible,
  onClose,
  partner = null,
  user = null,
  onSuccess = null,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [operatorList, setOperatorList] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(partner || (user?.partner_id ? user : null));

  const targetPartner = selectedPartner || partner || user;
  const partnerId = targetPartner?.partner_id || (user?.partner_id ? user.partner_id : null);
  const partnerName = targetPartner?.partner_name || targetPartner?.company_name || targetPartner?.username || 'Operator';
  const partnerMobile = targetPartner?.partner_mobile || targetPartner?.mobile || targetPartner?.phone || targetPartner?.contact_no || '—';

  const [liveBalance, setLiveBalance] = useState(
    partner?.wallet_balance !== undefined && partner?.wallet_balance !== null
      ? Number(partner.wallet_balance)
      : user?.wallet_balance !== undefined && user?.wallet_balance !== null
      ? Number(user.wallet_balance)
      : 0
  );
  const [balanceLoading, setBalanceLoading] = useState(false);

  const currentBalance = liveBalance !== undefined && liveBalance !== null
    ? Number(liveBalance)
    : (targetPartner?.wallet_balance !== undefined && targetPartner?.wallet_balance !== null
        ? Number(targetPartner.wallet_balance)
        : 0);

  const [amount, setAmount] = useState('1000');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [payuMode, setPayuMode] = useState(PAYU_CONFIG.ENVIRONMENT); // 'test' | 'production'
  const [successReceipt, setSuccessReceipt] = useState(null);

  // Sync balance when partner prop updates with balance
  useEffect(() => {
    if (partner?.wallet_balance !== undefined && partner?.wallet_balance !== null) {
      setLiveBalance(Number(partner.wallet_balance));
    }
  }, [partner?.wallet_balance]);

  // Fetch live wallet balance from backend whenever modal opens or partner changes
  useEffect(() => {
    if (!visible || !partnerId) return undefined;

    let isMounted = true;
    const fetchWallet = () => {
      setBalanceLoading(true);
      OneBssApi.getWallet(partnerId)
        .then((res) => {
          if (!isMounted) return;
          if (res.ok && res.data && res.data.wallet_balance !== undefined) {
            setLiveBalance(Number(res.data.wallet_balance));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setBalanceLoading(false);
        });
    };

    fetchWallet();

    const handleWalletChanged = (e) => {
      if (e?.detail?.balance_after !== undefined && (!e.detail.partner_id || String(e.detail.partner_id) === String(partnerId))) {
        setLiveBalance(Number(e.detail.balance_after));
      } else {
        fetchWallet();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('onebss:wallet-changed', handleWalletChanged);
      return () => {
        isMounted = false;
        window.removeEventListener('onebss:wallet-changed', handleWalletChanged);
      };
    }
  }, [visible, partnerId]);

  useEffect(() => {
    if (visible) {
      setSuccessReceipt(null);
      setLoading(false);
      setRemark('');
      if (!amount) setAmount('1000');

      if (partner?.partner_id) {
        setSelectedPartner(partner);
        if (partner.wallet_balance !== undefined && partner.wallet_balance !== null) {
          setLiveBalance(Number(partner.wallet_balance));
        }
      } else if (user?.partner_id) {
        setSelectedPartner(user);
        if (user.wallet_balance !== undefined && user.wallet_balance !== null) {
          setLiveBalance(Number(user.wallet_balance));
        }
      } else {
        // Admin user: fetch operator list so an operator can be selected
        OneBssApi.getPartners('operator').then((res) => {
          const list = Array.isArray(res.data) ? res.data : (res.data?.partners || []);
          setOperatorList(list);
          if (list.length > 0 && (!selectedPartner || !selectedPartner.partner_id)) {
            setSelectedPartner(list[0]);
            if (list[0].wallet_balance !== undefined) {
              setLiveBalance(Number(list[0].wallet_balance));
            }
          }
        }).catch(() => {});
      }
    }
  }, [visible, partner, user]);

  const handleSelectPreset = (val) => {
    setAmount(String(val));
  };

  /**
   * Launch online payment using PayU Bolt inline checkout overlay.
   * If Bolt fails to initialize, fallback to PayU Hosted Checkout.
   */
  const handleProceedPayment = async () => {
    if (loading) return;
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 1) {
      toast.warn('Please enter a valid amount of at least ₹1.00');
      return;
    }

    if (!partnerId) {
      toast.error('Partner ID missing. Unable to initiate wallet top-up.');
      return;
    }

    setLoading(true);

    try {
      PAYU_CONFIG.ENVIRONMENT = payuMode;
      const userRemark = remark.trim();
      const paymentData = preparePayUPaymentData({
        partner: targetPartner,
        amount: numAmount,
        user,
        remark: userRemark,
      });

      // Save pending transaction to storage so callback can detect it
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            'onebss_pending_payu_txn',
            JSON.stringify({
              partner_id: partnerId,
              amount: numAmount,
              txnid: paymentData.txnid,
              remark: userRemark,
              timestamp: Date.now(),
            })
          );
        } catch (e) {}
      }

      // Attempt PayU Bolt inline checkout (redirection-less)
      let boltInstance = null;
      try {
        boltInstance = await loadPayUBoltSdk();
      } catch (sdkErr) {
        console.warn('PayU Bolt SDK unavailable, using Hosted Checkout fallback:', sdkErr);
      }

      if (boltInstance && typeof boltInstance.launch === 'function') {
        console.log('Launching PayU Bolt with payload:', paymentData);
        boltInstance.launch(
          paymentData,
          {
            responseHandler: async (BOLT) => {
              setLoading(false);
              const resp = BOLT?.response || {};
              const status = (resp.txnStatus || resp.status || '').toUpperCase();

              if (status === 'SUCCESS') {
                await handlePaymentSuccess(numAmount, paymentData.txnid, resp.bank_ref_num || resp.payuMoneyId || '', resp, userRemark);
              } else if (status === 'CANCEL') {
                toast.info('Payment was cancelled.');
              } else {
                toast.error(resp.error_Message || resp.errorMessage || 'Payment was not completed.');
              }
            },
            catchException: (err) => {
              setLoading(false);
              console.error('PayU Bolt Exception:', err);
              toast.error(err?.message || 'Payment window could not be opened.');
            },
          }
        );
      } else {
        // Fallback: Hosted Checkout Form Post
        toast.info('Opening secure PayU payment gateway...');
        launchPayUHostedCheckout(paymentData);
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      toast.error(err?.message || 'Failed to initiate PayU payment.');
    }
  };

  /**
   * Instant simulation for Test/Sandbox environment
   * (Allows QA and verification of full wallet credit ledger without real bank credentials)
   */
  const handleTestSimulateSuccess = async () => {
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 1) {
      toast.warn('Please enter a valid amount of at least ₹1.00');
      return;
    }

    if (!partnerId) {
      toast.warn('Please select an operator account first.');
      return;
    }

    setLoading(true);
    const mockTxnId = generatePayUTxnId(partnerId);

    // Simulate PayU payment gateway verification delay
    setTimeout(async () => {
      await handlePaymentSuccess(numAmount, mockTxnId, `SANDBOX_REF_${Date.now()}`, {}, remark.trim());
      setLoading(false);
    }, 1200);
  };

  const handlePaymentSuccess = async (numAmount, txnid, bankRef = '', payuResponse = {}, userRemark = '') => {
    try {
      const res = await recordPayUWalletTopup({
        partnerId,
        amount: numAmount,
        txnid,
        mode: payuMode === 'test' ? 'PayU Sandbox' : 'PayU Gateway',
        bankRef,
        payuResponse,
        remark: userRemark,
      });

      const isOk = res && res.ok && res.data?.success;
      if (!isOk) {
        toast.error(res?.message || res?.data?.message || 'Payment could not be verified by PayU. Wallet was not credited.');
        return;
      }

      const newBal = res?.data?.balance_after !== undefined
        ? Number(res.data.balance_after)
        : currentBalance + numAmount;

      setLiveBalance(newBal);

      setSuccessReceipt({
        amount: numAmount,
        txnid,
        bankRef: res.data?.bank_ref_num || bankRef,
        balanceAfter: newBal,
        remark: res.data?.user_remark || userRemark || '',
        syncPending: false,
        date: new Date().toLocaleString('en-IN'),
      });

      toast.success(`₹${numAmount.toLocaleString('en-IN')} added to operator wallet successfully!`);
      if (onSuccess) {
        onSuccess({ amount: numAmount, txnid, balanceAfter: newBal });
      }
    } catch (e) {
      console.error('Wallet topup verification error:', e);
      toast.error('An error occurred while verifying payment with server.');
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { width: isMobile ? '96%' : 540 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="wallet-outline" size={20} color="#10b981" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Top Up Operator Wallet</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {partnerName} (#{partnerId}) · Phone: {partnerMobile}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={loading}>
              <Feather name="x" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ padding: 18, gap: 14 }}>
            {/* SUCCESS RECEIPT VIEW */}
            {successReceipt ? (
              <View style={styles.successContainer}>
                <View style={[styles.successIconCircle, successReceipt.syncPending && { backgroundColor: '#f59e0b' }]}>
                  <Feather name={successReceipt.syncPending ? 'clock' : 'check'} size={32} color="#ffffff" />
                </View>
                <Text style={styles.successTitle}>
                  {successReceipt.syncPending ? 'Payment Received on PayU!' : 'Top-Up Successful!'}
                </Text>
                <Text style={styles.successAmount}>+₹{Number(successReceipt.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                <Text style={styles.successSub}>
                  {successReceipt.syncPending
                    ? 'Payment verified on PayU. The operator wallet ledger is updating.'
                    : 'Credits have been added to your operator wallet balance.'}
                </Text>

                <View style={styles.receiptBox}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction ID</Text>
                    <Text style={styles.receiptValue}>{successReceipt.txnid}</Text>
                  </View>
                  {successReceipt.bankRef ? (
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Bank / PayU Ref</Text>
                      <Text style={styles.receiptValue}>{successReceipt.bankRef}</Text>
                    </View>
                  ) : null}
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Payment Gateway</Text>
                    <Text style={styles.receiptValue}>PayU India (Verified)</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Status</Text>
                    <Text style={[styles.receiptValue, { color: successReceipt.syncPending ? '#d97706' : '#059669', fontWeight: '800' }]}>
                      {successReceipt.syncPending ? 'Payment Verified (Syncing)' : 'Credited to Wallet'}
                    </Text>
                  </View>
                  {successReceipt.remark ? (
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Remark / Note</Text>
                      <Text style={[styles.receiptValue, { color: '#0f172a' }]} numberOfLines={2}>
                        {successReceipt.remark}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{successReceipt.syncPending ? 'Expected Balance' : 'Updated Balance'}</Text>
                    <Text style={[styles.receiptValue, { color: '#059669', fontWeight: '800' }]}>
                      ₹{Number(successReceipt.balanceAfter).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Date & Time</Text>
                    <Text style={styles.receiptValue}>{successReceipt.date}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: successReceipt.syncPending ? '#0284c7' : '#10b981', marginTop: 10, width: '100%' }]}
                  onPress={onClose}
                >
                  <Text style={styles.btnPrimaryText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Operator Selector for Admin */}
                {operatorList.length > 0 && !partner?.partner_id && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.fieldLabel}>SELECT OPERATOR ACCOUNT</Text>
                    <View style={{ marginTop: 6 }}>
                      {Platform.OS === 'web' ? (
                        <select
                          value={selectedPartner?.partner_id || ''}
                          onChange={(e) => {
                            const found = operatorList.find((p) => String(p.partner_id) === String(e.target.value));
                            if (found) {
                              setSelectedPartner(found);
                              if (found.wallet_balance !== undefined && found.wallet_balance !== null) {
                                setLiveBalance(Number(found.wallet_balance));
                              }
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#f8fafc',
                            fontSize: 13,
                            fontWeight: '600',
                            color: '#1e293b',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {operatorList.map((op) => (
                            <option key={op.partner_id} value={op.partner_id}>
                              {op.partner_name || op.username} (ID: #{op.partner_id} • Balance: ₹{Number(op.wallet_balance || 0).toLocaleString('en-IN')})
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </View>
                  </View>
                )}

                {/* Current Balance Banner */}
                <View style={styles.balanceBanner}>
                  <View>
                    <Text style={styles.balanceBannerLabel}>
                      CURRENT BALANCE ({partnerName ? partnerName.toUpperCase() : 'OPERATOR'})
                    </Text>
                    <Text style={styles.balanceBannerVal}>
                      ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Active</Text>
                  </View>
                </View>

                {/* Amount Input */}
                <View>
                  <Text style={styles.fieldLabel}>ENTER TOP-UP AMOUNT (₹)</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.rupeeSymbol}>₹</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amount}
                      onChangeText={(val) => setAmount(val.replace(/[^0-9.]/g, ''))}
                      keyboardType="numeric"
                      placeholder="e.g. 5000"
                      placeholderTextColor="#94a3b8"
                      editable={!loading}
                    />
                    {amount ? (
                      <TouchableOpacity onPress={() => setAmount('')} style={{ padding: 6 }}>
                        <Feather name="x-circle" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Remark / Note Input */}
                <View style={{ marginTop: 2 }}>
                  <Text style={styles.fieldLabel}>REMARK / NOTE (OPTIONAL)</Text>
                  <View style={styles.remarkWrapper}>
                    <Feather name="file-text" size={15} color="#64748b" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.remarkInput}
                      value={remark}
                      onChangeText={setRemark}
                      placeholder="e.g. Monthly recharge, Office top-up"
                      placeholderTextColor="#94a3b8"
                      editable={!loading}
                      maxLength={120}
                    />
                    {remark ? (
                      <TouchableOpacity onPress={() => setRemark('')} style={{ padding: 6 }}>
                        <Feather name="x-circle" size={15} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer Actions */}
          {!successReceipt && (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.btnCancel} onPress={onClose} disabled={loading}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
                onPress={handleProceedPayment}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="lock" size={14} color="#ffffff" />
                    <Text style={styles.btnPrimaryText}>
                      Proceed to Pay ₹{Number(amount || 0).toLocaleString('en-IN')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  balanceBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  balanceBannerVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16a34a',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#10b981',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  rupeeSymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    height: 48,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    outlineStyle: 'none',
  },
  remarkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    height: 44,
  },
  remarkInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    outlineStyle: 'none',
  },
  presetsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetChipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#047857',
  },
  gatewayBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 10,
  },
  gatewayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payuBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#047857',
  },
  payuBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  gatewayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#064e3b',
  },
  envPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  envPillTest: {
    backgroundColor: '#fef3c7',
  },
  envPillProd: {
    backgroundColor: '#dcfce7',
  },
  envPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
  },
  gatewayDesc: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  methodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  methodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  securityText: {
    fontSize: 11,
    color: '#047857',
  },
  modeToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modeToggleActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#10b981',
  },
  modeToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  modeToggleTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fafafa',
  },
  btnSimulate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginRight: 'auto',
  },
  btnSimulateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  btnCancel: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  btnCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#10b981',
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  successAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#059669',
    marginTop: 4,
  },
  successSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  receiptBox: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  receiptValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
});
