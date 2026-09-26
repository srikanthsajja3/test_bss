import os

partner_path = '/Users/srikanthchowdary/onebss_expo/src/screens/PartnerScreen.js'
with open(partner_path, 'r') as f:
    p_code = f.read()

# 1. Add states if missing
if 'resetPartnerModal' not in p_code:
    p_state_target = "const [deleteConfirmPartner, setDeleteConfirmPartner] = useState(null);"
    p_state_addition = """const [deleteConfirmPartner, setDeleteConfirmPartner] = useState(null);
  const [resetPartnerModal, setResetPartnerModal] = useState(null);
  const [partnerNewPass, setPartnerNewPass] = useState('');
  const [showPartnerPass, setShowPartnerPass] = useState(false);
  const [resettingPartnerPass, setResettingPartnerPass] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null);"""
    p_code = p_code.replace(p_state_target, p_state_addition)

# 2. Add Handlers if missing
if 'handleConfirmPartnerResetPass' not in p_code:
    p_handler_target = "  const filteredInternetPlans = internetPlans.filter((plan) => {"
    p_handler_addition = """  // Partner Reset Password & Impersonate Handlers
  const handleOpenPartnerResetPass = (partner) => {
    setResetPartnerModal(partner);
    setPartnerNewPass('oper' + Math.floor(1000 + Math.random() * 9000));
    setShowPartnerPass(true);
  };

  const handleConfirmPartnerResetPass = async () => {
    if (!resetPartnerModal || !partnerNewPass.trim()) return;
    setResettingPartnerPass(true);
    try {
      const res = await OneBssApi.resetPartnerPassword(resetPartnerModal.partner_id, partnerNewPass.trim());
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(`Password reset for ${resetPartnerModal.partner_name} (#${resetPartnerModal.partner_id})! New Password: ${partnerNewPass.trim()}`);
        setResetPartnerModal(null);
      } else {
        toast.error(data.message || 'Failed to reset partner password.');
      }
    } catch (e) {
      toast.error('Failed to reset partner password.');
    } finally {
      setResettingPartnerPass(false);
    }
  };

  const handleImpersonatePartner = async (partner) => {
    setImpersonatingId(partner.partner_id);
    try {
      const res = await OneBssApi.impersonatePartner(partner.partner_id);
      const data = res.data || {};
      if (data.success && data.token) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('onebss_token', data.token);
          if (data.impersonating) {
            localStorage.setItem('onebss_user', JSON.stringify(data.impersonating));
          }
        }
        toast.success(`Impersonating ${partner.partner_name} (#${partner.partner_id})! Token issued.`);
        setTimeout(() => {
          if (typeof window !== 'undefined') window.location.reload();
        }, 1000);
      } else {
        toast.error(data.message || 'Impersonation failed.');
      }
    } catch (e) {
      toast.error('Impersonation request failed.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const filteredInternetPlans = internetPlans.filter((plan) => {"
    p_code = p_code.replace(p_handler_target, p_handler_addition)

# 3. Add Quick Action Buttons in selectedPartner view
q_target = """              {/* IPTV PLANS BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(139, 92, 246, 0.4)', backgroundColor: 'rgba(139, 92, 246, 0.08)' }]}
                onPress={() => handleOpenIptvPlans(selectedPartner)}
              >
                <Feather name="tv" size={14} color="#8b5cf6" />
                <Text style={[styles.simpleActionBtnText, { color: '#8b5cf6' }]}>IPTV Plans</Text>
              </TouchableOpacity>"""

q_replacement = """              {/* IPTV PLANS BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(139, 92, 246, 0.4)', backgroundColor: 'rgba(139, 92, 246, 0.08)' }]}
                onPress={() => handleOpenIptvPlans(selectedPartner)}
              >
                <Feather name="tv" size={14} color="#8b5cf6" />
                <Text style={[styles.simpleActionBtnText, { color: '#8b5cf6' }]}>IPTV Plans</Text>
              </TouchableOpacity>

              {/* RESET PASSWORD BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(234, 179, 8, 0.4)', backgroundColor: 'rgba(234, 179, 8, 0.08)' }]}
                onPress={() => handleOpenPartnerResetPass(selectedPartner)}
              >
                <Feather name="key" size={14} color="#eab308" />
                <Text style={[styles.simpleActionBtnText, { color: '#eab308' }]}>Reset Password</Text>
              </TouchableOpacity>

              {/* IMPERSONATE BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(236, 72, 153, 0.4)', backgroundColor: 'rgba(236, 72, 153, 0.08)' }]}
                onPress={() => handleImpersonatePartner(selectedPartner)}
                disabled={impersonatingId === selectedPartner.partner_id}
              >
                <Feather name="user-check" size={14} color="#ec4899" />
                <Text style={[styles.simpleActionBtnText, { color: '#ec4899' }]}>
                  {impersonatingId === selectedPartner.partner_id ? 'Switching...' : 'Impersonate Partner'}
                </Text>
              </TouchableOpacity>"""

if q_target in p_code:
    p_code = p_code.replace(q_target, q_replacement)

# 4. Add Actions Column & Mobile Card Buttons in Main Partners Table
th_target = """              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 0.8 }]}>ID</Text>
                <Text style={[styles.th, { flex: 2.5 }]}>Partner & Company Name</Text>
                <Text style={[styles.th, { flex: 2.2 }]}>Contact Info</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Wallet (₹)</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Role</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Status</Text>
              </View>"""

th_replacement = """              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 0.8 }]}>ID</Text>
                <Text style={[styles.th, { flex: 2.2 }]}>Partner & Company Name</Text>
                <Text style={[styles.th, { flex: 2.0 }]}>Contact Info</Text>
                <Text style={[styles.th, { flex: 1.3 }]}>Wallet (₹)</Text>
                <Text style={[styles.th, { flex: 1.0 }]}>Role</Text>
                <Text style={[styles.th, { flex: 1.0 }]}>Status</Text>
                <Text style={[styles.th, { flex: 2.2, textAlign: 'right' }]}>Actions</Text>
              </View>"""

if th_target in p_code:
    p_code = p_code.replace(th_target, th_replacement)

tr_target = """                      <View style={[{ flex: 1.2 }, styles.td]}>
                        <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>"""

tr_replacement = """                      <View style={[{ flex: 1.0 }, styles.td]}>
                        <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      <View style={[{ flex: 2.2, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }, styles.td]}>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(234, 179, 8, 0.1)', borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)' }}
                          onPress={() => handleOpenPartnerResetPass(item)}
                        >
                          <Feather name="key" size={11} color="#eab308" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#eab308' }}>Reset Pass</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(236, 72, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.3)' }}
                          onPress={() => handleImpersonatePartner(item)}
                          disabled={impersonatingId === item.partner_id}
                        >
                          <Feather name="user-check" size={11} color="#ec4899" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#ec4899' }}>
                            {impersonatingId === item.partner_id ? '...' : 'Impersonate'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>"""

if tr_target in p_code:
    p_code = p_code.replace(tr_target, tr_replacement)

# Mobile Card Footer Target
m_footer_target = """                      <View style={[styles.mobileCardFooter, { justifyContent: 'space-between' }]}>
                        <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>"""

m_footer_replacement = """                      <View style={[styles.mobileCardFooter, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }]}>
                        <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(234, 179, 8, 0.1)', borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)' }}
                            onPress={() => handleOpenPartnerResetPass(item)}
                          >
                            <Feather name="key" size={11} color="#eab308" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#eab308' }}>Reset Pass</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(236, 72, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.3)' }}
                            onPress={() => handleImpersonatePartner(item)}
                            disabled={impersonatingId === item.partner_id}
                          >
                            <Feather name="user-check" size={11} color="#ec4899" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#ec4899' }}>
                              {impersonatingId === item.partner_id ? '...' : 'Impersonate'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>"""

if m_footer_target in p_code:
    p_code = p_code.replace(m_footer_target, m_footer_replacement)

# Render Partner Reset Password Modal if missing
modal_end_target = "  // 2. FULL SCREEN EDIT PARTNER VIEW"
partner_modal_jsx = """  // PARTNER RESET PASSWORD MODAL
  if (resetPartnerModal) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, maxWidth: 600, alignSelf: 'center', width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setResetPartnerModal(null)}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { marginTop: 16, padding: isMobile ? 16 : 24 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
              <Feather name="key" size={22} color="#eab308" />
              <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.textMain }}>
                Reset Password for #{resetPartnerModal.partner_id}
              </Text>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.formLabel}>PARTNER NAME</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain }}>
                {resetPartnerModal.partner_name} ({resetPartnerModal.company_name || 'Operator'})
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NEW PASSWORD</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1, fontSize: 15, fontWeight: '600' }]}
                  value={partnerNewPass}
                  onChangeText={setPartnerNewPass}
                  placeholder="Enter new password"
                  secureTextEntry={!showPartnerPass}
                  placeholderTextColor={COLORS.textDim}
                />
                <TouchableOpacity
                  style={{ padding: 10, backgroundColor: COLORS.bgSecondary, borderRadius: 6, borderWidth: 1, borderColor: COLORS.borderLight }}
                  onPress={() => setShowPartnerPass((s) => !s)}
                >
                  <Feather name={showPartnerPass ? 'eye-off' : 'eye'} size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(234, 179, 8, 0.12)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)' }}
                  onPress={() => setPartnerNewPass('oper' + Math.floor(1000 + Math.random() * 9000))}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#eab308' }}>Generate</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setResetPartnerModal(null)}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#eab308' }]}
                onPress={handleConfirmPartnerResetPass}
                disabled={resettingPartnerPass}
              >
                {resettingPartnerPass ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="check" size={14} color="#ffffff" />
                    <Text style={styles.btnPrimaryText}>Reset Partner Password</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 2. FULL SCREEN EDIT PARTNER VIEW"""

if modal_end_target in p_code and 'PARTNER RESET PASSWORD MODAL' not in p_code:
    p_code = p_code.replace(modal_end_target, partner_modal_jsx)

with open(partner_path, 'w') as f:
    f.write(p_code)

with open('/Users/srikanthchowdary/Downloads/test_bss-main/src/screens/PartnerScreen.js', 'w') as f:
    f.write(p_code)

print('Successfully added Partner Reset Pass and Impersonate buttons to table and quick actions!')
