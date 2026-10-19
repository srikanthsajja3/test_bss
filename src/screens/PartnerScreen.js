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
import { OneBssApi, decodeJwt, saveOriginalSession, switchSession } from '../services/oneBssApi';
import { PartnersTable, LevelBadge, levelLabelOf } from '../components/partners/PartnersTable';
import { CustomerPricesPage } from '../components/plans/CustomerPricesPage';
import { PartnerDevices } from '../components/partners/PartnerDevices';
import { OttPlansPage } from '../components/ott/OttPlansPage';
import { PlanCardList } from '../components/plans/PlanCardList';
import { OperatorPlansView } from '../components/plans/OperatorPlansView';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { Dropdown } from '../components/internet/shared';
import { toast } from 'react-toastify';

const flattenComboOptions = (options) => {
  const inetList = [];
  if (options?.internet && Array.isArray(options.internet)) {
    options.internet.forEach((p) => {
      const planName = p.plan_name || `Plan #${p.plan_id}`;
      if (Array.isArray(p.subplans) && p.subplans.length > 0) {
        p.subplans.forEach((s) => {
          const subName = s.sub_plan_name || s.name || '';
          const validity = s.validity || s.validity_days || 30;
          inetList.push({
            sub_plan_id: s.sub_plan_id || s.id,
            display_name: `${planName}${subName ? ' - ' + subName : ''} (${validity} Days) - ₹${s.price || 0}`,
            plan_name: planName,
            sub_plan_name: subName,
            price: Number(s.price || 0),
            validity: validity,
          });
        });
      } else {
        inetList.push({
          sub_plan_id: p.sub_plan_id || p.plan_id || p.id,
          display_name: `${planName} - ₹${p.price || 0}`,
          plan_name: planName,
          sub_plan_name: '',
          price: Number(p.price || 0),
          validity: p.validity || 30,
        });
      }
    });
  }

  const iptvList = [];
  if (options?.iptv && Array.isArray(options.iptv)) {
    options.iptv.forEach((p) => {
      const planName = p.plan_name || `IPTV Pack #${p.plan_id}`;
      if (Array.isArray(p.subplans) && p.subplans.length > 0) {
        p.subplans.forEach((s) => {
          const subName = s.sub_plan_name || s.name || '';
          const validity = s.validity_days || s.validity || 30;
          iptvList.push({
            sub_plan_id: s.sub_plan_id || s.id,
            display_name: `${planName}${subName ? ' - ' + subName : ''} (${validity} Days) - ₹${s.price || 0}`,
            plan_name: planName,
            sub_plan_name: subName,
            price: Number(s.price || 0),
            validity: validity,
          });
        });
      } else {
        iptvList.push({
          sub_plan_id: p.sub_plan_id || p.plan_id || p.id,
          display_name: `${planName} - ₹${p.price || 0}`,
          plan_name: planName,
          sub_plan_name: '',
          price: Number(p.price || 0),
          validity: p.validity || 30,
        });
      }
    });
  }

  return { inetList, iptvList };
};

