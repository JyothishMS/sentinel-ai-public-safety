
import React, { useState, useEffect } from 'react';

const LiveFeed: React.FC = () => {
  const [activeCam, setActiveCam] = useState(0);
  const cams = [
    { id: 'CAM-042', location: 'Main St Crossing', status: 'Online', alerts: 1 },
    { id: 'CAM-112', location: 'Retail District West', status: 'Online', alerts: 0 },
    { id: 'CAM-089', location: 'Harbor Bridge North', status: 'Online', alerts: 0 },
    { id: 'CAM-154', location: 'Industrial Sector 4', status: 'Offline', alerts: 0 },
  ];

  return (
    <div className="h-[calc(100vh-140px)] flex gap-8">
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Live Monitoring</h1>
            <span className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> {cams[activeCam].id} ACTIVE
            </span>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
              <i className="fa-solid fa-camera-rotate"></i>
            </button>
            <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
              <i className="fa-solid fa-volume-high"></i>
            </button>
            <button className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all">
              EMERGENCY BROADCAST
            </button>
          </div>
        </div>

        <div className="flex-1 bg-black rounded-3xl border border-slate-800 relative overflow-hidden group">
          <img 
            src={`https://picsum.photos/seed/${cams[activeCam].id}/1280/720`} 
            className="w-full h-full object-cover opacity-60" 
            alt="Live View" 
          />
          
          {/* Simulated HUD overlays */}
          <div className="absolute inset-0 p-8 pointer-events-none">
            <div className="h-full w-full border border-white/10 rounded-lg flex items-center justify-center relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/40"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/40"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/40"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/40"></div>
              
              {/* Detection Box Simulation */}
              <div className="absolute top-1/3 left-1/4 w-32 h-48 border-2 border-emerald-500/60 flex flex-col justify-start">
                <span className="bg-emerald-500 text-[8px] font-bold text-white px-1 self-start">PEDESTRIAN 0.98</span>
              </div>
              <div className="absolute bottom-1/4 right-1/3 w-64 h-32 border-2 border-blue-500/60 flex flex-col justify-start">
                <span className="bg-blue-500 text-[8px] font-bold text-white px-1 self-start">VEHICLE: BUS 0.94</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none">
            <div className="space-y-1">
              <p className="text-white font-mono text-sm drop-shadow-lg">{cams[activeCam].location}</p>
              <p className="text-white/50 font-mono text-[10px]">{new Date().toISOString()}</p>
            </div>
            <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-mono text-[10px] space-y-1">
              <div className="flex justify-between gap-8"><span>LAT:</span><span>34.0522 N</span></div>
              <div className="flex justify-between gap-8"><span>LON:</span><span>118.2437 W</span></div>
              <div className="flex justify-between gap-8"><span>FPS:</span><span>29.97</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex flex-col gap-6">
        <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest mt-2">Camera Network</h3>
        <div className="space-y-3 overflow-y-auto flex-1 pr-2">
          {cams.map((cam, idx) => (
            <div 
              key={cam.id}
              onClick={() => setActiveCam(idx)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                activeCam === idx 
                  ? 'bg-blue-600 border-blue-500' 
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`font-mono text-[10px] ${activeCam === idx ? 'text-white' : 'text-slate-500'}`}>{cam.id}</span>
                {cam.alerts > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                )}
              </div>
              <p className={`font-bold text-sm ${activeCam === idx ? 'text-white' : 'text-slate-200'}`}>{cam.location}</p>
              <div className="flex items-center justify-between mt-3">
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  cam.status === 'Online' 
                    ? (activeCam === idx ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-500') 
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {cam.status}
                </span>
                {cam.alerts > 0 && <span className="text-[10px] font-bold text-red-400">1 INCIDENT</span>}
              </div>
            </div>
          ))}
        </div>
        
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <h4 className="text-sm font-bold text-slate-200 mb-4">Remote Controls</h4>
          <div className="grid grid-cols-2 gap-3">
            <button className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors flex flex-col items-center gap-1">
              <i className="fa-solid fa-arrows-up-down-left-right text-slate-400"></i>
              <span className="text-[10px] text-slate-500 font-bold">PTZ</span>
            </button>
            <button className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors flex flex-col items-center gap-1">
              <i className="fa-solid fa-magnifying-glass-plus text-slate-400"></i>
              <span className="text-[10px] text-slate-500 font-bold">ZOOM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveFeed;
