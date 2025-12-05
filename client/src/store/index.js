import { createStore } from 'vuex';
import api from '../services/api';

export default createStore({
  state: {
    user: null,
    token: localStorage.getItem('token') || null,
    codes: [],
    stats: { byAirline: [], total: 0 }, // Inicializar com objeto vazio ao invés de null
    gmailStatus: null,
    loading: false,
    error: null
  },
  mutations: {
    SET_USER(state, user) {
      state.user = user;
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
      }
    },
    SET_TOKEN(state, token) {
      state.token = token;
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    },
    SET_CODES(state, codes) {
      state.codes = codes;
    },
    ADD_CODE(state, code) {
      // Verificar se o código já existe
      const exists = state.codes.find(c => c.id === code.id);
      if (!exists) {
        state.codes.unshift(code);
      }
    },
    UPDATE_CODE(state, code) {
      const index = state.codes.findIndex(c => c.id === code.id);
      if (index !== -1) {
        state.codes[index] = code;
      }
    },
    SET_STATS(state, stats) {
      state.stats = stats;
    },
    SET_GMAIL_STATUS(state, status) {
      state.gmailStatus = status;
    },
    SET_LOADING(state, loading) {
      state.loading = loading;
    },
    SET_ERROR(state, error) {
      state.error = error;
    },
    LOGOUT(state) {
      state.user = null;
      state.token = null;
      state.codes = [];
      state.stats = { byAirline: [], total: 0 };
      state.gmailStatus = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },
  actions: {
    async login({ commit }, { username, password }) {
      try {
        commit('SET_LOADING', true);
        commit('SET_ERROR', null);
        
        const response = await api.post('/auth/login', { username, password });
        const { token, user } = response.data;
        
        commit('SET_TOKEN', token);
        commit('SET_USER', user);
        
        return { success: true };
      } catch (error) {
        const message = error.response?.data?.error || 'Erro ao fazer login';
        commit('SET_ERROR', message);
        return { success: false, error: message };
      } finally {
        commit('SET_LOADING', false);
      }
    },
    // Registro removido - usuários só podem ser criados diretamente no banco de dados
    async logout({ commit }) {
      commit('LOGOUT');
    },
    async fetchCodes({ commit }, { limit = 50, offset = 0, airline = null } = {}) {
      try {
        commit('SET_LOADING', true);
        const params = { limit, offset };
        if (airline) params.airline = airline;
        
        const response = await api.get('/codes', { params });
        commit('SET_CODES', response.data.codes || []);
        return response.data;
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Erro ao buscar códigos');
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async fetchStats({ commit, state }) {
      try {
        // Evitar múltiplas chamadas simultâneas
        if (state.loading) {
          return state.stats;
        }
        
        const response = await api.get('/codes/stats/summary');
        // Garantir que sempre temos um objeto válido
        const stats = response.data || { byAirline: [], total: 0 };
        commit('SET_STATS', stats);
        return stats;
      } catch (error) {
        // Não mostrar erro para 429 (rate limiting) - é esperado em alguns casos
        if (error.response?.status !== 429) {
          console.error('Erro ao buscar estatísticas:', error);
          // Definir estatísticas vazias em caso de erro
          commit('SET_STATS', { byAirline: [], total: 0 });
        }
        // Retornar objeto vazio em caso de erro para não quebrar a UI
        return { byAirline: [], total: 0 };
      }
    },
    async clearAllCodes({ commit }) {
      try {
        commit('SET_LOADING', true);
        const response = await api.delete('/codes/clear');
        commit('SET_CODES', []); // Limpar códigos do store
        commit('SET_STATS', { byAirline: [], total: 0 }); // Limpar estatísticas
        return response.data;
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Erro ao limpar códigos');
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async fetchGmailStatus({ commit }) {
      try {
        const response = await api.get('/gmail/status');
        commit('SET_GMAIL_STATUS', response.data);
        return response.data;
      } catch (error) {
        commit('SET_GMAIL_STATUS', { connected: false });
        throw error;
      }
    },
    async disconnectGmail({ commit }) {
      try {
        const response = await api.delete('/gmail/disconnect');
        commit('SET_GMAIL_STATUS', { connected: false });
        return response.data;
      } catch (error) {
        commit('SET_GMAIL_STATUS', { connected: false });
        throw error;
      }
    },
    async disconnectAllGmail({ commit }) {
      try {
        const response = await api.delete('/gmail/disconnect-all');
        commit('SET_GMAIL_STATUS', { connected: false });
        return response.data;
      } catch (error) {
        commit('SET_GMAIL_STATUS', { connected: false });
        throw error;
      }
    },
    async processEmails({ commit }, onlyNew = false) {
      try {
        commit('SET_LOADING', true);
        const response = await api.post('/gmail/process', { onlyNew });
        return response.data;
      } catch (error) {
        const message = error.response?.data?.error || 'Erro ao processar emails';
        commit('SET_ERROR', message);
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async deactivateCode({ commit }, codeId) {
      try {
        await api.patch(`/codes/${codeId}/deactivate`);
        const code = this.state.codes.find(c => c.id === codeId);
        if (code) {
          commit('UPDATE_CODE', { ...code, is_active: 0 });
        }
        return { success: true };
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Erro ao desativar código');
        throw error;
      }
    }
  },
  getters: {
    isAuthenticated: (state) => !!state.token,
    user: (state) => state.user,
    codes: (state) => state.codes,
    activeCodes: (state) => state.codes.filter(c => c.is_active === 1),
    stats: (state) => state.stats,
    gmailStatus: (state) => state.gmailStatus,
    loading: (state) => state.loading,
    error: (state) => state.error
  }
});

