'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, FolderKanban, FileSearch, FileText, LayoutDashboard } from 'lucide-react';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" /> },
  { href: '/analyse', label: 'Analyse', icon: <FileSearch className="h-5 w-5" /> },
  { href: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" /> },
];

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl">
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-brand-purple" />
            <span className="text-lg font-bold text-brand-dark">DevComms</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
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
      </div>
    </div>
  );
}
