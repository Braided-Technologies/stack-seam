import { ReactNode, useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SiteTour from '@/components/tour/AppTour';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Layers, Map, LogOut, Building2, Moon, Sun, Sparkles, Settings, Link2, ChevronsLeft, ChevronsRight, ShieldCheck, DollarSign, LifeBuoy } from 'lucide-react';
import HelpChatPanel from '@/components/HelpChatPanel';
import stackseamIcon from '@/assets/stackseam-icon.svg';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stack', icon: Layers, label: 'My Stack' },
  { to: '/map', icon: Map, label: 'Stack Map' },
  { to: '/integrations', icon: Link2, label: 'Integrations' },
  { to: '/budget', icon: DollarSign, label: 'Budget' },
  { to: '/research', icon: Sparkles, label: 'Research' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { orgName, signOut, user, userRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  // On login, restore theme from user metadata
  useEffect(() => {
    const savedTheme = user?.user_metadata?.theme;
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setDark(savedTheme === 'dark');
    }
  }, [user?.id]);

  // Apply theme to DOM and localStorage
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Persist theme to Supabase user metadata on toggle
  const toggleDark = () => {
    const newDark = !dark;
    setDark(newDark);
    supabase.auth.updateUser({ data: { theme: newDark ? 'dark' : 'light' } });
  };

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const isExpanded = !collapsed || hovered;

  const handleMouseEnter = () => {
    if (!collapsed) return;
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHovered(true), 150);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHovered(false);
  };

  const openFeedbackTab = () => {
    navigate('/support?tab=feedback');
  };

  return (
    <div className="flex min-h-screen">
      <SiteTour />
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'sticky top-0 h-screen flex flex-col border-r bg-card overflow-y-auto overflow-x-hidden transition-all duration-200 z-30',
          isExpanded ? 'w-64' : 'w-16'
        )}
      >
        <Link to="/" className={cn('flex items-center gap-2 border-b px-4 py-4 hover:bg-accent/50 transition-colors', !isExpanded && 'justify-center px-2')}>
          <img src={stackseamIcon} alt="StackSeam" className="flex-shrink-0 h-8 w-8" />
          {isExpanded && <span className="font-display font-bold whitespace-nowrap">StackSeam</span>}
        </Link>

        <nav data-tour="sidebar-nav" className="flex-1 space-y-1 p-3">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              title={!isExpanded ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                !isExpanded && 'justify-center px-0',
                location.pathname === item.to
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          ))}
          {(userRole === 'admin' || userRole === 'platform_admin') && (
            <Link
              to="/settings"
              title={!isExpanded ? 'Settings' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                !isExpanded && 'justify-center px-0',
                location.pathname === '/settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">Settings</span>}
            </Link>
          )}
          {userRole === 'platform_admin' && (
            <Link
              to="/admin"
              title={!isExpanded ? 'Platform Admin' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                !isExpanded && 'justify-center px-0',
                location.pathname === '/admin'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">Platform Admin</span>}
            </Link>
          )}
        </nav>

        <div data-tour="sidebar-org" className="border-t p-3 space-y-2">
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium truncate">{orgName}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate px-3">{user?.email}</div>
            </>
          ) : (
            <div className="flex justify-center" title={orgName || ''}>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <Link
            data-tour="sidebar-support"
            to="/support"
            title={!isExpanded ? 'Support' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full',
              !isExpanded && 'justify-center px-0',
              location.pathname === '/support'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <LifeBuoy className="h-4 w-4 flex-shrink-0" />
            {isExpanded && 'Support'}
          </Link>
          <Button
            data-tour="sidebar-theme"
            variant="ghost"
            size="sm"
            className={cn('w-full gap-2 text-muted-foreground', isExpanded ? 'justify-start' : 'justify-center px-0')}
            onClick={toggleDark}
            title={dark ? 'Light Mode' : 'Dark Mode'}
          >
            {dark ? <Sun className="h-4 w-4 flex-shrink-0" /> : <Moon className="h-4 w-4 flex-shrink-0" />}
            {isExpanded && (dark ? 'Light Mode' : 'Dark Mode')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full gap-2 text-muted-foreground', isExpanded ? 'justify-start' : 'justify-center px-0')}
            onClick={signOut}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {isExpanded && 'Sign Out'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full gap-2 text-muted-foreground', isExpanded ? 'justify-start' : 'justify-center px-0')}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4 flex-shrink-0" /> : <ChevronsLeft className="h-4 w-4 flex-shrink-0" />}
            {isExpanded && (collapsed ? 'Expand' : 'Collapse')}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <HelpChatPanel onOpenFeedback={openFeedbackTab} />
    </div>
  );
}
