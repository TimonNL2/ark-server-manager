import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { ClustersPage } from "./pages/ClustersPage";
import { CreateInstancePage } from "./pages/CreateInstancePage";
import { InstanceDetailPage } from "./pages/InstanceDetailPage";
import { InstancesPage } from "./pages/InstancesPage";
import { LoginPage } from "./pages/LoginPage";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            Ark <span>Host</span>
          </div>
          <div className="brand-sub">ASA · ASE control plane</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Instances
          </NavLink>
          <NavLink to="/instances/new">New instance</NavLink>
          <NavLink to="/clusters">Clusters</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div>{user?.username}</div>
          <button className="btn btn-ghost" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Private>
            <InstancesPage />
          </Private>
        }
      />
      <Route
        path="/instances/new"
        element={
          <Private>
            <CreateInstancePage />
          </Private>
        }
      />
      <Route
        path="/instances/:id"
        element={
          <Private>
            <InstanceDetailPage />
          </Private>
        }
      />
      <Route
        path="/clusters"
        element={
          <Private>
            <ClustersPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
