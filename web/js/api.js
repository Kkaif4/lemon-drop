const API_BASE = 'http://localhost:3000'; // Change in production

function getAuthToken() {
  return localStorage.getItem('token');
}

async function apiCall(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API Error');
  }
  return data;
}

const api = {
  login: (email, password) => apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  initUpload: (payload) => apiCall('/uploads/init', { method: 'POST', body: JSON.stringify(payload) }),
  getParts: (fileId) => apiCall(`/uploads/${fileId}/parts`),
  signParts: (fileId, parts) => apiCall(`/uploads/${fileId}/sign`, { method: 'POST', body: JSON.stringify({ parts }) }),
  completeUpload: (fileId, parts) => apiCall(`/uploads/${fileId}/complete`, { method: 'POST', body: JSON.stringify({ parts }) }),
};
