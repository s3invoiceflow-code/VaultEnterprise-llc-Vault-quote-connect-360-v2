import React from 'react';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          {/* Logo */}
          <div className="inline-flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-lg bg-white flex items-center justify-center shadow-lg border border-slate-200">
              <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
                <path d="M 50 20 A 30 30 0 0 1 80 50" stroke="#3b82f6" strokeWidth="10" strokeLinecap="round" fill="none" />
                <path d="M 80 50 A 30 30 0 0 1 50 80" stroke="#10b981" strokeWidth="10" strokeLinecap="round" fill="none" />
                <path d="M 50 80 A 30 30 0 0 1 20 50" stroke="#8b5cf6" strokeWidth="10" strokeLinecap="round" fill="none" />
                <path d="M 20 50 A 30 30 0 0 1 50 20" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" fill="none" />
                <rect x="38" y="35" width="24" height="30" rx="2" stroke="#1e3a5f" strokeWidth="3" fill="white" />
                <line x1="43" y1="45" x2="57" y2="45" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" />
                <line x1="43" y1="53" x2="57" y2="53" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" />
                <circle cx="62" cy="65" r="10" stroke="#10b981" strokeWidth="3" fill="white" />
                <path d="M 58 65 L 61 68 L 66 62" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Connect Quote 360</h1>
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Access Restricted</h2>
          <p className="text-slate-600 mb-8">
            You are not registered to use this application. Please contact the app administrator to request access.
          </p>
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600">
            <p>If you believe this is an error, you can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Verify you are logged in with the correct account</li>
              <li>Contact the app administrator for access</li>
              <li>Try logging out and back in again</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;