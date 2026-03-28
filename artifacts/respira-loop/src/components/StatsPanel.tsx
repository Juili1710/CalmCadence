import React, { useState } from 'react';
import { useGetStats } from "@workspace/api-client-react";
import { ChevronUp, ChevronDown, Users, Activity, Clock, Heart } from 'lucide-react';
import { formatTime } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function StatsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  
  // Refetch every 30 seconds
  const { data: stats, isLoading } = useGetStats({
    query: { refetchInterval: 30000 }
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-6 py-2 bg-card/80 backdrop-blur-md border border-white/10 rounded-t-2xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Activity className="w-4 h-4" />
        Live Community Stats
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full bg-card/90 backdrop-blur-xl border-t border-white/10 overflow-hidden"
          >
            <div className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              <StatCard 
                icon={<Users className="w-5 h-5 text-blue-400" />}
                label="Total Users"
                value={isLoading ? "..." : stats?.totalUsers?.toLocaleString() || "0"}
              />
              <StatCard 
                icon={<Activity className="w-5 h-5 text-teal-400" />}
                label="Total Sessions"
                value={isLoading ? "..." : stats?.totalSessions?.toLocaleString() || "0"}
              />
              <StatCard 
                icon={<Clock className="w-5 h-5 text-purple-400" />}
                label="Avg Duration"
                value={isLoading ? "..." : formatTime(stats?.avgDurationSeconds || 0)}
              />
              <StatCard 
                icon={<Heart className="w-5 h-5 text-rose-400" />}
                label="Would Recommend"
                value={isLoading ? "..." : `${Math.round(stats?.recommendPercent || 0)}%`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white/5 border border-white/5">
      <div className="p-3 bg-white/5 rounded-full mb-3">
        {icon}
      </div>
      <div className="text-2xl font-bold font-display text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
