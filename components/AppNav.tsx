'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dashboardNavLinks, isNavActive } from '@/lib/nav';
import { navIcons } from '@/components/icons';

export default function AppNav({
  variant,
}: {
  variant: 'top' | 'bottom';
}) {
  const pathname = usePathname();
  const className = variant === 'bottom' ? 'mobile-bottom-nav' : 'nav-links';

  return (
    <nav className={className} aria-label="Primary">
      {dashboardNavLinks.map((link) => {
        const active = isNavActive(pathname, link.href);
        const Icon = navIcons[link.icon];
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            className={`${variant === 'bottom' ? 'mobile-bottom-nav-link' : 'nav-link'}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={variant === 'bottom' ? 'mobile-bottom-nav-icon' : 'nav-icon'} />
            <span className={variant === 'bottom' ? 'mobile-bottom-nav-label' : undefined}>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
