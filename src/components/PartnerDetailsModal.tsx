import React, { useState, useEffect } from 'react';
import type { Partner } from '../types';
import { BssApiClient } from '../api/bssApi';
import {
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Wifi,
  Tv,
  Edit,
  Code,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Hash,
  UserCheck,
  Layers,
} from 'lucide-react';

interface PartnerDetailsModalProps {
  partnerId: number;
  initialData?: Partner | null;
  onClose: () => void;
  onEdit: (partner: Partner) => void;
  onManagePlans?: (partner: Partner, tab?: 'internet' | 'iptv') => void;
}

export const PartnerDetailsModal: React.FC<PartnerDetailsModalProps> = ({
  partnerId,
  initialData,
  onClose,
  onEdit,
  onManagePlans,
}) => {
  const [partner, setPartner] = useState<Partner | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await BssApiClient.getPartnerById(partnerId);
        if (isMounted) {
          setPartner(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load partner details');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [partnerId]);

  const handleCopyJson = () => {
    if (!partner) return;
    navigator.clipboard.writeText(JSON.stringify(partner, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">
                {partner?.partner_name || `Partner #${partnerId}`}
              </h3>
              <p className="text-xs text-slate-400">
                {partner?.company_name || 'Loading details...'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {partner && onManagePlans && (
              <button
                onClick={() => onManagePlans(partner)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-medium transition"
                title="Manage Internet & IPTV Plan Mappings"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Plans</span>
              </button>
            )}
            {partner && (
              <button
                onClick={() => onEdit(partner)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm">Fetching partner info via GET /b_bss/partner.php?id={partnerId}...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-start space-x-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold">Unable to fetch partner</h4>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {partner && !loading && (
            <>
              {/* Partner Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <Hash className="w-3 h-3 text-slate-500" />
                    <span>Partner ID</span>
                  </span>
                  <p className="text-base font-bold text-white mt-1">{partner.partner_id}</p>
                </div>

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <UserCheck className="w-3 h-3 text-slate-500" />
                    <span>Status</span>
                  </span>
                  <p className="text-xs font-semibold uppercase mt-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full inline-block ${
                        partner.status === 'enabled'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {partner.status || 'Active'}
                    </span>
                  </p>
                </div>

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Region</span>
                  <p className="text-sm font-semibold text-white mt-1 flex items-center space-x-1 truncate">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    <span className="truncate">{partner.partner_region || 'N/A'}</span>
                  </p>
                </div>

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Created By</span>
                  <p className="text-sm font-medium text-slate-300 mt-1">
                    {partner.created_by ? `ID: ${partner.created_by}` : 'System'}
                  </p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Contact Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2.5">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="text-xs text-slate-500 block">Mobile</span>
                      <span className="text-slate-200 font-medium">{partner.partner_mobile || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <div className="truncate">
                      <span className="text-xs text-slate-500 block">Email</span>
                      <span className="text-slate-200 font-medium truncate block">
                        {partner.partner_email || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Internet Mapping */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Wifi className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      Internet Mapping Config
                    </h4>
                  </div>
                  {onManagePlans && (
                    <button
                      onClick={() => onManagePlans(partner, 'internet')}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-medium bg-cyan-950/40 hover:bg-cyan-950/60 px-2 py-1 rounded border border-cyan-800/40 transition"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Internet Plans</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Base URL</span>
                    <span className="font-mono text-slate-200 break-all">
                      {partner.internet_base_url || 'Not configured'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Branch ID / Partner ID</span>
                    <span className="text-slate-200 font-medium">
                      Branch: {partner.internet_branch_id || 'N/A'} | Partner:{' '}
                      {partner.internet_partner_id || 'N/A'}
                    </span>
                  </div>
                  {partner.internet_token && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Integration Token</span>
                      <span className="font-mono text-slate-300 bg-slate-900 px-2 py-1 rounded block truncate">
                        {partner.internet_token}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* IPTV Mapping */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Tv className="w-4 h-4 text-violet-400" />
                    <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider">
                      IPTV Mapping Config
                    </h4>
                  </div>
                  {onManagePlans && (
                    <button
                      onClick={() => onManagePlans(partner, 'iptv')}
                      className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center space-x-1 font-medium bg-violet-950/40 hover:bg-violet-950/60 px-2 py-1 rounded border border-violet-800/40 transition"
                    >
                      <Layers className="w-3 h-3" />
                      <span>IPTV Plans</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Base URL</span>
                    <span className="font-mono text-slate-200 break-all">
                      {partner.iptv_base_url || 'Not configured'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Operator ID</span>
                    <span className="text-slate-200 font-medium">
                      {partner.iptv_operator_id ? String(partner.iptv_operator_id) : 'Not assigned'}
                    </span>
                  </div>
                  {partner.iptv_key && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">IPTV Secret Key</span>
                      <span className="font-mono text-slate-300 bg-slate-900 px-2 py-1 rounded block truncate">
                        {partner.iptv_key}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Raw JSON Accordion */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="w-full px-4 py-2.5 bg-slate-800/30 hover:bg-slate-800/60 flex items-center justify-between text-xs text-slate-400 transition"
                >
                  <span className="flex items-center space-x-1.5 font-mono">
                    <Code className="w-3.5 h-3.5" />
                    <span>Raw JSON Response</span>
                  </span>
                  <span>{showRawJson ? 'Hide' : 'Inspect'}</span>
                </button>
                {showRawJson && (
                  <div className="p-3 bg-slate-950 border-t border-slate-800 relative">
                    <button
                      onClick={handleCopyJson}
                      className="absolute top-3 right-3 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center space-x-1 transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[10px]">Copy</span>
                        </>
                      )}
                    </button>
                    <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto p-1 leading-relaxed">
                      {JSON.stringify(partner, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
