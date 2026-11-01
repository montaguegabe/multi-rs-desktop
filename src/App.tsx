import { useEffect } from 'react';
import { MemoryRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import RepoDiff from './components/RepoDiff';
import RepoList from './components/RepoList';
import Settings from './components/Settings';
import {
  onNavigateToRepo,
  onNavigateToSettings,
  takePendingNavigation,
  type NavigateToRepoPayload,
} from './lib/bridge';

function diffRoute({ repoPath, filePath }: NavigateToRepoPayload): string {
  const name = repoPath.split('/').pop() || repoPath;
  const params = new URLSearchParams({ path: repoPath, name });
  if (filePath) {
    params.set('file', filePath);
  }
  return `/diff?${params.toString()}`;
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const unsubscribe = onNavigateToRepo((payload) => {
      if (active) navigate(diffRoute(payload));
    });
    // A deep link that arrived before this listener existed (cold start).
    takePendingNavigation().then((payload) => {
      if (active && payload) navigate(diffRoute(payload));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    return onNavigateToSettings(() => navigate('/settings'));
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<RepoList />} />
      <Route path="/diff" element={<RepoDiff />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
