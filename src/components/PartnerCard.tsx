import React from 'react';
import type { Partner } from '../types';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Wifi,
  Tv,
  Eye,
  Edit2,
  Shield,
  CheckCircle2,
  Layers,
} from 'lucide-react';

interface PartnerCardProps {
  partner: Partner;
  onView: (partner: Partner) => void;
  onEdit: (partner: Partner) => void;
  onManagePlans?: (partner: Partner, tab?: 'internet' | 'iptv') => void;
}

export const PartnerCard: React.FC<PartnerCardProps> = ({
  partner,
  onView,
  onEdit,
  onManagePlans,
}) => {
  const hasInternet = !!(partner.internet_base_url || partner.internet_partner_id);
  const hasIptv = !!(partner.iptv_base_url || partner.iptv_operator_id);

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex flex-col justify-between group">
      <div>
        {/* Top bar: ID and Role */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
              #{partner.partner_id}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-md font-medium capitalize flex items-center space-x-1 ${
                partner.account_role === 'admin'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}
            >
              <Shield className="w-3 h-3 inline mr-1" />
              {partner.account_role || 'partner'}
            </span>
          </div>

          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center space-x-1 ${
              partner.status === 'enabled'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span className="capitalize">{partner.status || 'Active'}</span>
          </span>
        </div>

        {/* Partner / Company Title */}
        <div className="mb-4">
          <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition tracking-tight">
            {partner.partner_name}
          </h3>
          <div className="flex items-center text-xs text-slate-400 mt-0.5 space-x-1">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
            <span className="truncate">{partner.company_name}</span>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-1.5 text-xs text-slate-300 bg-slate-800/50 p-3 rounded-xl border border-slate-800/80 mb-4">
          <div className="flex items-center space-x-2">
            <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="font-mono">{partner.partner_mobile || '—'}</span>
          </div>
          <div className="flex items-center space-x-2 truncate">
            <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{partner.partner_email || '—'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPin className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            <span className="truncate">{partner.partner_region || '—'}</span>
          </div>
        </div>

        {/* Integration Status Chips */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
          <div
            className={`p-2 rounded-lg border flex items-center space-x-1.5 ${
              hasInternet
                ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-300'
                : 'bg-slate-800/30 border-slate-800 text-slate-500'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
            <div className="truncate">
              <span className="block font-medium">RADIUS</span>
              <span className="text-[10px] opacity-75 truncate block">
                {partner.internet_branch_id ? `Branch ${partner.internet_branch_id}` : (hasInternet ? 'Active' : 'None')}
              </span>
            </div>
          </div>

          <div
            className={`p-2 rounded-lg border flex items-center space-x-1.5 ${
              hasIptv
                ? 'bg-violet-950/30 border-violet-800/50 text-violet-300'
                : 'bg-slate-800/30 border-slate-800 text-slate-500'
            }`}
          >
            <Tv className="w-3.5 h-3.5 flex-shrink-0" />
            <div className="truncate">
              <span className="block font-medium">IPTV</span>
              <span className="text-[10px] opacity-75 truncate block">
                {partner.iptv_operator_id ? `Op: ${partner.iptv_operator_id}` : (hasIptv ? 'Active' : 'None')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-1.5 pt-3 border-t border-slate-800">
        <button
          onClick={() => onView(partner)}
          className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center justify-center space-x-1"
          title="View full details and RADIUS/IPTV config"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Details</span>
        </button>

        {onManagePlans && (
          <button
            onClick={() => onManagePlans(partner)}
            className="flex-1 py-1.5 px-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-medium rounded-lg transition flex items-center justify-center space-x-1"
            title="Manage and map Internet & IPTV plans"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Plans</span>
          </button>
        )}

        <button
          onClick={() => onEdit(partner)}
          className="py-1.5 px-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium rounded-lg transition flex items-center space-x-1"
          title="Edit partner information"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
};
