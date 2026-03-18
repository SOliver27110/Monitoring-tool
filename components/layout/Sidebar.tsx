'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  FileSearch,
  Inbox,
  FileText,
  LayoutDashboard,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: '/projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" /> },
  { href: '/analyse', label: 'Analyse', icon: <FileSearch className="h-5 w-5" /> },
  { href: '/queue', label: 'Review Queue', icon: <Inbox className="h-5 w-5" /> },
  { href: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-gray-200 lg:bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <LayoutDashboard className="h-6 w-6 text-brand-purple" />
        <span className="text-lg font-bold text-brand-dark">DevComms</span>
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                    ${
                      isActive
                        ? 'bg-brand-light text-brand-purple'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-gray-200 px-6 py-4">
        <p className="text-xs text-gray-400">DevComms Media Monitor</p>
      </div>
    </aside>
  );
}
