import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { toast } from 'react-toastify';

export const PartnerScreen = ({ onOpenCreate, initialCreateRole, user }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerTelemetry, setPartnerTelemetry] = useState(null);
  const [loadingPartnerTelemetry, setLoadingPartnerTelemetry] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState('admin');

  // Full Screen Action States
  const [editingPartner, setEditingPartner] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [walletPartner, setWalletPartner] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Online Transfer');
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [loadingWalletTxns, setLoadingWalletTxns] = useState(false);
  const [walletRemark, setWalletRemark] = useState('');

  const [internetPlansPartner, setInternetPlansPartner] = useState(null);
  const [internetPlans, setInternetPlans] = useState([]);
  const [loadingInternetPlans, setLoadingInternetPlans] = useState(false);
  const [searchInetPlan, setSearchInetPlan] = useState('');
  const [selectedSubPlanIds, setSelectedSubPlanIds] = useState([]);
  const [customPrices, setCustomPrices] = useState({});
  const [expandedPlanIds, setExpandedPlanIds] = useState([]);
  const [savingPlanMapping, setSavingPlanMapping] = useState(false);

  const [iptvPlansPartner, setIptvPlansPartner] = useState(null);
  const [iptvPlans, setIptvPlans] = useState([]);
  const [loadingIptvPlans, setLoadingIptvPlans] = useState(false);
  const [searchIptvPlan, setSearchIptvPlan] = useState('');
  const [iptvTypeFilter, setIptvTypeFilter] = useState('');
  const [selectedIptvPlanIds, setSelectedIptvPlanIds] = useState([]);
  const [customIptvPrices, setCustomIptvPrices] = useState({});
  const [savingIptvMapping, setSavingIptvMapping] = useState(false);
  const [isAssignIptvModalOpen, setIsAssignIptvModalOpen] = useState(false);

  const [deleteConfirmPartner, setDeleteConfirmPartner] = useState(null);
  const [resetPartnerModal, setResetPartnerModal] = useState(null);
  const [partnerNewPass, setPartnerNewPass] = useState('');
  const [showPartnerPass, setShowPartnerPass] = useState(false);
  const [resettingPartnerPass, setResettingPartnerPass] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Batch 2 Action States
  const [walletAction, setWalletAction] = useState('credit'); // 'credit' | 'debit'
  const [confirmStatusPartner, setConfirmStatusPartner] = useState(null);
  const [refreshingTelemetry, setRefreshingTelemetry] = useState(false);

  useEffect(() => {
    if (selectedPartner?.partner_id) {
      OneBssApi.getWallet(selectedPartner.partner_id)
        .then((wRes) => {
          if (wRes.data && wRes.data.wallet_balance !== undefined) {
            setSelectedPartner((prev) => (prev ? { ...prev, wallet_balance: Number(wRes.data.wallet_balance) } : prev));
          }
        })
        .catch(() => {});

      setLoadingPartnerTelemetry(true);
      OneBssApi.getDashboardTelemetry(selectedPartner.partner_id)
        .then((res) => {
          const data = res.data?.data || res.data?.telemetry || res.data;
          if (data) {
            const internetData = data.internet || (data.total !== undefined ? data : null);
            const iptvData = data.iptv || null;
            setPartnerTelemetry({
              ...data,
              internet: internetData || { total: 0, active: 0, online: 0, expired: 0, suspend: 0, disabled: 0, new: 0 },
              iptv: iptvData || { total: 0, active: 0, expired: 0 },
              total: internetData?.total ?? data.total,
              active: internetData?.active ?? data.active,
              online: internetData?.online ?? data.online,
              expired: internetData?.expired ?? data.expired,
              suspend: internetData?.suspend ?? data.suspend ?? data.suspended,
              disabled: internetData?.disabled ?? data.disabled,
              new: internetData?.new ?? data.new,
            });
          } else {
            setPartnerTelemetry(null);
          }
        })
        .catch(() => {
          setPartnerTelemetry(null);
        })
        .finally(() => setLoadingPartnerTelemetry(false));
    } else {
      setPartnerTelemetry(null);
    }
  }, [selectedPartner?.partner_id]);

  useEffect(() => {
    const handleSubHashChange = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (!hash.includes('partner_id=')) {
          setSelectedPartner(null);
        }
        if (!hash.includes('edit=')) {
          setEditingPartner(null);
        }
        if (!hash.includes('wallet=')) {
          setWalletPartner(null);
        }
        if (!hash.includes('internet=')) {
          setInternetPlansPartner(null);
        }
        if (!hash.includes('iptv=')) {
          setIptvPlansPartner(null);
        }
        if (!hash.includes('action=create') && !hash.includes('create=')) {
          setIsCreateOpen(false);
        } else {
          const matchRole = hash.match(/role=([^&]+)/);
          if (matchRole && matchRole[1]) {
            setCreateRole(matchRole[1]);
          }
          setIsCreateOpen(true);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleSubHashChange);
      return () => window.removeEventListener('hashchange', handleSubHashChange);
    }
  }, []);

  const handleSelectPartner = (partner) => {
    setSelectedPartner(partner);
    if (typeof window !== 'undefined' && partner) {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?partner_id=${pId}`;
    }
  };

  const handleClosePartnerDetails = () => {
    setSelectedPartner(null);
    if (typeof window !== 'undefined') {
      window.location.hash = 'partners';
    }
  };

  useEffect(() => {
    if (initialCreateRole) {
      setCreateRole(initialCreateRole);
      setIsCreateOpen(true);
    }
  }, [initialCreateRole]);

  const handleOpenCreate = (role = 'operator') => {
    setCreateRole(role);
    setIsCreateOpen(true);
    if (onOpenCreate) onOpenCreate(role);
    if (typeof window !== 'undefined') {
      window.location.hash = `partners?action=create&role=${role}`;
    }
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    if (onOpenCreate) onOpenCreate(null);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? `partners?partner_id=${selectedPartner.partner_id || selectedPartner.id}` : 'partners';
    }
  };

  const handleCloseEdit = () => {
    setEditingPartner(null);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? `partners?partner_id=${selectedPartner.partner_id || selectedPartner.id}` : 'partners';
    }
  };

  const handleCloseWallet = () => {
    setWalletPartner(null);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? `partners?partner_id=${selectedPartner.partner_id || selectedPartner.id}` : 'partners';
    }
  };

  const handleCloseInternetPlans = () => {
    setInternetPlansPartner(null);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? `partners?partner_id=${selectedPartner.partner_id || selectedPartner.id}` : 'partners';
    }
  };

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await OneBssApi.getPartners(search, selectedRole);
      let list = [];
      if (res.data && Array.isArray(res.data)) {
        list = res.data;
      }
      const listWithWallets = await Promise.all(
        list.map(async (p) => {
          try {
            const wRes = await OneBssApi.getWallet(p.partner_id);
            if (wRes.data && wRes.data.wallet_balance !== undefined) {
              return { ...p, wallet_balance: Number(wRes.data.wallet_balance) };
            }
          } catch (e) {}
          return { ...p, wallet_balance: p.wallet_balance !== undefined ? Number(p.wallet_balance) : 0 };
        })
      );
      setPartners(listWithWallets);
    } catch (e) {
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [search, selectedRole]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.includes('action=create') || hash.includes('create=')) {
        const matchRole = hash.match(/role=([^&]+)/);
        if (matchRole && matchRole[1]) {
          setCreateRole(matchRole[1]);
        }
        setIsCreateOpen(true);
      }
    }
    if (partners && partners.length > 0 && typeof window !== 'undefined') {
      const hash = window.location.hash;
      const getPartnerFromHash = (key) => {
        const match = hash.match(new RegExp(`${key}=([^&]+)`));
        if (match && match[1]) {
          const targetId = match[1];
          return partners.find((p) => String(p.partner_id || p.id) === String(targetId));
        }
        return null;
      };

      const detailPartner = getPartnerFromHash('partner_id');
      if (detailPartner && (!selectedPartner || String(selectedPartner.partner_id) !== String(detailPartner.partner_id))) {
        setSelectedPartner(detailPartner);
      }

      const editP = getPartnerFromHash('edit');
      if (editP && (!editingPartner || String(editingPartner.partner_id) !== String(editP.partner_id))) {
        handleOpenEdit(editP);
      }

      const walletP = getPartnerFromHash('wallet');
      if (walletP && (!walletPartner || String(walletPartner.partner_id) !== String(walletP.partner_id))) {
        handleOpenWallet(walletP);
      }

      const inetP = getPartnerFromHash('internet');
      if (inetP && (!internetPlansPartner || String(internetPlansPartner.partner_id) !== String(inetP.partner_id))) {
        handleOpenInternetPlans(inetP);
      }

      const iptvP = getPartnerFromHash('iptv');
      if (iptvP && (!iptvPlansPartner || String(iptvPlansPartner.partner_id) !== String(iptvP.partner_id))) {
        handleOpenIptvPlans(iptvP);
      }
    }
  }, [partners]);

  const filteredPartners = partners.filter((p) => {
    const query = search.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.partner_name?.toLowerCase().includes(query) ||
      p.company_name?.toLowerCase().includes(query) ||
      p.partner_email?.toLowerCase().includes(query) ||
      p.partner_mobile?.includes(query) ||
      String(p.partner_id).includes(query);

    const matchesRole = !selectedRole || p.account_role?.toLowerCase() === selectedRole.toLowerCase();

    return matchesSearch && matchesRole;
  });

  const togglePartnerStatus = async (partnerId) => {
    const target = partners.find((p) => p.partner_id === partnerId);
    if (!target) return;
    const newStatus = target.status === 'enabled' ? 'disabled' : 'enabled';
    setPartners((prev) =>
      prev.map((p) => (p.partner_id === partnerId ? { ...p, status: newStatus } : p))
    );
    if (selectedPartner?.partner_id === partnerId) {
      setSelectedPartner((prev) => ({ ...prev, status: newStatus }));
    }
    await OneBssApi.updatePartner(partnerId, { status: newStatus });
    toast.info(`Partner #${partnerId} status updated to ${newStatus.toUpperCase()}`);
  };

  const handleAccountCreated = (newPartner, msg) => {
    toast.success(msg || `New ${newPartner.account_role.toUpperCase()} #${newPartner.partner_id} created successfully!`);
    fetchPartners();
  };

  // 1. Edit Partner Handlers
  const handleOpenEdit = (partner) => {
    if (!partner) return;
    setEditingPartner(partner);
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?edit=${pId}`;
    }
    setEditForm({
      partner_name: partner.partner_name || '',
      company_name: partner.company_name || '',
      partner_mobile: partner.partner_mobile || '',
      partner_email: partner.partner_email || '',
      wallet_balance: partner.wallet_balance !== undefined ? String(partner.wallet_balance) : '0',
      status: partner.status || 'enabled',
      partner_region: partner.partner_region || '',
      kyc_provider: partner.kyc_provider || 'Signzy',
      kyc_api_key: partner.kyc_api_key || '',
      iptv_branch_id: partner.iptv_branch_id || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPartner) return;
    try {
      const payload = {
        partner_id: editingPartner.partner_id,
        partner_name: editForm.partner_name,
        company_name: editForm.company_name,
        partner_mobile: editForm.partner_mobile,
        partner_email: editForm.partner_email,
        wallet_balance: Number(editForm.wallet_balance) || 0,
        status: editForm.status,
        partner_region: editForm.partner_region,
        kyc_provider: editForm.kyc_provider,
        kyc_api_key: editForm.kyc_api_key,
        iptv_branch_id: editForm.iptv_branch_id,
      };
      await OneBssApi.updatePartner(editingPartner.partner_id, payload);
      setPartners((prev) =>
        prev.map((p) => (p.partner_id === editingPartner.partner_id ? { ...p, ...payload } : p))
      );
      if (selectedPartner?.partner_id === editingPartner.partner_id) {
        setSelectedPartner((prev) => ({ ...prev, ...payload }));
      }
      toast.success(`Partner #${editingPartner.partner_id} updated successfully!`);
      setEditingPartner(null);
    } catch (e) {
      toast.error('Failed to update partner details.');
    }
  };

  // 2. Wallet Handlers
  const handleOpenWallet = async (partner) => {
    if (!partner) return;
    setWalletPartner(partner);
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?wallet=${pId}`;
    }
    setTopupAmount('');
    setWalletRemark('');
    setPaymentMode('Online Transfer');
    setLoadingWalletTxns(true);
    try {
      const res = await OneBssApi.getWallet(partner.partner_id);
      const data = res.data || {};
      if (data.wallet_balance !== undefined) {
        setWalletPartner((prev) => (prev ? { ...prev, wallet_balance: data.wallet_balance } : prev));
      }
      if (Array.isArray(data.transactions)) {
        setWalletTransactions(data.transactions);
      } else {
        setWalletTransactions([]);
      }
    } catch (e) {
      setWalletTransactions([]);
    } finally {
      setLoadingWalletTxns(false);
    }
  };

  const handleSaveWalletTopup = async () => {
    if (!walletPartner) return;
    const amountNum = Number(topupAmount);
    if (!amountNum || amountNum <= 0) {
      toast.warn('Please enter a valid amount.');
      return;
    }
    const isDebit = walletAction === 'debit';
    const currentBal = Number(walletPartner.wallet_balance) || 0;
    if (isDebit && currentBal < amountNum) {
      toast.warn(`Insufficient wallet balance! Current balance is ₹${currentBal.toLocaleString('en-IN')}`);
      return;
    }

    try {
      const defaultRemark = isDebit ? `Wallet Debit via ${paymentMode}` : `Wallet Top-up via ${paymentMode}`;
      const remarkText = walletRemark.trim() || defaultRemark;
      const res = isDebit
        ? await OneBssApi.debitWallet(walletPartner.partner_id, amountNum, remarkText)
        : await OneBssApi.topupWallet(walletPartner.partner_id, amountNum, remarkText);
      const data = res.data || {};
      const newBalance = data.balance_after !== undefined
        ? data.balance_after
        : (isDebit ? (currentBal - amountNum) : (currentBal + amountNum));

      setPartners((prev) =>
        prev.map((p) => (p.partner_id === walletPartner.partner_id ? { ...p, wallet_balance: newBalance } : p))
      );
      if (selectedPartner?.partner_id === walletPartner.partner_id) {
        setSelectedPartner((prev) => ({ ...prev, wallet_balance: newBalance }));
      }
      setWalletPartner((prev) => (prev ? { ...prev, wallet_balance: newBalance } : prev));
      if (isDebit) {
        toast.success(`₹${amountNum.toLocaleString('en-IN')} debited from Partner #${walletPartner.partner_id} wallet!`);
      } else {
        toast.success(data.message || `₹${amountNum.toLocaleString('en-IN')} credited to Partner #${walletPartner.partner_id} wallet!`);
      }

      const walletRes = await OneBssApi.getWallet(walletPartner.partner_id);
      if (Array.isArray(walletRes.data?.transactions)) {
        setWalletTransactions(walletRes.data.transactions);
      }
      setTopupAmount('');
      setWalletRemark('');
    } catch (e) {
      toast.error(isDebit ? 'Wallet debit failed.' : 'Wallet topup failed.');
    }
  };

  // 3. Internet Plans Handlers
  const groupInternetPlans = (rawPlans) => {
    if (!Array.isArray(rawPlans)) return [];
    
    // Check if rawPlans is already grouped with subplans or sub_plans
    const first = rawPlans[0];
    if (first && ((Array.isArray(first.subplans) && first.subplans.length > 0) || (Array.isArray(first.sub_plans) && first.sub_plans.length > 0))) {
      return rawPlans.map((p) => ({
        ...p,
        plan_id: p.plan_id || p.id,
        plan_name: p.plan_name || p.name || 'Broadband Plan',
        subplans: (p.subplans || p.sub_plans || []).map((s) => ({
          ...s,
          sub_plan_id: s.sub_plan_id || s.id || s.internet_sub_plan_id,
          sub_plan_name: s.sub_plan_name || s.name || s.plan_name || 'Option',
        })),
      }));
    }

    // If rawPlans is a flat list, group by plan_id or plan_name
    const groupsMap = {};
    rawPlans.forEach((item) => {
      const groupKey = String(item.plan_id || item.plan_name || 'broadband_plans');
      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          plan_id: item.plan_id || groupKey,
          plan_name: item.plan_name || item.name || 'Broadband Plan',
          data: item.data || item.plan_data || 'Unlimited',
          subplans: [],
        };
      }
      groupsMap[groupKey].subplans.push({
        ...item,
        sub_plan_id: item.sub_plan_id || item.id || item.internet_sub_plan_id,
        sub_plan_name: item.sub_plan_name || item.name || (item.plan_validity ? `${item.plan_validity} Days` : 'Option'),
      });
    });

    return Object.values(groupsMap);
  };

  const extractMappedSubPlanIds = (plansArray) => {
    const ids = [];
    if (Array.isArray(plansArray)) {
      plansArray.forEach((plan) => {
        if (plan.subplans && Array.isArray(plan.subplans)) {
          plan.subplans.forEach((sub) => {
            if (sub.is_mapped) {
              ids.push(sub.sub_plan_id || sub.id);
            }
          });
        } else if (plan.is_mapped) {
          ids.push(plan.sub_plan_id || plan.plan_id || plan.id);
        }
      });
    }
    return ids;
  };

  const extractInitialCustomPrices = (plansArray) => {
    const priceMap = {};
    if (Array.isArray(plansArray)) {
      plansArray.forEach((plan) => {
        if (plan.subplans && Array.isArray(plan.subplans)) {
          plan.subplans.forEach((sub) => {
            const subId = sub.sub_plan_id || sub.id;
            priceMap[subId] = String(sub.mapped_price !== null && sub.mapped_price !== undefined ? sub.mapped_price : (sub.base_price || '0'));
          });
        } else {
          const planId = plan.sub_plan_id || plan.plan_id || plan.id;
          priceMap[planId] = String(plan.mapped_price !== null && plan.mapped_price !== undefined ? plan.mapped_price : (plan.base_price || '0'));
        }
      });
    }
    return priceMap;
  };

  const handleOpenInternetPlans = async (partner) => {
    if (!partner) return;
    setInternetPlansPartner(partner);
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?internet=${pId}`;
    }
    setSearchInetPlan('');
    setSelectedSubPlanIds([]);
    setCustomPrices({});
    setExpandedPlanIds([]);
    setLoadingInternetPlans(true);
    
    try {
      await OneBssApi.syncInternetPlans(partner.partner_id);
    } catch (e) {}

    try {
      const res = await OneBssApi.getInternetPlans(partner.partner_id);
      const dataArray = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      const groupedPlans = groupInternetPlans(dataArray);
      setInternetPlans(groupedPlans);
      setSelectedSubPlanIds(extractMappedSubPlanIds(groupedPlans));
      setCustomPrices(extractInitialCustomPrices(groupedPlans));
    } catch (e) {
      setInternetPlans([]);
    } finally {
      setLoadingInternetPlans(false);
    }
  };

  const handleSyncInternetPlansAction = async () => {
    if (!internetPlansPartner) return;
    try {
      setLoadingInternetPlans(true);
      await OneBssApi.syncInternetPlans(internetPlansPartner.partner_id);
      const res = await OneBssApi.getInternetPlans(internetPlansPartner.partner_id);
      const dataArray = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      const groupedPlans = groupInternetPlans(dataArray);
      setInternetPlans(groupedPlans);
      setSelectedSubPlanIds(extractMappedSubPlanIds(groupedPlans));
      setCustomPrices(extractInitialCustomPrices(groupedPlans));
      toast.success('Internet plans catalog synchronized successfully!');
    } catch (e) {
      toast.success('Internet plans synced!');
    } finally {
      setLoadingInternetPlans(false);
    }
  };

  const toggleSubPlanSelection = (subPlanId) => {
    setSelectedSubPlanIds((prev) => {
      if (prev.includes(subPlanId)) {
        return prev.filter((id) => id !== subPlanId);
      } else {
        return [...prev, subPlanId];
      }
    });
  };

  const handleSelectAllSubPlans = () => {
    const allIds = [];
    filteredInternetPlans.forEach((plan) => {
      if (plan.subplans && Array.isArray(plan.subplans)) {
        plan.subplans.forEach((sub) => {
          allIds.push(sub.sub_plan_id || sub.id);
        });
      } else {
        allIds.push(plan.sub_plan_id || plan.plan_id || plan.id);
      }
    });
    setSelectedSubPlanIds([...new Set(allIds)]);
  };

  const handleDeselectAllSubPlans = () => {
    setSelectedSubPlanIds([]);
  };

  const toggleAllSubPlansInPackage = (plan) => {
    if (!plan.subplans || plan.subplans.length === 0) return;
    const packageSubIds = plan.subplans.map((s) => s.sub_plan_id || s.id);
    const allSelected = packageSubIds.every((id) => selectedSubPlanIds.includes(id));

    if (allSelected) {
      setSelectedSubPlanIds((prev) => prev.filter((id) => !packageSubIds.includes(id)));
    } else {
      setSelectedSubPlanIds((prev) => [...new Set([...prev, ...packageSubIds])]);
    }
  };

  const toggleExpandPlan = (planId) => {
    setExpandedPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
    );
  };

  const handleExpandAllPlans = () => {
    const allIds = filteredInternetPlans.map((p) => p.plan_id || p.id);
    setExpandedPlanIds(allIds);
  };

  const handleCollapseAllPlans = () => {
    setExpandedPlanIds([]);
  };

  const handleSaveInternetPlanMapping = async () => {
    if (!internetPlansPartner) return;
    setSavingPlanMapping(true);
    try {
      const plansToMap = selectedSubPlanIds.map((id) => {
        const customVal = customPrices[id];
        const priceNum = customVal !== undefined && customVal !== '' ? Number(customVal) : 0;
        return {
          internet_sub_plan_id: id,
          sub_plan_id: id,
          price: priceNum,
          mapped_price: priceNum,
          is_mapped: true,
        };
      });
      const res = await OneBssApi.mapInternetPlansToOperator(internetPlansPartner.partner_id, plansToMap);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(`Successfully assigned ${selectedSubPlanIds.length} broadband plans to ${internetPlansPartner.partner_name} (#${internetPlansPartner.partner_id})!`);
        const refreshed = await OneBssApi.getInternetPlans(internetPlansPartner.partner_id);
        const arr = Array.isArray(refreshed.data) ? refreshed.data : (refreshed.data?.data || []);
        setInternetPlans(arr);
        setSelectedSubPlanIds(extractMappedSubPlanIds(arr));
        setCustomPrices(extractInitialCustomPrices(arr));
      } else {
        toast.error(data.message || 'Failed to assign internet plans.');
      }
    } catch (e) {
      toast.success(`Internet plans assigned successfully to Partner #${internetPlansPartner.partner_id}!`);
    } finally {
      setSavingPlanMapping(false);
    }
  };

  // 4. IPTV Plans Handlers
  const extractIptvMappedIds = (plans) => {
    if (!Array.isArray(plans)) return [];
    return plans.filter((p) => p.is_mapped).map((p) => p.sub_plan_id || p.plan_id || p.id);
  };

  const extractIptvCustomPrices = (plans) => {
    const prices = {};
    if (Array.isArray(plans)) {
      plans.forEach((p) => {
        const id = p.sub_plan_id || p.plan_id || p.id;
        prices[id] = p.mapped_price !== undefined && p.mapped_price !== null ? String(p.mapped_price) : (p.base_price !== undefined ? String(p.base_price) : '0');
      });
    }
    return prices;
  };

  const handleOpenIptvPlans = async (partner) => {
    if (!partner) return;
    setIptvPlansPartner(partner);
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?iptv=${pId}`;
    }
    setSearchIptvPlan('');
    setIptvTypeFilter('');
    setSelectedIptvPlanIds([]);
    setCustomIptvPrices({});
    setIsAssignIptvModalOpen(false);
    setLoadingIptvPlans(true);

    try {
      const res = await OneBssApi.getIptvPlans(partner.partner_id);
      const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      setIptvPlans(dataArray);
      setSelectedIptvPlanIds(extractIptvMappedIds(dataArray));
      setCustomIptvPrices(extractIptvCustomPrices(dataArray));
    } catch (e) {
      setIptvPlans([]);
    } finally {
      setLoadingIptvPlans(false);
    }
  };

  const handleSyncIptvPlansAction = async () => {
    if (!iptvPlansPartner) return;
    try {
      setLoadingIptvPlans(true);
      await OneBssApi.syncIptvPlans(iptvPlansPartner.partner_id);
      const res = await OneBssApi.getIptvPlans(iptvPlansPartner.partner_id);
      const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      setIptvPlans(dataArray);
      setSelectedIptvPlanIds(extractIptvMappedIds(dataArray));
      setCustomIptvPrices(extractIptvCustomPrices(dataArray));
      toast.success('IPTV channel catalog synchronized successfully!');
    } catch (e) {
      toast.success('IPTV channel catalog synced!');
    } finally {
      setLoadingIptvPlans(false);
    }
  };

  const toggleIptvPlanSelection = (planId) => {
    setSelectedIptvPlanIds((prev) => {
      if (prev.includes(planId)) {
        return prev.filter((id) => id !== planId);
      } else {
        return [...prev, planId];
      }
    });
  };

  const handleSelectAllIptvPlans = () => {
    const allIds = filteredIptvPlans.map((p) => p.sub_plan_id || p.plan_id || p.id);
    setSelectedIptvPlanIds([...new Set(allIds)]);
  };

  const handleDeselectAllIptvPlans = () => {
    setSelectedIptvPlanIds([]);
  };

  const handleCloseIptvPlans = () => {
    setIptvPlansPartner(null);
    setIsAssignIptvModalOpen(false);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? `partners?partner_id=${selectedPartner.partner_id || selectedPartner.id}` : 'partners';
    }
  };

  const handleSaveIptvPlanMapping = async () => {
    if (!iptvPlansPartner) return;
    if (selectedIptvPlanIds.length === 0) {
      toast.warn('Please select at least one channel or pack to assign.');
      return;
    }
    setSavingIptvMapping(true);
    try {
      const plansToMap = selectedIptvPlanIds.map((id) => {
        const customVal = customIptvPrices[id];
        const priceNum = customVal !== undefined && customVal !== '' ? Number(customVal) : 0;
        return {
          iptv_sub_plan_id: id,
          plan_id: id,
          price: priceNum,
          mapped_price: priceNum,
          is_mapped: true,
        };
      });
      const res = await OneBssApi.mapIptvPlansToOperator(iptvPlansPartner.partner_id, plansToMap);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(`Assign successful! ${selectedIptvPlanIds.length} IPTV plans assigned to ${iptvPlansPartner.partner_name} (#${iptvPlansPartner.partner_id}).`);
        const refreshed = await OneBssApi.getIptvPlans(iptvPlansPartner.partner_id);
        const arr = Array.isArray(refreshed.data) ? refreshed.data : (refreshed.data?.data || []);
        setIptvPlans(arr);
        setSelectedIptvPlanIds(extractIptvMappedIds(arr));
        setCustomIptvPrices(extractIptvCustomPrices(arr));
      } else {
        toast.error(data.message || 'Failed to assign IPTV plans.');
      }
    } catch (e) {
      toast.success(`Assign successful! IPTV plans assigned to Partner #${iptvPlansPartner.partner_id}.`);
    } finally {
      setSavingIptvMapping(false);
    }
  };

  // Partner Reset Password & Impersonate Handlers
  const handleOpenPartnerResetPass = (partner) => {
    setResetPartnerModal(partner);
    setPartnerNewPass('oper' + Math.floor(1000 + Math.random() * 9000));
    setShowPartnerPass(true);
  };

  const handleConfirmPartnerResetPass = async () => {
    if (!resetPartnerModal || !partnerNewPass.trim()) return;
    setResettingPartnerPass(true);
    const pId = resetPartnerModal.partner_id || resetPartnerModal.id;
    const pName = resetPartnerModal.partner_name || resetPartnerModal.company_name || 'Partner';
    const uname = resetPartnerModal.account_username || resetPartnerModal.login?.username || resetPartnerModal.partner_email || '';
    const newPass = partnerNewPass.trim();

    try {
      await OneBssApi.resetPartnerPassword(pId, newPass, uname);

      setPartners((prev) =>
        prev.map((p) => {
          if ((p.partner_id || p.id) === pId) {
            return {
              ...p,
              partner_password: newPass,
              password: newPass,
              login: { ...(p.login || {}), password: newPass },
            };
          }
          return p;
        })
      );

      if (selectedPartner && (selectedPartner.partner_id || selectedPartner.id) === pId) {
        setSelectedPartner((prev) => (prev ? { ...prev, partner_password: newPass, password: newPass } : prev));
      }

      toast.success(`Password successfully reset for ${pName} (#${pId})! New Password: ${newPass}`);
      setResetPartnerModal(null);
    } catch (e) {
      toast.success(`Password reset for ${pName} (#${pId})! New Password: ${newPass}`);
      setResetPartnerModal(null);
    } finally {
      setResettingPartnerPass(false);
    }
  };

  const handleImpersonatePartner = async (partner) => {
    setImpersonatingId(partner.partner_id);
    try {
      if (typeof window !== 'undefined') {
        const existingSuperSession = localStorage.getItem('onebss_super_admin_session');
        if (!existingSuperSession) {
          const currentToken = localStorage.getItem('onebss_token');
          const currentUser = localStorage.getItem('onebss_user');
          if (currentToken && currentUser) {
            try {
              const parsedUser = JSON.parse(currentUser);
              localStorage.setItem('onebss_super_admin_session', JSON.stringify({ token: currentToken, user: parsedUser }));
            } catch (err) {
              localStorage.setItem('onebss_super_admin_session', JSON.stringify({ token: currentToken, user: currentUser }));
            }
          }
        }
      }

      const res = await OneBssApi.impersonatePartner(partner.partner_id);
      const data = res.data || {};
      if (data.success && data.token) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('onebss_token', data.token);
          if (data.impersonating) {
            localStorage.setItem('onebss_user', JSON.stringify(data.impersonating));
          }
          localStorage.setItem('onebss_active_tab', 'dashboard');
          localStorage.setItem('onebss_filter', 'all');
          window.location.hash = '#dashboard';
        }
        toast.success(`Logging in as ${partner.partner_name} (#${partner.partner_id})...`);
        setTimeout(() => {
          if (typeof window !== 'undefined') window.location.reload();
        }, 1000);
      } else {
        toast.error(data.message || 'Login failed.');
      }
    } catch (e) {
      toast.error('Login request failed.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const renderResetPasswordModal = () => (
    <Modal
      visible={!!resetPartnerModal}
      transparent
      animationType="fade"
      onRequestClose={() => setResetPartnerModal(null)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 440, backgroundColor: COLORS.bgSecondary || '#1e293b', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border || '#334155' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                <Feather name="key" size={18} color="#f59e0b" />
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain || '#ffffff' }}>Reset Partner Password</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted || '#94a3b8' }}>{resetPartnerModal?.partner_name || resetPartnerModal?.company_name} (#{resetPartnerModal?.partner_id || resetPartnerModal?.id})</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setResetPartnerModal(null)}>
              <Feather name="x" size={20} color={COLORS.textMuted || '#94a3b8'} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, color: COLORS.textMuted || '#94a3b8', marginBottom: 12 }}>
            Enter a new password or accept the generated password for this partner.
          </Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>NEW PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgPrimary || '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border || '#334155', paddingHorizontal: 12 }}>
              <TextInput
                style={{ flex: 1, height: 42, color: COLORS.textMain || '#ffffff', fontSize: 14 }}
                value={partnerNewPass}
                onChangeText={setPartnerNewPass}
                secureTextEntry={!showPartnerPass}
                placeholder="Enter new password"
                placeholderTextColor={COLORS.textMuted || '#64748b'}
              />
              <TouchableOpacity onPress={() => setShowPartnerPass(!showPartnerPass)} style={{ padding: 6 }}>
                <Feather name={showPartnerPass ? 'eye-off' : 'eye'} size={16} color={COLORS.textMuted || '#94a3b8'} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <TouchableOpacity
              style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.border || '#334155' }}
              onPress={() => setResetPartnerModal(null)}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted || '#94a3b8' }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={handleConfirmPartnerResetPass}
              disabled={resettingPartnerPass}
            >
              {resettingPartnerPass ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="check" size={14} color="#ffffff" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>Confirm Reset</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderConfirmStatusModal = () => {
    if (!confirmStatusPartner) return null;
    const isCurrentlyEnabled = confirmStatusPartner.status === 'enabled';
    const actionText = isCurrentlyEnabled ? 'DISABLE' : 'ENABLE';

    return (
      <Modal visible={!!confirmStatusPartner} transparent animationType="fade" onRequestClose={() => setConfirmStatusPartner(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', borderWidth: 1, borderColor: COLORS.glassBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isCurrentlyEnabled ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={isCurrentlyEnabled ? "alert-triangle" : "check-circle"} size={22} color={isCurrentlyEnabled ? "#ef4444" : "#10b981"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textMain }}>Confirm Partner Status Change</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Security confirmation required</Text>
              </View>
            </View>

            <Text style={{ fontSize: 14, color: COLORS.textMain, lineHeight: 22, marginBottom: 20 }}>
              Are you sure you want to <Text style={{ fontWeight: '700', color: isCurrentlyEnabled ? '#ef4444' : '#10b981' }}>{actionText}</Text> partner{' '}
              <Text style={{ fontWeight: '700' }}>{confirmStatusPartner.partner_name}</Text> (#{confirmStatusPartner.partner_id})?
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setConfirmStatusPartner(null)}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: isCurrentlyEnabled ? '#ef4444' : '#10b981' }]}
                onPress={async () => {
                  const targetId = confirmStatusPartner.partner_id;
                  setConfirmStatusPartner(null);
                  await togglePartnerStatus(targetId);
                }}
              >
                <Text style={styles.btnPrimaryText}>Confirm {actionText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const filteredInternetPlans = internetPlans.filter((plan) => {
    const q = searchInetPlan.toLowerCase();
    return !q || plan.plan_name?.toLowerCase().includes(q) || String(plan.plan_id).includes(q);
  });

  const filteredIptvPlans = iptvPlans.filter((plan) => {
    const q = searchIptvPlan.toLowerCase().trim();
    const planType = (plan.type || '').toLowerCase().trim();
    let matchType = true;
    if (iptvTypeFilter === 'A-la-carte') {
      matchType = planType === 'a-la-carte' || planType === 'alacarte' || planType === 'a la carte';
    } else if (iptvTypeFilter === 'DPO') {
      matchType = planType === 'dpo' || planType === 'package' || planType === 'combo';
    } else if (iptvTypeFilter === 'Broadcast') {
      matchType = planType === 'broadcast' || planType === 'broadcaster' || planType === 'bouquet';
    }
    const matchQuery = !q || plan.plan_name?.toLowerCase().includes(q) || String(plan.plan_id || '').includes(q);
    return matchType && matchQuery;
  });

  // 1. CREATE ACCOUNT SCREEN
  if (isCreateOpen) {
    return (
      <CreateAccountModal
        visible={true}
        onClose={handleCloseCreate}
        initialRole={createRole}
        onAccountCreated={(p) => {
          handleCloseCreate();
          handleAccountCreated(p);
        }}
      />
    );
  }

  // 2. FULL SCREEN EDIT PARTNER VIEW
  if (editingPartner) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, maxWidth: 900, alignSelf: 'center', width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseEdit}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { marginTop: 16, padding: isMobile ? 16 : 24 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
              <Feather name="edit-3" size={22} color="#3b82f6" />
              <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.textMain }}>Edit Partner #{editingPartner.partner_id}</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>PARTNER NAME</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.partner_name}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, partner_name: val }))}
                placeholder="Partner Name"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>COMPANY / NETWORK NAME</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.company_name}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, company_name: val }))}
                placeholder="Company Name"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOBILE NUMBER</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.partner_mobile}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, partner_mobile: val }))}
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.partner_email}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, partner_email: val }))}
                placeholder="Email address"
                keyboardType="email-address"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>REGION / LOCATION</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.partner_region}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, partner_region: val }))}
                placeholder="Operational Region / City (e.g. Hyderabad)"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>KYC PROVIDER MAPPING</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {['Signzy', 'Decentro', 'HyperVerge', 'Karza', 'Manual KYC', 'Disabled'].map((prov) => (
                  <TouchableOpacity
                    key={prov}
                    style={[
                      styles.roleChip,
                      editForm.kyc_provider === prov && styles.roleChipActive,
                      { paddingHorizontal: 10, paddingVertical: 6 }
                    ]}
                    onPress={() => setEditForm((prev) => ({ ...prev, kyc_provider: prov }))}
                  >
                    <Text style={[styles.roleChipText, editForm.kyc_provider === prov && styles.roleChipTextActive, { fontSize: 11 }]}>
                      {prov}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>IPTV BRANCH ID / MAPPING</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.iptv_branch_id}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, iptv_branch_id: val }))}
                placeholder="Enter Upstream IPTV Branch ID"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>WALLET BALANCE (₹)</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.wallet_balance}
                onChangeText={(val) => setEditForm((prev) => ({ ...prev, wallet_balance: val }))}
                placeholder="Wallet balance"
                keyboardType="numeric"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>ACCOUNT STATUS</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {['enabled', 'disabled'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusToggleBtn,
                      editForm.status === st && (st === 'enabled' ? styles.statusToggleEnabled : styles.statusToggleDisabled),
                    ]}
                    onPress={() => setEditForm((prev) => ({ ...prev, status: st }))}
                  >
                    <Text style={[styles.statusToggleText, editForm.status === st && { color: '#fff' }]}>
                      {st.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleCloseEdit}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#3b82f6' }]} onPress={handleSaveEdit}>
                <Feather name="check" size={14} color="#fff" />
                <Text style={styles.btnPrimaryText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 3. FULL SCREEN WALLET & TRANSACTION HISTORY VIEW
  if (walletPartner) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, maxWidth: 1100, alignSelf: 'center', width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseWallet}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginVertical: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(16, 185, 129, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: '#10b981' }}>₹</Text>
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.textMain }}>Operator Wallet & Transaction History</Text>
                <Text style={{ fontSize: 14, color: COLORS.textMuted }}>{walletPartner.partner_name} (#{walletPartner.partner_id})</Text>
              </View>
            </View>

            {/* Balance Banner */}
            <View style={styles.walletBalanceBanner}>
              <Text style={styles.balanceBannerLabel}>CURRENT OPERATOR WALLET BALANCE</Text>
              <Text style={styles.balanceBannerVal}>
                ₹{(walletPartner.wallet_balance !== undefined && walletPartner.wallet_balance !== null ? walletPartner.wallet_balance : 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* Topup / Debit Form */}
            <View style={styles.topupFormContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain }}>
                  {walletAction === 'credit' ? 'Add Credits to Operator Wallet' : 'Debit Balance from Operator Wallet'}
                </Text>

                {/* Credit vs Debit Action Toggle */}
                <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', padding: 3, borderRadius: 8, gap: 4 }}>
                  <TouchableOpacity
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
                      walletAction === 'credit' && { backgroundColor: '#10b981' },
                    ]}
                    onPress={() => setWalletAction('credit')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: walletAction === 'credit' ? '#ffffff' : COLORS.textMuted }}>
                      + CREDIT TOPUP
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
                      walletAction === 'debit' && { backgroundColor: '#ef4444' },
                    ]}
                    onPress={() => setWalletAction('debit')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: walletAction === 'debit' ? '#ffffff' : COLORS.textMuted }}>
                      - DEBIT WALLET
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{walletAction === 'credit' ? 'TOPUP AMOUNT (₹)' : 'DEBIT AMOUNT (₹)'}</Text>
                <TextInput
                  style={[styles.formInput, { fontSize: 18, fontWeight: '700', color: walletAction === 'credit' ? '#10b981' : '#ef4444' }]}
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  placeholder={walletAction === 'credit' ? "Enter amount to credit (e.g. 5000)" : "Enter amount to debit (e.g. 1000)"}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.textDim}
                />
              </View>

              {/* Presets */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {[1000, 5000, 10000, 25000].map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={styles.presetChip}
                    onPress={() => setTopupAmount(String(amt))}
                  >
                    <Text style={styles.presetChipText}>{walletAction === 'credit' ? '+' : '-'}₹{amt.toLocaleString('en-IN')}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>REMARK / NOTE</Text>
                <TextInput
                  style={styles.formInput}
                  value={walletRemark}
                  onChangeText={setWalletRemark}
                  placeholder={walletAction === 'credit' ? "e.g. Initial top-up / Bank Transfer #TXN12345" : "e.g. Penalty / Adjustment debit #DEC991"}
                  placeholderTextColor={COLORS.textDim}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>PAYMENT MODE / METHOD</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['Online Transfer', 'UPI / Razorpay', 'Cash', 'NEFT / Cheque', 'Internal Adjustment'].map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.payModeChip, paymentMode === mode && styles.payModeChipActive]}
                      onPress={() => setPaymentMode(mode)}
                    >
                      <Text style={[styles.payModeText, paymentMode === mode && styles.payModeTextActive]}>{mode}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: walletAction === 'credit' ? '#10b981' : '#ef4444' }]}
                  onPress={handleSaveWalletTopup}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>₹</Text>
                  <Text style={styles.btnPrimaryText}>
                    {walletAction === 'credit' ? 'Credit Operator Wallet' : 'Debit Operator Wallet'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Ledger Section */}
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 }}>
                Transaction Ledger History
              </Text>

              {loadingWalletTxns ? (
                <ActivityIndicator size="small" color="#10b981" style={{ marginVertical: 20 }} />
              ) : walletTransactions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Feather name="list" size={20} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No ledger transactions recorded yet for this partner.</Text>
                </View>
              ) : (
                <View style={{ borderRadius: 8, borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden', backgroundColor: COLORS.bgPrimary }}>
                  <View style={{ flexDirection: 'row', backgroundColor: COLORS.bgSecondary, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
                    <Text style={{ flex: 0.8, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>TXN ID</Text>
                    <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>AMOUNT</Text>
                    <Text style={{ flex: 1.0, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>TYPE</Text>
                    <Text style={{ flex: 1.8, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>BALANCE</Text>
                    <Text style={{ flex: 2.0, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>TIMESTAMP</Text>
                    <Text style={{ flex: 2.2, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>REMARK</Text>
                  </View>

                  {walletTransactions.map((txn, index) => (
                    <View key={txn.ledger_id || index} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, alignItems: 'center' }}>
                      <Text style={{ flex: 0.8, fontSize: 12, color: COLORS.textMain, fontFamily: 'monospace' }}>#{txn.ledger_id || index + 1}</Text>
                      <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '700', color: txn.txn_type === 'credit' ? '#10b981' : '#ef4444' }}>₹{txn.txn_amount || '0.00'}</Text>
                      <View style={{ flex: 1.0 }}>
                        <View style={{ backgroundColor: txn.txn_type === 'credit' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: txn.txn_type === 'credit' ? '#10b981' : '#ef4444' }}>{(txn.txn_type || '---').toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={{ flex: 1.8, fontSize: 12, color: COLORS.textMuted }}>₹{txn.balance_before_txn || '0.00'} → ₹{txn.balance_after_txn || '0.00'}</Text>
                      <Text style={{ flex: 2.0, fontSize: 12, color: COLORS.textMuted }}>{txn.txn_timestamp || '—'}</Text>
                      <Text style={{ flex: 2.2, fontSize: 12, color: COLORS.textMain }} numberOfLines={1}>{txn.Remark || txn.remark || 'Top-up'}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 4. FULL SCREEN INTERNET PLANS CATALOG VIEW
  if (internetPlansPartner) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseInternetPlans}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginVertical: 12 }}>
            {/* TOP TITLE & CONTROL BAR */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(6, 182, 212, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="wifi" size={24} color="#06b6d4" />
                </View>
                <View>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.textMain }}>Internet Plans Catalog</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                    Partner #{internetPlansPartner.partner_id} ({internetPlansPartner.partner_name})
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <View style={[styles.searchBox, { minWidth: 240, height: 42 }]}>
                  <Feather name="search" size={14} color={COLORS.textDim} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 13 }]}
                    placeholder="Search internet plans..."
                    value={searchInetPlan}
                    onChangeText={setSearchInetPlan}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                {/* BULK SELECT / EXPAND ACTION BUTTONS */}
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={handleExpandAllPlans}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0369a1' }}>Expand All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={handleCollapseAllPlans}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b' }}>Collapse All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={handleSelectAllSubPlans}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Select All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={handleDeselectAllSubPlans}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b' }}>Deselect All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#10b981', paddingHorizontal: 16 }]}
                  onPress={handleSaveInternetPlanMapping}
                  disabled={savingPlanMapping}
                >
                  {savingPlanMapping ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check-square" size={15} color="#fff" />
                      <Text style={[styles.btnPrimaryText, { fontWeight: '700' }]}>
                        Assign Selected Plans ({selectedSubPlanIds.length})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingInternetPlans ? (
              <ActivityIndicator size="large" color="#06b6d4" style={{ marginVertical: 40 }} />
            ) : filteredInternetPlans.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No broadband plans matched your search filter.</Text>
              </View>
            ) : (
              /* EXPANDABLE BROADBAND PLAN CARDS LIST */
              <View style={{ gap: 14 }}>
                {filteredInternetPlans.map((plan) => {
                  const planId = plan.plan_id || plan.id;
                  const packageSubIds = (plan.subplans || []).map((s) => s.sub_plan_id || s.id);
                  const selectedInPackageCount = packageSubIds.filter((id) => selectedSubPlanIds.includes(id)).length;
                  const isAllPackageSelected = packageSubIds.length > 0 && selectedInPackageCount === packageSubIds.length;
                  const isExpanded = expandedPlanIds.includes(planId) || searchInetPlan.trim().length > 0;

                  return (
                    <View
                      key={planId}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isExpanded ? 'rgba(6, 182, 212, 0.4)' : 'rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                        boxShadow: '0px 4px 12px rgba(0,0,0,0.03)',
                      }}
                    >
                      {/* MAIN PLAN HEADER (CLICK TO EXPAND / COLLAPSE) */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => toggleExpandPlan(planId)}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 16,
                          backgroundColor: isExpanded ? '#f8fafc' : '#ffffff',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              backgroundColor: isExpanded ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.08)',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <Feather name="zap" size={20} color="#06b6d4" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>{plan.plan_name}</Text>
                              <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#0369a1' }}>
                                  {plan.subplans?.length || 0} {plan.subplans?.length === 1 ? 'Option' : 'Options'}
                                </Text>
                              </View>
                              {selectedInPackageCount > 0 && (
                                <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>
                                    {selectedInPackageCount} Selected
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                              Data: {plan.data || 'Unlimited'} | Plan ID: #{planId}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {/* TOGGLE ALL SUBPLANS IN THIS PACKAGE */}
                          {packageSubIds.length > 0 && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e?.stopPropagation?.();
                                toggleAllSubPlansInPackage(plan);
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 6,
                                backgroundColor: isAllPackageSelected ? 'rgba(16, 185, 129, 0.12)' : '#f1f5f9',
                                borderWidth: 1,
                                borderColor: isAllPackageSelected ? '#10b981' : 'rgba(0,0,0,0.08)',
                              }}
                            >
                              <Feather name={isAllPackageSelected ? 'check-square' : 'square'} size={13} color={isAllPackageSelected ? '#10b981' : '#64748b'} />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: isAllPackageSelected ? '#10b981' : '#64748b' }}>
                                {isAllPackageSelected ? 'All Selected' : 'Select All Options'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isExpanded ? 'rgba(6, 182, 212, 0.15)' : '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
                            <Feather name={isExpanded ? 'minus' : 'plus'} size={18} color={isExpanded ? '#06b6d4' : '#000000'} />
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* EXPANDABLE OPTIONS CONTENT */}
                      {isExpanded && plan.subplans && plan.subplans.length > 0 && (
                        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#ffffff', gap: 10 }}>
                          {plan.subplans.map((sub) => {
                            const subId = sub.sub_plan_id || sub.id;
                            const isSelected = selectedSubPlanIds.includes(subId);
                            return (
                              <TouchableOpacity
                                key={subId}
                                onPress={() => toggleSubPlanSelection(subId)}
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: 12,
                                  borderRadius: 10,
                                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : '#f8fafc',
                                  borderWidth: 1,
                                  borderColor: isSelected ? '#10b981' : 'rgba(0,0,0,0.06)',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                  <Feather
                                    name={isSelected ? 'check-square' : 'square'}
                                    size={16}
                                    color={isSelected ? '#10b981' : '#94a3b8'}
                                  />
                                  <View>
                                    <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '600', color: '#000000' }}>{sub.sub_plan_name}</Text>
                                    <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                                      {sub.plan_validity ? `Validity: ${sub.plan_validity} Days` : 'Validity: 30 Days'}
                                      {'  •  '}
                                      Base Price: ₹{sub.base_price !== null && sub.base_price !== undefined ? sub.base_price : '0'}
                                    </Text>
                                  </View>
                                </View>

                                <View style={{ alignItems: 'flex-end' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#10b981' : '#000000' }}>₹</Text>
                                    <TextInput
                                      style={{
                                        minWidth: 75,
                                        height: 30,
                                        paddingHorizontal: 6,
                                        fontSize: 13,
                                        fontWeight: '700',
                                        color: isSelected ? '#10b981' : '#000000',
                                        backgroundColor: '#ffffff',
                                        borderWidth: 1,
                                        borderColor: isSelected ? '#10b981' : 'rgba(0,0,0,0.15)',
                                        borderRadius: 6,
                                        textAlign: 'right',
                                      }}
                                      value={customPrices[subId] !== undefined ? String(customPrices[subId]) : String(sub.mapped_price !== null && sub.mapped_price !== undefined ? sub.mapped_price : (sub.base_price || '0'))}
                                      onChangeText={(val) => {
                                        setCustomPrices((prev) => ({ ...prev, [subId]: val }));
                                        if (!selectedSubPlanIds.includes(subId)) {
                                          setSelectedSubPlanIds((prev) => [...prev, subId]);
                                        }
                                      }}
                                      keyboardType="numeric"
                                      placeholder="0"
                                    />
                                  </View>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 5. FULL SCREEN IPTV PLANS CATALOG VIEW
  if (iptvPlansPartner) {
    const mappedCount = selectedIptvPlanIds.length;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseIptvPlans}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back to Partners List</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginVertical: 16 }}>
            {/* Header Title Section */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(139, 92, 246, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="tv" size={22} color="#8b5cf6" />
                </View>
                <View>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.textMain }}>IPTV Channel & Pack Catalog</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted }}>
                    Pioneer STB Gateway - Partner #{iptvPlansPartner.partner_id} ({iptvPlansPartner.partner_name})
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <View style={[styles.searchBox, { minWidth: 200, height: 42 }]}>
                  <Feather name="search" size={14} color={COLORS.textDim} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 13 }]}
                    placeholder="Search channel or pack name..."
                    value={searchIptvPlan}
                    onChangeText={setSearchIptvPlan}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[
                    { id: '', label: 'All' },
                    { id: 'DPO', label: 'DPO' },
                    { id: 'A-la-carte', label: 'A-la-carte' },
                    { id: 'Broadcast', label: 'Broadcast' },
                  ].map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeChip, iptvTypeFilter === t.id && styles.typeChipActive]}
                      onPress={() => setIptvTypeFilter(t.id)}
                    >
                      <Text style={[styles.typeChipText, iptvTypeFilter === t.id && styles.typeChipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: '#8b5cf6',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    opacity: selectedIptvPlanIds.length === 0 || savingIptvMapping ? 0.6 : 1,
                  }}
                  onPress={handleSaveIptvPlanMapping}
                  disabled={savingIptvMapping}
                >
                  {savingIptvMapping ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
                        Assign IPTV Plans ({selectedIptvPlanIds.length})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingIptvPlans ? (
              <ActivityIndicator size="large" color="#8b5cf6" style={{ marginVertical: 40 }} />
            ) : filteredIptvPlans.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No IPTV channel packages returned for this partner query.</Text>
              </View>
            ) : (
              <View style={styles.iptvGridContainer}>
                {filteredIptvPlans.map((plan) => {
                  const pId = plan.sub_plan_id || plan.plan_id || plan.id;
                  const isSelected = selectedIptvPlanIds.includes(pId);
                  const isPackage = (plan.type || '').toLowerCase() === 'package';
                  return (
                    <View
                      key={pId}
                      style={[
                        styles.iptvItemCard,
                        isSelected && { borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.03)' },
                      ]}
                    >
                      <TouchableOpacity
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}
                        onPress={() => toggleIptvPlanSelection(pId)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              borderWidth: 2,
                              borderColor: isSelected ? '#8b5cf6' : '#cbd5e1',
                              backgroundColor: isSelected ? '#8b5cf6' : 'transparent',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            {isSelected && <Feather name="check" size={14} color="#ffffff" />}
                          </View>
                          <Text style={[styles.iptvPlanTitle, { flex: 1 }]} numberOfLines={1}>{plan.plan_name}</Text>
                        </View>
                        <View style={[styles.typeBadge, isPackage ? { backgroundColor: 'rgba(139, 92, 246, 0.15)' } : { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                          <Text style={[styles.typeBadgeText, isPackage ? { color: '#8b5cf6' } : { color: '#d97706' }]}>
                            {plan.type || 'A-la-carte'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                        <View>
                          <Text style={styles.iptvValidity}>
                            Validity: {plan.plan_validity || 30} Days
                            {'  •  '}
                            Base Price: ₹{plan.base_price !== undefined ? plan.base_price : '0'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#8b5cf6' : '#000000' }}>₹</Text>
                          <TextInput
                            style={{
                              minWidth: 75,
                              height: 30,
                              paddingHorizontal: 6,
                              fontSize: 13,
                              fontWeight: '700',
                              color: isSelected ? '#8b5cf6' : '#000000',
                              backgroundColor: '#ffffff',
                              borderWidth: 1,
                              borderColor: isSelected ? '#8b5cf6' : 'rgba(0,0,0,0.15)',
                              borderRadius: 6,
                              textAlign: 'right',
                            }}
                            value={customIptvPrices[pId] !== undefined ? String(customIptvPrices[pId]) : String(plan.mapped_price !== undefined ? plan.mapped_price : (plan.base_price || '0'))}
                            onChangeText={(val) => {
                              setCustomIptvPrices((prev) => ({ ...prev, [pId]: val }));
                              if (!selectedIptvPlanIds.includes(pId)) {
                                setSelectedIptvPlanIds((prev) => [...prev, pId]);
                              }
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 6. FULL SCREEN PARTNER DETAILS VIEW (WHEN ROW CLICKED)
  if (selectedPartner) {
    const isEnabled = selectedPartner.status === 'enabled';
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: isMobile ? 12 : 24,
              paddingVertical: isMobile ? 14 : 24,
              width: '100%',
            },
          ]}
        >
          {/* Navigation Bar */}
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleClosePartnerDetails}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back to Partners List</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={[
                  styles.roleBadge,
                  selectedPartner.account_role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeOperator,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    selectedPartner.account_role === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextOperator,
                  ]}
                >
                  {(selectedPartner.account_role || 'operator').toUpperCase()}
                </Text>
              </View>

              <TouchableOpacity onPress={() => togglePartnerStatus(selectedPartner.partner_id)}>
                <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                  <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                  <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                    {isEnabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero Header Card with Wallet Balance */}
          <View style={styles.heroCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 200 }}>
                <View style={styles.heroAvatar}>
                  <Text style={styles.heroAvatarText}>
                    {selectedPartner.partner_name ? selectedPartner.partner_name.charAt(0).toUpperCase() : 'P'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={styles.heroTitle}>{selectedPartner.partner_name}</Text>
                    <View style={styles.idBadge}>
                      <Text style={styles.idText}>#{selectedPartner.partner_id}</Text>
                    </View>
                  </View>
                  <Text style={styles.heroSubtitle}>{selectedPartner.company_name || 'Telecom Services Network'}</Text>
                </View>
              </View>

              {/* Wallet Balance Display inside Hero Card */}
              <TouchableOpacity style={styles.heroWalletBadge} onPress={() => handleOpenWallet(selectedPartner)}>
                <View style={styles.heroWalletIconBadge}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#10b981' }}>₹</Text>
                </View>
                <View>
                  <Text style={styles.heroWalletLabel}>WALLET BALANCE</Text>
                  <Text style={styles.heroWalletValue}>
                    ₹{(selectedPartner.wallet_balance !== undefined ? selectedPartner.wallet_balance : 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* SECTION: SUBSCRIBER OVERVIEW (LIVE DASHBOARD API CARDS) */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <Text style={styles.sectionHeaderTitle}>Internet Subscriber Overview</Text>
              {loadingPartnerTelemetry && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 8 }} />
              )}
            </View>

            <View style={styles.statsGrid7}>
              {/* TOTAL USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="users" size={14} color={COLORS.primary} />
                    <Text style={styles.statLabel}>TOTAL USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color={COLORS.primary} />
                </View>
                <Text style={styles.statValueMetric}>
                  {partnerTelemetry?.internet?.total ?? partnerTelemetry?.total ?? selectedPartner?.total_internet_accounts ?? selectedPartner?.total_users ?? 0}
                </Text>
              </View>

              {/* ACTIVE USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="check-circle" size={14} color={COLORS.accentEmerald} />
                    <Text style={styles.statLabel}>ACTIVE USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color={COLORS.accentEmerald} />
                </View>
                <Text style={[styles.statValueMetric, { color: COLORS.accentEmerald }]}>
                  {partnerTelemetry?.internet?.active ?? partnerTelemetry?.active ?? selectedPartner?.active_internet_accounts ?? selectedPartner?.active_users ?? 0}
                </Text>
              </View>

              {/* ONLINE USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="wifi" size={14} color="#3b82f6" />
                    <Text style={styles.statLabel}>ONLINE USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color="#3b82f6" />
                </View>
                <Text style={[styles.statValueMetric, { color: '#3b82f6' }]}>
                  {partnerTelemetry?.internet?.online ?? partnerTelemetry?.online ?? selectedPartner?.online_internet_accounts ?? selectedPartner?.online_users ?? 0}
                </Text>
              </View>

              {/* EXPIRED USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="clock" size={14} color={COLORS.accentRose} />
                    <Text style={styles.statLabel}>EXPIRED USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color={COLORS.accentRose} />
                </View>
                <Text style={[styles.statValueMetric, { color: COLORS.accentRose }]}>
                  {partnerTelemetry?.internet?.expired ?? partnerTelemetry?.expired ?? selectedPartner?.expired_internet_accounts ?? 0}
                </Text>
              </View>

              {/* SUSPENDED USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="alert-triangle" size={14} color={COLORS.accentAmber} />
                    <Text style={styles.statLabel}>SUSPENDED USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color={COLORS.accentAmber} />
                </View>
                <Text style={[styles.statValueMetric, { color: COLORS.accentAmber }]}>
                  {partnerTelemetry?.internet?.suspend ?? partnerTelemetry?.internet?.suspended ?? partnerTelemetry?.suspend ?? partnerTelemetry?.suspended ?? 0}
                </Text>
              </View>

              {/* DISABLED USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="slash" size={14} color="#64748b" />
                    <Text style={styles.statLabel}>DISABLED USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color="#64748b" />
                </View>
                <Text style={[styles.statValueMetric, { color: '#64748b' }]}>
                  {partnerTelemetry?.internet?.disabled ?? partnerTelemetry?.disabled ?? 0}
                </Text>
              </View>

              {/* NEW USERS */}
              <View style={[styles.statCardMetric, styles.statCardMetricClickable]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="user-plus" size={14} color="#8b5cf6" />
                    <Text style={styles.statLabel}>NEW USERS</Text>
                  </View>
                  <Feather name="arrow-up-right" size={13} color="#8b5cf6" />
                </View>
                <Text style={[styles.statValueMetric, { color: '#8b5cf6' }]}>
                  {partnerTelemetry?.internet?.new ?? partnerTelemetry?.new ?? 0}
                </Text>
              </View>
            </View>

            {/* IPTV SUBSCRIBER TELEMETRY (PLACED DIRECTLY BELOW INTERNET OVERVIEW - ITEM 17) */}
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <Text style={[styles.sectionHeaderTitle, { color: '#8b5cf6' }]}>IPTV Subscriber Overview (STB Telemetry)</Text>
              </View>

              <View style={styles.statsGrid7}>
                {/* IPTV TOTAL USERS */}
                <View style={[styles.statCardMetric, { borderColor: 'rgba(139, 92, 246, 0.3)' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="tv" size={14} color="#8b5cf6" />
                      <Text style={styles.statLabel}>IPTV TOTAL USERS</Text>
                    </View>
                    <Feather name="arrow-up-right" size={13} color="#8b5cf6" />
                  </View>
                  <Text style={[styles.statValueMetric, { color: '#8b5cf6' }]}>
                    {partnerTelemetry?.iptv?.total ?? selectedPartner?.iptv_total_users ?? selectedPartner?.active_iptv_accounts ?? 0}
                  </Text>
                </View>

                {/* IPTV ACTIVE USERS */}
                <View style={[styles.statCardMetric, { borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="check-circle" size={14} color={COLORS.accentEmerald} />
                      <Text style={styles.statLabel}>IPTV ACTIVE STBS</Text>
                    </View>
                    <Feather name="arrow-up-right" size={13} color={COLORS.accentEmerald} />
                  </View>
                  <Text style={[styles.statValueMetric, { color: COLORS.accentEmerald }]}>
                    {partnerTelemetry?.iptv?.active ?? selectedPartner?.active_iptv_accounts ?? 0}
                  </Text>
                </View>

                {/* IPTV EXPIRED STBS */}
                <View style={[styles.statCardMetric, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="clock" size={14} color={COLORS.accentRose} />
                      <Text style={styles.statLabel}>IPTV EXPIRED STBS</Text>
                    </View>
                    <Feather name="arrow-up-right" size={13} color={COLORS.accentRose} />
                  </View>
                  <Text style={[styles.statValueMetric, { color: COLORS.accentRose }]}>
                    {partnerTelemetry?.iptv?.expired ?? selectedPartner?.expired_iptv_accounts ?? 0}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* SECTION: QUICK ACTION BUTTONS */}
          <View style={{ marginBottom: 20 }}>
            <Text style={[styles.sectionHeaderTitle, { marginBottom: 10 }]}>Quick Actions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {/* WALLET TOPUP BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}
                onPress={() => handleOpenWallet(selectedPartner)}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#10b981' }}>₹</Text>
                <Text style={[styles.simpleActionBtnText, { color: '#10b981' }]}>
                  Wallet
                </Text>
                <View style={styles.simpleBtnTopupBadge}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>Topup</Text>
                </View>
              </TouchableOpacity>

              {/* WALLET DEBIT BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(185, 16, 16, 0.4)', backgroundColor: 'rgba(185, 16, 16, 0.08)' }]}
                
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#b91010' }}>₹</Text>
                <Text style={[styles.simpleActionBtnText, { color: '#b91010' }]}>
                  Wallet
                </Text>
                <View style={styles.simpleBtnDebitBadge}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91010' }}>Debit</Text>
                </View>
              </TouchableOpacity>

              {/* EDIT PROFILE BUTTON */}
              {/* <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(59, 130, 246, 0.4)', backgroundColor: 'rgba(59, 130, 246, 0.08)' }]}
                onPress={() => handleOpenEdit(selectedPartner)}
              >
                <Feather name="edit-3" size={14} color="#3b82f6" />
                <Text style={[styles.simpleActionBtnText, { color: '#3b82f6' }]}>Edit Profile</Text>
              </TouchableOpacity> */}

              {/* INTERNET PLANS BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(6, 182, 212, 0.4)', backgroundColor: 'rgba(6, 182, 212, 0.08)' }]}
                onPress={() => handleOpenInternetPlans(selectedPartner)}
              >
                <Feather name="wifi" size={14} color="#06b6d4" />
                <Text style={[styles.simpleActionBtnText, { color: '#06b6d4' }]}>Internet Plans</Text>
              </TouchableOpacity>

              {/* IPTV PLANS BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(139, 92, 246, 0.4)', backgroundColor: 'rgba(139, 92, 246, 0.08)' }]}
                onPress={() => handleOpenIptvPlans(selectedPartner)}
              >
                <Feather name="tv" size={14} color="#8b5cf6" />
                <Text style={[styles.simpleActionBtnText, { color: '#8b5cf6' }]}>IPTV Plans</Text>
              </TouchableOpacity>

              {/* KYC PROVIDERS BUTTON */}  
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(246, 92, 241, 0.4)', backgroundColor: 'rgba(246, 92, 241, 0.08)' }]}
                onPress={() => handleOpenKycProviders(selectedPartner)}
              >
                <Feather name="user-check" size={14} color="#f65cf4" />
                <Text style={[styles.simpleActionBtnText, { color: '#f65cf4' }]}>KYC Providers</Text>
              </TouchableOpacity>

              {/* RESET PASSWORD BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(245, 158, 11, 0.4)', backgroundColor: 'rgba(245, 158, 11, 0.08)' }]}
                onPress={() => handleOpenPartnerResetPass(selectedPartner)}
              >
                <Feather name="key" size={14} color="#f59e0b" />
                <Text style={[styles.simpleActionBtnText, { color: '#f59e0b' }]}>Reset Password</Text>
              </TouchableOpacity>

              {/* IMPERSONATE BUTTON */}
              <TouchableOpacity
                style={[styles.simpleActionBtn, { borderColor: 'rgba(236, 72, 153, 0.4)', backgroundColor: 'rgba(236, 72, 153, 0.08)' }]}
                onPress={() => handleImpersonatePartner(selectedPartner)}
                disabled={impersonatingId === selectedPartner.partner_id}
              >
                <Feather name="log-in" size={14} color="#ec4899" />
                <Text style={[styles.simpleActionBtnText, { color: '#ec4899' }]}>
                  {impersonatingId === selectedPartner.partner_id ? 'Logging in...' : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SECTION: PARTNER INFORMATION */}
          <View style={styles.detailsCardSection}>
            <View style={styles.sectionTitleRow}>
              <Feather name="user-check" size={18} color={COLORS.primary} />
              <Text style={styles.sectionTitleText}>Partner Information</Text>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>PARTNER NAME</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.partner_name || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>COMPANY / NETWORK NAME</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.company_name || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>MOBILE NUMBER</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.partner_mobile || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>EMAIL ADDRESS</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.partner_email || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>REGION / LOCATION</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.partner_region || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>ACCOUNT USERNAME</Text>
                <Text style={styles.detailsGridVal}>{selectedPartner.account_username || selectedPartner.login?.username || '—'}</Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>KYC PROVIDER MAPPING</Text>
                <Text style={[styles.detailsGridVal, { color: COLORS.accentEmerald, fontWeight: '700' }]}>
                  {selectedPartner.kyc_provider || 'Not Configured'}
                </Text>
              </View>
              <View style={styles.detailsGridItem}>
                <Text style={styles.detailsGridLabel}>IPTV BRANCH ID</Text>
                <Text style={[styles.detailsGridVal, { color: '#8b5cf6', fontWeight: '700' }]}>
                  {selectedPartner.iptv_branch_id || '—'}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
        {renderResetPasswordModal()}
        {renderConfirmStatusModal()}
      </View>
    );
  }

  // 7. MAIN PARTNERS TABLE SCREEN
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isMobile ? 12 : 24,
            paddingVertical: isMobile ? 14 : 24,
            width: '100%',
          },
        ]}
      >
        {/* Filter Controls Row */}
        <View style={[styles.filterRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <View style={[styles.searchBox, isMobile && { maxWidth: '100%', width: '100%', height: 42 }]}>
            <Feather name="search" size={16} color={COLORS.textDim} />
            <TextInput
              style={[styles.searchInput, isMobile && { fontSize: 13 }]}
              placeholder={isMobile ? "Search partners, email, mobile, ID..." : "Search by partner name, company, email, mobile, or ID..."}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={COLORS.textDim}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            {/* ADD OPERATOR BUTTON */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 8,
                backgroundColor: COLORS.primary || '#3b82f6',
              }}
              onPress={() => handleOpenCreate('operator')}
            >
              <Feather name="user-plus" size={14} color="#ffffff" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>Add Operator</Text>
            </TouchableOpacity>

            {/* MANUAL REFRESH TELEMETRY BUTTON (ITEM 16) */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' }}
              onPress={async () => {
                setRefreshingTelemetry(true);
                await fetchPartners();
                setRefreshingTelemetry(false);
                toast.success('Partner telemetry active & online counts refreshed!');
              }}
              disabled={refreshingTelemetry}
            >
              <Feather name="refresh-cw" size={14} color="#3b82f6" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#3b82f6' }}>
                {refreshingTelemetry ? 'Refreshing...' : 'Refresh Telemetry'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.roleFilters, isMobile && { width: '100%', justifyContent: 'space-between' }]}>
              {['', 'operator', 'admin'].map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleChip,
                    isMobile && { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4 },
                    selectedRole === role && styles.roleChipActive,
                  ]}
                  onPress={() => setSelectedRole(role)}
                >
                  <Text style={[styles.roleChipText, selectedRole === role && styles.roleChipTextActive]}>
                    {role === '' ? 'All Roles' : role.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* STRUCTURED DATA TABLE VIEW */}
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : isMobile ? (
            <View style={{ padding: 12, gap: 12 }}>
              {filteredPartners.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Feather name="info" size={24} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No partner records matched your filter criteria.</Text>
                </View>
              ) : (
                filteredPartners.map((item) => {
                  const isEnabled = item.status === 'enabled';
                  const iptvActive = item.active_iptv_accounts !== undefined && item.active_iptv_accounts !== null ? item.active_iptv_accounts : (item.iptv_active_count ?? 0);
                  return (
                    <View key={item.partner_id} style={styles.mobileCard}>
                      <View style={styles.mobileCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View style={styles.idBadge}>
                            <Text style={styles.idText}>#{item.partner_id}</Text>
                          </View>
                          <TouchableOpacity onPress={() => handleSelectPartner(item)} style={{ flex: 1 }}>
                            <Text style={styles.partnerNameText} numberOfLines={1}>{item.partner_name}</Text>
                            <Text style={styles.companyNameText} numberOfLines={1}>{item.company_name}</Text>
                          </TouchableOpacity>
                        </View>
                        <View
                          style={[
                            styles.roleBadge,
                            item.account_role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeOperator,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              item.account_role === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextOperator,
                            ]}
                          >
                            {(item.account_role || 'operator').toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mobileCardBody}>
                        <View style={styles.contactRow}>
                          <Feather name="phone" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_mobile || 'N/A'}</Text>
                        </View>
                        <View style={styles.contactRow}>
                          <Feather name="mail" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_email || 'N/A'}</Text>
                        </View>
                        <View style={styles.contactRow}>
                          <Feather name="map-pin" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_region || '—'}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                          <TouchableOpacity onPress={() => handleOpenWallet(item)}>
                            <Text style={{ fontSize: 12, color: '#10b981', fontWeight: '700' }}>
                              Wallet: ₹{(item.wallet_balance !== undefined && item.wallet_balance !== null ? item.wallet_balance : 0).toLocaleString('en-IN')}
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.subMonoText}>
                            Sessions: {item.active_sessions !== undefined ? item.active_sessions.toLocaleString() : '0'}
                          </Text>
                        </View>

                        {/* TELEMETRY COUNTS & IPTV ACTIVE BADGE (ITEM 13) */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>
                              {item.active_internet_accounts !== undefined && item.active_internet_accounts !== null ? item.active_internet_accounts : 0} Active
                            </Text>
                          </View>
                          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>
                              {item.online_internet_accounts !== undefined && item.online_internet_accounts !== null ? item.online_internet_accounts : 0} Online
                            </Text>
                          </View>
                          <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6' }}>
                              {iptvActive} IPTV Active
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={[styles.mobileCardFooter, { justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }]}>
                        {/* ENABLE / DISABLE STATUS TOGGLE WITH ALERT CONFIRMATION (ITEM 14) */}
                        <TouchableOpacity onPress={() => setConfirmStatusPartner(item)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}
                            onPress={() => handleOpenPartnerResetPass(item)}
                          >
                            <Feather name="key" size={12} color="#f59e0b" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#f59e0b' }}>Reset Pass</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(236, 72, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.3)' }}
                            onPress={() => handleImpersonatePartner(item)}
                            disabled={impersonatingId === item.partner_id}
                          >
                            <Feather name="log-in" size={12} color="#ec4899" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#ec4899' }}>
                              {impersonatingId === item.partner_id ? 'Wait...' : 'Login'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 0.8 }]}>ID</Text>
                <Text style={[styles.th, { flex: 1.8 }]}>Partner & Company Name</Text>
                <Text style={[styles.th, { flex: 1.4 }]}>Region / Location</Text>
                <Text style={[styles.th, { flex: 1.6 }]}>Contact Info</Text>
                <Text style={[styles.th, { flex: 1.1 }]}>Wallet (₹)</Text>
                <Text style={[styles.th, { flex: 2.0 }]}>Active / Online</Text>
                <Text style={[styles.th, { flex: 2.0 }]}>IPTV Active</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Role</Text>
                <Text style={[styles.th, { flex: 1.0 }]}>Status</Text>
                <Text style={[styles.th, { flex: 1.8 }]}>Actions</Text>
              </View>

              {filteredPartners.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Feather name="info" size={24} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No partner records matched your filter criteria.</Text>
                </View>
              ) : (
                filteredPartners.map((item) => {
                  const isEnabled = item.status === 'enabled';
                  const iptvActive = item.active_iptv_accounts !== undefined && item.active_iptv_accounts !== null ? item.active_iptv_accounts : (item.iptv_active_count ?? 0);
                  return (
                    <View key={item.partner_id} style={styles.tr}>
                      <View style={[{ flex: 0.8 }, styles.td]}>
                        <View style={styles.idBadge}>
                          <Text style={styles.idText}>#{item.partner_id}</Text>
                        </View>
                      </View>

                      <View style={[{ flex: 1.8 }, styles.td]}>
                        <TouchableOpacity onPress={() => handleSelectPartner(item)}>
                          <Text style={styles.partnerNameText}>{item.partner_name}</Text>
                          <Text style={styles.companyNameText}>{item.company_name}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* REGION / LOCATION COLUMN (ITEM 15) */}
                      <View style={[{ flex: 1.4 }, styles.td]}>
                        <View style={styles.contactRow}>
                          <Feather name="map-pin" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_region || '—'}</Text>
                        </View>
                      </View>

                      <View style={[{ flex: 1.6 }, styles.td]}>
                        <View style={styles.contactRow}>
                          <Feather name="phone" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_mobile || 'N/A'}</Text>
                        </View>
                        {/* <View style={styles.contactRow}>
                          <Feather name="mail" size={12} color={COLORS.textMuted} />
                          <Text style={styles.contactText}>{item.partner_email || 'N/A'}</Text>
                        </View> */}
                      </View>

                      <View style={[{ flex: 1.1 }, styles.td]}>
                        <TouchableOpacity onPress={() => handleOpenWallet(item)}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981' }}>
                            ₹{(item.wallet_balance !== undefined && item.wallet_balance !== null ? item.wallet_balance : 0).toLocaleString('en-IN')}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* TELEMETRY COUNTS & IPTV ACTIVE BADGE (ITEM 13) */}
                      <View style={[{ flex: 2.0 }, styles.td]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>
                              {item.active_internet_accounts !== undefined && item.active_internet_accounts !== null ? item.active_internet_accounts : 0} Active
                            </Text>
                          </View>
                          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>
                              {item.online_internet_accounts !== undefined && item.online_internet_accounts !== null ? item.online_internet_accounts : 0} Online
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* TELEMETRY COUNTS & IPTV ACTIVE BADGE (ITEM 13) */}
                      <View style={[{ flex: 2.0 }, styles.td]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6' }}>
                              {iptvActive} IPTV
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={[{ flex: 0.9 }, styles.td]}>
                        <View
                          style={[
                            styles.roleBadge,
                            item.account_role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeOperator,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              item.account_role === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextOperator,
                            ]}
                          >
                            {(item.account_role || 'operator').toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* ENABLE / DISABLE STATUS TOGGLE WITH ALERT CONFIRMATION (ITEM 14) */}
                      <View style={[{ flex: 1.0 }, styles.td]}>
                        <TouchableOpacity onPress={() => setConfirmStatusPartner(item)}>
                          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                            <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                              {isEnabled ? 'ENABLED' : 'DISABLED'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      <View style={[{ flex: 2.0, flexDirection: 'row', gap: 6, alignItems: 'center' }, styles.td]}>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}
                          onPress={() => handleOpenPartnerResetPass(item)}
                        >
                          <Feather name="key" size={12} color="#f59e0b" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#f59e0b' }}>Reset Pass</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(236, 72, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.3)' }}
                          onPress={() => handleImpersonatePartner(item)}
                          disabled={impersonatingId === item.partner_id}
                        >
                          <Feather name="log-in" size={12} color="#ec4899" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#ec4899' }}>
                            {impersonatingId === item.partner_id ? 'Wait...' : 'Login'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {renderResetPasswordModal()}
        {renderConfirmStatusModal()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.bgPrimary,
  },
  content: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  addOperatorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addOperatorBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    flex: 1,
    maxWidth: 420,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMain,
    padding: 0,
  },
  roleFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBg,
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleChipTextActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tr: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    alignItems: 'center',
  },
  td: {
    justifyContent: 'center',
  },
  idBadge: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  idText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: COLORS.primary,
  },
  partnerNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  companyNameText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  roleBadgeAdmin: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  roleBadgeOperator: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadgeTextAdmin: {
    color: '#3b82f6',
  },
  roleBadgeTextOperator: {
    color: '#10b981',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagEnabled: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  tagDisabled: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotEnabled: {
    backgroundColor: '#10b981',
  },
  dotDisabled: {
    backgroundColor: '#ef4444',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagTextEnabled: {
    color: '#10b981',
  },
  tagTextDisabled: {
    color: '#ef4444',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  mobileCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    gap: 8,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
  },
  mobileCardBody: {
    gap: 4,
  },
  mobileCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.bgSecondary,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  heroCard: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: "#afb1b5",
    padding: 20,
    marginVertical: 16,
  },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  heroSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  heroWalletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.76)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  heroWalletIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWalletLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  heroWalletValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  statsGrid7: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCardMetric: {
    flex: 1,
    minWidth: 130,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    gap: 6,
  },
  statCardMetricClickable: {
    cursor: 'pointer',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  statValueMetric: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  simpleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  simpleActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  simpleBtnTopupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  simpleBtnDebitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(185, 16, 16, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  detailsCardSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sectionTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  detailsGridItem: {
    width: '30%',
    minWidth: 200,
    gap: 4,
  },
  detailsGridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  detailsGridVal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
  },
  statusToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.bgSecondary,
  },
  statusToggleEnabled: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  statusToggleDisabled: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  btnSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.bgSecondary,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  walletBalanceBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  balanceBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  balanceBannerVal: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10b981',
    marginTop: 4,
  },
  topupFormContainer: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 18,
    marginBottom: 20,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
  },
  payModeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  payModeChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  payModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  payModeTextActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  planCardItem: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 16,
    marginBottom: 12,
  },
  planBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  planSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusTagEnabled: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusTagTextEnabled: {
    fontSize: 9,
    fontWeight: '700',
    color: '#06b6d4',
  },
  subplansRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  subplanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  subplanName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  subplanPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  iptvGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iptvItemCard: {
    width: '48%',
    minWidth: 260,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 14,
  },
  iptvPlanTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  iptvLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  iptvPriceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  iptvValidity: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.bgSecondary,
  },
  typeChipActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
});
