import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  Partner,
  InternetPlan,
  IptvPlan,
  InternetPlanMappingItem,
  IptvPlanMappingItem,
  PlanSyncResponse,
} from '../types';
import { BssApiClient } from '../api/bssApi';
import {
  X,
  Wifi,
  Tv,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Tag,
  Calendar,
  Layers,
  Check,
  RotateCw,
} from 'lucide-react';

interface PlanMappingModalProps {
  partner: Partner;
  initialTab?: 'internet' | 'iptv';
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export const PlanMappingModal: React.FC<PlanMappingModalProps> = ({
  partner,
  initialTab = 'internet',
  onClose,
  onSuccessToast,
}) => {
  const [activeTab, setActiveTab] = useState<'internet' | 'iptv'>(initialTab);

  // Internet Plans state
  const [internetPlans, setInternetPlans] = useState<InternetPlan[]>([]);
  const [loadingInternet, setLoadingInternet] = useState(false);
  const [internetError, setInternetError] = useState<string | null>(null);
  const [syncingInternet, setSyncingInternet] = useState(false);
  const [internetSyncResult, setInternetSyncResult] = useState<PlanSyncResponse | null>(null);
  const [internetSearch, setInternetSearch] = useState('');
  const [internetFilter, setInternetFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');

  // Local selection and custom prices for Internet mapping
  // Map of sub_plan_id -> { selected: boolean, price: string }
  const [internetSelection, setInternetSelection] = useState<
    Record<number, { selected: boolean; price: string }>
  >({});
  const [savingInternet, setSavingInternet] = useState(false);

  // IPTV Plans state
  const [iptvPlans, setIptvPlans] = useState<IptvPlan[]>([]);
  const [loadingIptv, setLoadingIptv] = useState(false);
  const [iptvError, setIptvError] = useState<string | null>(null);
  const [syncingIptv, setSyncingIptv] = useState(false);
  const [iptvSyncResult, setIptvSyncResult] = useState<PlanSyncResponse | null>(null);
  const [iptvSearch, setIptvSearch] = useState('');
  const [iptvFilter, setIptvFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [iptvTypeFilter, setIptvTypeFilter] = useState<string>('all');

  // Map of sub_plan_id -> { selected: boolean, price: string }
  const [iptvSelection, setIptvSelection] = useState<
    Record<number, { selected: boolean; price: string }>
  >({});
  const [savingIptv, setSavingIptv] = useState(false);

  // Message / Notification banner
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setStatusBanner({ type, text });
    setTimeout(() => setStatusBanner(null), 5000);
  };

  // 1. Fetch Internet Plans
  const fetchInternetPlans = useCallback(async () => {
    setLoadingInternet(true);
    setInternetError(null);
    try {
      const plans = await BssApiClient.getInternetPlanMapping(partner.partner_id);
      setInternetPlans(plans || []);

      // Initialize mapping selection from existing data
      const initialSelection: Record<number, { selected: boolean; price: string }> = {};
      plans.forEach((plan) => {
        plan.subplans?.forEach((sub) => {
          initialSelection[sub.sub_plan_id] = {
            selected: !!sub.is_mapped,
            price: sub.mapped_price ?? sub.base_price ?? '',
          };
        });
      });
      setInternetSelection(initialSelection);
    } catch (err: any) {
      setInternetError(err?.message || 'Failed to fetch internet plans');
    } finally {
      setLoadingInternet(false);
    }
  }, [partner.partner_id]);

  // 2. Fetch IPTV Plans
  const fetchIptvPlans = useCallback(async () => {
    setLoadingIptv(true);
    setIptvError(null);
    try {
      const plans = await BssApiClient.getIptvPlanMapping(partner.partner_id);
      setIptvPlans(plans || []);

      const initialSelection: Record<number, { selected: boolean; price: string }> = {};
      plans.forEach((plan) => {
        initialSelection[plan.sub_plan_id] = {
          selected: !!plan.is_mapped,
          price: plan.mapped_price ?? plan.base_price ?? '',
        };
      });
      setIptvSelection(initialSelection);
    } catch (err: any) {
      setIptvError(err?.message || 'Failed to fetch IPTV plans');
    } finally {
      setLoadingIptv(false);
    }
  }, [partner.partner_id]);

  useEffect(() => {
    if (activeTab === 'internet' && internetPlans.length === 0 && !loadingInternet) {
      fetchInternetPlans();
    } else if (activeTab === 'iptv' && iptvPlans.length === 0 && !loadingIptv) {
      fetchIptvPlans();
    }
  }, [activeTab, fetchInternetPlans, fetchIptvPlans, internetPlans.length, iptvPlans.length, loadingInternet, loadingIptv]);

  // Handle Internet Sync
  const handleInternetSync = async () => {
    setSyncingInternet(true);
    setInternetSyncResult(null);
    try {
      const res = await BssApiClient.syncInternetPlans(partner.partner_id);
      setInternetSyncResult(res);
      showBanner(
        'success',
        res.message ||
          `Sync complete: ${res.summary?.plans_added ?? 0} plans added, ${
            res.summary?.subplans_added ?? 0
          } subplans added.`
      );
      // Refresh listing
      await fetchInternetPlans();
    } catch (err: any) {
      showBanner('error', `Internet Plan Sync failed: ${err.message}`);
    } finally {
      setSyncingInternet(false);
    }
  };

  // Handle IPTV Sync
  const handleIptvSync = async () => {
    setSyncingIptv(true);
    setIptvSyncResult(null);
    try {
      const res = await BssApiClient.syncIptvPlans(partner.partner_id);
      setIptvSyncResult(res);
      showBanner(
        'success',
        res.message ||
          `Sync complete: ${res.summary?.plans_added ?? 0} plans added, ${
            res.summary?.subplans_added ?? 0
          } subplans added.`
      );
      await fetchIptvPlans();
    } catch (err: any) {
      showBanner('error', `IPTV Plan Sync failed: ${err.message}`);
    } finally {
      setSyncingIptv(false);
    }
  };

  // Save Internet Mapping
  const handleSaveInternetMapping = async () => {
    const selectedItems: InternetPlanMappingItem[] = [];
    Object.entries(internetSelection).forEach(([idStr, state]) => {
      if (state.selected) {
        const id = parseInt(idStr, 10);
        const item: InternetPlanMappingItem = {
          internet_sub_plan_id: id,
        };
        const p = parseFloat(state.price);
        if (!isNaN(p) && p >= 0) {
          item.price = p;
        }
        selectedItems.push(item);
      }
    });

    if (selectedItems.length === 0) {
      showBanner('error', 'Please select at least one sub-plan to map.');
      return;
    }

    setSavingInternet(true);
    try {
      const res = await BssApiClient.saveInternetPlanMapping({
        partner_id: partner.partner_id,
        plans: selectedItems,
      });
      showBanner('success', res.message || `${selectedItems.length} internet plan(s) mapped successfully!`);
      if (onSuccessToast) onSuccessToast(res.message || 'Internet plans mapped successfully!');
      await fetchInternetPlans();
    } catch (err: any) {
      showBanner('error', `Failed to save internet mapping: ${err.message}`);
    } finally {
      setSavingInternet(false);
    }
  };

  // Save IPTV Mapping
  const handleSaveIptvMapping = async () => {
    const selectedItems: IptvPlanMappingItem[] = [];
    Object.entries(iptvSelection).forEach(([idStr, state]) => {
      if (state.selected) {
        const id = parseInt(idStr, 10);
        const item: IptvPlanMappingItem = {
          iptv_sub_plan_id: id,
        };
        const p = parseFloat(state.price);
        if (!isNaN(p) && p >= 0) {
          item.price = p;
        }
        selectedItems.push(item);
      }
    });

    if (selectedItems.length === 0) {
      showBanner('error', 'Please select at least one IPTV plan to map.');
      return;
    }

    setSavingIptv(true);
    try {
      const res = await BssApiClient.saveIptvPlanMapping({
        partner_id: partner.partner_id,
        plans: selectedItems,
      });
      showBanner('success', res.message || `${selectedItems.length} IPTV plan(s) mapped successfully!`);
      if (onSuccessToast) onSuccessToast(res.message || 'IPTV plans mapped successfully!');
      await fetchIptvPlans();
    } catch (err: any) {
      showBanner('error', `Failed to save IPTV mapping: ${err.message}`);
    } finally {
      setSavingIptv(false);
    }
  };

  // Filtering Internet Plans
  const filteredInternetPlans = useMemo(() => {
    const q = internetSearch.toLowerCase().trim();
    return internetPlans
      .map((plan) => {
        const planMatches = !q || plan.plan_name.toLowerCase().includes(q) || plan.data.toLowerCase().includes(q);
        const matchingSubplans = (plan.subplans || []).filter((sub) => {
          const subMatches = !q || planMatches || sub.sub_plan_name.toLowerCase().includes(q) || String(sub.sub_plan_id).includes(q);
          const isSelected = internetSelection[sub.sub_plan_id]?.selected ?? sub.is_mapped;
          if (internetFilter === 'mapped' && !isSelected) return false;
          if (internetFilter === 'unmapped' && isSelected) return false;
          return subMatches;
        });

        return {
          ...plan,
          subplans: matchingSubplans,
        };
      })
      .filter((plan) => plan.subplans.length > 0);
  }, [internetPlans, internetSearch, internetFilter, internetSelection]);

  // Filtering IPTV Plans
  const filteredIptvPlans = useMemo(() => {
    const q = iptvSearch.toLowerCase().trim();
    return iptvPlans.filter((plan) => {
      const matchesSearch =
        !q ||
        plan.plan_name?.toLowerCase().includes(q) ||
        plan.type?.toLowerCase().includes(q) ||
        String(plan.sub_plan_id).includes(q) ||
        String(plan.plan_id).includes(q);

      const isSelected = iptvSelection[plan.sub_plan_id]?.selected ?? plan.is_mapped;
      if (iptvFilter === 'mapped' && !isSelected) return false;
      if (iptvFilter === 'unmapped' && isSelected) return false;

      if (iptvTypeFilter !== 'all' && plan.type !== iptvTypeFilter) return false;

      return matchesSearch;
    });
  }, [iptvPlans, iptvSearch, iptvFilter, iptvTypeFilter, iptvSelection]);

  // Distinct IPTV Types for category tabs
  const iptvTypes = useMemo(() => {
    const types = new Set<string>();
    iptvPlans.forEach((p) => {
      if (p.type) types.add(p.type);
    });
    return Array.from(types);
  }, [iptvPlans]);

  // Selected counts
  const internetSelectedCount = Object.values(internetSelection).filter((s) => s.selected).length;
  const iptvSelectedCount = Object.values(iptvSelection).filter((s) => s.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-lg text-white">Plan Catalog & Mapping</h3>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700">
                  Partner #{partner.partner_id}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {partner.partner_name} • {partner.company_name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-800 bg-slate-900/60">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('internet')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 ${
                activeTab === 'internet'
                  ? 'bg-slate-800/80 text-cyan-400 border-cyan-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Wifi className="w-4 h-4" />
              <span>Internet Plans (RADIUS)</span>
              {internetPlans.length > 0 && (
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300 font-mono">
                  {internetPlans.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('iptv')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 ${
                activeTab === 'iptv'
                  ? 'bg-slate-800/80 text-violet-400 border-violet-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>IPTV Plans & Bouquets</span>
              {iptvPlans.length > 0 && (
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300 font-mono">
                  {iptvPlans.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Endpoint indicator */}
          <div className="hidden sm:flex items-center text-[11px] text-slate-500 font-mono">
            {activeTab === 'internet' ? 'POST & GET /internet_plan_mapping.php' : 'POST & GET /iptv_plan_mapping.php'}
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusBanner && (
          <div
            className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
              statusBanner.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/70 border-rose-800 text-rose-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Internet Plans */}
        {activeTab === 'internet' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col space-y-4">
            {/* Top action row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/40 p-3.5 rounded-xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleInternetSync}
                  disabled={syncingInternet}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                  title="Calls POST /b_bss/internet_plan_sync.php?partner_id=..."
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingInternet ? 'animate-spin' : ''}`} />
                  <span>{syncingInternet ? 'Syncing Catalog...' : 'Sync Catalog from RADIUS'}</span>
                </button>

                <button
                  onClick={fetchInternetPlans}
                  disabled={loadingInternet}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                  title="Reload mapping from server"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loadingInternet ? 'animate-spin' : ''}`} />
                </button>

                {internetSyncResult?.summary && (
                  <span className="text-[11px] text-cyan-400 font-mono bg-cyan-950/50 px-2 py-1 rounded border border-cyan-800/40">
                    Added: {internetSyncResult.summary.subplans_added ?? 0} subplans | Skipped: {internetSyncResult.summary.plans_skipped ?? 0}
                  </span>
                )}
              </div>

              {/* Search & Filter */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search speed or plan..."
                    value={internetSearch}
                    onChange={(e) => setInternetSearch(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44"
                  />
                </div>

                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                  <button
                    onClick={() => setInternetFilter('all')}
                    className={`px-2 py-0.5 rounded-md ${
                      internetFilter === 'all' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setInternetFilter('mapped')}
                    className={`px-2 py-0.5 rounded-md ${
                      internetFilter === 'mapped' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mapped
                  </button>
                  <button
                    onClick={() => setInternetFilter('unmapped')}
                    className={`px-2 py-0.5 rounded-md ${
                      internetFilter === 'unmapped' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Unmapped
                  </button>
                </div>
              </div>
            </div>

            {/* Content list */}
            {loadingInternet ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                <p className="text-xs font-medium">Fetching internet plan mapping for Partner #{partner.partner_id}...</p>
              </div>
            ) : internetError ? (
              <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-start space-x-3 text-rose-300 text-xs">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Failed to load Internet Plans</h4>
                  <p className="mt-0.5">{internetError}</p>
                </div>
              </div>
            ) : filteredInternetPlans.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                <Wifi className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium">No internet plans found matching your criteria.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Click "Sync Catalog from RADIUS" above to fetch plans from the operator's RADIUS server.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInternetPlans.map((plan) => (
                  <div
                    key={plan.plan_id}
                    className="bg-slate-800/30 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                  >
                    {/* Plan Header */}
                    <div className="bg-slate-800/60 px-4 py-2.5 border-b border-slate-700/60 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-white">{plan.plan_name}</span>
                        <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">
                          {plan.data || 'Unlimited'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        Plan ID: #{plan.plan_id} • {plan.subplans.length} sub-plan(s)
                      </span>
                    </div>

                    {/* Sub-plans Table */}
                    <div className="divide-y divide-slate-800">
                      {plan.subplans.map((sub) => {
                        const isSelected = !!internetSelection[sub.sub_plan_id]?.selected;
                        const currentPrice = internetSelection[sub.sub_plan_id]?.price ?? sub.base_price ?? '';

                        return (
                          <div
                            key={sub.sub_plan_id}
                            className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                              isSelected ? 'bg-cyan-950/15' : 'hover:bg-slate-800/20'
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setInternetSelection((prev) => ({
                                    ...prev,
                                    [sub.sub_plan_id]: {
                                      selected: checked,
                                      price: prev[sub.sub_plan_id]?.price ?? sub.base_price ?? '',
                                    },
                                  }));
                                }}
                                className="mt-1 w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                              />

                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-semibold text-white">
                                    {sub.sub_plan_name}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                    #{sub.sub_plan_id}
                                  </span>
                                  {sub.is_mapped ? (
                                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded-full flex items-center space-x-0.5">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Mapped ({sub.mapped_price})</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                                      Unmapped
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-1">
                                  <span className="flex items-center space-x-1">
                                    <Calendar className="w-3 h-3 text-slate-500" />
                                    <span>{sub.plan_validity} Days</span>
                                  </span>
                                  <span className="flex items-center space-x-1">
                                    <Tag className="w-3 h-3 text-slate-500" />
                                    <span>Base: ₹{sub.base_price}</span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Price adjustment & Map quick action */}
                            <div className="flex items-center space-x-2 self-end sm:self-center">
                              <span className="text-xs text-slate-400">Offer Price (₹):</span>
                              <input
                                type="number"
                                placeholder={sub.base_price || '0.00'}
                                value={currentPrice}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInternetSelection((prev) => ({
                                    ...prev,
                                    [sub.sub_plan_id]: {
                                      selected: true, // auto-select on editing price
                                      price: val,
                                    },
                                  }));
                                }}
                                className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded text-xs font-mono text-white text-right focus:outline-none"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: IPTV Plans */}
        {activeTab === 'iptv' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col space-y-4">
            {/* Top action row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/40 p-3.5 rounded-xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleIptvSync}
                  disabled={syncingIptv}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                  title="Calls POST /b_bss/iptv_plan_sync.php?partner_id=..."
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingIptv ? 'animate-spin' : ''}`} />
                  <span>{syncingIptv ? 'Syncing IPTV...' : 'Sync Catalog from IPTV'}</span>
                </button>

                <button
                  onClick={fetchIptvPlans}
                  disabled={loadingIptv}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                  title="Reload IPTV mapping from server"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loadingIptv ? 'animate-spin' : ''}`} />
                </button>

                {iptvSyncResult?.summary && (
                  <span className="text-[11px] text-violet-400 font-mono bg-violet-950/50 px-2 py-1 rounded border border-violet-800/40">
                    Added: {iptvSyncResult.summary.plans_added ?? 0} plans
                  </span>
                )}
              </div>

              {/* Search & Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search channel or bouquet..."
                    value={iptvSearch}
                    onChange={(e) => setIptvSearch(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 w-44"
                  />
                </div>

                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                  <button
                    onClick={() => setIptvFilter('all')}
                    className={`px-2 py-0.5 rounded-md ${
                      iptvFilter === 'all' ? 'bg-violet-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setIptvFilter('mapped')}
                    className={`px-2 py-0.5 rounded-md ${
                      iptvFilter === 'mapped' ? 'bg-violet-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mapped
                  </button>
                  <button
                    onClick={() => setIptvFilter('unmapped')}
                    className={`px-2 py-0.5 rounded-md ${
                      iptvFilter === 'unmapped' ? 'bg-violet-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Unmapped
                  </button>
                </div>
              </div>
            </div>

            {/* Type filters if any */}
            {iptvTypes.length > 0 && (
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] text-slate-400 mr-1">Category:</span>
                <button
                  onClick={() => setIptvTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                    iptvTypeFilter === 'all'
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All Types
                </button>
                {iptvTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setIptvTypeFilter(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                      iptvTypeFilter === t
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Content list */}
            {loadingIptv ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                <p className="text-xs font-medium">Fetching IPTV plan mapping for Partner #{partner.partner_id}...</p>
              </div>
            ) : iptvError ? (
              <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-start space-x-3 text-rose-300 text-xs">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Failed to load IPTV Plans</h4>
                  <p className="mt-0.5">{iptvError}</p>
                </div>
              </div>
            ) : filteredIptvPlans.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                <Tv className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium">No IPTV plans found matching your criteria.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Ensure IPTV provider credentials are set up for this partner and click "Sync Catalog from IPTV".
                </p>
              </div>
            ) : (
              <div className="bg-slate-800/30 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 shadow-sm">
                {filteredIptvPlans.map((plan) => {
                  const isSelected = !!iptvSelection[plan.sub_plan_id]?.selected;
                  const currentPrice = iptvSelection[plan.sub_plan_id]?.price ?? plan.base_price ?? '';

                  return (
                    <div
                      key={plan.sub_plan_id}
                      className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                        isSelected ? 'bg-violet-950/15' : 'hover:bg-slate-800/20'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIptvSelection((prev) => ({
                              ...prev,
                              [plan.sub_plan_id]: {
                                selected: checked,
                                price: prev[plan.sub_plan_id]?.price ?? plan.base_price ?? '',
                              },
                            }));
                          }}
                          className="mt-1 w-4 h-4 rounded border-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                        />

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white">
                              {plan.plan_name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                              #{plan.sub_plan_id}
                            </span>
                            {plan.type && (
                              <span className="text-[10px] bg-slate-800 text-violet-300 border border-slate-700 px-1.5 py-0.5 rounded">
                                {plan.type}
                              </span>
                            )}
                            {plan.is_mapped ? (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded-full flex items-center space-x-0.5">
                                <Check className="w-2.5 h-2.5" />
                                <span>Mapped ({plan.mapped_price})</span>
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                                Unmapped
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-1">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span>{plan.plan_validity || 30} Days</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Tag className="w-3 h-3 text-slate-500" />
                              <span>Base: ₹{plan.base_price}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Price input */}
                      <div className="flex items-center space-x-2 self-end sm:self-center">
                        <span className="text-xs text-slate-400">Offer Price (₹):</span>
                        <input
                          type="number"
                          placeholder={plan.base_price || '0.00'}
                          value={currentPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            setIptvSelection((prev) => ({
                              ...prev,
                              [plan.sub_plan_id]: {
                                selected: true,
                                price: val,
                              },
                            }));
                          }}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 focus:border-violet-500 rounded text-xs font-mono text-white text-right focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {activeTab === 'internet' ? (
              <span>
                <strong className="text-cyan-400">{internetSelectedCount}</strong> sub-plan(s) selected for mapping
              </span>
            ) : (
              <span>
                <strong className="text-violet-400">{iptvSelectedCount}</strong> IPTV plan(s) selected for mapping
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              Close
            </button>

            {activeTab === 'internet' ? (
              <button
                onClick={handleSaveInternetMapping}
                disabled={savingInternet || internetSelectedCount === 0}
                className="flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg transition disabled:opacity-50"
              >
                {savingInternet ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save Internet Mappings</span>
              </button>
            ) : (
              <button
                onClick={handleSaveIptvMapping}
                disabled={savingIptv || iptvSelectedCount === 0}
                className="flex items-center space-x-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-lg transition disabled:opacity-50"
              >
                {savingIptv ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save IPTV Mappings</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
