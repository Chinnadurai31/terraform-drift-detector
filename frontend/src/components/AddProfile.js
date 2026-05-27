import React, { useState } from 'react';
import axios from 'axios';

function AddProfile({ onBack, onProfileCreated, editProfile }) {
  const isEditMode = !!editProfile;

  const [formData, setFormData] = useState({
    name: editProfile?.name || '',
    stateSource: editProfile?.stateSource || 'local',
    statePath: editProfile?.statePath || '',
    stateBucket: editProfile?.stateBucket || '',
    stateKey: editProfile?.stateKey || '',
    credentialsText: '',
    region: 'us-east-1'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5050';

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const parseCredentials = (text) => {
    const credentials = {
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      region: formData.region || 'us-east-1'
    };

    if (!text.trim()) return null;

    // Parse AWS credentials from text
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Match export AWS_ACCESS_KEY_ID="value" or AWS_ACCESS_KEY_ID="value"
      const accessKeyMatch = trimmed.match(/AWS_ACCESS_KEY_ID\s*=\s*["']?([^"'\s]+)["']?/i);
      if (accessKeyMatch) {
        credentials.accessKeyId = accessKeyMatch[1];
      }

      const secretKeyMatch = trimmed.match(/AWS_SECRET_ACCESS_KEY\s*=\s*["']?([^"'\s]+)["']?/i);
      if (secretKeyMatch) {
        credentials.secretAccessKey = secretKeyMatch[1];
      }

      const sessionTokenMatch = trimmed.match(/AWS_SESSION_TOKEN\s*=\s*["']?([^"'\s]+)["']?/i);
      if (sessionTokenMatch) {
        credentials.sessionToken = sessionTokenMatch[1];
      }

      const regionMatch = trimmed.match(/AWS_REGION\s*=\s*["']?([^"'\s]+)["']?/i);
      if (regionMatch) {
        credentials.region = regionMatch[1];
      }
    }

    return credentials.accessKeyId && credentials.secretAccessKey ? credentials : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        stateSource: formData.stateSource
      };

      if (formData.stateSource === 'local') {
        payload.statePath = formData.statePath;
      } else {
        payload.stateBucket = formData.stateBucket;
        payload.stateKey = formData.stateKey;
      }

      // Parse and add credentials if provided
      if (formData.credentialsText) {
        const parsedCreds = parseCredentials(formData.credentialsText);
        if (parsedCreds) {
          payload.credentials = parsedCreds;
        } else {
          setError('Could not parse AWS credentials. Please check the format.');
          setLoading(false);
          return;
        }
      }
      // When editing: if no new credentials provided, DON'T send credentials field at all
      // This preserves existing credentials in the database

      if (isEditMode) {
        await axios.put(`${API_BASE}/api/profiles/${editProfile.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/api/profiles`, payload);
      }

      setLoading(false);
      onProfileCreated();
    } catch (err) {
      setError(err.response?.data?.error || err.message || `Failed to ${isEditMode ? 'update' : 'create'} profile`);
      setLoading(false);
    }
  };

  return (
    <div className="add-profile-page">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={onBack} className="btn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="logo">
              <h1>{isEditMode ? 'Edit Profile' : 'Add New Profile'}</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="main-container">
        <div className="form-container">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-section">
              <h3>Profile Information</h3>

              <div className="form-group">
                <label htmlFor="name">Profile Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Production VPC, Staging Environment"
                  required
                  className="form-input"
                />
                <small>A friendly name to identify this infrastructure</small>
              </div>
            </div>

            <div className="form-section">
              <h3>State File Location</h3>

              <div className="form-group">
                <label>Source Type *</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="stateSource"
                      value="local"
                      checked={formData.stateSource === 'local'}
                      onChange={handleChange}
                    />
                    <span>💾 Local File</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="stateSource"
                      value="s3"
                      checked={formData.stateSource === 's3'}
                      onChange={handleChange}
                    />
                    <span>☁️ S3 Bucket</span>
                  </label>
                </div>
              </div>

              {formData.stateSource === 'local' && (
                <div className="form-group">
                  <label htmlFor="statePath">State File Path *</label>
                  <input
                    type="text"
                    id="statePath"
                    name="statePath"
                    value={formData.statePath}
                    onChange={handleChange}
                    placeholder="/path/to/terraform.tfstate"
                    required
                    className="form-input"
                  />
                  <small>Absolute path to your terraform.tfstate file</small>
                </div>
              )}

              {formData.stateSource === 's3' && (
                <>
                  <div className="form-group">
                    <label htmlFor="stateBucket">S3 Bucket Name *</label>
                    <input
                      type="text"
                      id="stateBucket"
                      name="stateBucket"
                      value={formData.stateBucket}
                      onChange={handleChange}
                      placeholder="my-terraform-states"
                      required
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="stateKey">S3 Key/Path *</label>
                    <input
                      type="text"
                      id="stateKey"
                      name="stateKey"
                      value={formData.stateKey}
                      onChange={handleChange}
                      placeholder="prod/vpc/terraform.tfstate"
                      required
                      className="form-input"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="form-section">
              <h3>AWS Credentials (Optional)</h3>
              <p className="form-section-desc">
                Required for drift detection. Paste your AWS credentials in export format.
              </p>

              <div className="form-group">
                <label htmlFor="credentialsText">
                  AWS Credentials {isEditMode && '(Leave empty to keep existing)'}
                </label>
                <textarea
                  id="credentialsText"
                  name="credentialsText"
                  value={formData.credentialsText}
                  onChange={handleChange}
                  placeholder={`AWS_ACCESS_KEY_ID="ASIA4Q7C6B2HDSZMVHKJ"
AWS_SECRET_ACCESS_KEY="rEGzIBIekJPrEwfk8yLHv8eqZ5iC9656BSDAnAMv"
AWS_SESSION_TOKEN="IQoJb3JpZ2lu..."
AWS_REGION="ap-south-1"`}
                  className="form-textarea credentials-textarea"
                  rows="8"
                />
                <small>
                  {isEditMode
                    ? 'Paste new credentials to update, or leave empty to keep existing credentials.'
                    : 'Paste your AWS credentials from AWS CLI or console. Supports export format.'
                  }
                </small>
              </div>
            </div>

            {error && (
              <div className="form-error">
                ⚠️ {error}
              </div>
            )}

            <div className="form-actions">
              <button type="button" onClick={onBack} className="btn">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? (
                  <>
                    <div className="small-spinner"></div>
                    {isEditMode ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  isEditMode ? 'Update Profile' : 'Create Profile'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddProfile;
