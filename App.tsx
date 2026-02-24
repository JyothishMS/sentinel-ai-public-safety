
import React, { useState, useEffect } from 'react';
import Upload from './pages/Upload';
import CriminalID from './pages/CriminalID';
import Incidents from './pages/Incidents';
import TacticalMap from './pages/TacticalMap';
import { Incident, NavigationTab } from './types';
import { db } from './services/backendService';

const App: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeTab, setActiveTab] = useState<NavigationTab>(NavigationTab.Upload);
  const [isSimulated, setIsSimulated] = useState<boolean>(!process.env.API_KEY);

  // Hydrate data from backend on mount
  useEffect(() => {
    const loadData = async () => {
      const storedIncidents = await db.getAllIncidents();
      setIncidents(storedIncidents);
    };
    loadData();
  }, []);

  const handleSaveIncident = async (incident: Incident) => {
    await db.saveIncident(incident);
    setIncidents(prev => [incident, ...prev]);
  };

  const handleRemoveIncident = async (id: string) => {
    await db.deleteIncident(id);
    setIncidents(prev => prev.filter(i => i.id !== id));
  };

  const renderContent = () => {
    switch (activeTab) {
      case NavigationTab.Archive:
        return <Incidents incidents={incidents} onDeleteIncident={handleRemoveIncident} />;
      case NavigationTab.TacticalMap:
        return (
          <TacticalMap 
            incidents={incidents} 
            onManualReport={handleSaveIncident} 
            onDeleteIncident={handleRemoveIncident} 
          />
        );
      case NavigationTab.CriminalID:
        return <CriminalID onNewIncident={handleSaveIncident} isSimulated={isSimulated} incidents={incidents} />;
      case NavigationTab.Upload:
      default:
        return <Upload onNewIncident={handleSaveIncident} isSimulated={isSimulated} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 font-sans overflow-x-hidden">
      <header className="h-20 bg-slate-950/90 backdrop-blur-xl border-b border-slate-900 flex items-center justify-between px-10 sticky top-0 z-50 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_200px_rgba(37,99,235,0.4)]">
            <i className="fa-solid fa-shield-halved text-lg"></i>
          </div>
          <div className="h-6 w-[1px] bg-slate-800"></div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-white">
              Sentinel <span className="text-blue-600">Command</span>
            </h2>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Autonomous Defense Node v4.0.2</p>
          </div>
        </div>

        <nav className="flex items-center gap-2 bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800/50">
           <button onClick={() => setActiveTab(NavigationTab.Upload)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === NavigationTab.Upload ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <i className="fa-solid fa-microchip"></i> Neural Scan
           </button>
           <button onClick={() => setActiveTab(NavigationTab.CriminalID)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === NavigationTab.CriminalID ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <i className="fa-solid fa-magnifying-glass"></i> Search Hub
           </button>
           <button onClick={() => setActiveTab(NavigationTab.TacticalMap)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === NavigationTab.TacticalMap ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <i className="fa-solid fa-map-location-dot"></i> Tactical Map
           </button>
           <button onClick={() => setActiveTab(NavigationTab.Archive)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === NavigationTab.Archive ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <i className="fa-solid fa-box-archive"></i> Archive
           </button>
        </nav>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mr-4">
             <span className={`w-2 h-2 rounded-full ${isSimulated ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
             <span className={isSimulated ? 'text-amber-500' : 'text-emerald-500'}>{isSimulated ? 'SIMULATED' : 'LIVE'}</span>
          </div>
          <button onClick={() => setIsSimulated(!isSimulated)} className="h-10 w-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <i className="fa-solid fa-power-off"></i>
          </button>
        </div>
      </header>

      <main className="py-8 px-8 max-w-[1920px] mx-auto min-h-[calc(100vh-160px)]">
        {renderContent()}
      </main>

      <footer className="py-8 text-center opacity-30 text-[10px] font-black text-slate-500 uppercase tracking-[0.8em]">
        Sentinel v4.0.2 // Biometric Uplink Persistent
      </footer>
    </div>
  );
};

export default App;
