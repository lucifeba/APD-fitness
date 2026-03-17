import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/Dashboard';
import { Athletes } from './pages/Athletes';
import { AthleteDetail } from './pages/AthleteDetail';
import { Plans } from './pages/Plans';
import { PlanDetail } from './pages/PlanDetail';
import { PlanBuilder } from './pages/PlanBuilder';
import { AutoPlanGenerator } from './pages/AutoPlanGenerator';
import { Exercises } from './pages/Exercises';
import { Assignments } from './pages/Assignments';
import { Settings } from './pages/Settings';
import { Nutrition } from './pages/Nutrition';
import { NutritionGenerator } from './pages/NutritionGenerator';
import { NutritionPlanDetail } from './pages/NutritionPlanDetail';
import { AdminPanel } from './pages/admin/AdminPanel';
import { PatientRegister } from './pages/PatientRegister';
import { Chat } from './pages/Chat';
import { Feedback } from './pages/Feedback';
import { AthleteDashboard } from './pages/athlete/AthleteDashboard';
import { AthleteMyPlans } from './pages/athlete/AthleteMyPlans';
import { AthleteMyNutrition } from './pages/athlete/AthleteMyNutrition';
import { AthleteChat } from './pages/athlete/AthleteChat';
import { AthleteCompleteSurvey } from './pages/athlete/AthleteCompleteSurvey';
import { useStore } from './store/useStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Athletes have their own module
  if (currentUser?.role === 'athlete') return <Navigate to="/athlete/dashboard" replace />;
  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (currentUser?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AthleteRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (currentUser?.role !== 'athlete') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/registro-paciente/:token" element={<PatientRegister />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/athletes" element={<ProtectedRoute><Athletes /></ProtectedRoute>} />
        <Route path="/athletes/:id" element={<ProtectedRoute><AthleteDetail /></ProtectedRoute>} />
        <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
        <Route path="/plans/new" element={<ProtectedRoute><PlanBuilder /></ProtectedRoute>} />
        <Route path="/plans/auto" element={<ProtectedRoute><AutoPlanGenerator /></ProtectedRoute>} />
        <Route path="/plans/:id" element={<ProtectedRoute><PlanDetail /></ProtectedRoute>} />
        <Route path="/plans/:id/edit" element={<ProtectedRoute><PlanBuilder /></ProtectedRoute>} />
        <Route path="/exercises" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
        <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
        <Route path="/nutrition" element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
        <Route path="/nutrition/generator" element={<ProtectedRoute><NutritionGenerator /></ProtectedRoute>} />
        <Route path="/nutrition/plan/:id" element={<ProtectedRoute><NutritionPlanDetail /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        {/* ── ATHLETE ROUTES ───────────────────────────────────────────── */}
        <Route path="/athlete/complete-survey" element={<AthleteRoute><AthleteCompleteSurvey /></AthleteRoute>} />
        <Route path="/athlete/dashboard" element={<AthleteRoute><AthleteDashboard /></AthleteRoute>} />
        <Route path="/athlete/plans" element={<AthleteRoute><AthleteMyPlans /></AthleteRoute>} />
        <Route path="/athlete/nutrition" element={<AthleteRoute><AthleteMyNutrition /></AthleteRoute>} />
        <Route path="/athlete/chat" element={<AthleteRoute><AthleteChat /></AthleteRoute>} />
        <Route path="/athlete/feedback" element={<AthleteRoute><Feedback /></AthleteRoute>} />
        <Route path="/athlete/profile" element={<AthleteRoute><AthleteDashboard /></AthleteRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
