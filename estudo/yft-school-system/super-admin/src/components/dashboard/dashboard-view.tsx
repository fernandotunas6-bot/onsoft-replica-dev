"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { 
  Building2, 
  Banknote,
  MoreVertical,
  School2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import type { WorkerMetrics } from '@/lib/worker';
import { cn } from '@/lib/utils';

type TrendPoint = {
  label: string;
  schools: number;
  revenue: number;
};

type DashboardViewProps = {
  metrics: WorkerMetrics;
  trend: TrendPoint[];
  recentSchools: Array<{
    id: string;
    name: string;
    location: string | null;
    is_active: boolean;
  }>;
};

const statColors = {
  purple: { bg: 'stat-card-purple', icon: '#6a5ae0' },
  blue: { bg: 'stat-card-blue', icon: '#3b82f6' },
  orange: { bg: 'stat-card-orange', icon: '#f97316' },
  green: { bg: 'stat-card-green', icon: '#22c55e' },
};

export function DashboardView({ metrics, trend, recentSchools }: DashboardViewProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const systemData = (metrics.system_distribution ?? []).map(item => ({
    name: item.name,
    value: item.value,
    color: item.name === 'Trimester' ? '#6a5ae0' : '#3b82f6',
  }));

  const cards = [
    {
      label: 'Onboarded Schools',
      value: metrics.total_schools ?? 0,
      icon: School2,
      color: 'purple',
    },
    {
      label: 'Active Hubs',
      value: metrics.active_schools ?? 0,
      icon: Building2,
      color: 'green',
    },
    {
      label: 'Suspended Schools',
      value: metrics.suspended_schools ?? 0,
      icon: MoreVertical,
      color: 'orange',
    },
    {
      label: 'Total Ecosystem Revenue',
      value: `GH₵${(metrics.total_revenue ?? 0).toLocaleString()}`,
      icon: Banknote,
      color: 'blue',
    },
  ];

  return (
    <div className="space-y-8 overflow-x-hidden">
      <div>
        <h2 className="text-2xl font-bold text-[#1a1c21]">Ecosystem Control Center</h2>
        <p className="text-sm font-medium text-[#7c8b9a]">Global Overview of YFT School Management System</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          const tone = statColors[card.color as keyof typeof statColors];
          return (
            <div
              key={card.label}
              className={cn(
                'group flex items-center justify-between rounded-[2rem] p-6 transition-transform hover:scale-[1.02] sm:rounded-[2.5rem] sm:p-8',
                tone.bg
              )}
            >
              <div>
                <p className="text-xs font-semibold opacity-70 sm:text-sm">{card.label}</p>
                <p className="font-[var(--font-space-grotesk)] text-2xl font-bold tracking-tight sm:text-3xl">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-white/60 shadow-sm backdrop-blur-md sm:size-14 sm:rounded-2xl">
                <Icon className="size-6 sm:size-7" style={{ color: tone.icon }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-8">
        {/* Main Chart */}
        <div className="min-w-0 rounded-[2rem] bg-white p-6 premium-shadow sm:rounded-[2.5rem] sm:p-8 overflow-hidden">
          <div className="mb-6 flex items-center justify-between sm:mb-8">
            <h3 className="text-lg font-bold text-[#1a1c21] sm:text-xl">Tenant Onboarding Trends</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5">
                <div className="size-2 rounded-full bg-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">Schools</span>
              </div>
            </div>
          </div>
          <div className="h-64 w-full min-h-64 min-w-0 sm:h-80 sm:min-h-80">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6a5ae0" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#6a5ae0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#7c8b9a', fontSize: 10, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: 15, 
                      border: 'none', 
                      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
                      padding: '8px 16px',
                      fontSize: '12px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="schools" 
                    stroke="#6a5ae0" 
                    strokeWidth={3}
                    fill="url(#purpleGradient)" 
                    dot={{ r: 3, fill: '#6a5ae0', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut Chart */}
        <div className="min-w-0 rounded-[2rem] bg-white p-6 premium-shadow sm:rounded-[2.5rem] sm:p-8">
          <div className="mb-6 flex items-center justify-between sm:mb-8">
            <h3 className="text-lg font-bold text-[#1a1c21] sm:text-xl">Onboarding Systems</h3>
            <button className="text-[#7c8b9a] hover:text-[#1a1c21]">
              <MoreVertical className="size-5" />
            </button>
          </div>
          <div className="relative mx-auto h-52 w-full min-h-52 min-w-0 sm:h-64 sm:min-h-64">
            <div className="absolute inset-0 min-h-0 min-w-0">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minHeight={208}>
                  <PieChart>
                    <Pie
                      data={systemData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {systemData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] font-bold text-[#7c8b9a] uppercase tracking-widest">Total Schools</p>
              <p className="text-2xl font-black text-[#1a1c21] sm:text-3xl">{metrics.total_schools}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6">
            {systemData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="size-2.5 rounded-full sm:size-3" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-bold text-[#1a1c21] sm:text-sm">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Recent Schools Table-style */}
        <div className="rounded-[2.5rem] bg-white p-8 premium-shadow">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#1a1c21]">Onboarded Schools</h3>
            <button className="text-[#7c8b9a] hover:text-[#1a1c21]">
              <MoreVertical className="size-5" />
            </button>
          </div>
          <div className="-mx-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50 text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">
                  <th className="px-8 pb-4">Name</th>
                  <th className="px-4 pb-4">ID</th>
                  <th className="px-4 pb-4">Location</th>
                  <th className="px-8 pb-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentSchools.map((school) => (
                  <tr key={school.id} className="group transition-colors hover:bg-slate-50/50">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                          <School2 className="size-5" />
                        </div>
                        <span className="font-bold text-[#1a1c21]">{school.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-xs font-mono text-[#7c8b9a]">{school.id.slice(0, 8)}...</td>
                    <td className="px-4 py-5 text-sm text-[#7c8b9a]">{school.location ?? 'Global'}</td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                        school.is_active ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {school.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Exam results or News style panel */}
        <div className="rounded-[2.5rem] bg-white p-8 premium-shadow">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#1a1c21]">System Logs</h3>
            <button className="text-[#7c8b9a] hover:text-[#1a1c21]">
              <MoreVertical className="size-5" />
            </button>
          </div>
          <div className="space-y-6">
            {[
              { title: 'New School', desc: 'Central High has been onboarded.', time: 'Just now', color: 'bg-primary/10 text-primary' },
              { title: 'D1 Migration', desc: 'Auto-applied 2 migration(s).', time: '2 hours ago', color: 'bg-emerald-100 text-emerald-600' },
              { title: 'Super Admin', desc: 'Custom claims updated for user.', time: 'Today', color: 'bg-orange-100 text-orange-600' },
            ].map((log, i) => (
              <div key={i} className="flex gap-4">
                <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl font-bold", log.color)}>
                  {log.title[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[#1a1c21]">{log.title}</p>
                    <p className="text-[10px] font-bold text-[#7c8b9a] uppercase">{log.time}</p>
                  </div>
                  <p className="mt-1 text-sm text-[#7c8b9a] line-clamp-1">{log.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
