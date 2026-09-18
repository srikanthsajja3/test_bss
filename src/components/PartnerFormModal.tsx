import React, { useState } from 'react';
import type { Partner, CreatePartnerPayload, UpdatePartnerPayload } from '../types';
import { BssApiClient } from '../api/bssApi';
import {
  X,
  Building2,
  Lock,
  Wifi,
  Tv,
  Save,
  Loader2,
  AlertCircle,
  Sparkles,
  Info,
} from 'lucide-react';

interface PartnerFormModalProps {
  partner?: Partner | null; // If provided, edit mode. Otherwise, create mode.
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const PartnerFormModal: React.FC<PartnerFormModalProps> = ({
  partner,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!partner;

  // General fields
  const [partnerName, setPartnerName] = useState(partner?.partner_name || '');
  const [companyName, setCompanyName] = useState(partner?.company_name || '');
  const [mobile, setMobile] = useState(partner?.partner_mobile || '');
  const [email, setEmail] = useState(partner?.partner_email || '');
  const [region, setRegion] = useState(partner?.partner_region || '');

  // Login credentials (for Create only)
  const [username, setUsername] = useState(partner?.account_username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'admin'>('operator');

  // Internet mapping
  const [internetBaseUrl, setInternetBaseUrl] = useState(
    partner?.internet_base_url || 'https://radius.vrplay.in'
  );
  const [internetToken, setInternetToken] = useState(partner?.internet_token || 'sdfghjkluytresa');
  const [internetPartnerId, setInternetPartnerId] = useState(partner?.internet_partner_id || '222');
  const [internetBranchId, setInternetBranchId] = useState(partner?.internet_branch_id || '111');

  // IPTV mapping
  const [iptvBaseUrl, setIptvBaseUrl] = useState(partner?.iptv_base_url || '');
  const [iptvKey, setIptvKey] = useState(partner?.iptv_key || '');
  const [iptvOperatorId, setIptvOperatorId] = useState<string>(
    partner?.iptv_operator_id ? String(partner.iptv_operator_id) : ''
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFillSample = () => {
    setPartnerName('Sai Ram');
    setCompanyName('Sai Ram Cable Network');
    setMobile('9876543210');
    setEmail('sai.ram789@gmail.com');
    setRegion('Vijayawada');
    setUsername('oper1');
    setPassword('oper1');
    setRole('operator');
    setInternetBaseUrl('https://radius.vrplay.in');
    setInternetToken('sdfghjkluytresa');
    setInternetPartnerId('222');
    setInternetBranchId('111');
    setIptvBaseUrl('');
    setIptvKey('');
    setIptvOperatorId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const internet_mapping = {
        internet_base_url: internetBaseUrl,
        internet_token: internetToken,
        internet_partner_id: internetPartnerId,
        internet_branch_id: internetBranchId,
      };

      const iptv_mapping = {
        iptv_base_url: iptvBaseUrl,
        iptv_key: iptvKey,
        iptv_operator_id: iptvOperatorId,
      };

      if (isEditing && partner) {
        const payload: UpdatePartnerPayload = {
          partner_name: partnerName,
          company_name: companyName,
          partner_mobile: mobile,
          partner_email: email,
          partner_region: region,
          internet_mapping,
          iptv_mapping,
        };
        const res = await BssApiClient.updatePartner(partner.partner_id, payload);
        onSuccess(res.message || 'Partner updated successfully!');
      } else {
        const payload: CreatePartnerPayload = {
          partner_name: partnerName,
          company_name: companyName,
          partner_mobile: mobile,
          partner_email: email,
          partner_region: region,
          login: {
            username,
            password,
            role,
          },
          internet_mapping,
          iptv_mapping,
        };
        const res = await BssApiClient.createPartner(payload);
        onSuccess(res.message || 'Partner created successfully!');
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save partner');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">
                {isEditing ? `Edit Partner #${partner?.partner_id}` : 'Create New Partner'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditing
                  ? 'Update partner settings via PUT /b_bss/partner.php?id=' + partner?.partner_id
                  : 'Register a partner with RADIUS & IPTV integrations via POST /b_bss/partner.php'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                type="button"
                onClick={handleFillSample}
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs font-medium border border-slate-700 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Doc Sample</span>
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
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {error && (
              <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-start space-x-3 text-rose-300 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold">Error submitting request</h4>
                  <p className="text-xs mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Section 1: Partner Information */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>General Information</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Partner Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="e.g. Sai Ram"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Sai Ram Cable Network"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. sai.ram789@gmail.com"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Region / City *
                  </label>
                  <input
                    type="text"
                    required
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. Vijayawada"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Login Credentials (Only for creation) */}
            {!isEditing && (
              <div className="border-t border-slate-800 pt-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Account Credentials</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. oper1"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. oper1"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Role *</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as 'operator' | 'admin')}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Internet (RADIUS) Mapping */}
            <div className="border-t border-slate-800 pt-5">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Wifi className="w-3.5 h-3.5" />
                <span>Internet / RADIUS Mapping</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Internet Base URL
                  </label>
                  <input
                    type="text"
                    value={internetBaseUrl}
                    onChange={(e) => setInternetBaseUrl(e.target.value)}
                    placeholder="https://radius.vrplay.in"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Internet Partner ID
                  </label>
                  <input
                    type="text"
                    value={internetPartnerId}
                    onChange={(e) => setInternetPartnerId(e.target.value)}
                    placeholder="e.g. 222"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Internet Branch ID
                  </label>
                  <input
                    type="text"
                    value={internetBranchId}
                    onChange={(e) => setInternetBranchId(e.target.value)}
                    placeholder="e.g. 111"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Internet Token
                  </label>
                  <input
                    type="text"
                    value={internetToken}
                    onChange={(e) => setInternetToken(e.target.value)}
                    placeholder="e.g. sdfghjkluytresa"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: IPTV Mapping */}
            <div className="border-t border-slate-800 pt-5">
              <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Tv className="w-3.5 h-3.5" />
                <span>IPTV Mapping</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    IPTV Base URL
                  </label>
                  <input
                    type="text"
                    value={iptvBaseUrl}
                    onChange={(e) => setIptvBaseUrl(e.target.value)}
                    placeholder="e.g. https://iptv.example.com"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    IPTV Operator ID
                  </label>
                  <input
                    type="text"
                    value={iptvOperatorId}
                    onChange={(e) => setIptvOperatorId(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    IPTV Key / Secret
                  </label>
                  <input
                    type="text"
                    value={iptvKey}
                    onChange={(e) => setIptvKey(e.target.value)}
                    placeholder="e.g. iptv-secret-key"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span>
                {isEditing ? 'Requires Bearer Token' : 'Creates partner & registers credentials'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isEditing ? 'Update Partner' : 'Create Partner'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
