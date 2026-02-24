
import React, { useState, useMemo } from 'react';
import { Incident } from '../types';

interface IncidentsProps {
  incidents: Incident[];
  onDeleteIncident: (id: string) => void;
}

const Incidents: React.FC<IncidentsProps> = ({ incidents, onDeleteIncident }) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeSource, setActiveSource] = useState<'neural' | 'search'>('neural');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Distinguish between the two sources
  const neuralIncidents = useMemo(() => 
    incidents.filter(i => i.videoRef !== 'Biometric Search Hub'), 
    [incidents]
  );
  
  const searchHubIncidents = useMemo(() => 
    incidents.filter(i => i.videoRef === 'Biometric Search Hub'), 
    [incidents]
  );

  const filteredIncidents = useMemo(() => {
    const currentList = activeSource === 'neural' ? neuralIncidents : searchHubIncidents;
    return currentList.filter(inc => {
      const matchesSearch = 
        inc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesDate = dateFilter ? inc.savedAt?.includes(dateFilter) : true;
      
      return matchesSearch && matchesDate;
    });
  }, [activeSource, neuralIncidents, searchHubIncidents, searchQuery, dateFilter]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("CRITICAL: Permanent deletion of this record from the database?")) {
      onDeleteIncident(id);
      if (selectedIncident?.id === id) setSelectedIncident(null);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 max-w-[1600px] mx-auto pb-24">
      {/* TACTICAL HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 border-b-4 border-slate-900 pb-12">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
             <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
             <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Encrypted Storage v4.0</span>
          </div>
          <h1 className="text-7xl font-black text-white uppercase tracking-tighter leading-none">Evidence <span className="text-blue-500">Vault</span></h1>
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest max-w-lg">Persistent database of all identified threats and biometric matches.</p>
        </div>

        {/* SEARCH & FILTER HUD */}
        <div className="flex flex-wrap gap-6 items-center bg-slate-900/40 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-2xl w-full lg:w-auto">
           <div className="relative group">
              <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors"></i>
              <input 
                type="text" 
                placeholder="Search type, ID, or description..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500/50 w-full md:w-64 transition-all"
              />
           </div>
           <div className="relative">
              <i className="fa-solid fa-calendar-days absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input 
                type="text" 
                placeholder="Filter by date (MM/DD/YYYY)..." 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500/50 w-full md:w-64 transition-all"
              />
           </div>
           <div className="h-10 w-[1px] bg-slate-800 hidden md:block"></div>
           <div className="text-right px-4">
              <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Records</span>
              <span className="text-2xl font-black text-white">{filteredIncidents.length}</span>
           </div>
        </div>
      </div>

      {/* SOURCE SWITCHER */}
      <div className="flex gap-4 p-2 bg-slate-950 border-2 border-slate-900 rounded-3xl w-fit mx-auto lg:mx-0">
         <button 
           onClick={() => setActiveSource('neural')}
           className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeSource === 'neural' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
         >
            <i className="fa-solid fa-microchip"></i> Neural Scan Data
         </button>
         <button 
           onClick={() => setActiveSource('search')}
           className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeSource === 'search' ? 'bg-rose-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
         >
            <i className="fa-solid fa-fingerprint"></i> Search Hub Data
         </button>
      </div>

      {/* RESULTS GRID */}
      {filteredIncidents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
          {filteredIncidents.map((inc) => (
            <div key={inc.id} className={`bg-slate-950 border-4 rounded-[3.5rem] overflow-hidden group transition-all shadow-2xl flex flex-col relative ${activeSource === 'search' ? 'border-rose-900/20 hover:border-rose-600' : 'border-slate-900 hover:border-blue-600'}`}>
              
              {/* DELETE BUTTON */}
              <button 
                onClick={(e) => handleDelete(inc.id, e)}
                className="absolute top-6 left-6 z-20 w-10 h-10 bg-black/60 backdrop-blur-md rounded-full text-slate-400 hover:text-red-500 hover:bg-black transition-all border border-white/10"
                title="Wipe Record"
              >
                <i className="fa-solid fa-trash-can text-sm"></i>
              </button>

              {/* IMAGE/SNAPSHOT PART */}
              <div className="relative aspect-[4/3] bg-black overflow-hidden group/image cursor-pointer" onClick={() => setSelectedIncident(inc)}>
                <img src={inc.snapshotUrl} className="w-full h-full object-cover opacity-60 group-hover/image:opacity-100 transition-all duration-700 scale-110 group-hover/image:scale-100" alt="Incident Snapshot" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
                
                {/* Confidence Badge */}
                <div className="absolute bottom-6 right-6 flex flex-col items-end">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${activeSource === 'search' ? 'bg-rose-600' : 'bg-blue-600'}`}>
                      {Math.round(inc.confidence * 100)}% Match
                    </span>
                </div>
              </div>

              {/* DATA PART */}
              <div className="p-10 space-y-6 flex-1 flex flex-col">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{inc.savedAt}</p>
                   <h3 className="text-2xl font-black text-white uppercase tracking-tight truncate">{inc.type}</h3>
                </div>

                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-900/50 flex-1">
                  <p className="text-xs text-slate-400 font-medium leading-relaxed italic line-clamp-3">"{inc.description}"</p>
                </div>

                <div className="pt-6 border-t border-slate-900 mt-auto flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${activeSource === 'search' ? 'bg-rose-500' : 'bg-blue-500'}`}></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{inc.id}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedIncident(inc)}
                    className="text-white text-[10px] font-black uppercase tracking-widest hover:text-blue-500 transition-colors flex items-center gap-2"
                  >
                    Details <i className="fa-solid fa-arrow-right-long"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-48 text-center bg-slate-900/20 border-4 border-dashed border-slate-900 rounded-[5rem] animate-in fade-in duration-1000">
          <div className="w-24 h-24 bg-slate-900 rounded-[2.5rem] mx-auto flex items-center justify-center mb-8">
             <i className="fa-solid fa-database text-slate-700 text-5xl"></i>
          </div>
          <h2 className="text-4xl font-black uppercase tracking-[0.4em] text-slate-700 leading-none">Records Clear</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest mt-4">No data matches the current search or filter parameters</p>
          {(searchQuery || dateFilter) && (
            <button 
              onClick={() => { setSearchQuery(''); setDateFilter(''); }}
              className="mt-8 text-blue-500 font-black uppercase text-[10px] tracking-widest underline underline-offset-8"
            >
              Reset All Filters
            </button>
          )}
        </div>
      )}

      {/* VIDEO/DETAIL MODAL */}
      {selectedIncident && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 md:p-12">
          <div className="absolute inset-0 bg-[#020617]/98 backdrop-blur-2xl" onClick={() => setSelectedIncident(null)}></div>
          <div className="relative w-full max-w-7xl bg-black rounded-[5rem] overflow-hidden border-8 border-slate-900 shadow-[0_0_150px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
            
            <div className="flex flex-col lg:flex-row h-full">
               {/* MEDIA VIEW */}
               <div className="flex-[3] bg-black relative aspect-video lg:aspect-auto">
                  {selectedIncident.localVideoUrl && !selectedIncident.videoRef.includes('.png') && !selectedIncident.videoRef.includes('.jpg') ? (
                    <video 
                      src={selectedIncident.localVideoUrl} 
                      className="w-full h-full object-contain"
                      autoPlay 
                      controls
                    />
                  ) : (
                    <img src={selectedIncident.snapshotUrl} className="w-full h-full object-contain" alt="Record Frame" />
                  )}
                  
                  <div className="absolute top-12 left-12 pointer-events-none">
                     <div className="bg-black/80 backdrop-blur-2xl border border-white/10 p-8 rounded-[2rem] shadow-2xl">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-2">Vault Entry // {selectedIncident.id}</p>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter">{selectedIncident.type}</h2>
                     </div>
                  </div>
               </div>

               {/* DETAILS PANEL */}
               <div className="flex-[1] bg-slate-950 p-12 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-900">
                  <div className="space-y-10">
                     <div className="flex justify-between items-start">
                        <button onClick={() => setSelectedIncident(null)} className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all">
                           <i className="fa-solid fa-xmark"></i>
                        </button>
                        <button onClick={(e) => handleDelete(selectedIncident.id, e)} className="px-6 py-3 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">
                           Wipe Persistent Data
                        </button>
                     </div>

                     <div className="space-y-8">
                        <div>
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Archived At</p>
                           <p className="text-xl font-bold text-white">{selectedIncident.savedAt}</p>
                        </div>
                        <div>
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Location Sector</p>
                           <div className="flex items-center gap-3 text-xl font-bold text-white">
                              <i className="fa-solid fa-location-dot text-rose-600"></i>
                              {selectedIncident.location}
                           </div>
                        </div>
                        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800">
                           <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4">Neural Analysis Summary</p>
                           <p className="text-sm text-slate-300 italic leading-relaxed font-medium">"{selectedIncident.description}"</p>
                        </div>
                     </div>
                  </div>

                  <button 
                    onClick={() => setSelectedIncident(null)}
                    className="w-full mt-10 bg-blue-600 text-white font-black py-6 rounded-3xl text-xs uppercase tracking-[0.3em] hover:bg-blue-500 transition-all shadow-xl"
                  >
                    Close Session
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Incidents;
