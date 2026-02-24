
import React, { useState, useRef, useEffect } from 'react';
import { analyzeVisualMedia } from '../services/geminiService';
import { db } from '../services/backendService';
import { Incident, IdentifiedSubject } from '../types';

interface CriminalIDProps {
  onNewIncident: (incident: Incident) => void;
  incidents: Incident[];
  isSimulated?: boolean;
}

interface DetectionResult {
  type: string;
  identifiedSubject: IdentifiedSubject;
  confidence: number;
  autoConfirmed?: boolean;
  location?: string;
}

const CriminalID: React.FC<CriminalIDProps> = ({ onNewIncident, incidents, isSimulated = false }) => {
  const [registry, setRegistry] = useState<IdentifiedSubject[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState(false);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertTarget, setAlertTarget] = useState<IdentifiedSubject | null>(null);
  
  const suspectInputRef = useRef<HTMLInputElement>(null);
  const registryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const data = await db.getAllTargets();
        setRegistry(data);
      } catch (err) {
        console.error("Failed to load registry:", err);
      }
    };
    loadRegistry();
  }, []);

  const handleAddRegistryEntry = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const newEntry: IdentifiedSubject = {
        name: `Subject Record ${registry.length + 1}`,
        id: `TRG-${Math.floor(1000 + Math.random() * 8999)}`,
        status: 'Flagged',
        riskLevel: 'High',
        bio: "Bio-registry profile created via manual uplink.",
        matchConfidence: 1,
        mugshotUrl: url,
        mugshotBase64: base64
      };

      try {
        await db.saveTarget(newEntry);
        setRegistry(prev => [newEntry, ...prev]);
        setDuplicateError(false);
      } catch (err: any) {
        if (err.message === 'DUPLICATE_FOUND') {
          setDuplicateError(true);
          setTimeout(() => setDuplicateError(false), 3000);
        }
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleSuspectCheck = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (registry.length === 0) {
      setError('REGISTRY EMPTY // UPLOAD TARGET PROFILES FIRST');
      return;
    }

    setError(null);
    setDetections([]);
    setShowAlert(false);
    setAlertTarget(null);
    const url = URL.createObjectURL(file);
    setCurrentMediaUrl(url);
    setIsProcessing(true);
    setStatus('SYNCING BIOMETRIC CORE...');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setStatus('SCANNING CROWD BIOMETRICS (GEMINI-3-PRO)...');
      try {
        const results = await analyzeVisualMedia(base64, file.type, isSimulated, registry);
        
        if (results && results.length > 0) {
          const processedDetections: DetectionResult[] = results
            .map((r): DetectionResult | null => {
              const localTarget = registry.find(t => 
                t.id.toLowerCase() === r.matchedTargetId?.toLowerCase() || 
                t.name.toLowerCase() === r.matchedTargetId?.toLowerCase() ||
                t.name.toLowerCase().includes(r.matchedTargetId?.toLowerCase() || 'NOT_FOUND') ||
                r.description?.toLowerCase().includes(t.name.toLowerCase())
              );

              if (localTarget) {
                const confidence = r.confidence || 0.95;
                const subjectWithMatch: IdentifiedSubject = {
                  ...localTarget,
                  matchConfidence: confidence,
                  locationInImage: r.locationInImage || 'Identified in Scene'
                };

                return {
                  type: "Target Match",
                  identifiedSubject: subjectWithMatch,
                  confidence: confidence,
                  autoConfirmed: confidence > 0.6,
                  location: r.location
                };
              }
              return null;
            })
            .filter((d): d is DetectionResult => d !== null)
            .sort((a, b) => b.confidence - a.confidence);

          if (processedDetections.length > 0) {
            setDetections(processedDetections);
            const mainMatch = processedDetections[0];
            setAlertTarget(mainMatch.identifiedSubject);
            setShowAlert(true);
            archiveAutoMatch(mainMatch.identifiedSubject, url, mainMatch.location || 'Current Sector');
            setStatus(`BIOMETRIC LOCK: ${processedDetections.length} MATCHES FOUND`);
          } else {
            setError('SCAN COMPLETE // NO REGISTRY TARGETS IN CROWD');
          }
        } else {
          setError('SCAN COMPLETE // NO REGISTRY TARGETS IN CROWD');
        }
      } catch (err) {
        console.error("Match Failure:", err);
        setError('NEURAL UPLINK FAILURE // RETRY SCAN');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const archiveAutoMatch = async (subject: IdentifiedSubject, url: string, location: string) => {
    const now = new Date();
    const incident: Incident = {
      id: `MATCH-${Math.floor(Math.random() * 90000)}`,
      type: 'Suspicious Behavior',
      timestamp: 'LIVE',
      savedAt: now.toLocaleString(),
      location: location,
      confidence: subject.matchConfidence || 0.95,
      videoRef: 'Biometric Search Hub',
      snapshotUrl: url,
      description: `CRITICAL IDENTITY MATCH: Registry profile ${subject.name} (${subject.id}) positively identified in group shot at ${location}. Verification score: ${Math.round((subject.matchConfidence || 0) * 100)}%. Position: ${subject.locationInImage}.`,
      detectedObjects: ['Person', 'Facial Geometry Lock', 'Registry Match'],
      identifiedSubject: subject
    };
    await db.saveIncident(incident);
    onNewIncident(incident);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-12 animate-in fade-in duration-1000">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b-4 border-slate-900 pb-10 gap-8">
        <div className="space-y-2">
           <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-rose-600 rounded-full animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.8)]"></span>
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Search Hub v3.1 // Neural Core</span>
           </div>
           <h1 className="text-7xl font-black text-white uppercase tracking-tighter leading-none">Search <span className="text-rose-600">Hub</span></h1>
           <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Identify registered targets in complex crowd environments using Gemini 3 Pro</p>
        </div>
        <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-slate-800/50 flex items-center gap-8 shadow-2xl">
           <div className="text-center px-6 border-r border-slate-800">
              <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Local Registry</span>
              <span className="text-4xl font-black text-rose-500">{registry.length}</span>
           </div>
           <div className="relative">
              {duplicateError && (
                <div className="absolute -top-12 left-0 right-0 bg-red-600 text-white text-[8px] font-black py-2 px-4 rounded-lg animate-bounce text-center uppercase shadow-xl z-20">
                   Identity Already Registered
                </div>
              )}
              <button 
                onClick={() => registryInputRef.current?.click()} 
                className={`bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-3 ${duplicateError ? 'animate-shake' : ''}`}
              >
                 <i className="fa-solid fa-user-plus"></i> Add Target
              </button>
           </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
         {/* REGISTRY SIDEBAR */}
         <div className="lg:w-80 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 px-2">
               <i className="fa-solid fa-database text-rose-500"></i> Identity Vault
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 no-scrollbar pb-10">
               {registry.length > 0 ? registry.map((t, i) => (
                 <div key={i} className="bg-slate-950 border border-slate-900 p-5 rounded-3xl flex items-center gap-4 group hover:border-rose-500/50 transition-all cursor-default shadow-lg">
                    <div className="w-14 h-14 rounded-xl overflow-hidden grayscale group-hover:grayscale-0 transition-all border border-slate-800">
                       <img src={t.mugshotUrl || `data:image/png;base64,${t.mugshotBase64}`} className="w-full h-full object-cover" alt="Mugshot" />
                    </div>
                    <div className="min-w-0 flex-1">
                       <p className="text-[10px] font-black text-white uppercase truncate">{t.name}</p>
                       <p className="text-[8px] font-bold text-rose-500 uppercase tracking-tighter">{t.id}</p>
                    </div>
                 </div>
               )) : (
                 <div className="p-10 border-2 border-dashed border-slate-900 rounded-[2rem] text-center opacity-30">
                   <p className="text-[8px] font-black uppercase tracking-widest">No Identities Stored</p>
                 </div>
               )}
            </div>
         </div>

         {/* MAIN SCANNER AREA */}
         <div className="flex-1 bg-slate-950 border-4 border-slate-900 rounded-[4rem] p-12 min-h-[700px] flex flex-col relative overflow-hidden shadow-2xl">
            <input type="file" ref={registryInputRef} className="hidden" accept="image/*" onChange={handleAddRegistryEntry} />
            <input type="file" ref={suspectInputRef} className="hidden" accept="image/*" onChange={handleSuspectCheck} />

            {!currentMediaUrl && !isProcessing && (
              <div onClick={() => suspectInputRef.current?.click()} className="flex-1 border-4 border-dashed border-slate-900 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer group hover:border-rose-600/30 transition-all">
                 <div className="w-24 h-24 bg-slate-900 rounded-[2.5rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-users-viewfinder text-5xl text-slate-700 group-hover:text-rose-600"></i>
                 </div>
                 <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Initialize Scene Scan</h2>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Upload group shots, crowd scenes, or single portraits</p>
              </div>
            )}

            {isProcessing && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                 <div className="relative">
                    <div className="w-32 h-32 border-8 border-slate-900 border-t-rose-600 rounded-full animate-spin"></div>
                    <i className="fa-solid fa-brain text-3xl text-rose-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse"></i>
                 </div>
                 <div className="text-center space-y-3">
                    <p className="text-rose-500 font-black text-2xl uppercase tracking-[0.5em] animate-pulse">{status}</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Performing Face-by-Face Grid Scan...</p>
                 </div>
              </div>
            )}

            {error && !isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center p-12 pointer-events-none">
                 <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-10 rounded-[2.5rem] text-center space-y-4 max-w-sm pointer-events-auto shadow-2xl">
                    <i className="fa-solid fa-face-frown-open text-rose-500 text-4xl"></i>
                    <p className="text-sm font-black text-white uppercase tracking-widest leading-relaxed">{error}</p>
                    <button onClick={() => { setError(null); setCurrentMediaUrl(null); }} className="text-[10px] font-black text-rose-500 uppercase underline tracking-widest">Re-initialize</button>
                 </div>
              </div>
            )}

            {currentMediaUrl && !isProcessing && (
              <div className="flex-1 flex flex-col lg:flex-row gap-12 animate-in slide-in-from-bottom-6 duration-700">
                 <div className="lg:w-2/3 bg-black rounded-[3.5rem] overflow-hidden border-4 border-slate-900 relative group shadow-2xl">
                    <img src={currentMediaUrl} className="w-full h-full object-contain" alt="Feed Scan" />
                    {showAlert && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border-[30px] border-rose-600/30 animate-pulse"></div>
                      </div>
                    )}
                 </div>

                 <div className="flex-1 space-y-8">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-4">
                       <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Crowd Telemetry</h4>
                       <button onClick={() => { setCurrentMediaUrl(null); setDetections([]); setShowAlert(false); setError(null); }} className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all">
                          <i className="fa-solid fa-xmark"></i>
                       </button>
                    </div>

                    <div className="space-y-6 overflow-y-auto max-h-[500px] pr-2 no-scrollbar">
                       {detections.map((det, idx) => (
                         <div key={idx} className="p-8 rounded-[3rem] border-4 bg-rose-950/20 border-rose-600 shadow-[0_0_50px_rgba(225,29,72,0.2)] transition-all">
                            <div className="flex items-center gap-8">
                               <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 shrink-0 border-rose-500 animate-pulse shadow-xl">
                                  <img src={det.identifiedSubject.mugshotUrl || `data:image/png;base64,${det.identifiedSubject.mugshotBase64}`} className="w-full h-full object-cover" alt="Profile" />
                               </div>
                               <div className="space-y-1">
                                  <h5 className="text-2xl font-black text-white uppercase tracking-tight">{det.identifiedSubject.name}</h5>
                                  <div className="flex items-center gap-2">
                                     <span className="text-[10px] font-black text-rose-600 uppercase bg-rose-600/10 px-2 py-0.5 rounded">ID Locked: {Math.round(det.confidence * 100)}%</span>
                                     <span className="text-[10px] font-bold text-slate-500 uppercase">/ {det.identifiedSubject.id}</span>
                                  </div>
                               </div>
                            </div>
                            <button onClick={() => { setAlertTarget(det.identifiedSubject); setShowAlert(true); }} className="w-full mt-6 bg-rose-600 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-rose-500 transition-all shadow-xl">
                               Detailed Identity Profile
                            </button>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
            )}
         </div>
      </div>

      {/* BIOMETRIC COMPARISON MODAL - FULLY SCROLLABLE PAGE STYLE */}
      {showAlert && alertTarget && (
        <div className="fixed inset-0 z-[5000] bg-black/98 backdrop-blur-3xl overflow-y-auto pt-10 pb-24 px-4 md:px-8 flex flex-col items-center">
           {/* Close overlay on click */}
           <div className="fixed inset-0 pointer-events-none" />
           
           <div className="relative w-full max-w-7xl bg-[#0a0a0c] border-[1px] border-white/10 rounded-[4rem] p-8 md:p-16 space-y-16 shadow-[0_0_100px_rgba(225,29,72,0.3)] animate-in zoom-in-95 duration-500 z-[5001]">
              
              {/* TOP: Primary Identity Hero Header */}
              <div className="text-center space-y-6 border-b border-white/5 pb-12">
                 <div className="flex items-center justify-center gap-4 mb-2">
                    <span className="w-3 h-3 bg-rose-600 rounded-full animate-ping"></span>
                    <span className="text-xs font-black text-rose-500 uppercase tracking-[0.8em]">Positive Biometric Match</span>
                 </div>
                 <h2 className="text-6xl md:text-9xl font-black text-white uppercase tracking-tighter leading-none">
                    Target <span className="text-rose-600">Identified</span>
                 </h2>
                 <p className="text-2xl md:text-4xl font-black text-slate-400 uppercase tracking-[0.2em]">
                    {alertTarget.name} // <span className="text-rose-500">{alertTarget.id}</span>
                 </p>
              </div>

              {/* MIDDLE: Side-by-Side Visual Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 relative">
                 {/* Field Scan Capture */}
                 <div className="space-y-6">
                    <div className="flex justify-between items-center px-6">
                       <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Field Capture (Live Feed)</span>
                       <span className="text-[10px] font-bold text-slate-600 uppercase">Sector 7 Grid Analysis</span>
                    </div>
                    <div className="aspect-square md:aspect-[4/3] bg-black rounded-[3rem] border-2 border-rose-600/20 overflow-hidden relative shadow-2xl">
                       <img src={currentMediaUrl || ''} className="w-full h-full object-cover" alt="Live Scan" />
                       <div className="absolute inset-0 border-[4px] border-rose-600/10 animate-pulse pointer-events-none"></div>
                       <div className="absolute inset-x-0 h-[3px] bg-rose-500 shadow-[0_0_25px_rgba(225,29,72,1)] animate-scan pointer-events-none"></div>
                       
                       {/* Identification marker overlay simulation */}
                       <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-rose-500/60 rounded-lg pointer-events-none flex flex-col justify-end p-2">
                          <span className="bg-rose-600 text-[8px] font-black text-white px-2 py-0.5 rounded">LOCK-ON</span>
                       </div>
                    </div>
                 </div>

                 {/* Match Score HUD Center */}
                 <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex-col items-center gap-4">
                    <div className="w-32 h-32 bg-[#0a0a0c] border-[8px] border-rose-600 rounded-full flex flex-col items-center justify-center shadow-[0_0_80px_rgba(225,29,72,0.8)] scale-110">
                       <span className="text-3xl font-black text-white leading-none">{Math.round((alertTarget.matchConfidence || 0.99) * 100)}%</span>
                       <span className="text-[10px] font-black text-rose-500 uppercase tracking-tighter">Verified</span>
                    </div>
                    <div className="h-24 w-1 bg-gradient-to-b from-rose-600 to-transparent"></div>
                 </div>

                 {/* Master Biometric Registry Record */}
                 <div className="space-y-6">
                    <div className="flex justify-between items-center px-6">
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Master Registry Record</span>
                       <span className="text-[10px] font-bold text-slate-600 uppercase">Archive ID: {alertTarget.id}</span>
                    </div>
                    <div className="aspect-square md:aspect-[4/3] bg-black rounded-[3rem] border-2 border-white/5 overflow-hidden relative shadow-2xl">
                       <img src={alertTarget.mugshotUrl || `data:image/png;base64,${alertTarget.mugshotBase64}`} className="w-full h-full object-cover grayscale brightness-75" alt="Registry Profile" />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
                       <div className="absolute bottom-8 left-8 right-8 text-left">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Biometric Signature Status</p>
                          <div className="flex gap-2">
                             {[...Array(8)].map((_, i) => (
                               <div key={i} className="h-1 w-full bg-rose-600/40 rounded-full"></div>
                             ))}
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* BOTTOM: Expanded Details & Risk Assessment */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {/* Technical Analysis */}
                 <div className="lg:col-span-2 bg-slate-900/30 border border-white/5 rounded-[3rem] p-10 space-y-8">
                    <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                       <i className="fa-solid fa-microchip text-rose-600 text-2xl"></i>
                       <h4 className="text-xl font-black text-white uppercase tracking-tight">Neural Analysis Summary</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Spatial Scene Position</p>
                          <p className="text-lg font-bold text-white uppercase">{alertTarget.locationInImage}</p>
                       </div>
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk Factor Analysis</p>
                          <p className="text-lg font-bold text-rose-500 uppercase">{alertTarget.riskLevel} - PRIORITY 1</p>
                       </div>
                    </div>
                    <div className="space-y-4 pt-4">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bio-Signature Insight</p>
                       <p className="text-sm text-slate-400 leading-relaxed font-medium italic">
                          "Facial geometry match confirmed against Sector database. Subject exhibits pattern behavior consistent with previous registry flags. Immediate verification protocol initiated."
                       </p>
                    </div>
                 </div>

                 {/* Command Actions */}
                 <div className="bg-rose-600/10 border border-rose-600/20 rounded-[3rem] p-10 flex flex-col justify-between space-y-10">
                    <div className="space-y-6">
                       <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] text-center">Protocol Actions</h4>
                       <div className="space-y-3">
                          <button onClick={() => setShowAlert(false)} className="w-full bg-white text-black font-black py-6 rounded-2xl text-[10px] uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-xl">
                             Dispatch Field Unit
                          </button>
                          <button onClick={() => setShowAlert(false)} className="w-full bg-slate-900 border border-white/10 text-slate-500 font-black py-6 rounded-2xl text-[10px] uppercase tracking-widest hover:text-white transition-all">
                             Bypass Alert
                          </button>
                       </div>
                    </div>
                    <p className="text-[8px] font-black text-slate-600 uppercase text-center tracking-widest">
                       Uplink Active // Command Override Available
                    </p>
                 </div>
              </div>

              {/* FLOATING CLOSE BUTTON */}
              <button 
                 onClick={() => setShowAlert(false)} 
                 className="absolute top-10 right-10 w-16 h-16 bg-slate-900 hover:bg-rose-600 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all border border-white/10 shadow-2xl z-[5002]"
              >
                 <i className="fa-solid fa-xmark text-2xl"></i>
              </button>
           </div>
           
           {/* Bottom scroll indicator if content is long */}
           <div className="mt-12 flex flex-col items-center gap-2 opacity-30">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">End of Record</span>
              <div className="w-1 h-8 bg-gradient-to-b from-slate-500 to-transparent rounded-full"></div>
           </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan { animation: scan 4s linear infinite; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.2s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        
        /* Custom smooth scrolling for the overlay */
        .fixed.overflow-y-auto {
           scroll-behavior: smooth;
        }
      `}</style>
    </div>
  );
};

export default CriminalID;
