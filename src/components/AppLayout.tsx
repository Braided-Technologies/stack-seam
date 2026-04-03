import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Layers, Map, LogOut, Building2, Moon, Sun, Users, Sparkles, Settings } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stack', icon: Layers, label: 'My Stack' },
  { to: '/map', icon: Map, label: 'Stack Map' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/research', icon: Sparkles, label: 'Research' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { orgName, signOut, user, userRole } = useAuth();
  const location = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Layers className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">StackMap</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === item.to
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {userRole === 'admin' && (
            <Link
              to="/settings"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === '/settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
        </nav>

        <div className="border-t p-3 space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium truncate">{orgName}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate px-3">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => setDark(!dark)}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Light Mode' : 'Dark Mode'}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
