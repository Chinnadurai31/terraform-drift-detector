import React, { useState, useEffect } from 'react';
import './App.css';
import LoginPage from './components/LoginPage';
import ProfileList from './components/ProfileList';
import AddProfile from './components/AddProfile';
import ProfileDetail from './components/ProfileDetail';

function App() {
  // Initialize state from localStorage
  const [currentView, setCurrentView] = useState(() => {
    return localStorage.getItem('currentView') || 'login';
  });
  const [selectedProfile, setSelectedProfile] = useState(() => {
    const saved = localStorage.getItem('selectedProfile');
    return saved ? JSON.parse(saved) : null;
  });
  const [editingProfile, setEditingProfile] = useState(() => {
    const saved = localStorage.getItem('editingProfile');
    return saved ? JSON.parse(saved) : null;
  });

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('currentView', currentView);
  }, [currentView]);

  useEffect(() => {
    if (selectedProfile) {
      localStorage.setItem('selectedProfile', JSON.stringify(selectedProfile));
    } else {
      localStorage.removeItem('selectedProfile');
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (editingProfile) {
      localStorage.setItem('editingProfile', JSON.stringify(editingProfile));
    } else {
      localStorage.removeItem('editingProfile');
    }
  }, [editingProfile]);

  const handleLogin = () => {
    setCurrentView('profiles');
  };

  const handleSelectProfile = (profile) => {
    setSelectedProfile(profile);
    setCurrentView('detail');
  };

  const handleAddProfile = () => {
    setEditingProfile(null);
    setCurrentView('add');
  };

  const handleEditProfile = (profile) => {
    setEditingProfile(profile);
    setCurrentView('edit');
  };

  const handleBackToProfiles = () => {
    setCurrentView('profiles');
    setSelectedProfile(null);
    setEditingProfile(null);
  };

  const handleProfileCreated = () => {
    setCurrentView('profiles');
    setEditingProfile(null);
  };

  return (
    <div className="App">
      {currentView === 'login' && (
        <LoginPage onLogin={handleLogin} />
      )}

      {currentView === 'profiles' && (
        <ProfileList
          onSelectProfile={handleSelectProfile}
          onAddProfile={handleAddProfile}
          onEditProfile={handleEditProfile}
        />
      )}

      {(currentView === 'add' || currentView === 'edit') && (
        <AddProfile
          onBack={handleBackToProfiles}
          onProfileCreated={handleProfileCreated}
          editProfile={editingProfile}
        />
      )}

      {currentView === 'detail' && selectedProfile && (
        <ProfileDetail
          profile={selectedProfile}
          onBack={handleBackToProfiles}
        />
      )}
    </div>
  );
}

export default App;
