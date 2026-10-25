export const GITHUB_PAGES_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function appPath(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${GITHUB_PAGES_BASE}${normalized === '/' ? '/' : normalized}`;
}

export function getAppPathname() {
  const pathname = window.location.pathname;
  if (pathname === GITHUB_PAGES_BASE || pathname === `${GITHUB_PAGES_BASE}/`) return '/';
  return pathname.startsWith(`${GITHUB_PAGES_BASE}/`)
    ? pathname.slice(GITHUB_PAGES_BASE.length) || '/'
    : pathname;
}

export function restoreGithubPagesRoute() {
  const params = new URLSearchParams(window.location.search);
  const route = params.get('__ghpages_route');
  if (!route) return;
  const separator = route.indexOf('?');
  const hashSeparator = route.indexOf('#');
  const routePath = route.slice(0, Math.min(...[separator, hashSeparator].filter((value) => value >= 0).concat(route.length)));
  window.history.replaceState({}, '', appPath(routePath) + route.slice(routePath.length));
}
