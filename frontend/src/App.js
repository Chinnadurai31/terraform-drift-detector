import React, { useState } from 'react';
import './App.css';
import LoginPage from './components/LoginPage';
import ProfileList from './components/ProfileList';
import AddProfile from './components/AddProfile';
import ProfileDetail from './components/ProfileDetail';

function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login', 'profiles', 'add', 'edit', 'detail'
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);

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
