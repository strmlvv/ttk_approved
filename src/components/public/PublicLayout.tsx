import type { ReactNode } from 'react';
import { PublicFooter } from './PublicFooter';
import { PublicHeader } from './PublicHeader';

export function PublicLayout({ children, mapSlug = 'central', mapHref }: { children: ReactNode; mapSlug?: string; mapHref?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fa] text-ink">
      <PublicHeader mapSlug={mapSlug} mapHref={mapHref} />
      <div className="flex-1">{children}</div>
      <PublicFooter mapSlug={mapSlug} mapHref={mapHref} />
    </div>
  );
}
