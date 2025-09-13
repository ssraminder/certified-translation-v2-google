import React, { useState, useCallback } from 'react';
import { ApiName, ApiState, ApiStatus, API_NAMES } from './types';
import * as apiService from './services/apiService';
import Spinner from './components/Spinner';
import CheckIcon from './components/icons/CheckIcon';
import XIcon from './components/icons/XIcon';

const initialApiState: ApiState = {
  status: ApiStatus.IDLE,
  response: null,
};

const App: React.FC = () => {
  const [apiStates, setApiStates] = useState<Record<ApiName, ApiState>>(
    Object.fromEntries(API_NAMES.map(name => [name, initialApiState])) as Record<ApiName, ApiState>
  );

  const handleTestApi = useCallback(async (apiName: ApiName) => {
    setApiStates(prev => ({
      ...prev,
      [apiName]: { status: ApiStatus.LOADING, response: null },
    }));

    let apiPromise;
    switch (apiName) {
      case 'Supabase':
        apiPromise = apiService.testSupabase();
        break;
      case 'Gemini':
        apiPromise = apiService.testGemini();
        break;
      case 'Google Cloud Vision':
        apiPromise = apiService.testGoogleCloudVision();
        break;
      case 'Stripe':
        apiPromise = apiService.testStripe();
        break;
      case 'Brevo':
        apiPromise = apiService.testBrevo();
        break;
      default:
        return;
    }
    
    const result = await apiPromise;

    setApiStates(prev => ({
      ...prev,
      [apiName]: {
        status: result.success ? ApiStatus.SUCCESS : ApiStatus.ERROR,
        response: JSON.stringify(result.success ? result.data : { error: result.error }, null, 2),
      },
    }));
  }, []);

  const getStatusIcon = (status: ApiStatus) => {
    switch (status) {
      case ApiStatus.LOADING:
        return <Spinner />;
      case ApiStatus.SUCCESS:
        return <CheckIcon />;
      case ApiStatus.ERROR:
        return <XIcon />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-2">API Integration Test</h1>
            <p className="text-gray-400 mb-6">
              Click a button to test the integration with the corresponding API. Each test sends a request to a backend function to verify the connection and API key setup.
            </p>
          </div>
          <div className="space-y-2 p-6 bg-gray-800 border-t border-gray-700">
            {API_NAMES.map(apiName => {
              const state = apiStates[apiName];
              return (
                <div key={apiName} className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-lg text-white">{apiName}</span>
                    <div className="flex items-center space-x-4">
                      <div className="w-6 h-6 flex items-center justify-center">
                         {getStatusIcon(state.status)}
                      </div>
                      <button
                        onClick={() => handleTestApi(apiName)}
                        disabled={state.status === ApiStatus.LOADING}
                        className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                      >
                        {state.status === ApiStatus.LOADING ? 'Testing...' : `Test ${apiName}`}
                      </button>
                    </div>
                  </div>
                  {state.response && (
                     <pre className={`mt-4 p-4 rounded-md text-sm whitespace-pre-wrap overflow-x-auto ${state.status === ApiStatus.SUCCESS ? 'bg-green-900/20 text-green-200' : 'bg-red-900/20 text-red-200'}`}>
                       <code>{state.response}</code>
                     </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
