import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getVisibleSettingsSections } from '../utils/settingsSections';

export default function SettingsNav({ activeKey }) {
  const { user } = useAuth();
  const visibleSections = getVisibleSettingsSections(user);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        {visibleSections.map((section) => (
          <Link
            key={section.key}
            to={section.path}
            className="btn"
            style={{
              background: activeKey === section.key ? '#eff6ff' : '#f3f4f6',
              color: activeKey === section.key ? '#1d4ed8' : '#374151',
              border: '1px solid',
              borderColor: activeKey === section.key ? '#bfdbfe' : '#e5e7eb',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
