
import React, { useMemo } from 'react';
import { Incident } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';

interface DashboardProps {
  incidents: Incident[];
}

const Dashboard: React.FC<DashboardProps> = ({ incidents }) => {
  // Logic: Identify which place has more of what
  const locationHotspots = useMemo(() => {
    const stats: Record<string, { total: number, counts: Record<string, number>, lastReason: string }> = {};
    
    incidents.forEach(inc => {
      const loc = inc.location || 'Unknown Sector';
      if (!stats[loc]) {
        stats[loc] = { total: 0, counts: {}, lastReason: '' };
      }
      stats[loc].total++;
      // Fix: Correctly increment the specific incident type count within the location's stats
      stats[loc].counts[inc.type] = (stats[loc].counts[inc.type] || 0) + 1;
      // We take the description as the 'Reason' provided by AI
      stats[loc].lastReason = inc.description;
    });

    return Object.entries(stats).map(([name, data]) => {
      // Find what type is most frequent in this location
      const topTypeEntry = Object.entries(data.counts).sort((a, b) => b[1] - a[1])[0];
      return {
        name,
        total: data.total,
        topType: topTypeEntry ? topTypeEntry[0] : 'Various',
        reason: data.lastReason
      };
    }).sort((a, b) => b.total - a.total);
  }, [incidents]);

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {
      'Vehicle Collision': 0, 'Thief / Robbery': 0, 'Women Safety': 0, 'Weapon / Violence': 0
    };
    incidents.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  const COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#ef4444'];

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      {/* Strategic Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-slate-800 pb-10">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-2">Strategic <span className="text-blue-500">Hub</span></h1>
          <p className="text-slate-400">Analyzing which zones are reporting higher frequencies of crime and accidents.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-900 px-6 py-4 rounded-3xl border border-slate-800 text-center">
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Active Alerts</span>
            <span className="text-2xl font-black text-white">{incidents.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Hotspot List: The "Which place is taking more" section */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <i className="fa-solid fa-map-pin text-rose-500"></i> Location-Specific Threat Hotspots
          </h3>
          
          {locationHotspots.length > 0 ? (
            <div className="space-y-4">
              {locationHotspots.map((loc, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group hover:border-blue-500/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-blue-500 font-black text-xl">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white">{loc.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Top Incident:</span>
                        <span className="text-[10px] font-black text-rose-500 uppercase">{loc.topType}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                    <p className="text-[10px] font-black text-blue-500 uppercase mb-1">AI Reason & Analysis</p>
                    <p className="text-xs text-slate-400 italic line-clamp-2 leading-relaxed">
                      "{loc.reason || 'Multiple behavioral triggers detected in this corridor.'}"
                    </p>
                  </div>

                  <div className="text-right px-6">
                    <span className="block text-[10px] font-black text-slate-500 uppercase">Alert Frequency</span>
                    <span className="text-3xl font-black text-white">{loc.total}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-[3rem] p-24 text-center">
              <i className="fa-solid fa-satellite text-6xl text-slate-800 mb-6"></i>
              <p className="text-slate-600 font-bold uppercase tracking-widest">Awaiting Data Streams</p>
            </div>
          )}
        </div>

        {/* Analytics Sidebar */}
        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem]">
            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-10 flex items-center gap-2">
              <i className="fa-solid fa-chart-pie text-blue-500"></i> Global Threat Split
            </h4>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8">
              {typeData.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                  <span className="text-[9px] font-black text-slate-400 uppercase truncate">{t.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-10">
              <i className="fa-solid fa-brain text-9xl"></i>
            </div>
            <h4 className="text-lg font-black uppercase mb-4 tracking-tighter">Strategic Insight</h4>
            <p className="text-xs text-blue-100 leading-relaxed">
              System has flagged <span className="text-white font-bold">{locationHotspots[0]?.name || 'a new sector'}</span> as a high-risk priority due to an increase in <span className="text-white font-bold">{locationHotspots[0]?.topType || 'unusual activity'}</span> detections.
            </p>
            <button className="w-full mt-6 bg-white text-blue-600 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest">
              Review High Risk Feed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
