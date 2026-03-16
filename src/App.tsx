import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/Dashboard';
import { Athletes } from './pages/Athletes';
import { AthleteDetail } from './pages/AthleteDetail';
import { Plans } from './pages/Plans';
import { PlanDetail } from './pages/PlanDetail';
import { PlanBuilder } from './pages/PlanBuilder';
import { Exercises } from './pages/Exercises';
import { Assignments } from './pages/Assignments';
import { Settings } from './pages/Settings';
import { useStore } from './store/useStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/athletes" element={<ProtectedRoute><Athletes /></ProtectedRoute>} />
        <Route path="/athletes/:id" element={<ProtectedRoute><AthleteDetail /></ProtectedRoute>} />
        <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
        <Route path="/plans/new" element={<ProtectedRoute><PlanBuilder /></ProtectedRoute>} />
        <Route path="/plans/:id" element={<ProtectedRoute><PlanDetail /></ProtectedRoute>} />
        <Route path="/plans/:id/edit" element={<ProtectedRoute><PlanBuilder /></ProtectedRoute>} />
        <Route path="/exercises" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
        <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
