import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_API_BASE, DIRECT_API_BASE, BssApiClient } from '../api/bssApi';
import { Server, X, Check, Key, RotateCcw } from 'lucide-react';

interface ApiSettingsModalProps {
  onClose: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({ onClose }) => {
  const { baseUrl, updateBaseUrl, token } = useAuth();
  const [selectedUrl, setSelectedUrl] = useState(baseUrl);
  const [customUrl, setCustomUrl] = useState(
    baseUrl !== DEFAULT_API_BASE && baseUrl !== DIRECT_API_BASE ? baseUrl : ''
  );
  const [manualToken, setManualToken] = useState(token || '');
  const [savedMessage, setSavedMessage] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = customUrl.trim() ? customUrl.trim() : selectedUrl;
    updateBaseUrl(finalUrl);

    if (manualToken.trim() && manualToken !== token) {
      BssApiClient.setToken(manualToken.trim());
      window.location.reload(); // Refresh to re-init auth
    }

    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 1000);
  };

  const handleReset = () => {
    setSelectedUrl(DEFAULT_API_BASE);
    setCustomUrl('');
    updateBaseUrl(DEFAULT_API_BASE);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-white">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">API Configuration</h3>
              <p className="text-xs text-slate-400">Manage API gateway & proxy routing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select API Base Route
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  selectedUrl === DEFAULT_API_BASE && !customUrl
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                    : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="apiMode"
                  checked={selectedUrl === DEFAULT_API_BASE && !customUrl}
                  onChange={() => {
                    setSelectedUrl(DEFAULT_API_BASE);
                    setCustomUrl('');
                  }}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="ml-3">
                  <span className="text-xs font-semibold block text-indigo-300">
                    Vite Dev Proxy: <code className="text-[11px] font-mono">/b_bss</code> (Recommended)
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Forwards local requests to <code className="text-slate-300">https://demo.onebss.in</code> bypassing CORS.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  selectedUrl === DIRECT_API_BASE && !customUrl
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                    : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="apiMode"
                  checked={selectedUrl === DIRECT_API_BASE && !customUrl}
                  onChange={() => {
                    setSelectedUrl(DIRECT_API_BASE);
                    setCustomUrl('');
                  }}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="ml-3">
                  <span className="text-xs font-semibold block text-white">
                    Direct Cloud: <code className="text-[11px] font-mono">{DIRECT_API_BASE}</code>
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Direct browser requests to demo server. Requires server CORS enablement.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Custom URL Override (Optional)
            </label>
            <input
              type="text"
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value);
                setSelectedUrl(e.target.value);
              }}
              placeholder="e.g. https://your-domain.com/b_bss"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Active JWT Bearer Token</span>
              <Key className="w-3.5 h-3.5 text-slate-500" />
            </label>
            <textarea
              rows={2}
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Paste token directly to override..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {savedMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>Settings saved!</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
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
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
