export const dashboardNavLinks = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/dashboard/notes', label: 'Notes', icon: 'notes' },
  { href: '/dashboard/music', label: 'Music', icon: 'music' },
  { href: '/dashboard/gallery', label: 'Gallery', icon: 'gallery' },
  { href: '/dashboard/letters', label: 'Letters', icon: 'letters' },
] as const;

export type NavIconId = (typeof dashboardNavLinks)[number]['icon'];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
