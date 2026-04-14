import { useActiveDiscoveryJob } from '@/hooks/useStackData';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';

export function DiscoveryProgressPanel() {
  const { orgId } = useAuth();
  const { data: activeJob } = useActiveDiscoveryJob(orgId);

  if (!activeJob) return null;

  const pct = activeJob.total_pairs > 0
    ? (activeJob.processed_pairs / activeJob.total_pairs) * 100
    : 0;

  const label =
    activeJob.job_type === 'full_scan' ? 'Scanning full stack' :
    activeJob.job_type === 'deep_scan' ? 'Deep scan' :
    'Scan';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Integration Discovery Progress
          </CardTitle>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{activeJob.processed_pairs} of {activeJob.total_pairs} pairs checked</span>
          <span>{activeJob.found_count} new integration{activeJob.found_count === 1 ? '' : 's'} found</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Skipping pairs already scanned in the last 30 days or already linked.
        </p>
      </CardContent>
    </Card>
  );
}
