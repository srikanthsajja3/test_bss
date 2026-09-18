import React, { useState, useMemo } from 'react';
import type { Partner } from '../types';
import { PartnerCard } from './PartnerCard';
import {
  Search,
  Users,
  Shield,
  Radio,
  SearchCode,
  Loader2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';

interface PartnerListProps {
  partners: Partner[];
  loading: boolean;
  error: string | null;
  activeRole: string;
  onRoleChange: (role: string) => void;
  onViewPartner: (partner: Partner) => void;
  onEditPartner: (partner: Partner) => void;
  onManagePlans?: (partner: Partner, tab?: 'internet' | 'iptv') => void;
  onDirectLookup: (id: number) => void;
  onOpenCreate: () => void;
}

export const PartnerList: React.FC<PartnerListProps> = ({
  partners,
  loading,
  error,
  activeRole,
  onRoleChange,
  onViewPartner,
  onEditPartner,
  onManagePlans,
  onDirectLookup,
  onOpenCreate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [directIdInput, setDirectIdInput] = useState('');

  // Filtered partners based on search
  const filteredPartners = useMemo(() => {
    if (!searchQuery.trim()) return partners;
    const q = searchQuery.toLowerCase();
    return partners.filter((p) => {
      return (
        p.partner_name?.toLowerCase().includes(q) ||
        p.company_name?.toLowerCase().includes(q) ||
        p.partner_email?.toLowerCase().includes(q) ||
        p.partner_mobile?.toLowerCase().includes(q) ||
        p.partner_region?.toLowerCase().includes(q) ||
        String(p.partner_id).includes(q)
      );
    });
  }, [partners, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = partners.length;
    const operators = partners.filter((p) => p.account_role === 'operator').length;
    const admins = partners.filter((p) => p.account_role === 'admin').length;
    const enabled = partners.filter((p) => p.status === 'enabled').length;
    return { total, operators, admins, enabled };
  }, [partners]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(directIdInput.trim(), 10);
    if (!isNaN(id) && id > 0) {
      onDirectLookup(id);
      setDirectIdInput('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Partners</span>
            <span className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats.total}</p>
          <span className="text-[11px] text-slate-500">Listed across query filters</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Operators</span>
            <span className="p-2 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <Radio className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats.operators}</p>
          <span className="text-[11px] text-slate-500">role=operator</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Administrators</span>
            <span className="p-2 rounded-xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <Shield className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats.admins}</p>
          <span className="text-[11px] text-slate-500">role=admin</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Enabled Status</span>
            <span className="p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{stats.enabled}</p>
          <span className="text-[11px] text-slate-500">Active integrations</span>
        </div>
      </div>

      {/* Controls Bar: Role Filters & Direct ID Lookup */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Role Tabs */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          {[
            { id: '', label: 'All Partners' },
            { id: 'operator', label: 'Operators' },
            { id: 'admin', label: 'Admins' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onRoleChange(tab.id)}
              className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeRole === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Direct ID Lookup */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search partner, region..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Direct ID lookup form */}
          <form onSubmit={handleLookupSubmit} className="flex items-center space-x-1 w-full sm:w-auto">
            <input
              type="number"
              value={directIdInput}
              onChange={(e) => setDirectIdInput(e.target.value)}
              placeholder="Partner ID (e.g. 1112)"
              className="w-full sm:w-40 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <button
              type="submit"
              title="Lookup by ID via GET /b_bss/partner.php?id={id}"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-xl transition flex items-center space-x-1 flex-shrink-0"
            >
              <SearchCode className="w-3.5 h-3.5" />
              <span>Fetch</span>
            </button>
          </form>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-start space-x-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Failed to fetch partner list:</span> {error}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Loading partners from OneBSS API...</p>
          <span className="text-xs text-slate-500 font-mono">
            GET /b_bss/partner.php{activeRole ? `?role=${activeRole}` : ''}
          </span>
        </div>
      ) : filteredPartners.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPartners.map((partner) => (
            <PartnerCard
              key={partner.partner_id}
              partner={partner}
              onView={onViewPartner}
              onEdit={onEditPartner}
              onManagePlans={onManagePlans}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="inline-flex p-3 bg-slate-800 rounded-2xl text-slate-400 mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Partners Found</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">
            {searchQuery
              ? `No partners matched your search query "${searchQuery}".`
              : activeRole
              ? `No partners found with role "${activeRole}".`
              : 'There are no partners available yet or the API returned an empty list.'}
          </p>
          <button
            onClick={onOpenCreate}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create First Partner</span>
          </button>
        </div>
      )}
    </div>
  );
};
