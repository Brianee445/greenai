import { useLocation } from 'react-router-dom';
import { Menu, Shield } from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';

interface AdminHeaderProps {
  onMenuClick: () => void;
}

const routeTitles: Record<string, string> = {
  '/ops/dashboard': 'Dashboard',
  '/ops/users': 'Users',
  '/ops/payments': 'Payments',
  '/ops/revenue': 'Revenue',
  '/ops/subscriptions': 'Subscriptions',
  '/ops/usage': 'AI Usage',
  '/ops/conversations': 'Conversations',
  '/ops/prompts': 'Prompts',
  '/ops/files': 'Files',
  '/ops/features': 'Feature Flags',
  '/ops/audit': 'Audit Logs',
  '/ops/health': 'System Health',
};

export function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const location = useLocation();
  const { profile, isSuperAdmin } = useAdminAuth();

  const basePath = '/' + location.pathname.split('/').slice(1, 3).join('/');
  const title = routeTitles[basePath] ?? 'Admin';

  return (
    <header className="h-14 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-1.5 text-gray-400 hover:text-white transition-colors lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
          <Shield className={`w-4 h-4 ${isSuperAdmin ? 'text-amber-400' : 'text-emerald-400'}`} />
          <span className="text-sm text-gray-300">
            {profile?.display_name ?? profile?.email ?? 'Admin'}
          </span>
        </div>
      </div>
    </header>
  );
}
