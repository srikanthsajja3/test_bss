import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  Server,
  LogOut,
  Terminal,
  User,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';

interface NavbarProps {
  onOpenCreate: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggleConsole: () => void;
  isConsoleOpen: boolean;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCreate,
  onRefresh,
  onOpenSettings,
  onToggleConsole,
  isConsoleOpen,
  isRefreshing,
}) => {
  const { user, isAuthenticated, logout, baseUrl } = useAuth();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg flex items-center justify-center text-white shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">OneBSS</span>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                Partner Portal
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Broadband & IPTV BSS Management System
            </p>
          </div>
        </div>

        {/* Right: Actions and User */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {isAuthenticated && (
            <>
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh Partners"
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={onOpenCreate}
                className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-1.5 rounded-lg shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Add Partner</span>
              </button>
            </>
          )}

          {/* Settings & Endpoint pill */}
          <button
            onClick={onOpenSettings}
            title="Configure API Endpoint"
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline max-w-[140px] truncate">{baseUrl}</span>
          </button>

          {/* API Console Toggle */}
          <button
            onClick={onToggleConsole}
            title="Toggle API Request/Response Log Console"
            className={`p-2 rounded-lg transition border text-xs flex items-center space-x-1 ${
              isConsoleOpen
                ? 'bg-indigo-950 text-indigo-300 border-indigo-600'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span className="hidden lg:inline">Logs</span>
          </button>

          {/* User / Logout */}
          {isAuthenticated ? (
            <div className="flex items-center pl-2 border-l border-slate-800 space-x-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-white">
                  {user?.partner_name || 'Admin'}
                </span>
                <span className="text-[10px] text-indigo-400 capitalize">
                  {user?.role || 'SuperAdmin'}
                </span>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-400">
              <User className="w-4 h-4 mr-1 text-slate-500" />
              <span>Not logged in</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