export const PartnerScreen = ({ onOpenCreate, initialCreateRole, user, initialRoleFilter, refreshSignal = 0 }) => {
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const isSuperAdminUser = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'superadmin';
  const isAdminUser = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'admin';
  // Admins (super distributor / distributor / sub distributor) are VIEW-ONLY: no add, edit,
  // wallet change, plan change or recharge. The backend refuses it too (auth_middleware.php).
  const readOnly = !isSuperAdminUser;
  // An admin may switch into a partner below it only while the super admin drives the session.
  const canImpersonate = isSuperAdminUser || (isAdminUser && !!user?.is_impersonation);
  // Admin page: the partners that admin created (same table as the main page)
  const [adminChildren, setAdminChildren] = useState([]);
  const [loadingAdminChildren, setLoadingAdminChildren] = useState(false);
  // Drill-down trail: the partner pages we came through (Partners › SD › D › ...), so Back
  // returns one level instead of jumping to the main list.
  const [partnerTrail, setPartnerTrail] = useState([]);
  const [createParentId, setCreateParentId] = useState(null);
  const [customerPricesPartner, setCustomerPricesPartner] = useState(null);
  // Hierarchy margins on an operator's packages (super admin, on the operator's plan pages):
  // operator price = super admin price + the margin of each admin above the operator.
  const [inetAdminChain, setInetAdminChain] = useState([]);
  const [inetMargins, setInetMargins] = useState({}); // { subPlanId: { adminId: '20' } }
  const [iptvAdminChain, setIptvAdminChain] = useState([]);
  const [iptvMargins, setIptvMargins] = useState({});
  const [bulkMargins, setBulkMargins] = useState({}); // { adminId: '10' } — "apply to all selected"
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState(initialRoleFilter || '');

  React.useEffect(() => {
    setSelectedRole(initialRoleFilter || '');
  }, [initialRoleFilter]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partner, setPartner] = useState(null);
  const [loadingPartner, setLoadingPartner] = useState(false);
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
  const [ottPlansPartner, setOttPlansPartner] = useState(null);
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
  const [syncingIptvId, setSyncingIptvId] = useState(null);
  const [syncingInetId, setSyncingInetId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Batch 2 Action States
  const [walletAction, setWalletAction] = useState('credit'); // 'credit' | 'debit'
  const [confirmStatusPartner, setConfirmStatusPartner] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [kycPartner, setKycPartner] = useState(null);
  const [initialKycProviders, setInitialKycProviders] = useState([]);
  const [assignedKycProviders, setAssignedKycProviders] = useState([]);
  const [loadingKycProviders, setLoadingKycProviders] = useState(false);
  const [savingKycProviders, setSavingKycProviders] = useState(false);
  const [customProviderInput, setCustomProviderInput] = useState('');

  // Assign Branches Action States
  const [branchPartner, setBranchPartner] = useState(null);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [syncingBranches, setSyncingBranches] = useState(false);
  const [pioneerKey, setPioneerKey] = useState('');

  // Combo Plans States
  const [comboPlansPartner, setComboPlansPartner] = useState(null);
  const [comboPlans, setComboPlans] = useState([]);
  const [loadingComboPlans, setLoadingComboPlans] = useState(false);
  const [searchComboPlan, setSearchComboPlan] = useState('');
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [editingComboPlan, setEditingComboPlan] = useState(null);
  const [comboPlanOptions, setComboPlanOptions] = useState({ internet: [], iptv: [] });
  const [loadingComboOptions, setLoadingComboOptions] = useState(false);
  const [comboForm, setComboForm] = useState({
    combo_name: '',
    isub_plan_id: '',
    iptvsub_plan_id: '',
    price: '',
    is_active: true,
  });
  const [savingCombo, setSavingCombo] = useState(false);
  const [expandedIptvIds, setExpandedIptvIds] = useState([]);
  const [comboAdminChain, setComboAdminChain] = useState([]);
  const [deletingComboId, setDeletingComboId] = useState(null);

  // Opening an ADMIN: list the partners it created (its distributors / operators).
  useEffect(() => {
    const pid = selectedPartner?.partner_id;
    const isAdminPartner = String(selectedPartner?.account_role || '').toLowerCase() === 'admin';
    if (!pid || !isAdminPartner) {
      setAdminChildren([]);
      return;
    }
    setLoadingAdminChildren(true);
    OneBssApi.getPartnersCreatedBy(pid)
      .then((res) => setAdminChildren(res.ok && Array.isArray(res.data) ? res.data : []))
      .catch(() => setAdminChildren([]))
      .finally(() => setLoadingAdminChildren(false));
  }, [selectedPartner?.partner_id, selectedPartner?.account_role, detailReloadKey]);

  useEffect(() => {
    if (selectedPartner?.partner_id) {
      OneBssApi.getWallet(selectedPartner.partner_id)
        .then((wRes) => {
          if (wRes.ok && wRes.data && wRes.data.wallet_balance !== undefined) {
            setSelectedPartner((prev) => (prev ? { ...prev, wallet_balance: Number(wRes.data.wallet_balance) } : prev));
          }
        })
        .catch(() => {});

      setLoadingPartner(true);
      OneBssApi.getDashboard(selectedPartner.partner_id)
        .then((res) => {
          if (!res.ok) {
            toast.error(res.data?.message || 'Could not load this partner\'s dashboard.');
            setPartner(null);
            return;
          }
          const data = res.data?.data || res.data;
          if (data) {
            const internetData = data.internet || (data.total !== undefined ? data : null);
            const iptvData = data.iptv || null;
            setPartner({
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
            setPartner(null);
          }
        })
        .catch(() => {
          setPartner(null);
        })
        .finally(() => setLoadingPartner(false));
    } else {
      setPartner(null);
    }
  }, [selectedPartner?.partner_id, detailReloadKey]);

  // Top-bar Refresh: reload the list and whatever partner page is open
  const firstRefreshSignal = React.useRef(true);
  useEffect(() => {
    if (firstRefreshSignal.current) {
      firstRefreshSignal.current = false;
      return;
    }
    fetchPartners();
    setDetailReloadKey((k) => k + 1);
    if (walletPartner) handleOpenWallet(walletPartner, walletAction);
  }, [refreshSignal]);

  useEffect(() => {
    const handleSubHashChange = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash;
        const hasPartnerContext = hash.includes('partner_id=') || hash.includes('edit=') || hash.includes('wallet=') || hash.includes('internet=') || hash.includes('iptv=') || hash.includes('combo=');
        
        if (!hasPartnerContext) {
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
        if (!hash.includes('combo=')) {
          setComboPlansPartner(null);
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

  const trailHash = (trail) => (trail.length ? `&trail=${trail.map((t) => t.partner_id).join(',')}` : '');

  // Open a partner. From the main list the trail starts empty; from another partner's page
  // (its "partners under" table) that page is pushed, so Back comes back to it.
  const handleSelectPartner = (partner, fromParent = null) => {
    const trail = fromParent ? [...partnerTrail, fromParent] : [];
    setPartnerTrail(trail);
    setSelectedPartner(partner);
    if (typeof window !== 'undefined' && partner) {
      const pId = partner.partner_id || partner.id;
      window.location.hash = `partners?partner_id=${pId}${trailHash(trail)}`;
    }
  };

  // Back from a partner page: one level up the trail, or the main list.
  const handleClosePartnerDetails = () => {
    if (partnerTrail.length) {
      const trail = partnerTrail.slice(0, -1);
      const parent = partnerTrail[partnerTrail.length - 1];
      setPartnerTrail(trail);
      setSelectedPartner(parent);
      if (typeof window !== 'undefined') window.location.hash = `partners?partner_id=${parent.partner_id}${trailHash(trail)}`;
      return;
    }
    setSelectedPartner(null);
    if (typeof window !== 'undefined') {
      window.location.hash = 'partners';
    }
  };

  // Hash of a sub page (wallet, plans...) of the open partner, keeping the trail.
  const partnerPageHash = (pId, extra = '') => `partners?partner_id=${pId}${extra}${trailHash(partnerTrail)}`;

  useEffect(() => {
    if (initialCreateRole) {
      setCreateRole(initialCreateRole);
      setIsCreateOpen(true);
    }
  }, [initialCreateRole]);

  const handleOpenCreate = (role = 'operator', parentId = null) => {
    setCreateParentId(parentId);
    setCreateRole(role);
    setIsCreateOpen(true);
    if (onOpenCreate) onOpenCreate(role);
    if (typeof window !== 'undefined') {
      const currentPId = selectedPartner?.partner_id || selectedPartner?.id;
      window.location.hash = currentPId ? `partners?partner_id=${currentPId}&action=create&role=${role}` : `partners?action=create&role=${role}`;
    }
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    if (onOpenCreate) onOpenCreate(null);
    if (typeof window !== 'undefined') {
      const pId = selectedPartner?.partner_id || selectedPartner?.id;
      window.location.hash = pId ? partnerPageHash(pId) : 'partners';
    }
  };

  const handleCloseEdit = () => {
    setEditingPartner(null);
    if (typeof window !== 'undefined') {
      const pId = selectedPartner?.partner_id || selectedPartner?.id;
      window.location.hash = pId ? partnerPageHash(pId) : 'partners';
    }
  };

  const handleCloseWallet = () => {
    setWalletPartner(null);
    if (typeof window !== 'undefined') {
      const pId = selectedPartner?.partner_id || selectedPartner?.id;
      window.location.hash = pId ? partnerPageHash(pId) : 'partners';
    }
  };

  const handleCloseInternetPlans = () => {
    setInternetPlansPartner(null);
    if (typeof window !== 'undefined') {
      const pId = selectedPartner?.partner_id || selectedPartner?.id;
      window.location.hash = pId ? partnerPageHash(pId) : 'partners';
    }
  };

  const fetchPartners = async () => {
    setLoading(true);
    try {
      // search is filtered client-side below; the server filters by role and scope
      // Main table = only the caller's own level (super admin: its super distributors and
      // direct operators). Deeper levels are opened from each admin's page.
      const res = await OneBssApi.getPartners(selectedRole, '', 'direct');
      if (!res.ok) {
        toast.error(res.data?.message || 'Could not load partners.');
        setPartners([]);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      const listWithWallets = await Promise.all(
        list.map(async (p) => {
          try {
            const wRes = await OneBssApi.getWallet(p.partner_id);
            if (wRes.ok && wRes.data && wRes.data.wallet_balance !== undefined) {
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
  }, [selectedRole]);

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
    if (partners && typeof window !== 'undefined') {
      restoreFromHash();
    }
  }, [partners]);

  // Reload / deep link: partners deeper than the main list are fetched by id, and the
  // drill-down trail (#...&trail=2,4) is rebuilt so Back keeps working level by level.
  const restoreFromHash = async () => {
    {
      const hash = window.location.hash;
      if (!/partner_id=|edit=|wallet=|internet=|iptv=|combo=/.test(hash)) return;
      const cache = {};
      partners.forEach((p) => { cache[String(p.partner_id)] = p; });
      const ids = new Set();
      ['partner_id', 'edit', 'wallet', 'internet', 'iptv', 'combo'].forEach((key) => {
        const m = hash.match(new RegExp(`${key}=([^&]+)`));
        if (m && m[1]) ids.add(m[1]);
      });
      const trailMatch = hash.match(/trail=([0-9,]+)/);
      const trailIds = trailMatch ? trailMatch[1].split(',').filter(Boolean) : [];
      trailIds.forEach((id) => ids.add(id));
      for (const id of ids) {
        if (!cache[id]) {
          try {
            const r = await OneBssApi.getPartnerById(id);
            if (r.ok && r.data?.data) cache[id] = r.data.data;
          } catch (e) {}
        }
      }
      setPartnerTrail(trailIds.map((id) => cache[id]).filter(Boolean));
      const getPartnerFromHash = (key) => {
        const match = hash.match(new RegExp(`${key}=([^&]+)`));
        return match && match[1] ? cache[match[1]] || null : null;
      };

      const detailPartner = getPartnerFromHash('partner_id') || getPartnerFromHash('edit') || getPartnerFromHash('wallet') || getPartnerFromHash('internet') || getPartnerFromHash('iptv') || getPartnerFromHash('combo');
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

      const comboP = getPartnerFromHash('combo');
      if (comboP && (!comboPlansPartner || String(comboPlansPartner.partner_id) !== String(comboP.partner_id))) {
        handleOpenComboPlans(comboP);
      }
    }
  };

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
    const res = await OneBssApi.updatePartner(partnerId, { status: newStatus });
    if (!res.ok) {
      toast.error(res.data?.message || `Could not change status of partner #${partnerId}.`);
      return;
    }
    setPartners((prev) =>
      prev.map((p) => (p.partner_id === partnerId ? { ...p, status: newStatus } : p))
    );
    if (selectedPartner?.partner_id === partnerId) {
      setSelectedPartner((prev) => ({ ...prev, status: newStatus }));
    }
    toast.info(`Partner #${partnerId} status updated to ${newStatus.toUpperCase()}`);
  };

  const handleAccountCreated = (newPartner, msg) => {
    toast.success(msg || `New ${levelLabelOf(newPartner)} #${newPartner.partner_id} created successfully!`);
    fetchPartners();
    setDetailReloadKey((k) => k + 1); // refresh "partners under" of the open admin
  };

  // 1. Edit Partner Handlers
  const handleOpenEdit = (partner) => {
    if (!partner) return;
    setEditingPartner(partner);
    if (!selectedPartner || String(selectedPartner.partner_id) === String(partner.partner_id || partner.id)) {
      setSelectedPartner(partner);
    }
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = partnerPageHash(pId, `&edit=${pId}`);
    }
    setEditForm({
      partner_name: partner.partner_name || '',
      company_name: partner.company_name || '',
      partner_mobile: partner.partner_mobile || '',
      partner_email: partner.partner_email || '',
      status: partner.status || 'enabled',
      partner_region: partner.partner_region || '',
      ott_franchise_id: partner.ott_franchise_id || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPartner) return;
    try {
      // Only the fields partner.php actually saves.
      const payload = {
        partner_name: editForm.partner_name,
        company_name: editForm.company_name,
        partner_mobile: editForm.partner_mobile,
        partner_email: editForm.partner_email,
        status: editForm.status,
        partner_region: editForm.partner_region,
        // OTTAggre franchise id (operators); empty removes it
        ...(String(editingPartner.account_role || editingPartner.role || '').toLowerCase() === 'operator'
          ? { ott_mapping: { franchise_id: String(editForm.ott_franchise_id || '').trim() } }
          : {}),
      };
      const res = await OneBssApi.updatePartner(editingPartner.partner_id, payload);
      if (!res.ok) {
        toast.error(res.data?.message || 'Failed to update partner details.');
        return;
      }
      // Show what the server stored, not what we sent.
      const saved = res.data?.data || payload;
      setPartners((prev) =>
        prev.map((p) => (p.partner_id === editingPartner.partner_id ? { ...p, ...saved, wallet_balance: p.wallet_balance } : p))
      );
      if (selectedPartner?.partner_id === editingPartner.partner_id) {
        setSelectedPartner((prev) => ({ ...prev, ...saved, wallet_balance: prev.wallet_balance }));
      }
      toast.success(`Partner #${editingPartner.partner_id} updated successfully!`);
      handleCloseEdit();
    } catch (e) {
      toast.error('Failed to update partner details.');
    }
  };

  // 2. Wallet Handlers
  const handleOpenWallet = async (partner, initialAction = 'credit') => {
    if (!partner) return;
    setWalletPartner(partner);
    setWalletAction(initialAction);
    if (!selectedPartner || String(selectedPartner.partner_id) === String(partner.partner_id || partner.id)) {
      setSelectedPartner(partner);
    }
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = partnerPageHash(pId, `&wallet=${pId}&action=${initialAction}`);
    }
    setTopupAmount('');
    setWalletRemark('');
    setPaymentMode('Online Transfer');
    setLoadingWalletTxns(true);
    try {
      const pId = partner.partner_id || partner.id;
      const res = await OneBssApi.getWallet(pId);
      const data = res.data || {};
      if (!res.ok) {
        toast.error(data.message || 'Could not load wallet history.');
      }
      if (res.ok && data.wallet_balance !== undefined) {
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

      // Money moves only when the server confirms it — never update balances on a failed call.
      if (!res.ok || data.balance_after === undefined || data.balance_after === null || isNaN(Number(data.balance_after))) {
        toast.error(data.message || (isDebit ? 'Wallet debit failed. No money was moved.' : 'Wallet top-up failed. No money was added.'));
        return;
      }
      const newBalance = Number(data.balance_after);

      setPartners((prev) =>
        prev.map((p) => (p.partner_id === walletPartner.partner_id ? { ...p, wallet_balance: newBalance } : p))
      );
      if (selectedPartner?.partner_id === walletPartner.partner_id) {
        setSelectedPartner((prev) => ({ ...prev, wallet_balance: newBalance }));
      }
      setWalletPartner((prev) => (prev ? { ...prev, wallet_balance: newBalance } : prev));

      const newTxn = {
        ledger_id: data.ledger_id,
        txn_amount: amountNum,
        txn_type: isDebit ? 'debit' : 'credit',
        balance_before_txn: currentBal,
        balance_after_txn: newBalance,
        txn_timestamp: new Date().toLocaleString('en-IN'),
        remark: remarkText,
      };
      setWalletTransactions((prev) => [newTxn, ...(Array.isArray(prev) ? prev : [])]);

      if (isDebit) {
        toast.success(`₹${amountNum.toLocaleString('en-IN')} debited from Partner #${walletPartner.partner_id} wallet!`);
      } else {
        toast.success(data.message || `₹${amountNum.toLocaleString('en-IN')} credited to Partner #${walletPartner.partner_id} wallet!`);
      }

      try {
        const walletRes = await OneBssApi.getWallet(walletPartner.partner_id);
        if (walletRes.ok && walletRes.data) {
          if (Array.isArray(walletRes.data.transactions)) {
            setWalletTransactions(walletRes.data.transactions);
          }
          if (walletRes.data.wallet_balance !== undefined && walletRes.data.wallet_balance !== null && !isNaN(Number(walletRes.data.wallet_balance))) {
            const freshBal = Number(walletRes.data.wallet_balance);
            setPartners((prev) =>
              prev.map((p) => (p.partner_id === walletPartner.partner_id ? { ...p, wallet_balance: freshBal } : p))
            );
            if (selectedPartner?.partner_id === walletPartner.partner_id) {
              setSelectedPartner((prev) => ({ ...prev, wallet_balance: freshBal }));
            }
            setWalletPartner((prev) => (prev ? { ...prev, wallet_balance: freshBal } : prev));
          }
        }
      } catch (err) {}

      setTopupAmount('');
      setWalletRemark('');
    } catch (e) {
      toast.error(isDebit ? 'Wallet debit failed.' : 'Wallet topup failed.');
    }
  };

  // Admin margins: read the chain + saved margins from a plan-mapping response.
  const marginsFromRows = (rows) => {
    const out = {};
    (rows || []).forEach((r) => {
      const id = r.sub_plan_id || r.plan_id || r.id;
      const m = r.margins && typeof r.margins === 'object' ? r.margins : {};
      out[id] = {};
      Object.keys(m).forEach((adminId) => {
        out[id][adminId] = String(m[adminId]);
      });
    });
    return out;
  };
  const captureInternetMargins = (res, grouped) => {
    setInetAdminChain(Array.isArray(res?.data?.admin_chain) ? res.data.admin_chain : []);
    setInetMargins(marginsFromRows((grouped || []).flatMap((p) => p.subplans || [])));
    setBulkMargins({});
  };
  const captureIptvMargins = (res, rows) => {
    setIptvAdminChain(Array.isArray(res?.data?.admin_chain) ? res.data.admin_chain : []);
    setIptvMargins(marginsFromRows(rows));
    setBulkMargins({});
  };
  // Payload: super admin price + { adminId: margin }; the server adds them up into the operator price.
  const marginPayload = (chain, marginState, id, saPrice) => {
    if (!isSuperAdminUser) return {};
    const m = marginState[id] || {};
    const out = {};
    chain.forEach((a) => {
      const v = m[a.partner_id];
      if (v !== undefined && v !== '' && !isNaN(Number(v))) out[a.partner_id] = Number(v);
    });
    return { sa_price: saPrice, margins: out };
  };
  const marginTotal = (chain, marginState, id) =>
    chain.reduce((sum, a) => sum + (Number((marginState[id] || {})[a.partner_id]) || 0), 0);
  // Returns an error text when margins are invalid for one of the selected plans, else ''.
  const checkMargins = (chain, marginState, ids, priceOf, nameOf) => {
    if (!isSuperAdminUser || !chain.length) return '';
    for (const id of ids) {
      for (const a of chain) {
        const v = (marginState[id] || {})[a.partner_id];
        if (v !== undefined && v !== '' && (isNaN(Number(v)) || Number(v) < 0)) return `${nameOf(id)}: ${a.partner_name}'s margin must be 0 or more.`;
      }
    }
    return '';
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
            // super admin edits the SUPER ADMIN price (operator price = it + margins); others see the operator price
            priceMap[subId] = String(sub.sa_price !== null && sub.sa_price !== undefined ? sub.sa_price : sub.mapped_price !== null && sub.mapped_price !== undefined ? sub.mapped_price : (sub.base_price || '0'));
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
    if (!selectedPartner || String(selectedPartner.partner_id) === String(partner.partner_id || partner.id)) {
      setSelectedPartner(partner);
    }
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = partnerPageHash(pId, `&internet=${pId}`);
    }
    setSearchInetPlan('');
    setSelectedSubPlanIds([]);
    setCustomPrices({});
    setExpandedPlanIds([]);
    setLoadingInternetPlans(true);
    
    // only the super admin fetches packages from RADIUS (admins are view-only)
    if (isSuperAdminUser) {
      const syncRes = await OneBssApi.syncInternetPlans(partner.partner_id);
      if (!syncRes.ok) {
        toast.warn('Could not refresh plans from RADIUS — showing the last synced catalog.');
      }
    }

    try {
      const res = await OneBssApi.getInternetPlans(partner.partner_id);
      const dataArray = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      const groupedPlans = groupInternetPlans(dataArray);
      setInternetPlans(groupedPlans);
      setSelectedSubPlanIds(extractMappedSubPlanIds(groupedPlans));
      setCustomPrices(extractInitialCustomPrices(groupedPlans));
      captureInternetMargins(res, groupedPlans);
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
      const syncRes = await OneBssApi.syncInternetPlans(internetPlansPartner.partner_id);
      if (!syncRes.ok) {
        toast.error(syncRes.data?.message || 'Internet plan sync failed.');
        return;
      }
      const res = await OneBssApi.getInternetPlans(internetPlansPartner.partner_id);
      const dataArray = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      const groupedPlans = groupInternetPlans(dataArray);
      setInternetPlans(groupedPlans);
      setSelectedSubPlanIds(extractMappedSubPlanIds(groupedPlans));
      setCustomPrices(extractInitialCustomPrices(groupedPlans));
      captureInternetMargins(res, groupedPlans);
      toast.success(syncRes.data?.message || 'Internet plans catalog synchronized.');
    } catch (e) {
      toast.error('Internet plan sync failed.');
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
    const findSub = (id) => {
      for (const plan of internetPlans) {
        const sub = (plan.subplans || []).find((x) => String(x.sub_plan_id || x.id) === String(id));
        if (sub) return { plan, sub };
      }
      return null;
    };
    const marginErr = checkMargins(
      inetAdminChain,
      inetMargins,
      selectedSubPlanIds,
      (id) => customPrices[id],
      (id) => {
        const h = findSub(id);
        return h ? `${h.plan.plan_name} - ${h.sub.sub_plan_name}` : `Sub-plan #${id}`;
      }
    );
    if (marginErr) {
      toast.warn(marginErr);
      return;
    }
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
          ...marginPayload(inetAdminChain, inetMargins, id, priceNum),
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
        captureInternetMargins(refreshed, arr);
      } else {
        toast.error(data.message || 'Failed to assign internet plans.');
      }
    } catch (e) {
      toast.error('Failed to assign internet plans.');
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
        prices[id] = p.sa_price !== undefined && p.sa_price !== null
          ? String(p.sa_price)
          : p.mapped_price !== undefined && p.mapped_price !== null ? String(p.mapped_price) : (p.base_price !== undefined ? String(p.base_price) : '0');
      });
    }
    return prices;
  };

  const handleOpenIptvPlans = async (partner) => {
    if (!partner) return;
    setIptvPlansPartner(partner);
    if (!selectedPartner || String(selectedPartner.partner_id) === String(partner.partner_id || partner.id)) {
      setSelectedPartner(partner);
    }
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = partnerPageHash(pId, `&iptv=${pId}`);
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
      captureIptvMargins(res, dataArray);
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
      const syncRes = await OneBssApi.syncIptvPlans(iptvPlansPartner.partner_id);
      if (!syncRes.ok) {
        toast.error(syncRes.data?.message || 'IPTV catalog sync failed.');
        return;
      }
      const res = await OneBssApi.getIptvPlans(iptvPlansPartner.partner_id);
      const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      setIptvPlans(dataArray);
      setSelectedIptvPlanIds(extractIptvMappedIds(dataArray));
      setCustomIptvPrices(extractIptvCustomPrices(dataArray));
      captureIptvMargins(res, dataArray);
      const sum = syncRes.data?.summary;
      toast.success(`${syncRes.data?.message || 'IPTV packages synced.'}${sum ? ` — ${Number(sum.plans_added || 0)} new pack(s)` : ''}`);
    } catch (e) {
      toast.error('IPTV catalog sync failed.');
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

  // Select / deselect every plan currently shown (respects the search and type filter)
  const handleSelectAllIptvPlans = () => {
    const allIds = filteredIptvPlans.map((p) => p.sub_plan_id || p.plan_id || p.id);
    setSelectedIptvPlanIds((prev) => [...new Set([...prev, ...allIds])]);
  };

  const handleDeselectAllIptvPlans = () => {
    const shown = new Set(filteredIptvPlans.map((p) => p.sub_plan_id || p.plan_id || p.id));
    setSelectedIptvPlanIds((prev) => prev.filter((id) => !shown.has(id)));
  };

  const handleCloseIptvPlans = () => {
    setIptvPlansPartner(null);
    setIsAssignIptvModalOpen(false);
    if (typeof window !== 'undefined') {
      window.location.hash = selectedPartner ? partnerPageHash(selectedPartner.partner_id || selectedPartner.id) : 'partners';
    }
  };

  const handleSaveIptvPlanMapping = async () => {
    if (!iptvPlansPartner) return;
    if (selectedIptvPlanIds.length === 0) {
      toast.warn('Please select at least one channel or pack to assign.');
      return;
    }
    const marginErr = checkMargins(
      iptvAdminChain,
      iptvMargins,
      selectedIptvPlanIds,
      (id) => customIptvPrices[id],
      (id) => iptvPlans.find((p) => String(p.sub_plan_id || p.plan_id || p.id) === String(id))?.plan_name || `Pack #${id}`
    );
    if (marginErr) {
      toast.warn(marginErr);
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
          ...marginPayload(iptvAdminChain, iptvMargins, id, priceNum),
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
        captureIptvMargins(refreshed, arr);
      } else {
        toast.error(data.message || 'Failed to assign IPTV plans.');
      }
    } catch (e) {
      toast.error('Failed to assign IPTV plans.');
    } finally {
      setSavingIptvMapping(false);
    }
  };

  // 5. COMBO PLANS HANDLERS
  const handleOpenComboPlans = async (partner) => {
    if (!partner) return;
    setComboPlansPartner(partner);
    if (!selectedPartner || String(selectedPartner.partner_id) === String(partner.partner_id || partner.id)) {
      setSelectedPartner(partner);
    }
    if (typeof window !== 'undefined') {
      const pId = partner.partner_id || partner.id;
      window.location.hash = partnerPageHash(pId, `&combo=${pId}`);
    }
    setSearchComboPlan('');
    setLoadingComboPlans(true);
    try {
      const res = await OneBssApi.getComboPlans(partner.partner_id || partner.id);
      const arr = Array.isArray(res.data)
        ? res.data
        : (res.data?.data && Array.isArray(res.data.data) ? res.data.data : []);
      setComboPlans(arr);
      setComboAdminChain(Array.isArray(res.data?.admin_chain) ? res.data.admin_chain : []);
    } catch (e) {
      setComboPlans([]);
      setComboAdminChain([]);
    } finally {
      setLoadingComboPlans(false);
    }
  };

  const handleCloseComboPlans = () => {
    setComboPlansPartner(null);
    if (typeof window !== 'undefined' && selectedPartner) {
      window.location.hash = partnerPageHash(selectedPartner.partner_id || selectedPartner.id);
    }
  };

  const fetchComboOptions = async (partnerId) => {
    setLoadingComboOptions(true);
    try {
      const res = await OneBssApi.getComboPlanOptions(partnerId);
      const opts = res.data?.data || res.data || { internet: [], iptv: [] };
      setComboPlanOptions(opts);
      return opts;
    } catch (e) {
      setComboPlanOptions({ internet: [], iptv: [] });
      return { internet: [], iptv: [] };
    } finally {
      setLoadingComboOptions(false);
    }
  };

  const handleOpenCreateCombo = async () => {
    if (!comboPlansPartner) return;
    setEditingComboPlan(null);
    setComboForm({
      combo_name: '',
      isub_plan_id: '',
      iptvsub_plan_id: '',
      price: '',
      margins: {},
      is_active: true,
      _autoName: false,
      _autoPrice: false,
    });
    setIsComboModalOpen(true);
    await fetchComboOptions(comboPlansPartner.partner_id || comboPlansPartner.id);
  };

  const handleOpenEditCombo = async (comboItem) => {
    if (!comboPlansPartner) return;
    setEditingComboPlan(comboItem);
    setComboForm({
      combo_name: comboItem.combo_name || '',
      isub_plan_id: String(comboItem.isub_plan_id || comboItem.internet?.sub_plan_id || ''),
      iptvsub_plan_id: String(comboItem.iptvsub_plan_id || comboItem.iptv?.sub_plan_id || ''),
      // with admins above the operator the box is the super admin price (operator price = it + margins)
      price: String(comboItem.sa_price !== undefined && comboItem.sa_price !== null ? comboItem.sa_price : comboItem.price !== undefined ? comboItem.price : ''),
      margins: Object.fromEntries(Object.entries(comboItem.margins && typeof comboItem.margins === 'object' ? comboItem.margins : {}).map(([k, v]) => [k, String(v)])),
      is_active: comboItem.is_active !== false && comboItem.is_active !== 0 && comboItem.is_active !== '0',
      _autoName: false,
      _autoPrice: false,
    });
    setIsComboModalOpen(true);
    await fetchComboOptions(comboPlansPartner.partner_id || comboPlansPartner.id);
  };

  const handleSelectSubPlanInComboForm = (field, val, inetList, iptvList) => {
    const newInetId = field === 'isub_plan_id' ? val : comboForm.isub_plan_id;
    const newIptvId = field === 'iptvsub_plan_id' ? val : comboForm.iptvsub_plan_id;
    const selInet = inetList.find((i) => String(i.sub_plan_id) === String(newInetId));
    const selIptv = iptvList.find((i) => String(i.sub_plan_id) === String(newIptvId));

    setComboForm((prev) => {
      const updated = { ...prev, [field]: val };
      if (selInet && selIptv) {
        if (!prev.combo_name || prev._autoName) {
          updated.combo_name = `${selInet.plan_name} + ${selIptv.plan_name}`;
          updated._autoName = true;
        }
        if (!prev.price || prev._autoPrice) {
          const sumPrice = Number(selInet.price || 0) + Number(selIptv.price || 0);
          updated.price = String(sumPrice);
          updated._autoPrice = true;
        }
      }
      return updated;
    });
  };

  // Combo operator price = super admin price (comboForm.price) + each admin's margin.
  const comboMarginsOut = () => {
    const out = {};
    comboAdminChain.forEach((a) => {
      const v = (comboForm.margins || {})[a.partner_id];
      if (v !== undefined && v !== '' && !isNaN(Number(v))) out[a.partner_id] = Number(v);
    });
    return out;
  };
  const comboOperatorTotal = () =>
    (Number(comboForm.price) || 0) + Object.values(comboMarginsOut()).reduce((sum, v) => sum + v, 0);

  const handleSaveCombo = async () => {
    if (!comboPlansPartner) return;
    if (!comboForm.combo_name.trim()) {
      toast.error('Please enter a combo plan name.');
      return;
    }
    if (!comboForm.isub_plan_id) {
      toast.error('Please select an Internet broadband subplan.');
      return;
    }
    if (!comboForm.iptvsub_plan_id) {
      toast.error('Please select an IPTV subplan.');
      return;
    }
    if (!comboForm.price || isNaN(Number(comboForm.price))) {
      toast.error('Please enter a valid combo price.');
      return;
    }

    setSavingCombo(true);
    try {
      const pId = comboPlansPartner.partner_id || comboPlansPartner.id;
      const payload = {
        partner_id: Number(pId),
        combo_name: comboForm.combo_name.trim(),
        isub_plan_id: Number(comboForm.isub_plan_id),
        iptvsub_plan_id: Number(comboForm.iptvsub_plan_id),
        price: Number(comboForm.price),
        is_active: comboForm.is_active ? 1 : 0,
      };
      if (comboAdminChain.length) {
        payload.sa_price = Number(comboForm.price);
        payload.margins = comboMarginsOut();
        payload.price = comboOperatorTotal();
      }

      let res;
      if (editingComboPlan) {
        payload.combo_id = Number(editingComboPlan.combo_id || editingComboPlan.id);
        res = await OneBssApi.updateComboPlan(payload);
      } else {
        res = await OneBssApi.createComboPlan(payload);
      }

      if (res.data?.success !== false) {
        toast.success(editingComboPlan ? 'Combo plan updated successfully!' : 'Combo plan created successfully!');
        setIsComboModalOpen(false);
        handleOpenComboPlans(comboPlansPartner);
      } else {
        toast.error(res.data?.message || 'Failed to save combo plan.');
      }
    } catch (e) {
      toast.error('An error occurred while saving combo plan.');
    } finally {
      setSavingCombo(false);
    }
  };

  const handleToggleComboStatus = async (comboItem) => {
    try {
      const curStatus = comboItem.is_active === 1 || comboItem.is_active === true || comboItem.is_active === '1';
      const newStatus = curStatus ? 0 : 1;
      const res = await OneBssApi.updateComboPlan({
        combo_id: Number(comboItem.combo_id || comboItem.id),
        is_active: newStatus,
      });
      if (res.data?.success !== false) {
        toast.success(`Combo plan ${newStatus ? 'activated' : 'deactivated'} successfully!`);
        handleOpenComboPlans(comboPlansPartner);
      } else {
        toast.error(res.data?.message || 'Failed to update status.');
      }
    } catch (e) {
      toast.error('Failed to update combo plan status.');
    }
  };

  const handleDeleteCombo = async (comboId) => {
    setDeletingComboId(comboId);
    try {
      const res = await OneBssApi.deleteComboPlan(comboId);
      if (res.data?.success !== false) {
        toast.success('Combo plan deleted successfully!');
        handleOpenComboPlans(comboPlansPartner);
      } else {
        toast.error(res.data?.message || 'Failed to delete combo plan.');
      }
    } catch (e) {
      toast.error('Error deleting combo plan.');
    } finally {
      setDeletingComboId(null);
    }
  };

  // Partner Reset Password & Impersonate Handlers
  const handleOpenPartnerResetPass = (partner) => {
    setResetPartnerModal(partner);
    // Empty = let the server generate a strong password (shown once after reset).
    setPartnerNewPass('');
    setShowPartnerPass(true);
  };

  const handleConfirmPartnerResetPass = async () => {
    if (!resetPartnerModal) return;
    const typed = partnerNewPass.trim();
    if (typed && typed.length < 8) {
      toast.warn('Password must be at least 8 characters, or leave it empty to auto-generate one.');
      return;
    }
    setResettingPartnerPass(true);
    const pId = resetPartnerModal.partner_id || resetPartnerModal.id;
    const pName = resetPartnerModal.partner_name || resetPartnerModal.company_name || 'Partner';

    try {
      const res = await OneBssApi.resetPartnerPassword(pId, typed);
      if (!res.ok || !res.data?.new_password) {
        toast.error(res.data?.message || `Password reset failed for ${pName} (#${pId}).`);
        return;
      }
      // Shown once; never kept in app state or storage.
      const issued = res.data.new_password;
      setPartnerNewPass(issued);
      toast.success(`Password reset for ${pName} (#${pId}). New password: ${issued}`, { autoClose: false });
      setResetPartnerModal(null);
    } catch (e) {
      toast.error(`Password reset failed for ${pName} (#${pId}).`);
    } finally {
      setResettingPartnerPass(false);
    }
  };

  const handleImpersonatePartner = async (partner) => {
    if (!partner) return;
    const pId = partner.partner_id || partner.id;
    const targetRole = String(partner.account_role || '').toLowerCase();
    if (targetRole === 'superadmin') {
      toast.info('Super Admin accounts cannot be impersonated.');
      return;
    }
    if (String(pId) === String(user?.partner_id)) {
      toast.info('You are already logged in as this account.');
      return;
    }

    setImpersonatingId(pId);
    try {
      const res = await OneBssApi.impersonatePartner(pId);
      const data = res.data || {};

      if (!res.ok || !data.token) {
        toast.error(data.message || 'Could not start the impersonation session.');
        return;
      }

      // Remember the account we are leaving — one entry per level (super admin -> admin ->
      // operator), so "Back" returns one level at a time (this tab only, never sent to the API).
      if (user?.token) {
        const { token: _t, ...origUser } = user;
        saveOriginalSession(user.token, origUser);
      }

      const claims = decodeJwt(data.token) || {};
      const impUser = {
        username: claims.username || data.impersonating?.username || '',
        partner_name: claims.partner_name || data.impersonating?.partner_name || partner.partner_name,
        partner_id: claims.partner_id || pId,
        role: String(claims.role || data.impersonating?.role || '').toLowerCase(),
        is_impersonation: true,
        impersonated_by: claims.impersonated_by || null,
        root_impersonated_by: claims.root_impersonated_by || null,
      };
      // Straight into the partner's dashboard: no toast + delayed reload, so this account's
      // screens are never shown in between.
      switchSession(data.token, impUser, 'dashboard', impUser.partner_name || `partner #${pId}`);
    } catch (e) {
      toast.error('Could not start the impersonation session.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleSyncIptvUsers = async (partner) => {
    if (!partner) return;
    const pId = partner.partner_id || partner.id;
    setSyncingIptvId(pId);
    try {
      const res = await OneBssApi.syncIptvBulkCustomers(pId);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(data.message || `IPTV users synced successfully for ${partner.partner_name || 'Partner'} (#${pId})!`);
      } else {
        toast.error(data.message || `IPTV user sync failed for Partner #${pId}.`);
      }
    } catch (e) {
      toast.error('Sync failed: Network error');
    } finally {
      setSyncingIptvId(null);
    }
  };

  const handleSyncInternetUsers = async (partner) => {
    if (!partner) return;
    const pId = partner.partner_id || partner.id;
    setSyncingInetId(pId);
    try {
      const res = await OneBssApi.syncInternetCustomersBulk(pId);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(data.message || `Internet users synced successfully for ${partner.partner_name || 'Partner'} (#${pId})!`);
      } else {
        toast.error(data.message || `Internet user sync failed for Partner #${pId}.`);
      }
    } catch (e) {
      toast.error('Sync failed: Network error');
    } finally {
      setSyncingInetId(null);
    }
  };

  const handleOpenKycProviders = async (partner) => {
    if (!partner) return;
    const pId = partner.partner_id || partner.id;
    setKycPartner(partner);
    setLoadingKycProviders(true);
    setCustomProviderInput('');
    try {
      const res = await OneBssApi.kycProviders(pId);
      const data = res.data || {};
      if (!res.ok) {
        toast.error(data.message || 'Could not load KYC providers.');
      }
      const list = Array.isArray(data.providers)
        ? data.providers
        : (Array.isArray(data.data?.providers) ? data.data.providers : []);
      const lowerList = list.map((p) => String(p).toLowerCase());
      setInitialKycProviders(lowerList);
      setAssignedKycProviders(lowerList);
    } catch (e) {
      setInitialKycProviders([]);
      setAssignedKycProviders([]);
    } finally {
      setLoadingKycProviders(false);
    }
  };

  const handleSaveKycProviders = async () => {
    if (!kycPartner) return;
    const pId = kycPartner.partner_id || kycPartner.id;
    setSavingKycProviders(true);
    try {
      const toAssign = assignedKycProviders.filter((p) => !initialKycProviders.includes(p));
      const toUnassign = initialKycProviders.filter((p) => !assignedKycProviders.includes(p));

      const promises = [];
      if (toAssign.length > 0) {
        promises.push(OneBssApi.assignKycProviders(pId, toAssign));
      }
      if (toUnassign.length > 0) {
        promises.push(OneBssApi.unassignKycProviders(pId, toUnassign));
      }

      if (promises.length > 0) {
        const results = await Promise.all(promises);
        const failed = results.find((r) => !r.ok);
        if (failed) {
          toast.error(failed.data?.message || 'Failed to update KYC providers.');
          return;
        }
      }

      toast.success(`KYC providers updated successfully for ${kycPartner.partner_name || 'operator'}!`);
      setKycPartner(null);
      fetchPartners();
    } catch (e) {
      toast.error('Failed to update KYC providers.');
    } finally {
      setSavingKycProviders(false);
    }
  };

  const handleOpenAssignBranches = async (partner) => {
    if (!partner) return;
    const pId = partner.partner_id || partner.id;
    setBranchPartner(partner);
    setLoadingBranches(true);
    setPioneerKey('');
    try {
      const res = await OneBssApi.getIptvBranchMapping(pId);
      const data = res.data || {};
      const rawList = Array.isArray(data.data)
        ? data.data
        : (Array.isArray(data.branches) ? data.branches : (Array.isArray(data) ? data : []));

      setAvailableBranches(rawList);

      const assignedIds = [];
      rawList.forEach((b) => {
        const id = b.branch_id !== undefined && b.branch_id !== null ? b.branch_id : (b.id !== undefined && b.id !== null ? b.id : b.branch_code);
        
        const isAssigned = Boolean(
          b.is_assigned === true || b.is_assigned == 1 ||
          b.is_mapped === true || b.is_mapped == 1 ||
          b.mapped === true || b.mapped == 1 ||
          b.selected === true || b.selected == 1
        );

        if (isAssigned) {
          assignedIds.push(id);
        }
      });

      setSelectedBranchIds(assignedIds);
    } catch (e) {
      setAvailableBranches([]);
      setSelectedBranchIds([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSyncBranches = async () => {
    if (!branchPartner) return;
    const pId = branchPartner.partner_id || branchPartner.id;
    setSyncingBranches(true);
    try {
      const res = await OneBssApi.syncIptvBranches(pId, pioneerKey);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(data.message || 'Branches synced from Pioneer Gateway successfully!');
        const freshRes = await OneBssApi.getIptvBranchMapping(pId);
        const freshData = freshRes.data || {};
        const freshBranches = Array.isArray(freshData.branches)
          ? freshData.branches
          : (Array.isArray(freshData.data) ? freshData.data : (Array.isArray(freshData) ? freshData : []));
        setAvailableBranches(freshBranches);
      } else {
        toast.info(data.message || 'Branch sync completed.');
      }
    } catch (e) {
      toast.error('Branch sync failed: Network error');
    } finally {
      setSyncingBranches(false);
    }
  };

  const handleSaveBranchMapping = async () => {
    if (!branchPartner) return;
    const pId = branchPartner.partner_id || branchPartner.id;
    setSavingBranches(true);
    try {
      const res = await OneBssApi.assignIptvBranchMapping(pId, selectedBranchIds);
      const data = res.data || {};
      if (data.success !== false) {
        toast.success(data.message || `Branches mapped successfully for ${branchPartner.partner_name || 'Partner'} (#${pId})!`);
        setBranchPartner(null);
      } else {
        toast.error(data.message || 'Failed to save branch mapping.');
      }
    } catch (e) {
      toast.error('Failed to save branch mapping.');
    } finally {
      setSavingBranches(false);
    }
  };

  const renderKycProvidersModal = () => {
    if (!kycPartner) return null;
    const providers = [
      { id: 'digilocker', title: 'DigiLocker Online Aadhaar', desc: 'Instant OTP/consent-based Aadhaar verification via DigiLocker gateway', icon: 'shield' },
      { id: 'scoreme', title: 'ScoreMe Aadhaar OTP', desc: 'Direct Aadhaar OTP validation with demographic auto-fill', icon: 'smartphone' },
      { id: 'manual', title: 'Manual / Offline KYC', desc: 'Allow physical document inspection and manual approval by operator', icon: 'file-text' },
    ];
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setKycPartner(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 520, backgroundColor: COLORS.bgSecondary || '#1e293b', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border || '#334155' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(246, 92, 241, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name="user-check" size={18} color="#f65cf4" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain || '#ffffff' }}>Assign KYC Providers</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted || '#94a3b8' }}>
                    {kycPartner.partner_name || kycPartner.company_name} (#{kycPartner.partner_id || kycPartner.id})
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setKycPartner(null)}>
                <Feather name="x" size={20} color={COLORS.textMuted || '#94a3b8'} />
              </TouchableOpacity>
            </View>

            {loadingKycProviders ? (
              <ActivityIndicator size="small" color="#f65cf4" style={{ marginVertical: 20 }} />
            ) : (
              <View style={{ gap: 10, marginBottom: 20 }}>
                {providers.map((p) => {
                  const isChecked = assignedKycProviders.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: isChecked ? 'rgba(246, 92, 241, 0.08)' : 'rgba(0,0,0,0.03)',
                        borderWidth: 1,
                        borderColor: isChecked ? '#f65cf4' : 'rgba(0,0,0,0.1)',
                      }}
                      onPress={() => {
                        setAssignedKycProviders((prev) =>
                          isChecked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                        );
                      }}
                    >
                      <Feather
                        name={isChecked ? 'check-square' : 'square'}
                        size={18}
                        color={isChecked ? '#f65cf4' : COLORS.textDim}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>{p.title}</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{p.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}


              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setKycPartner(null)}
                disabled={savingKycProviders}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#f65cf4' }]}
                onPress={handleSaveKycProviders}
                disabled={savingKycProviders || loadingKycProviders}
              >
                {savingKycProviders ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={14} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Save KYC Mapping</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAssignBranchesModal = () => {
    if (!branchPartner) return null;
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setBranchPartner(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 540, backgroundColor: COLORS.bgSecondary || '#1e293b', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border || '#334155' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(6, 182, 212, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name="git-branch" size={18} color="#06b6d4" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain || '#ffffff' }}>Assign Branches</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted || '#94a3b8' }}>
                    {branchPartner.partner_name || branchPartner.company_name} (#{branchPartner.partner_id || branchPartner.id})
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setBranchPartner(null)}>
                <Feather name="x" size={20} color={COLORS.textMuted || '#94a3b8'} />
              </TouchableOpacity>
            </View>

            {/* Pioneer Sync Section */}
            <View style={{ marginBottom: 16, padding: 12, borderRadius: 10, backgroundColor: 'rgba(6, 182, 212, 0.05)', borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.2)' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#06b6d4', marginBottom: 8, letterSpacing: 0.5 }}>
                SYNC BRANCHES FROM PIONEER GATEWAY
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minWidth: 0, height: 36, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 8, paddingHorizontal: 10, fontSize: 12, color: '#000000', outlineStyle: 'none' }}
                  placeholder="Pioneer key (optional)"
                  value={pioneerKey}
                  onChangeText={setPioneerKey}
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={{ height: 36, paddingHorizontal: 12, backgroundColor: '#06b6d4', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  onPress={handleSyncBranches}
                  disabled={syncingBranches}
                >
                  {syncingBranches ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="refresh-cw" size={13} color="#fff" />
                  )}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                    {syncingBranches ? 'Syncing...' : 'Sync Branches'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List of Available Branches */}
            {loadingBranches ? (
              <ActivityIndicator size="small" color="#06b6d4" style={{ marginVertical: 20 }} />
            ) : availableBranches.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 10, marginBottom: 16 }}>
                <Feather name="info" size={20} color={COLORS.textMuted} />
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' }}>
                  No branches found for this partner. Click "Sync Branches" above to sync from Pioneer.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 260, marginBottom: 16 }}>
                <View style={{ gap: 8 }}>
                  {availableBranches.map((b, idx) => {
                    const bId = b.id !== undefined && b.id !== null ? b.id : (b.branch_id !== undefined && b.branch_id !== null ? b.branch_id : (b.branch_code || idx + 1));
                    const bName = b.branch_name || b.name || b.branch_code || `Branch #${bId}`;
                    const bCode = b.branch_code || b.code || bId;
                    const isChecked = selectedBranchIds.some(
                      (x) => String(x) === String(bId) || String(x) === String(bCode) || (b.branch_id && String(x) === String(b.branch_id)) || (b.id && String(x) === String(b.id))
                    );
                    
                    return (
                      <TouchableOpacity
                        key={bId || `branch_${idx}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          padding: 12,
                          borderRadius: 10,
                          backgroundColor: isChecked ? 'rgba(6, 182, 212, 0.08)' : 'rgba(0,0,0,0.03)',
                          borderWidth: 1,
                          borderColor: isChecked ? '#06b6d4' : 'rgba(0,0,0,0.1)',
                        }}
                        onPress={() => {
                          setSelectedBranchIds((prev) => {
                            const exists = prev.some(
                              (x) => String(x) === String(bId) || String(x) === String(bCode) || (b.branch_id && String(x) === String(b.branch_id)) || (b.id && String(x) === String(b.id))
                            );
                            if (exists) {
                              return prev.filter(
                                (x) => String(x) !== String(bId) && String(x) !== String(bCode) && String(x) !== String(b.branch_id) && String(x) !== String(b.id)
                              );
                            } else {
                              return [...prev, bId];
                            }
                          });
                        }}
                      >
                        <Feather
                          name={isChecked ? 'check-square' : 'square'}
                          size={18}
                          color={isChecked ? '#06b6d4' : COLORS.textDim}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>{bName}</Text>
                          <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Branch Code: {bCode}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* Modal Actions */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setBranchPartner(null)}
                disabled={savingBranches}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#06b6d4' }]}
                onPress={handleSaveBranchMapping}
                disabled={savingBranches || loadingBranches}
              >
                {savingBranches ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={14} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Save Branch Mapping</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderComboModal = () => {
    if (!isComboModalOpen) return null;
    const { inetList, iptvList } = flattenComboOptions(comboPlanOptions);
    const inetDropdownOpts = inetList.map((i) => ({ value: String(i.sub_plan_id), label: i.display_name }));
    const iptvDropdownOpts = iptvList.map((i) => ({ value: String(i.sub_plan_id), label: i.display_name }));

    return (
      <Modal
        visible={isComboModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !savingCombo && setIsComboModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 540, backgroundColor: COLORS.bgSecondary || '#1e293b', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border || '#334155' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(236, 72, 153, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name="layers" size={20} color="#ec4899" />
                </View>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.textMain || '#ffffff' }}>
                    {editingComboPlan ? 'Edit Combo Plan' : 'Create New Combo Plan'}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted || '#94a3b8' }}>
                    Partner #{comboPlansPartner?.partner_id} ({comboPlansPartner?.partner_name})
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => !savingCombo && setIsComboModalOpen(false)}>
                <Feather name="x" size={20} color={COLORS.textMuted || '#94a3b8'} />
              </TouchableOpacity>
            </View>

            {loadingComboOptions ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#ec4899" />
                <Text style={{ fontSize: 13, color: COLORS.textMuted || '#94a3b8', marginTop: 10 }}>Loading plan options...</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 14 }}>
                {/* Broadband Subplan Picker */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>
                    SELECT INTERNET BROADBAND SUBPLAN *
                  </Text>
                  <Dropdown
                    value={comboForm.isub_plan_id}
                    options={inetDropdownOpts}
                    onChange={(val) => handleSelectSubPlanInComboForm('isub_plan_id', val, inetList, iptvList)}
                    placeholder="Choose Broadband Plan & Subplan…"
                  />
                </View>

                {/* IPTV Subplan Picker */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>
                    SELECT IPTV PACK / SUBPLAN *
                  </Text>
                  <Dropdown
                    value={comboForm.iptvsub_plan_id}
                    options={iptvDropdownOpts}
                    onChange={(val) => handleSelectSubPlanInComboForm('iptvsub_plan_id', val, inetList, iptvList)}
                    placeholder="Choose IPTV Pack & Subplan…"
                  />
                </View>

                {/* Combo Plan Name */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>
                    COMBO PLAN NAME *
                  </Text>
                  <TextInput
                    style={{
                      height: 42,
                      backgroundColor: COLORS.bgPrimary || '#0f172a',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: COLORS.border || '#334155',
                      paddingHorizontal: 12,
                      color: COLORS.textMain || '#ffffff',
                      fontSize: 14,
                    }}
                    value={comboForm.combo_name}
                    onChangeText={(text) => setComboForm((prev) => ({ ...prev, combo_name: text, _autoName: false }))}
                    placeholder="e.g. Fibre 100 + Telugu Elite"
                    placeholderTextColor={COLORS.textMuted || '#64748b'}
                  />
                </View>

                {/* Combo Price */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>
                    {comboAdminChain.length ? 'SUPER ADMIN PRICE (₹) *' : 'COMBO PRICE (₹) *'}
                  </Text>
                  <TextInput
                    style={{
                      height: 42,
                      backgroundColor: COLORS.bgPrimary || '#0f172a',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: COLORS.border || '#334155',
                      paddingHorizontal: 12,
                      color: COLORS.textMain || '#ffffff',
                      fontSize: 14,
                    }}
                    value={comboForm.price}
                    onChangeText={(text) => setComboForm((prev) => ({ ...prev, price: text, _autoPrice: false }))}
                    placeholder="e.g. 749"
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.textMuted || '#64748b'}
                  />
                </View>

                {/* Admin margins on this combo (one per level above the operator) */}
                {comboAdminChain.length ? (
                  <View style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(236,72,153,0.05)', borderWidth: 1, borderColor: 'rgba(236,72,153,0.25)', gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#be185d' }}>MARGINS ON THIS COMBO</Text>
                    {comboAdminChain.map((a) => (
                      <View key={a.partner_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMain }} numberOfLines={1}>{a.label}</Text>
                          <Text style={{ fontSize: 11, color: COLORS.textMuted }} numberOfLines={1}>{a.partner_name}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>+ ₹</Text>
                        <TextInput
                          style={{ width: 100, height: 36, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border || '#334155', paddingHorizontal: 10, textAlign: 'right', fontSize: 14, fontWeight: '700', color: COLORS.textMain, backgroundColor: '#ffffff' }}
                          value={(comboForm.margins || {})[a.partner_id] ?? ''}
                          onChangeText={(text) => setComboForm((prev) => ({ ...prev, margins: { ...(prev.margins || {}), [a.partner_id]: text.replace(/[^0-9.]/g, '') } }))}
                          placeholder="0"
                          keyboardType="numeric"
                          placeholderTextColor={COLORS.textMuted || '#64748b'}
                        />
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(236,72,153,0.2)' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>Operator combo price</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#db2777' }}>₹{comboOperatorTotal().toFixed(2)}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted }}>The operator pays this price; each level gets its margin in its wallet on every recharge of this combo.</Text>
                  </View>
                ) : null}

                {/* Price check: separate prices vs the combo price */}
                {(() => {
                  const selI = inetList.find((i) => String(i.sub_plan_id) === String(comboForm.isub_plan_id));
                  const selT = iptvList.find((i) => String(i.sub_plan_id) === String(comboForm.iptvsub_plan_id));
                  if (!selI || !selT) return null;
                  const separate = Number(selI.price || 0) + Number(selT.price || 0);
                  const combo = comboAdminChain.length ? comboOperatorTotal() : Number(comboForm.price || 0);
                  const saving = separate - combo;
                  return (
                    <View style={{ padding: 10, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                      <Text style={{ fontSize: 12, color: '#475569' }}>Internet ₹{Number(selI.price || 0).toFixed(2)} + IPTV ₹{Number(selT.price || 0).toFixed(2)} = <Text style={{ fontWeight: '800' }}>₹{separate.toFixed(2)}</Text> separately</Text>
                      {combo > 0 ? (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: saving >= 0 ? '#047857' : '#dc2626' }}>
                          {saving >= 0 ? `Customer saves ₹${saving.toFixed(2)} with this combo` : `Combo is ₹${Math.abs(saving).toFixed(2)} more than buying separately`}
                        </Text>
                      ) : null}
                    </View>
                  );
                })()}

                {/* Active Toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMain || '#ffffff' }}>Active Status</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted || '#94a3b8' }}>Make this combo available for customer recharges</Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      width: 48,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: comboForm.is_active ? '#ec4899' : '#475569',
                      padding: 3,
                      justifyContent: 'center',
                      alignItems: comboForm.is_active ? 'flex-end' : 'flex-start',
                    }}
                    onPress={() => setComboForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff' }} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.border || '#334155' }}
                onPress={() => setIsComboModalOpen(false)}
                disabled={savingCombo}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted || '#94a3b8' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#ec4899', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={handleSaveCombo}
                disabled={savingCombo || loadingComboOptions}
              >
                {savingCombo ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="check" size={14} color="#ffffff" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                      {editingComboPlan ? 'Update Combo' : 'Create Combo'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
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
            Type a new password (8+ characters), or leave it empty and the server will generate a strong one. It is shown once after the reset.
          </Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted || '#94a3b8', marginBottom: 6 }}>NEW PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgPrimary || '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border || '#334155', paddingHorizontal: 12 }}>
              <TextInput
                style={{ flex: 1, height: 42, color: COLORS.textMain || '#ffffff', fontSize: 14 }}
                value={partnerNewPass}
                onChangeText={setPartnerNewPass}
                secureTextEntry={!showPartnerPass}
                placeholder="Leave empty to auto-generate"
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, maxWidth: '100%' }}>
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

  // ---- Package cards for the plan pages (PlanCardList: card per package, options in a table) ----
  // Read-only viewers (admins) only see what is assigned to the operator.
  const internetGroups = () =>
    filteredInternetPlans
      .map((plan) => {
        const planId = plan.plan_id || plan.id;
        const subs = (plan.subplans || []).filter((sub) => !readOnly || sub.is_mapped);
        return {
          key: planId,
          plan,
          title: plan.plan_name,
          meta: `Data: ${plan.data || 'Unlimited'} | Plan ID: #${planId}`,
          rows: subs.map((sub) => ({
            kind: 'plan',
            id: sub.sub_plan_id || sub.id,
            title: sub.sub_plan_name,
            validity: sub.plan_validity || 30,
            basePrice: sub.base_price,
            saPrice: sub.sa_price,
            mappedPrice: sub.mapped_price,
            margins: sub.margins,
          })),
        };
      })
      .filter((g) => g.rows.length || !readOnly);
  // IPTV packs grouped like internet plans: one card per pack, its validities (1 / 3 / 6 months...) inside.
  const iptvGroups = () => {
    const byPack = new Map();
    filteredIptvPlans
      .filter((plan) => !readOnly || plan.is_mapped)
      .forEach((plan) => {
        const key = plan.plan_id || plan.sub_plan_id || plan.id;
        if (!byPack.has(key)) {
          byPack.set(key, { key, title: plan.plan_name, typeLabel: plan.type || 'A-la-carte', meta: `Pack ID: #${key}`, rows: [] });
        }
        const days = plan.plan_validity || 30;
        byPack.get(key).rows.push({
          kind: 'plan',
          id: plan.sub_plan_id || plan.plan_id || plan.id,
          title: `${days} Days`,
          basePrice: plan.base_price,
          saPrice: plan.sa_price,
          mappedPrice: plan.mapped_price,
          margins: plan.margins,
        });
      });
    return [...byPack.values()];
  };
  const selectOnEdit = (ids, setIds, id) => {
    if (!ids.includes(id)) setIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // ---- Hierarchy pricing UI (operator plan pages) ----
  // Operator price = super admin price (the box next to the plan) + one margin per admin above
  // the operator (Super Distributor, Distributor, Sub Distributor — whichever exist).
  // Super admin edits; an admin sees its own margin + the operator price; nothing for no admins.
  // Explains the levels and offers "same margin for all selected" (super admin).
  const renderMarginBulkBar = (chain, setMarginState, selectedIds, accent) => {
    if (!chain.length) return null;
    return (
      <View style={{ padding: 12, borderRadius: 10, marginBottom: 16, backgroundColor: `${accent}0d`, borderWidth: 1, borderColor: `${accent}33`, gap: 8 }}>
        <Text style={{ fontSize: 12.5, color: COLORS.textMain }}>
          Super Admin › {chain.map((a) => `${a.label}: ${a.partner_name}`).join(' › ')} › this operator.{' '}
          {isSuperAdminUser
            ? 'The box next to each plan is the super admin price (the fetched price by default). Add each level\'s margin; the operator price is the total. On every recharge each level gets its margin in its wallet.'
            : 'Prices are set by the super admin.'}
        </Text>
        {isSuperAdminUser ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b' }}>SAME MARGIN FOR ALL SELECTED</Text>
            {chain.map((a) => (
              <View key={a.partner_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, color: COLORS.textMain }}>{a.label}</Text>
                <TextInput
                  style={{ width: 64, height: 28, paddingHorizontal: 6, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 6, backgroundColor: '#ffffff', textAlign: 'right' }}
                  value={bulkMargins[a.partner_id] || ''}
                  onChangeText={(val) => setBulkMargins((prev) => ({ ...prev, [a.partner_id]: val.replace(/[^0-9.]/g, '') }))}
                  keyboardType="numeric"
                  placeholder="₹0"
                  placeholderTextColor={COLORS.textDim}
                />
              </View>
            ))}
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: accent, opacity: selectedIds.length ? 1 : 0.5 }}
              disabled={!selectedIds.length}
              onPress={() => {
                setMarginState((prev) => {
                  const next = { ...prev };
                  selectedIds.forEach((id) => {
                    next[id] = { ...(next[id] || {}) };
                    chain.forEach((a) => {
                      if (bulkMargins[a.partner_id] !== undefined && bulkMargins[a.partner_id] !== '') next[id][a.partner_id] = bulkMargins[a.partner_id];
                    });
                  });
                  return next;
                });
                toast.info(`Margins applied to ${selectedIds.length} selected plan(s). Press Assign to save.`);
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>Apply to {selectedIds.length} selected</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

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
        canCreateAdmin={isSuperAdminUser}
        parentId={createParentId}
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

            {String(editingPartner?.account_role || editingPartner?.role || '').toLowerCase() === 'operator' ? (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>OTT FRANCHISE ID (OTTAGGRE)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.ott_franchise_id || ''}
                  onChangeText={(val) => setEditForm((prev) => ({ ...prev, ott_franchise_id: val }))}
                  placeholder="e.g. F1001 — leave empty if this operator doesn't sell OTT"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="none"
                />
              </View>
            ) : null}

            <Text style={[styles.formLabel, { textTransform: 'none', fontWeight: '500', marginBottom: 12 }]}>
              Wallet, KYC providers and IPTV branches are changed from the partner page, so every change is recorded.
            </Text>

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, maxWidth: '100%' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(16, 185, 129, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: '#10b981' }}>₹</Text>
              </View>
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text style={{ fontSize: isMobile ? 18 : 22, fontWeight: '700', color: COLORS.textMain }}>Operator Wallet & Transaction History</Text>
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

            {/* Topup / Debit Form (super admin only — admins see the history) */}
            {!readOnly ? (
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
            ) : null}

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, maxWidth: '100%' }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(6, 182, 212, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="wifi" size={24} color="#06b6d4" />
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: isMobile ? 18 : 22, fontWeight: '700', color: COLORS.textMain }}>Internet Plans Catalog</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                    Partner #{internetPlansPartner.partner_id} ({internetPlansPartner.partner_name})
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                <View style={[styles.searchBox, { minWidth: 240, height: 42 }, isMobile && { minWidth: 0, width: '100%', maxWidth: '100%', flexBasis: '100%' }]}>
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

                {!readOnly ? (<>
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
                </>) : null}

                {!readOnly ? (
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
                ) : null}
              </View>
            </View>

            {renderMarginBulkBar(inetAdminChain, setInetMargins, selectedSubPlanIds, '#0284c7')}

            {loadingInternetPlans ? (
              <ActivityIndicator size="large" color="#06b6d4" style={{ marginVertical: 40 }} />
            ) : filteredInternetPlans.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No broadband plans matched your search filter.</Text>
              </View>
            ) : (
              /* EXPANDABLE BROADBAND PLAN CARDS (options of an expanded card in a price table) */
              <PlanCardList
                groups={internetGroups()}
                expandedKeys={expandedPlanIds}
                onToggleExpand={toggleExpandPlan}
                forceExpanded={searchInetPlan.trim().length > 0}
                onToggleGroup={(g) => toggleAllSubPlansInPackage(g.plan)}
                icon="zap"
                accent="#06b6d4"
                chain={inetAdminChain}
                mode={readOnly ? 'view' : 'edit'}
                viewerId={user?.partner_id}
                selectedIds={selectedSubPlanIds}
                onToggle={toggleSubPlanSelection}
                saPriceOf={(r) => customPrices[r.id] ?? r.saPrice ?? r.basePrice ?? ''}
                onSaPriceChange={(id, val) => {
                  setCustomPrices((prev) => ({ ...prev, [id]: val }));
                  selectOnEdit(selectedSubPlanIds, setSelectedSubPlanIds, id);
                }}
                marginState={inetMargins}
                onMarginChange={(id, adminId, val) => {
                  setInetMargins((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [adminId]: val } }));
                  selectOnEdit(selectedSubPlanIds, setSelectedSubPlanIds, id);
                }}
              />
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 5. FULL SCREEN IPTV PLANS CATALOG VIEW
  if (ottPlansPartner) {
    return <OttPlansPage partner={ottPlansPartner} onBack={() => setOttPlansPartner(null)} />;
  }

  if (customerPricesPartner) {
    return (
      <CustomerPricesPage
        partnerId={customerPricesPartner.partner_id}
        partnerName={customerPricesPartner.partner_name}
        readOnly={!isSuperAdminUser}
        onBack={() => setCustomerPricesPartner(null)}
      />
    );
  }

  if (iptvPlansPartner) {
    const mappedCount = selectedIptvPlanIds.length;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseIptvPlans}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginVertical: 16 }}>
            {/* Header Title Section */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, maxWidth: '100%' }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(139, 92, 246, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="tv" size={22} color="#8b5cf6" />
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: isMobile ? 18 : 22, fontWeight: '700', color: COLORS.textMain }}>IPTV Channel & Pack Catalog</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted }}>
                    Pioneer STB Gateway - Partner #{iptvPlansPartner.partner_id} ({iptvPlansPartner.partner_name})
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                <View style={[styles.searchBox, { minWidth: 200, height: 42 }, isMobile && { minWidth: 0, width: '100%', maxWidth: '100%', flexBasis: '100%' }]}>
                  <Feather name="search" size={14} color={COLORS.textDim} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 13 }]}
                    placeholder="Search channel or pack name..."
                    value={searchIptvPlan}
                    onChangeText={setSearchIptvPlan}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
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
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={() => setExpandedIptvIds(iptvGroups().map((g) => g.key))}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#7c3aed' }}>Expand All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}
                  onPress={() => setExpandedIptvIds([])}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b' }}>Collapse All</Text>
                </TouchableOpacity>

                {isSuperAdminUser ? (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)', opacity: loadingIptvPlans ? 0.6 : 1 }}
                    onPress={handleSyncIptvPlansAction}
                    disabled={loadingIptvPlans}
                  >
                    {loadingIptvPlans ? <ActivityIndicator size="small" color="#7c3aed" /> : <Feather name="refresh-cw" size={15} color="#7c3aed" />}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed' }}>Sync Packages</Text>
                  </TouchableOpacity>
                ) : null}

                {!readOnly && (() => {
                  const shownIds = filteredIptvPlans.map((p) => p.sub_plan_id || p.plan_id || p.id);
                  const allOn = shownIds.length > 0 && shownIds.every((id) => selectedIptvPlanIds.includes(id));
                  return (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)', opacity: shownIds.length ? 1 : 0.5 }}
                      onPress={allOn ? handleDeselectAllIptvPlans : handleSelectAllIptvPlans}
                      disabled={!shownIds.length}
                    >
                      <Feather name={allOn ? 'square' : 'check-square'} size={15} color="#7c3aed" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed' }}>
                        {allOn ? 'Deselect All' : `Select All (${shownIds.length})`}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                {!readOnly ? (
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
                ) : null}
              </View>
            </View>

            {renderMarginBulkBar(iptvAdminChain, setIptvMargins, selectedIptvPlanIds, '#7c3aed')}

            {loadingIptvPlans ? (
              <ActivityIndicator size="large" color="#8b5cf6" style={{ marginVertical: 40 }} />
            ) : filteredIptvPlans.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No IPTV channel packages returned for this partner query.</Text>
              </View>
            ) : (
              /* IPTV PACK CARDS, same as internet (validities of an expanded pack in a price table) */
              <PlanCardList
                groups={iptvGroups()}
                expandedKeys={expandedIptvIds}
                onToggleExpand={(key) => setExpandedIptvIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                forceExpanded={searchIptvPlan.trim().length > 0}
                onToggleGroup={(g, allSelected) => {
                  const ids = g.rows.map((r) => r.id);
                  setSelectedIptvPlanIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
                }}
                icon="tv"
                accent="#8b5cf6"
                chain={iptvAdminChain}
                mode={readOnly ? 'view' : 'edit'}
                viewerId={user?.partner_id}
                selectedIds={selectedIptvPlanIds}
                onToggle={toggleIptvPlanSelection}
                saPriceOf={(r) => customIptvPrices[r.id] ?? r.saPrice ?? r.basePrice ?? ''}
                onSaPriceChange={(id, val) => {
                  setCustomIptvPrices((prev) => ({ ...prev, [id]: val }));
                  selectOnEdit(selectedIptvPlanIds, setSelectedIptvPlanIds, id);
                }}
                marginState={iptvMargins}
                onMarginChange={(id, adminId, val) => {
                  setIptvMargins((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [adminId]: val } }));
                  selectOnEdit(selectedIptvPlanIds, setSelectedIptvPlanIds, id);
                }}
              />
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 5.5 FULL SCREEN COMBO PLANS CATALOG VIEW
  if (comboPlansPartner) {
    const filteredComboPlans = comboPlans.filter((item) => {
      const q = searchComboPlan.toLowerCase().trim();
      if (!q) return true;
      return (
        item.combo_name?.toLowerCase().includes(q) ||
        (item.internet?.plan_name || item.internet_plan_name || '').toLowerCase().includes(q) ||
        (item.iptv?.plan_name || item.iptv_plan_name || '').toLowerCase().includes(q) ||
        String(item.combo_id || item.id || '').includes(q)
      );
    });

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, width: '100%' }}>
          <View style={styles.detailsHeaderRow}>
            <TouchableOpacity style={styles.backBtn} onPress={handleCloseComboPlans}>
              <Feather name="arrow-left" size={18} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginVertical: 16 }}>
            {/* Header Title Section */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, maxWidth: '100%' }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(236, 72, 153, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="layers" size={22} color="#ec4899" />
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: isMobile ? 18 : 22, fontWeight: '700', color: COLORS.textMain }}>Combo Plans</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                    Internet + IPTV bundles for {comboPlansPartner.partner_name} (#{comboPlansPartner.partner_id})
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                <View style={[styles.searchBox, { minWidth: 220, height: 42 }, isMobile && { minWidth: 0, width: '100%', maxWidth: '100%', flexBasis: '100%' }]}>
                  <Feather name="search" size={14} color={COLORS.textDim} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 13 }]}
                    placeholder="Search combo plans..."
                    value={searchComboPlan}
                    onChangeText={setSearchComboPlan}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                {!readOnly ? (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#ec4899',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleOpenCreateCombo}
                >
                  <Feather name="plus" size={16} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Create Combo Plan</Text>
                </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* COMBO PLANS CARDS GRID */}
            {loadingComboPlans ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#ec4899" />
                <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 14 }}>Loading combo plans...</Text>
              </View>
            ) : filteredComboPlans.length === 0 ? (
              <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 36, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Feather name="layers" size={40} color={COLORS.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 4 }}>No Combo Plans Found</Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 16 }}>
                  {searchComboPlan ? 'No combo plans match your search query.' : 'No combo plans created for this partner yet.'}
                </Text>
                {!readOnly ? (
                <TouchableOpacity
                  style={{ backgroundColor: '#ec4899', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  onPress={handleOpenCreateCombo}
                >
                  <Feather name="plus" size={14} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Create First Combo Plan</Text>
                </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.comboTableCard}>
                {(() => {
                  const chain = comboAdminChain;
                  const showMine = readOnly && chain.some((a) => String(a.partner_id) === String(user?.partner_id));
                  const minW = 60 + 220 + 200 + 200 + 100 + (!readOnly && chain.length ? 120 + chain.length * 130 : 0) + (showMine ? 110 : 0) + 130 + 100 + (!readOnly ? 160 : 0) + 28;
                  const money = (v) => `₹${Number(v || 0).toFixed(2)}`;
                  return (
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
                  <View style={{ minWidth: minW, flexGrow: 1 }}>
                    <View style={[styles.comboTr, styles.comboThRow]}>
                      <Text style={[styles.comboTh, { width: 60 }]}>ID</Text>
                      <Text style={[styles.comboTh, { flex: 1, minWidth: 220 }]}>Combo</Text>
                      <Text style={[styles.comboTh, { width: 200 }]}>Internet plan</Text>
                      <Text style={[styles.comboTh, { width: 200 }]}>IPTV DPO</Text>
                      <Text style={[styles.comboTh, { width: 100, textAlign: 'right' }]}>Separate</Text>
                      {!readOnly && chain.length ? <Text style={[styles.comboTh, { width: 120, textAlign: 'right', paddingLeft: 10 }]} numberOfLines={2}>Super admin price</Text> : null}
                      {!readOnly ? chain.map((a) => (
                        <View key={a.partner_id} style={{ width: 130, alignItems: 'flex-end', paddingLeft: 12 }}>
                          <Text style={[styles.comboTh, { textAlign: 'right' }]} numberOfLines={2}>+ {a.label}</Text>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }} numberOfLines={1}>{a.partner_name}</Text>
                        </View>
                      )) : null}
                      {showMine ? <Text style={[styles.comboTh, { width: 110, textAlign: 'right' }]}>Your margin</Text> : null}
                      <Text style={[styles.comboTh, { width: 130, textAlign: 'right' }]}>Operator price</Text>
                      <Text style={[styles.comboTh, { width: 100, textAlign: 'center' }]}>Status</Text>
                      {!readOnly ? <Text style={[styles.comboTh, { width: 160, textAlign: 'right' }]}>Actions</Text> : null}
                    </View>
                    {filteredComboPlans.map((item) => {
                      const comboId = item.combo_id || item.id;
                      const isActive = item.is_active === 1 || item.is_active === true || item.is_active === '1';
                      // combo_plans.php returns nested { internet: {...}, iptv: {...} }
                      const inet = item.internet || {};
                      const tv = item.iptv || {};
                      const inetPrice = Number(inet.price ?? item.internet_price ?? 0);
                      const iptvPrice = Number(tv.price ?? item.iptv_price ?? 0);
                      const sumPrice = Number(item.separate_total ?? inetPrice + iptvPrice);
                      const comboPrice = Number(item.price || 0);
                      const discount = sumPrice > comboPrice ? sumPrice - comboPrice : 0;
                      const unavailable = item.is_available === false;
                      const m = item.margins && typeof item.margins === 'object' ? item.margins : {};
                      return (
                        <View key={comboId} style={[styles.comboTr, !isActive && { backgroundColor: '#fafafa' }]}>
                          <Text style={[styles.comboTd, { width: 60, color: COLORS.textMuted }]}>#{comboId}</Text>
                          <View style={{ flex: 1, minWidth: 220, paddingRight: 10 }}>
                            <Text style={[styles.comboTd, { fontWeight: '700' }]} numberOfLines={2}>{item.combo_name}</Text>
                            {unavailable ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <Feather name="alert-triangle" size={11} color="#b45309" />
                                <Text style={{ fontSize: 11, color: '#92400e', flexShrink: 1 }} numberOfLines={2}>{item.unavailable_reason || 'One of the plans is no longer mapped for this operator.'}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ width: 200, paddingRight: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <Feather name="wifi" size={14} color="#06b6d4" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.comboTd} numberOfLines={1}>{inet.plan_name || item.internet_plan_name || 'Internet plan'}</Text>
                              <Text style={styles.comboSub} numberOfLines={1}>{[inet.sub_plan_name || (inet.validity ? `${inet.validity} days` : null), inetPrice > 0 ? `₹${inetPrice.toFixed(2)}` : null].filter(Boolean).join(' · ')}</Text>
                            </View>
                          </View>
                          <View style={{ width: 200, paddingRight: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <Feather name="tv" size={14} color="#8b5cf6" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.comboTd} numberOfLines={1}>{tv.plan_name || item.iptv_plan_name || 'IPTV pack'}</Text>
                              <Text style={styles.comboSub} numberOfLines={1}>{[tv.validity_days ? `${tv.validity_days} days` : null, iptvPrice > 0 ? `₹${iptvPrice.toFixed(2)}` : null, 'FTA included'].filter(Boolean).join(' · ')}</Text>
                            </View>
                          </View>
                          <Text style={[styles.comboTd, { width: 100, textAlign: 'right', color: COLORS.textMuted, textDecorationLine: discount > 0 ? 'line-through' : 'none' }]}>₹{sumPrice.toFixed(2)}</Text>
                          {!readOnly && chain.length ? <Text style={[styles.comboTd, { width: 120, textAlign: 'right' }]}>{money(item.sa_price ?? comboPrice)}</Text> : null}
                          {!readOnly ? chain.map((a) => (
                            <Text key={a.partner_id} style={[styles.comboTd, { width: 130, textAlign: 'right', color: '#047857' }]}>{money(m[a.partner_id])}</Text>
                          )) : null}
                          {showMine ? <Text style={[styles.comboTd, { width: 110, textAlign: 'right', color: '#047857', fontWeight: '700' }]}>{money(m[user?.partner_id] ?? m[String(user?.partner_id)])}</Text> : null}
                          <View style={{ width: 130, alignItems: 'flex-end' }}>
                            <Text style={[styles.comboTd, { fontWeight: '800', color: '#db2777' }]}>₹{comboPrice.toFixed(2)}</Text>
                            {discount > 0 ? <Text style={{ fontSize: 10, fontWeight: '700', color: '#10b981' }}>SAVE ₹{discount.toFixed(0)}</Text> : null}
                          </View>
                          <View style={{ width: 100, alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => !readOnly && handleToggleComboStatus(item)} disabled={readOnly} title={readOnly ? undefined : isActive ? 'Switch off' : 'Switch on'}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isActive ? '#10b981' : '#ef4444' }} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#10b981' : '#ef4444' }}>{isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                          {!readOnly ? (
                          <View style={{ width: 160, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' }}
                              onPress={() => handleOpenEditCombo(item)}
                            >
                              <Feather name="edit-2" size={13} color={COLORS.textMain} />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMain }}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                              onPress={() => handleDeleteCombo(comboId)}
                              disabled={deletingComboId === comboId}
                            >
                              {deletingComboId === comboId ? (
                                <ActivityIndicator size="small" color="#ef4444" />
                              ) : (
                                <>
                                  <Feather name="trash-2" size={13} color="#ef4444" />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#ef4444' }}>Delete</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
                  );
                })()}
              </View>
            )}
          </View>
        </ScrollView>
        {renderComboModal()}
      </View>
    );
  }

  // 6. FULL SCREEN PARTNER DETAILS VIEW (WHEN ROW CLICKED)
  if (selectedPartner) {
    const p = selectedPartner;
    const pid = p.partner_id || p.id;
    const isEnabled = p.status === 'enabled';
    const isOperatorPartner = String(p.account_role || 'operator').toLowerCase() === 'operator';
    const inetStats = partner?.internet || {};
    const iptvStats = partner?.iptv || {};
    const inetCards = [
      { label: 'Total', value: inetStats.total, color: COLORS.textMain },
      { label: 'Active', value: inetStats.active, color: COLORS.accentEmerald },
      { label: 'Online', value: inetStats.online, color: '#3b82f6' },
      { label: 'Expired', value: inetStats.expired, color: COLORS.accentRose },
      { label: 'Suspended', value: inetStats.suspend ?? inetStats.suspended, color: COLORS.accentAmber },
      { label: 'Disabled', value: inetStats.disabled, color: '#64748b' },
      { label: 'New', value: inetStats.new, color: '#8b5cf6' },
    ];
    const iptvCards = [
      { label: 'Total STBs', value: iptvStats.total, color: COLORS.textMain },
      { label: 'Active', value: iptvStats.active, color: COLORS.accentEmerald },
      { label: 'Expired', value: iptvStats.expired, color: COLORS.accentRose },
    ];
    const ottStats = partner?.ott || {};
    const ottCards = [
      { label: 'Total', value: ottStats.total, color: COLORS.textMain },
      { label: 'Active', value: ottStats.active, color: COLORS.accentEmerald },
      { label: 'Expired', value: ottStats.expired, color: COLORS.accentRose },
      { label: 'New', value: ottStats.new, color: '#8b5cf6' },
    ];
    const backLabel = partnerTrail.length ? `Back to ${partnerTrail[partnerTrail.length - 1].partner_name}` : 'Back to Partners';
    const levelChain = Array.isArray(p.admin_chain) ? p.admin_chain : [];
    const ActionBtn = ({ icon, label, color, onPress, busy, disabled }) => (
      <TouchableOpacity
        style={[styles.pdAction, { borderColor: `${color}55`, backgroundColor: `${color}12` }, (busy || disabled) && { opacity: 0.6 }]}
        onPress={onPress}
        disabled={busy || disabled}
      >
        {busy ? <ActivityIndicator size="small" color={color} /> : <Feather name={icon} size={14} color={color} />}
        <Text style={[styles.pdActionText, { color }]}>{label}</Text>
      </TouchableOpacity>
    );
    const StatStrip = ({ cards }) => (
      <View style={styles.pdStatRow}>
        {cards.map((c) => (
          <View key={c.label} style={styles.pdStat}>
            <Text style={[styles.pdStatNum, { color: c.color }]}>{loadingPartner && !partner ? '…' : c.value ?? 0}</Text>
            <Text style={styles.pdStatLbl}>{c.label}</Text>
          </View>
        ))}
      </View>
    );

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' }]}
        >
          <TouchableOpacity style={[styles.backBtn, { alignSelf: 'flex-start', marginBottom: 14 }]} onPress={handleClosePartnerDetails}>
            <Feather name="arrow-left" size={16} color={COLORS.textMain} />
            <Text style={styles.backBtnText}>{backLabel}</Text>
          </TouchableOpacity>

          {/* where this partner sits: Super Admin › Super Distributor › ... */}
          <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>
            Super Admin{levelChain.map((a) => ` › ${a.label}: ${a.partner_name}`).join('')} › <Text style={{ fontWeight: '700', color: COLORS.textMain }}>{levelLabelOf(p)}: {p.partner_name}</Text>
          </Text>

          {/* HEADER: identity, status, wallet, account actions */}
          <View style={styles.heroCard}>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'flex-start' : 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                <View style={styles.heroAvatar}>
                  <Text style={styles.heroAvatarText}>{(p.partner_name || 'P').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={styles.heroTitle}>{p.partner_name}</Text>
                    <View style={styles.idBadge}><Text style={styles.idText}>#{pid}</Text></View>
                    <LevelBadge partner={p} />
                    <TouchableOpacity onPress={() => !readOnly && setConfirmStatusPartner(p)} disabled={readOnly} title={isEnabled ? 'Disable this partner' : 'Enable this partner'}>
                      <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                        <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                        <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>{isEnabled ? 'ENABLED' : 'DISABLED'}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.heroSubtitle}>
                    {[p.company_name, p.partner_region, p.partner_mobile, p.account_username ? `login: ${p.account_username}` : null].filter(Boolean).join('  ·  ')}
                  </Text>
                  {p.created_by_name && String(p.created_by) !== String(pid) ? (
                    <Text style={[styles.heroSubtitle, { marginTop: 2 }]}>Under {p.created_by_name} (#{p.created_by})</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.pdWallet}>
                <Text style={styles.heroWalletLabel}>WALLET BALANCE</Text>
                <Text style={styles.heroWalletValue}>₹{Number(p.wallet_balance || 0).toLocaleString('en-IN')}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  {!readOnly ? (
                    <>
                      <TouchableOpacity style={[styles.pdMini, { backgroundColor: '#10b981' }]} onPress={() => handleOpenWallet(p, 'credit')}>
                        <Feather name="plus" size={12} color="#fff" /><Text style={styles.pdMiniText}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pdMini, { backgroundColor: '#ef4444' }]} onPress={() => handleOpenWallet(p, 'debit')}>
                        <Feather name="minus" size={12} color="#fff" /><Text style={styles.pdMiniText}>Deduct</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  <TouchableOpacity style={[styles.pdMini, { backgroundColor: '#475569' }]} onPress={() => handleOpenWallet(p, 'credit')}>
                    <Feather name="list" size={12} color="#fff" /><Text style={styles.pdMiniText}>History</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {!readOnly || canImpersonate ? (
              <View style={styles.pdAccountRow}>
                {!readOnly ? <ActionBtn icon="edit-2" label="Edit Details" color="#2563eb" onPress={() => handleOpenEdit(p)} /> : null}
                {!readOnly ? <ActionBtn icon="key" label="Reset Password" color="#d97706" onPress={() => handleOpenPartnerResetPass(p)} /> : null}
                {canImpersonate ? <ActionBtn icon="log-in" label="Login as Partner" color="#db2777" onPress={() => handleImpersonatePartner(p)} busy={impersonatingId === pid} /> : null}
                {!readOnly && !isOperatorPartner && Number(p.admin_level || 0) < 3 ? (
                  <ActionBtn icon="user-plus" label={`Add ${Number(p.admin_level) === 1 ? 'Distributor' : 'Sub Distributor'} under`} color="#7c3aed" onPress={() => handleOpenCreate('admin', pid)} />
                ) : null}
                {!readOnly && !isOperatorPartner ? <ActionBtn icon="user-plus" label="Add Operator under" color="#059669" onPress={() => handleOpenCreate('operator', pid)} /> : null}
              </View>
            ) : null}
          </View>

          {isOperatorPartner ? (
            <>
              {/* SUBSCRIBERS */}
              <View style={styles.pdSection}>
                <View style={styles.pdSectionHead}>
                  <Feather name="wifi" size={16} color={COLORS.primary} />
                  <Text style={styles.pdSectionTitle}>Internet Subscribers</Text>
                  {loadingPartner ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
                </View>
                <StatStrip cards={inetCards} />
                <View style={[styles.pdSectionHead, { marginTop: 14 }]}>
                  <Feather name="tv" size={16} color="#8b5cf6" />
                  <Text style={styles.pdSectionTitle}>IPTV Subscribers</Text>
                </View>
                <StatStrip cards={iptvCards} />
                <View style={[styles.pdSectionHead, { marginTop: 14 }]}>
                  <Feather name="play-circle" size={16} color="#0ea5e9" />
                  <Text style={styles.pdSectionTitle}>OTT Subscribers</Text>
                </View>
                <StatStrip cards={ottCards} />
                {!readOnly ? (
                  <View style={[styles.pdAccountRow, { marginTop: 14 }]}>
                    <ActionBtn icon="refresh-cw" label="Sync Internet Users" color="#059669" onPress={() => handleSyncInternetUsers(p)} busy={syncingInetId === pid} />
                    <ActionBtn icon="refresh-cw" label="Sync IPTV Users" color="#7c3aed" onPress={() => handleSyncIptvUsers(p)} busy={syncingIptvId === pid} />
                  </View>
                ) : null}
              </View>

              {/* PLANS & SETUP */}
              <View style={styles.pdSection}>
                <View style={styles.pdSectionHead}>
                  <Feather name="sliders" size={16} color="#0f172a" />
                  <Text style={styles.pdSectionTitle}>Plans & Setup</Text>
                </View>
                {readOnly ? (
                  /* admins: view-only tables of what this operator has been given */
                  <OperatorPlansView partner={p} viewerId={user?.partner_id} />
                ) : (
                <View style={styles.pdTileGrid}>
                  {[
                    { icon: 'wifi', label: 'Internet Plans', hint: 'Map plans & prices', color: '#0284c7', onPress: () => handleOpenInternetPlans(p) },
                    { icon: 'tv', label: 'IPTV Plans', hint: 'Map packs & prices', color: '#7c3aed', onPress: () => handleOpenIptvPlans(p) },
                    { icon: 'layers', label: 'Combo Plans', hint: 'Internet + IPTV bundles', color: '#db2777', onPress: () => handleOpenComboPlans(p) },
                    { icon: 'play-circle', label: 'OTT Plans', hint: p.ott_franchise_id ? `Franchise ${p.ott_franchise_id}` : 'Set the OTT franchise id', color: '#0ea5e9', onPress: () => setOttPlansPartner(p) },
                    { icon: 'tag', label: 'Customer Prices', hint: 'Operator\'s price for its customers', color: '#059669', onPress: () => setCustomerPricesPartner(p) },
                    { icon: 'git-branch', label: 'IPTV Branches', hint: 'Pioneer branch mapping', color: '#0891b2', onPress: () => handleOpenAssignBranches(p) },
                    { icon: 'shield', label: 'KYC Providers', hint: 'DigiLocker / ScoreMe / manual', color: '#9333ea', onPress: () => handleOpenKycProviders(p) },
                  ].map((t) => (
                    <TouchableOpacity key={t.label} style={styles.pdTile} onPress={t.onPress}>
                      <View style={[styles.pdTileIcon, { backgroundColor: `${t.color}18` }]}><Feather name={t.icon} size={16} color={t.color} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.pdTileLabel}>{t.label}</Text>
                        <Text style={styles.pdTileHint} numberOfLines={1}>{t.hint}</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  ))}
                </View>
                )}
              </View>

              {/* NETWORK DEVICES (NMS) */}
              <PartnerDevices partner={p} />
            </>
          ) : (
            <>
              {/* ADMIN DASHBOARD: every operator below this admin */}
              <View style={styles.pdSection}>
                <View style={styles.pdSectionHead}>
                  <Feather name="bar-chart-2" size={16} color={COLORS.primary} />
                  <Text style={styles.pdSectionTitle}>Customers of every operator below {p.partner_name}</Text>
                  {loadingPartner ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
                </View>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>Internet</Text>
                <StatStrip cards={inetCards} />
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginVertical: 6 }}>IPTV</Text>
                <StatStrip cards={iptvCards} />
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginVertical: 6 }}>OTT</Text>
                <StatStrip cards={ottCards} />
              </View>

              {/* PARTNERS UNDER THIS ADMIN — same table as the main Partners page */}
              <View style={[styles.pdSection, { padding: 0, overflow: 'hidden' }]}>
                <View style={[styles.pdSectionHead, { padding: 16, marginBottom: 0 }]}>
                  <Feather name="git-merge" size={16} color="#0f172a" />
                  <Text style={styles.pdSectionTitle}>Partners under {p.partner_name}</Text>
                  {loadingAdminChildren ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
                </View>
                <PartnersTable
                  list={adminChildren}
                  loading={loadingAdminChildren && adminChildren.length === 0}
                  isMobile={isMobile}
                  emptyText={`${p.partner_name} has no partners under it yet.`}
                  onOpen={(ch) => handleSelectPartner(ch, p)}
                  onWallet={(ch) => handleOpenWallet(ch)}
                  onToggleStatus={readOnly ? null : (ch) => setConfirmStatusPartner(ch)}
                  onImpersonate={canImpersonate ? (ch) => handleImpersonatePartner(ch) : null}
                  impersonatingId={impersonatingId}
                  onResetPassword={readOnly ? null : (ch) => handleOpenPartnerResetPass(ch)}
                />
              </View>
            </>
          )}
        </ScrollView>
        {renderResetPasswordModal()}
        {renderConfirmStatusModal()}
        {renderKycProvidersModal()}
        {renderAssignBranchesModal()}
        {renderComboModal()}
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
          <View style={[styles.searchBox, isMobile && { maxWidth: '100%', width: '100%', height: 42, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }]}>
            <Feather name="search" size={16} color={COLORS.textDim} />
            <TextInput
              style={[styles.searchInput, isMobile && { fontSize: 13 }]}
              placeholder={isMobile ? "Search partners, email, mobile, ID..." : "Search by partner name, company, email, mobile, or ID..."}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={COLORS.textDim}
            />
          </View>

          <View style={[
            { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' },
            isMobile && { width: '100%', flexGrow: 0, flexShrink: 0, flexBasis: 'auto', justifyContent: 'space-between', marginTop: 4 }
          ]}>
            {!readOnly ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: isMobile ? '100%' : 'auto' }}>
              {/* ADD PARTNER BUTTON (super admin only — admins are view-only) */}
              <TouchableOpacity
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 8,
                    backgroundColor: COLORS.primary || '#3b82f6',
                  },
                  isMobile && { flex: 1, justifyContent: 'center' }
                ]}
                onPress={() => handleOpenCreate('operator')}
              >
                <Feather name="user-plus" size={14} color="#ffffff" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>Add Partner</Text>
              </TouchableOpacity>

            </View>
            ) : null}

            {!readOnly ? (
            <View style={[styles.roleFilters, isMobile && { width: '100%', justifyContent: 'space-between', marginTop: 4 }]}>
              {['', 'operator', 'admin'].map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleChip,
                    isMobile && { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
                    selectedRole === role && styles.roleChipActive,
                  ]}
                  onPress={() => setSelectedRole(role)}
                >
                  <Text style={[styles.roleChipText, selectedRole === role && styles.roleChipTextActive]}>
                    {role === '' ? 'All' : role === 'operator' ? 'Operators' : 'Super Distributors'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            ) : null}
          </View>
        </View>

        {/* PARTNERS TABLE — only this login's own level; deeper levels open from each admin */}
        <View style={styles.card}>
          <PartnersTable
            list={filteredPartners}
            loading={loading}
            isMobile={isMobile}
            onOpen={(item) => handleSelectPartner(item)}
            onWallet={(item) => handleOpenWallet(item)}
            onToggleStatus={readOnly ? null : (item) => setConfirmStatusPartner(item)}
            onImpersonate={canImpersonate ? (item) => handleImpersonatePartner(item) : null}
            impersonatingId={impersonatingId}
            onResetPassword={readOnly ? null : (item) => handleOpenPartnerResetPass(item)}
          />
        </View>

        {renderResetPasswordModal()}
        {renderConfirmStatusModal()}
        {renderKycProvidersModal()}
        {renderAssignBranchesModal()}
        {renderComboModal()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.06)' },
  rowBtnText: { fontSize: 11, fontWeight: '700' },
  pdWallet: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.06)', minWidth: 220 },
  pdMini: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  pdMiniText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  pdAccountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pdAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  pdActionText: { fontSize: 12, fontWeight: '700' },
  pdSection: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', padding: 16, marginBottom: 20 },
  pdSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pdSectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  pdStatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pdStat: { flexGrow: 1, flexBasis: 100, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  pdStatNum: { fontSize: 20, fontWeight: '700' },
  pdStatLbl: { fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 2 },
  pdTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pdTile: { flexGrow: 1, flexBasis: 240, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  pdTileIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pdTileLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  pdTileHint: { fontSize: 11, color: '#64748b', marginTop: 1 },
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
  comboTableCard: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  comboTr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  comboThRow: { backgroundColor: '#f8fafc', paddingVertical: 10 },
  comboTh: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  comboTd: { fontSize: 13, color: COLORS.textMain },
  comboSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
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
