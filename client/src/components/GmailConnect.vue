<template>
  <div class="gmail-connect card">
    <h3>Conexão Gmail</h3>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>
    
    <div v-else-if="status && status.connected" class="connected-state">
      <div class="status-indicator success">
        <span class="status-icon">●</span> Conectado
      </div>
      <p v-if="status.expiresAt" class="status-info">
        Expira em: {{ formatDate(status.expiresAt) }}
      </p>
      <div class="actions">
        <button 
          v-if="!hasCodes && isAdmin" 
          class="btn btn-primary" 
          @click="handleProcessEmails" 
          :disabled="processing"
        >
          {{ processing ? 'Processando...' : 'Processar Smiles & LATAM' }}
        </button>
        <button v-if="isAdmin" class="btn btn-secondary" @click="disconnect">
          Desconectar
        </button>
      </div>
    </div>
    
    <div v-else class="disconnected-state">
      <div class="status-indicator error">
        <span class="status-icon">●</span> Não Conectado
      </div>
      <p class="status-info">
        <span v-if="isAdmin">Conecte sua conta Gmail para começar a monitorar emails de spam</span>
        <span v-else>Aguardando conexão Gmail pelo administrador</span>
      </p>
      <button v-if="isAdmin" class="btn btn-primary" @click="connectGmail">
        Conectar Gmail
      </button>
    </div>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex';
import api from '../services/api';

export default {
  name: 'GmailConnect',
  data() {
    return {
      processing: false
    };
  },
  computed: {
    ...mapState(['gmailStatus', 'loading', 'codes', 'user']),
    hasCodes() {
      return this.codes && this.codes.length > 0;
    },
    isAdmin() {
      return this.user && this.user.role === 'admin';
    }
  },
  props: {
    status: {
      type: Object,
      default: null
    }
  },
  methods: {
    ...mapActions(['fetchGmailStatus']),
    async connectGmail() {
      try {
        const response = await api.get('/gmail/oauth/url');
        window.location.href = response.data.authUrl;
      } catch (error) {
        console.error('Erro ao obter URL de autenticação:', error);
        alert('Erro ao conectar Gmail. Tente novamente.');
      }
    },
    async handleProcessEmails() {
      this.processing = true;
      try {
        // Processar TODOS os emails (onlyNew: false), igual ao "Limpar e Reprocessar"
        const response = await api.post('/gmail/process', { onlyNew: false });
        const result = response.data;
        this.$emit('processed', result);
        
        // Atualizar códigos após processamento
        await this.$store.dispatch('fetchCodes');
        await this.$store.dispatch('fetchStats');
        
        if (this.$root.showToast) {
          this.$root.showToast(`Processados ${result.result?.saved || 0} códigos com sucesso!`, 'success');
        } else {
          alert(`Processados ${result.result?.saved || 0} códigos com sucesso!`);
        }
      } catch (error) {
        console.error('Erro ao processar emails:', error);
        const message = error.response?.data?.error || 'Erro ao processar emails. Verifique sua conexão Gmail.';
        if (this.$root.showToast) {
          this.$root.showToast(message, 'error');
        } else {
          alert(message);
        }
      } finally {
        this.processing = false;
      }
    },
    async disconnect() {
      if (confirm('Deseja desconectar todas as contas Gmail? Isso permitirá conectar novamente com milhasplusred@gmail.com.')) {
        try {
          await api.delete('/gmail/disconnect-all');
          if (this.$root.showToast) {
            this.$root.showToast('Conta desconectada com sucesso. Conecte novamente com milhasplusred@gmail.com', 'success');
          } else {
            alert('Conta desconectada com sucesso. Conecte novamente com milhasplusred@gmail.com');
          }
          await this.fetchGmailStatus();
        } catch (error) {
          console.error('Erro ao desconectar:', error);
          const message = error.response?.data?.error || 'Erro ao desconectar conta Gmail';
          if (this.$root.showToast) {
            this.$root.showToast(message, 'error');
          } else {
            alert(message);
          }
        }
      }
    },
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString('pt-BR');
    }
  },
  mounted() {
    this.fetchGmailStatus();
  }
};
</script>

<style scoped>
.gmail-connect h3 {
  margin-bottom: 20px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 15px;
}

.status-icon {
  font-size: 8px;
  line-height: 1;
}

.status-indicator.success {
  background: #e8f5e9;
  color: var(--secondary-color);
}

.status-indicator.success .status-icon {
  color: var(--secondary-color);
}

.status-indicator.error {
  background: #fce8e6;
  color: var(--danger-color);
}

.status-indicator.error .status-icon {
  color: var(--danger-color);
}

.status-info {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.actions .btn {
  flex: 1;
  min-width: 150px;
}

.connected-state,
.disconnected-state {
  display: flex;
  flex-direction: column;
}
</style>

