import { useEffect, useRef } from 'react';
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
import { diffRoute } from './lib/routes';

function AppRoutes() {
  const navigate = useNavigate();
  // The host parks every deep link as "pending" in case the event is emitted
  // before this listener exists. A target can therefore arrive twice (event
  // plus pending) in a narrow window; navigating once is enough.
  const lastDeepLinkRoute = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const openTarget = (payload: NavigateToRepoPayload) => {
      const route = diffRoute(payload);
      if (!active || route === lastDeepLinkRoute.current) return;
      lastDeepLinkRoute.current = route;
      navigate(route);
    };
    const unsubscribe = onNavigateToRepo((payload) => {
      openTarget(payload);
      // Delivered: clear the parked copy so it cannot replay on a later mount.
      void takePendingNavigation();
    });
    // A deep link that arrived before this listener existed (cold start or a
    // window recreated from the dock).
    takePendingNavigation().then((payload) => {
      if (payload) openTarget(payload);
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
