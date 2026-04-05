import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserApplications, useIntegrations } from '@/hooks/useStackData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, DollarSign, CalendarClock, Link2, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { formatCompact, formatCompactCurrency } from '@/lib/formatters';

type RenewalWindow = 30 | 60 | 90 | 'all';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: userApps = [] } = useUserApplications();
  const { data: integrations = [] } = useIntegrations();
  const [renewalWindow, setRenewalWindow] = useState<RenewalWindow>('all');

  // Compute totals: monthly includes annual/12, annual includes monthly*12
  const totalMonthly = userApps.reduce((sum, ua) => {
    const m = Number(ua.cost_monthly) || 0;
    const a = Number(ua.cost_annual) || 0;
    if (m > 0) return sum + m;
    if (a > 0) return sum + a / 12;
    return sum;
  }, 0);

  const totalAnnual = userApps.reduce((sum, ua) => {
    const m = Number(ua.cost_monthly) || 0;
    const a = Number(ua.cost_annual) || 0;
    if (a > 0) return sum + a;
    if (m > 0) return sum + m * 12;
    return sum;
  }, 0);

  const userAppIds = new Set(userApps.map(ua => ua.application_id));
  const relevantIntegrations = integrations.filter(
    i => userAppIds.has(i.source_app_id) && userAppIds.has(i.target_app_id)
  );

  const urgentRenewals = userApps
    .filter(ua => {
      if (!ua.renewal_date) return false;
      const days = differenceInDays(new Date(ua.renewal_date), new Date());
      return days <= 30;
    })
    .sort((a, b) => new Date(a.renewal_date!).getTime() - new Date(b.renewal_date!).getTime());

  const upcomingRenewals = userApps
    .filter(ua => {
      if (!ua.renewal_date) return false;
      if (renewalWindow === 'all') return true;
      const days = differenceInDays(new Date(ua.renewal_date), new Date());
      return days >= 0 && days <= renewalWindow;
    })
    .sort((a, b) => new Date(a.renewal_date!).getTime() - new Date(b.renewal_date!).getTime());

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your IT stack at a glance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { to: '/stack', icon: Layers, value: formatCompact(userApps.length), label: 'Total Apps', link: true },
          { to: '/budget', icon: DollarSign, value: formatCompactCurrency(totalMonthly), label: 'Monthly Spend', link: true },
          { to: '/budget', icon: DollarSign, value: formatCompactCurrency(totalAnnual), label: 'Annual Spend', link: true },
          { to: '/integrations', icon: Link2, value: formatCompact(relevantIntegrations.length), label: 'Integrations Available', link: true },
        ].map((card, i) => {
          const content = (
            <div className={cn(
              'rounded-xl border bg-card p-4 flex items-center gap-3 h-full',
              card.link && 'hover:border-primary/50 transition-colors cursor-pointer'
            )}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                <card.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold truncate">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          );
          return card.to ? (
            <Link key={i} to={card.to} className="block">{content}</Link>
          ) : (
            <div key={i}>{content}</div>
          );
        })}
      </div>

      {urgentRenewals.length > 0 && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-5 space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Renewal Alerts — {urgentRenewals.length} contract{urgentRenewals.length > 1 ? 's' : ''} expiring within 30 days
          </h3>
          <div className="space-y-2">
            {urgentRenewals.map(ua => {
              const daysUntil = differenceInDays(new Date(ua.renewal_date!), new Date());
              return (
                <div key={ua.id} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-background p-3">
                  <div>
                    <p className="font-medium">{(ua as any).applications?.name || 'Unknown App'}</p>
                    <p className="text-sm text-muted-foreground">
                      Renews {format(new Date(ua.renewal_date!), 'MMM d, yyyy')}
                      {ua.cost_annual ? ` · $${Number(ua.cost_annual).toLocaleString()}/yr` : ''}
                    </p>
                  </div>
                  <Badge variant={daysUntil <= 0 ? 'destructive' : 'outline'} className={daysUntil > 0 ? 'border-destructive/50 text-destructive' : ''}>
                    {daysUntil <= 0 ? 'Overdue!' : daysUntil === 1 ? '1 day left' : `${daysUntil} days left`}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcomingRenewals.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarClock className="h-5 w-5" />
              Upcoming Renewals
            </h3>
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              {([30, 60, 90, 'all'] as RenewalWindow[]).map(w => (
                <Button
                  key={w}
                  size="sm"
                  variant={renewalWindow === w ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setRenewalWindow(w)}
                >
                  {w === 'all' ? 'All' : `${w}d`}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {upcomingRenewals.map(ua => {
              const daysUntil = differenceInDays(new Date(ua.renewal_date!), new Date());
              return (
                <div key={ua.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{(ua as any).applications?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(ua.renewal_date!), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className={cn(
                    'text-sm font-medium',
                    daysUntil <= 30 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {daysUntil <= 0 ? 'Overdue' : `${daysUntil} days`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {relevantIntegrations.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Link2 className="h-5 w-5" />
              Available Integrations in Your Stack
            </h3>
            <Link to="/integrations" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {relevantIntegrations.map(i => (
                <div
                  key={i.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/integrations?highlight=${i.id}`)}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {(i as any).source?.name} ↔ {(i as any).target?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{i.description}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {i.integration_type}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}