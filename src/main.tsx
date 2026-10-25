import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ViewerPage } from './pages/ViewerPage';
import { EmbedPage } from './pages/EmbedPage';
import { PublicHomePage } from './pages/PublicHomePage';
import { MyMapsPage } from './pages/MyMapsPage';
import { EditorPage } from './pages/EditorPage';
import { OrganizerLoginPage } from './pages/OrganizerLoginPage';
import { isOrganizerAuthenticated } from './auth/frontendAuth';
import { OrganizerGate } from './auth/OrganizerGate';
import { isSupabaseEnabledFromEnv } from './api/client';
import { appPath, getAppPathname, restoreGithubPagesRoute } from './lib/routing';
import './api/bootstrap';

restoreGithubPagesRoute();

function App() {
  const path = getAppPathname();
  const editorMatch = path.match(/^\/app\/maps\/([^/]+)/);
  const viewerMatch = path.match(/^\/(m|embed)\/([^/]+)/);

  if (path === '/organizer/login' || path === '/login') return <OrganizerLoginPage />;
  if (path === '/app' || path === '/app/') {
    if (!isOrganizerAuthenticated() && !isSupabaseEnabledFromEnv()) return <OrganizerLoginPage />;
    return <OrganizerGate onUnauthorized={() => window.location.replace(appPath('/organizer/login'))}><MyMapsPage /></OrganizerGate>;
  }
  if (editorMatch) {
    if (!isOrganizerAuthenticated() && !isSupabaseEnabledFromEnv()) return <OrganizerLoginPage />;
    return <OrganizerGate onUnauthorized={() => window.location.replace(appPath('/organizer/login'))}><EditorPage id={editorMatch[1]} /></OrganizerGate>;
  }
  if (path === '/' || path === '') return <PublicHomePage />;
  if (viewerMatch?.[1] === 'embed') return <EmbedPage slug={viewerMatch[2]} />;
  return <ViewerPage slug={viewerMatch?.[2] || 'central'} />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
