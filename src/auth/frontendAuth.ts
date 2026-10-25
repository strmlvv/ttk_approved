export const ORGANIZER_SESSION_KEY = 'ttk-organizer-session';
export const FRONTEND_ORGANIZER_LOGIN = 'organizer';
export const FRONTEND_ORGANIZER_PASSWORD = 'ttk-demo-2026';
export const isOrganizerAuthenticated = () => window.localStorage.getItem(ORGANIZER_SESSION_KEY) === 'active';
