const API_BASE_URL = '/api';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Helper to get auth headers
  getAuthHeaders(includeContentType = true) {
    const token = localStorage.getItem('via_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  // Health check (hits root /health, not /api/health)
  async healthCheck() {
    try {
      const response = await fetch('/health');
      return await response.text();
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  // Register a new user
  async register(username, password, adminSecret) {
    try {
      const response = await fetch(`${this.baseURL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({ username, password }),
      });

      const rawText = await response.text();

      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned invalid response (${response.status}): ${rawText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Registration failed');
      }

      return data;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  // Login user
  async login(username, password) {
    try {
      const response = await fetch(`${this.baseURL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Support both username/password depending on backend expectation (it's username)
        body: JSON.stringify({ username, password }),
      });

      const rawText = await response.text();

      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned invalid response (${response.status}): ${rawText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Login failed');
      }

      return data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  // Upload CSV file (Sources)
  async uploadCSV(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // don't include Content-Type, let browser set it with boundary
      const headers = this.getAuthHeaders(false);

      const response = await fetch(`${this.baseURL}/sources`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  // Get all sources
  async getSources() {
    try {
      const response = await fetch(`${this.baseURL}/sources`, {
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Failed to get sources');
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get sources:', error);
      throw error;
    }
  }

  // Delete a source
  async deleteSource(id) {
    try {
      const response = await fetch(`${this.baseURL}/sources/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Failed to delete source');
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to delete source:', error);
      throw error;
    }
  }

  // Submit metadata context for an uploaded source (P2-3)
  async submitContext(id, formData) {
    try {
      const response = await fetch(`${this.baseURL}/sources/${id}/context`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          projectName:    formData.projectName    || null,
          description:    formData.description    || null,
          dataDomain:     formData.dataDomain      || null,
          coverageStart:  formData.coverageStart   || null,
          coverageEnd:    formData.coverageEnd     || null,
          ongoing:        Boolean(formData.ongoing),
          agencyResponse: formData.agencyResponse  || null,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save submission context');
      }
      return await response.json();
    } catch (error) {
      console.error('Context submission failed:', error);
      throw error;
    }
  }

  // Get Stats
  async getStats() {
    try {
      const response = await fetch(`${this.baseURL}/stats`, {
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Failed to get stats');
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get stats:', error);
      throw error;
    }
  }
}

export default new ApiService();