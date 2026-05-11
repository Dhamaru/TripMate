import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentResult {
  agent: string;
  success: boolean;
  confidence: number;
  durationMs: number;
  tokensUsed: number;
}

interface AgentJob {
  jobId: string;
  trigger: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: AgentResult[];
  totalTokensUsed: number;
  totalDurationMs: number;
  createdAt: string;
}

interface AgentHistoryListProps {
  tripId?: string;
  className?: string;
}

export const AgentHistoryList: React.FC<AgentHistoryListProps> = ({ tripId, className }) => {
  const { data, isLoading } = useQuery<{ success: boolean; data: AgentJob[] }>({
    queryKey: ['agent-history', tripId],
    queryFn: async () => {
      const url = tripId ? `/api/v1/orchestrator/jobs?tripId=${tripId}` : '/api/v1/orchestrator/jobs';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    refetchInterval: 10000, // Refresh every 10s to see live updates
  });

  const jobs = data?.data || [];

  if (isLoading && jobs.length === 0) {
    return (
      <Card className="bg-muted/50 border-white/5">
        <CardContent className="p-8 flex flex-col items-center justify-center space-y-4">
          <Brain className="w-8 h-8 text-[#1E3A8A] dark:text-blue-400 animate-pulse" />
          <p className="text-muted-foreground text-sm">Consulting our archives...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-muted/50 border-white/5 backdrop-blur-xl ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
          Intelligence Logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {jobs.map((job) => (
                <motion.div
                  key={job.jobId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">
                        {job.trigger.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge 
                      className={`${
                        job.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        job.status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-[#1E3A8A]/10 text-[#1E3A8A] dark:text-blue-400 border-[#1E3A8A]/20'
                      } text-[10px] px-2 py-0`}
                    >
                      {job.status}
                    </Badge>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {job.results.map((res, i) => (
                      <div 
                        key={i}
                        className={`group relative flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] ${
                          res.success ? 'bg-green-500/5 border-green-500/10 text-green-400' : 'bg-red-500/5 border-red-500/10 text-red-400'
                        }`}
                      >
                        {res.success ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                        {res.agent.replace('Agent', '')}
                        
                        {/* Tooltip-like popup */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-24 p-2 bg-muted border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                          <p className="text-[8px] text-muted-foreground">Conf: {(res.confidence * 100).toFixed(0)}%</p>
                          <p className="text-[8px] text-muted-foreground">{res.durationMs}ms</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#1E3A8A] dark:text-blue-400" />
                      {job.totalDurationMs}ms
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-[#1E3A8A] dark:text-blue-400" />
                      {job.totalTokensUsed} tokens
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {jobs.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-xs text-muted-foreground">No intelligence events recorded yet.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
