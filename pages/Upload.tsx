
import React, { useState, useRef } from 'react';
import { analyzeVisualMedia, analyzeVideoStream } from '../services/geminiService';
import { Incident, IncidentType } from '../types';

interface UploadProps {
  onNewIncident: (incident: Incident) => void;
  isSimulated?: boolean;
}

const Upload: React.FC<UploadProps> = ({ onNewIncident, isSimulated = false }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [primaryIncident, setPrimaryIncident] = useState<Incident | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string>('');
  const [isEmergencyDetected, setIsEmergencyDetected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPrimaryIncident(null);
    setIsEmergencyDetected(false);
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    setMediaMimeType(file.type);
    setIsProcessing(true);
    setStatus('AWAKENING NEURAL CORE...');

    try {
      if (file.type.startsWith('video/')) {
        setStatus('ANALYZING VIDEO STREAM...');
        const prompt = `
          Analyze this video footage from a security camera. Your task is to identify any potential incidents, threats, or noteworthy events.
          For each distinct event you identify, provide a JSON object with the following structure:
          - "type": A specific incident category (e.g., "Vehicle Collision", "Theft / Robbery", "Suspicious Behavior", "Medical Emergency", "Vandalism").
          - "timestamp": The time in the video (e.g., "00:42") where the event is most clearly visible.
          - "location": A descriptive location within the video frame (e.g., "Parking Lot B", "Intersection of 5th and Main").
          - "confidence": Your confidence in this assessment (0.0 to 1.0).
          - "description": A concise, one-sentence summary of the event.
          - "detectedObjects": An array of key objects or people involved (e.g., ["Red SUV", "Person in blue jacket", "Briefcase"]).
          - "licensePlate": If a vehicle license plate is clearly visible and relevant, extract it as a string. Otherwise, null.
          Return an array of these JSON objects. If no incidents are found, return an empty array.
        `;
        const detections = await analyzeVideoStream(file, prompt, isSimulated);
        handleDetections(detections, url, file.name);
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setStatus('DECRYPTING VISUAL VECTORS...');
          const detections = await analyzeVisualMedia(base64, file.type, isSimulated, [], file.name);
          handleDetections(detections, url, file.name);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error("Analysis Error:", err);
      setIsProcessing(false);
    }
  };

  const handleDetections = (detections: any[], mediaUrl: string, fileName: string) => {
    try {
      if (detections && detections.length > 0) {
        const highRiskKeywords = ['collision', 'accident', 'crash', 'weapon', 'violence', 'robbery', 'thief', 'women', 'sos', 'fall', 'assault'];
        
        const res = detections.find(d => 
          d.type && highRiskKeywords.some(t => d.type?.toLowerCase().includes(t))
        ) || detections[0];

        if (res) {
          const incident: Incident = {
            id: `ALERT-${Math.floor(10000 + Math.random() * 89999)}`,
            type: (res.type as IncidentType) || 'Suspicious Behavior',
            timestamp: res.timestamp || new Date().toLocaleTimeString(),
            location: res.location || 'ACTIVE SECTOR',
            confidence: res.confidence || 0.95,
            videoRef: fileName,
            snapshotUrl: mediaUrl,
            description: res.description || 'Neural analysis complete. Threat pattern identified.',
            detectedObjects: res.detectedObjects || [],
            localVideoUrl: mediaUrl,
            licensePlate: res.licensePlate
          };

          setPrimaryIncident(incident);
          const isEmergency = incident.type && highRiskKeywords.some(t => incident.type.toLowerCase().includes(t));
          setIsEmergencyDetected(!!isEmergency);
        }
      }
    } catch (err) {
      console.error("Detection Handling Error:", err);
    } finally {
      setIsProcessing(false);
    }
  };


  const getAlertConfig = (type?: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('weapon') || t.includes('violence') || t.includes('assault')) 
      return { color: 'bg-red-600', icon: 'fa-gun', label: 'CRITICAL THREAT' };
    if (t.includes('collision') || t.includes('accident') || t.includes('crash')) 
      return { color: 'bg-red-600', icon: 'fa-car-burst', label: 'ACCIDENT ALERT' };
    if (t.includes('women') || t.includes('sos')) 
      return { color: 'bg-purple-600', icon: 'fa-person-dress-burst', label: 'SAFETY SOS' };
    if (t.includes('fall') || t.includes('medical')) 
      return { color: 'bg-blue-600', icon: 'fa-user-injured', label: 'MEDICAL ALERT' };
    
    return { color: 'bg-amber-600', icon: 'fa-triangle-exclamation', label: 'NEURAL FLAG' };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-24">
      {!primaryIncident && !isProcessing && (
        <div className="text-center py-32 space-y-12">
           <div className="relative inline-block">
              <h1 className="text-[12vw] font-black text-white/5 uppercase leading-none select-none tracking-tighter">NEURAL SCAN</h1>
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-64 h-64 border border-blue-500/10 rounded-full animate-ping"></div>
              </div>
           </div>
           <div className="max-w-md mx-auto relative z-10">
             <input type="file" ref={fileInputRef} className="hidden" accept="video/*,image/*" onChange={handleFileChange} />
             <button onClick={() => fileInputRef.current?.click()} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-12 rounded-[3.5rem] text-xl uppercase tracking-[0.3em] shadow-[0_0_50px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-6">
               <i className="fa-solid fa-satellite-dish animate-bounce"></i>
               Initialize Scan
             </button>
           </div>
        </div>
      )}

      {isProcessing && (
        <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-10">
          <div className="relative">
             <div className="w-32 h-32 border-8 border-blue-600/10 border-t-blue-500 rounded-full animate-spin"></div>
             <i className="fa-solid fa-brain text-2xl text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse"></i>
          </div>
          <div className="space-y-4">
             <h3 className="text-3xl font-black text-blue-500 uppercase tracking-[0.5em]">{status}</h3>
             <div className="w-64 h-1 bg-slate-900 mx-auto rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 animate-[progress_2s_infinite]"></div>
             </div>
          </div>
        </div>
      )}

      {primaryIncident && !isProcessing && (
        <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
          <div className="flex flex-col lg:flex-row gap-10">
            {/* MEDIA PREVIEW WITH HUD */}
            <div className="flex-[2] bg-black rounded-[4rem] overflow-hidden border-4 border-slate-900 aspect-video relative group shadow-2xl">
              {mediaMimeType.startsWith('image') ? (
                <img src={mediaUrl!} className="w-full h-full object-contain" alt="Captured Scene" />
              ) : (
                <video src={mediaUrl!} className="w-full h-full object-contain" autoPlay muted loop controls />
              )}
              
              {/* EMERGENCY HUD OVERLAY */}
              {isEmergencyDetected && (
                <div className="absolute inset-0 pointer-events-none border-[20px] border-red-600/20 animate-pulse">
                   <div className="absolute top-10 left-10 bg-red-600 text-white px-6 py-2 rounded-lg font-black text-xs tracking-widest uppercase flex items-center gap-3 shadow-2xl">
                      <i className="fa-solid fa-triangle-exclamation animate-bounce"></i>
                      Threat Identified // Sector Critical
                   </div>
                   <div className="absolute bottom-10 right-10 flex gap-2">
                      <div className="w-4 h-4 bg-red-600 rounded-full animate-ping"></div>
                      <div className="w-4 h-4 bg-red-600 rounded-full animate-ping delay-75"></div>
                   </div>
                   <div className="absolute inset-0 bg-red-900/10 mix-blend-overlay"></div>
                </div>
              )}
            </div>

            {/* ACTION CENTER */}
            <div className="flex-1 space-y-6">
              {isEmergencyDetected ? (
                <div className="bg-red-600 p-12 rounded-[3.5rem] text-white space-y-8 shadow-[0_0_80px_rgba(220,38,38,0.4)] relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 opacity-10 rotate-12">
                     <i className={`fa-solid ${getAlertConfig(primaryIncident.type).icon} text-[15rem]`}></i>
                  </div>
                  <div className="relative space-y-6">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center text-3xl">
                        <i className={`fa-solid ${getAlertConfig(primaryIncident.type).icon}`}></i>
                      </div>
                      <h4 className="text-4xl font-black uppercase tracking-tighter leading-none">{getAlertConfig(primaryIncident.type).label}</h4>
                    </div>
                    <p className="text-xl font-bold italic leading-relaxed">"{primaryIncident.description}"</p>
                    <button 
                      onClick={() => { 
                        onNewIncident({...primaryIncident, savedAt: new Date().toLocaleString()}); 
                        setPrimaryIncident(null); 
                      }} 
                      className="w-full bg-white text-red-600 font-black py-8 rounded-3xl uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-2xl flex items-center justify-center gap-4"
                    >
                       <i className="fa-solid fa-shield-halved"></i> Archive & Dispatch
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900 p-12 rounded-[3.5rem] space-y-8 border border-slate-800 shadow-xl">
                  <h4 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.4em]">Environmental Scan OK</h4>
                  <p className="text-white text-xl font-bold leading-relaxed">"{primaryIncident.description}"</p>
                  <button 
                    onClick={() => { 
                      onNewIncident({...primaryIncident, savedAt: new Date().toLocaleString()}); 
                      setPrimaryIncident(null); 
                    }} 
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-8 rounded-3xl uppercase tracking-widest transition-all shadow-xl"
                  >
                    Save Evidence Log
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* NEURAL TELEMETRY */}
          <div className="bg-slate-950 border-4 border-slate-900 rounded-[4.5rem] p-12 grid grid-cols-1 md:grid-cols-3 gap-12 shadow-2xl">
             <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Neural Profile</p>
                <h3 className={`text-3xl font-black uppercase ${isEmergencyDetected ? 'text-red-500' : 'text-white'}`}>{primaryIncident.type}</h3>
                <div className="flex items-center gap-3">
                   <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div className={`h-full ${isEmergencyDetected ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${primaryIncident.confidence * 100}%` }}></div>
                   </div>
                   <span className="text-[10px] font-black text-slate-400">{Math.round(primaryIncident.confidence * 100)}%</span>
                </div>
             </div>
             <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Sector Coordinates</p>
                <p className="text-2xl font-bold text-white flex items-center gap-4">
                   <i className={`fa-solid fa-location-dot ${isEmergencyDetected ? 'text-red-500' : 'text-blue-500'}`}></i>
                   {primaryIncident.location}
                </p>
             </div>
             <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Detected Entities</p>
                <div className="flex flex-wrap gap-3">
                   {primaryIncident.detectedObjects?.map((obj, i) => (
                     <span key={i} className="px-5 py-2 bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-xl hover:text-white transition-colors">{obj}</span>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default Upload;
