import { Link, useNavigate } from 'react-router-dom';
import { useUserApplications, useIntegrations } from '@/hooks/useStackData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, DollarSign, CalendarClock, Link2, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: userApps = [] } = useUserApplications();
  const { data: integrations = [] } = useIntegrations();

  const totalMonthly = userApps.reduce((sum, ua) => sum + (Number(ua.cost_monthly) || 0), 0);
  const totalAnnual = userApps.reduce((sum, ua) => sum + (Number(ua.cost_annual) || 0), 0);

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
    .filter(ua => ua.renewal_date)
    .sort((a, b) => new Date(a.renewal_date!).getTime() - new Date(b.renewal_date!).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your IT stack at a glance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Apps</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userApps.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalMonthly.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annual Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalAnnual.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Link to="/integrations" className="block">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Integrations Available</CardTitle>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{relevantIntegrations.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to manage →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Urgent renewal alerts */}
      {urgentRenewals.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Renewal Alerts — {urgentRenewals.length} contract{urgentRenewals.length > 1 ? 's' : ''} expiring within 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {upcomingRenewals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Upcoming Renewals
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {relevantIntegrations.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Available Integrations in Your Stack
            </CardTitle>
            <Link to="/integrations" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
