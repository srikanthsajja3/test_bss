import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { PartnerList } from './components/PartnerList';
import { PartnerDetailsModal } from './components/PartnerDetailsModal';
import { PartnerFormModal } from './components/PartnerFormModal';
import { PlanMappingModal } from './components/PlanMappingModal';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { ApiConsole } from './components/ApiConsole';
import { BssApiClient } from './api/bssApi';
import type { Partner } from './types';
import { CheckCircle, AlertTriangle } from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { isAuthenticated, baseUrl } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('');

  // Modals state
  const [viewPartnerId, setViewPartnerId] = useState<number | null>(null);
  const [viewPartnerData, setViewPartnerData] = useState<Partner | null>(null);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [mappingPartner, setMappingPartner] = useState<Partner | null>(null);
  const [mappingTab, setMappingTab] = useState<'internet' | 'iptv'>('internet');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPartners = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await BssApiClient.getPartners(activeRole || undefined);
      setPartners(data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch partner list from API');
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeRole]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPartners();
    }
  }, [isAuthenticated, fetchPartners]);

  const handleRoleChange = (role: string) => {
    setActiveRole(role);
  };

  const handleViewPartner = (partner: Partner) => {
    setViewPartnerId(partner.partner_id);
    setViewPartnerData(partner);
  };

  const handleDirectLookup = (id: number) => {
    setViewPartnerId(id);
    setViewPartnerData(null); // Fetch directly via ID API
  };

  const handleEditPartner = (partner: Partner) => {
    setViewPartnerId(null);
    setEditPartner(partner);
  };

  const handleManagePlans = (partner: Partner, tab: 'internet' | 'iptv' = 'internet') => {
    setMappingPartner(partner);
    setMappingTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-24 selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <Navbar
        onOpenCreate={() => setIsCreateOpen(true)}
        onRefresh={fetchPartners}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleConsole={() => setIsConsoleOpen((prev) => !prev)}
        isConsoleOpen={isConsoleOpen}
        isRefreshing={loading}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Banner / Info Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Partner Management Console
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Live interface for OneBSS API — Operator & Admin management with RADIUS and IPTV bindings
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Endpoint:</span>
            <code className="text-xs bg-slate-900 text-indigo-400 px-2 py-1 rounded border border-slate-800 font-mono">
              {baseUrl}/partner.php
            </code>
          </div>
        </div>

        {/* Partners content */}
        <PartnerList
          partners={partners}
          loading={loading}
          error={error}
          activeRole={activeRole}
          onRoleChange={handleRoleChange}
          onViewPartner={handleViewPartner}
          onEditPartner={handleEditPartner}
          onManagePlans={handleManagePlans}
          onDirectLookup={handleDirectLookup}
          onOpenCreate={() => setIsCreateOpen(true)}
        />
      </main>

      {/* Modals & Dialogs */}
      {!isAuthenticated && <LoginModal />}

      {/* View Partner Details Modal (GET /b_bss/partner.php?id=...) */}
      {viewPartnerId && (
        <PartnerDetailsModal
          partnerId={viewPartnerId}
          initialData={viewPartnerData}
          onClose={() => {
            setViewPartnerId(null);
            setViewPartnerData(null);
          }}
          onEdit={(partner) => {
            setViewPartnerId(null);
            setViewPartnerData(null);
            setEditPartner(partner);
          }}
          onManagePlans={(partner, tab) => {
            setViewPartnerId(null);
            setViewPartnerData(null);
            handleManagePlans(partner, tab);
          }}
        />
      )}

      {/* Plan Catalog & Mapping Modal (Internet & IPTV) */}
      {mappingPartner && (
        <PlanMappingModal
          partner={mappingPartner}
          initialTab={mappingTab}
          onClose={() => setMappingPartner(null)}
          onSuccessToast={(msg) => showToast(msg, 'success')}
        />
      )}

      {/* Create Partner Modal (POST /b_bss/partner.php) */}
      {isCreateOpen && (
        <PartnerFormModal
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(msg) => {
            showToast(msg);
            fetchPartners();
          }}
        />
      )}

      {/* Edit Partner Modal (PUT /b_bss/partner.php?id=...) */}
      {editPartner && (
        <PartnerFormModal
          partner={editPartner}
          onClose={() => setEditPartner(null)}
          onSuccess={(msg) => {
            showToast(msg);
            fetchPartners();
          }}
        />
      )}

      {/* API Configuration Modal */}
      {isSettingsOpen && <ApiSettingsModal onClose={() => setIsSettingsOpen(false)} />}

      {/* Live API Console / Inspector */}
      <ApiConsole isOpen={isConsoleOpen} onClose={() => setIsConsoleOpen(false)} />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-semibold border ${
              toast.type === 'success'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
