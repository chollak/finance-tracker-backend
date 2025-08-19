import React, { useState } from 'react';
import { config } from '../config/env';

export const DevMode: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!config.isDevelopment) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      zIndex: 9999,
      backgroundColor: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: '0 0 0 8px',
      padding: '8px',
      fontSize: '12px',
      fontFamily: 'monospace'
    }}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '10px'
        }}
      >
        🛠️ DEV {isExpanded ? '▼' : '▶'}
      </button>
      
      {isExpanded && (
        <div style={{ marginTop: '8px', minWidth: '200px' }}>
          <div><strong>Development Mode</strong></div>
          <div>User ID: {config.getUserId()}</div>
          <div>API Base: {config.apiBase}</div>
          <div>Theme: {config.getTheme()}</div>
          <div>Telegram WebApp: {config.isTelegramWebApp ? 'Yes' : 'No'}</div>
          
          <div style={{ marginTop: '8px', padding: '4px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
            <div><strong>Test URLs:</strong></div>
            <div>
              <a href={`/transactions?userId=${config.getUserId()}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px' }}>
                Transactions
              </a>
            </div>
            <div>
              <a href={`/budgets?userId=${config.getUserId()}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px' }}>
                Budgets
              </a>
            </div>
            <div>
              <a href={`/dashboard?userId=${config.getUserId()}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px' }}>
                Dashboard
              </a>
            </div>
          </div>
          
          <button 
            onClick={() => {
              config.log.info('Development environment info', {
                userId: config.getUserId(),
                apiBase: config.apiBase,
                isTelegramWebApp: config.isTelegramWebApp
              });
            }}
            style={{
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '10px',
              marginTop: '4px'
            }}
          >
            Log Debug Info
          </button>
        </div>
      )}
    </div>
  );
};