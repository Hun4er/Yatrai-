import React from 'react';
import { AuthProvider } from './context/AuthContext.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import HomePage from './pages/HomePage.jsx';

export function App() {
  return (
    <AuthProvider>
      <MainLayout>
        <HomePage />
      </MainLayout>
    </AuthProvider>
  );
}

export default App;
