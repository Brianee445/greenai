import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, TrendingUp, Repeat,
  Cpu, MessageSquare, FileText, FileArchive,
  ToggleLeft, ScrollText, Activity, X,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/ops/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/ops/users', label: 'Users', icon: Users },
      { to: '/ops/payments', label: 'Payments', icon: CreditCard },
      { to: '/ops/revenue', label: 'Revenue', icon: TrendingUp },
      { to: '/ops/subscriptions', label: 'Subscriptions', icon: Repeat },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { to: '/ops/usage', label: 'AI Usage', icon: Cpu },
      { to: '/ops/conversations', label: 'Conversations', icon: MessageSquare },
      { to: '/ops/prompts', label: 'Prompts', icon: FileText },
      { to: '/ops/files', label: 'Files', icon: FileArchive },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/ops/features', label: 'Feature Flags', icon: ToggleLeft },
      { to: '/ops/audit', label: 'Audit Logs', icon: ScrollText },
      { to: '/ops/health', label: 'System Health', icon: Activity },
    ],
  },
];

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  return (
    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-30
        bg-gray-900 border-r border-gray-800
        transition-all duration-300 ease-in-out
        flex flex-col
        ${isOpen ? 'w-60 translate-x-0' : 'w-60 -translate-x-full lg:translate-x-0 lg:w-16'}
      `}
    >
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-800">
        <NavLink to="/ops/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          </div>
          <span className={`font-semibold text-white text-sm truncate ${!isOpen && 'lg:hidden'}`}>
            GreenAI Ops
          </span>
        </NavLink>
        <button
          onClick={onToggle}
          className="p-1 text-gray-400 hover:text-white transition-colors lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className={`px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 ${!isOpen && 'lg:hidden'}`}>
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/ops/dashboard'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800 border-l-2 border-transparent'
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className={`truncate ${!isOpen && 'lg:hidden'}`}>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
