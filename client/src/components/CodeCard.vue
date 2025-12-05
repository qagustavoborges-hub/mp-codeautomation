<template>
  <div class="code-card" :class="{ inactive: !code.is_active, expired: isExpired }">
    <div class="code-header">
      <span class="airline-badge">{{ code.airline || 'UNKNOWN' }}</span>
      <div class="code-header-right">
        <span v-if="isExpired" class="expired-badge">EXPIRADO</span>
        <span class="code-value">{{ code.code }}</span>
      </div>
    </div>
    <div class="code-info">
      <p v-if="code.customer_name" class="code-name">{{ code.customer_name }}</p>
      <p class="code-subject">{{ code.email_subject || 'Sem assunto' }}</p>
      <p class="code-from">De: {{ code.email_from }}</p>
      <p v-if="code.email_to" class="code-to">Para: {{ code.email_to }}</p>
      <p class="code-date">{{ formatDate(code.email_date) }}</p>
    </div>
    <div class="code-actions">
      <button class="btn btn-small" @click="copyCode" title="Copiar código">
        Copiar
      </button>
      <button 
        v-if="code.is_active" 
        class="btn btn-small btn-danger" 
        @click="deactivate"
        title="Desativar código"
      >
        Desativar
      </button>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex';

export default {
  name: 'CodeCard',
  props: {
    code: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      currentTime: Date.now(),
      updateInterval: null
    };
  },
  computed: {
    isExpired() {
      if (!this.code.email_date) {
        return false;
      }
      
      const emailDate = new Date(this.code.email_date).getTime();
      const expirationTime = emailDate + (5 * 60 * 1000); // 5 minutos em milissegundos
      
      return this.currentTime > expirationTime;
    }
  },
  mounted() {
    // Atualizar o tempo atual a cada segundo para verificar expiração em tempo real
    this.updateInterval = setInterval(() => {
      this.currentTime = Date.now();
    }, 1000);
  },
  beforeUnmount() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  },
  methods: {
    ...mapActions(['deactivateCode']),
    async copyCode() {
      try {
        await navigator.clipboard.writeText(this.code.code);
        this.$emit('copied', this.code.code);
      } catch (error) {
        console.error('Erro ao copiar:', error);
        // Fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = this.code.code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        this.$emit('copied', this.code.code);
      }
    },
    async deactivate() {
      if (confirm('Deseja desativar este código?')) {
        try {
          await this.deactivateCode(this.code.id);
          this.$emit('deactivated', this.code.id);
        } catch (error) {
          console.error('Erro ao desativar código:', error);
        }
      }
    },
    formatDate(dateString) {
      if (!dateString) return 'Data não disponível';
      const date = new Date(dateString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
};
</script>

<style scoped>
.code-card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow);
  transition: all 0.3s ease;
  border-left: 4px solid var(--primary-color);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

.code-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.code-card.inactive {
  opacity: 0.6;
  border-left-color: var(--text-secondary);
}

.code-card.expired {
  border-left-color: var(--danger-color);
  background: linear-gradient(to right, rgba(234, 67, 53, 0.05) 0%, var(--card-bg) 4px);
}

.code-card.expired .code-value {
  color: var(--danger-color);
  text-decoration: line-through;
  opacity: 0.7;
}

.expired-badge {
  background: var(--danger-color);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  gap: 10px;
}

.code-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.airline-badge {
  background: var(--primary-color);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-value {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: 'Roboto Mono', 'Courier New', monospace;
  letter-spacing: 1.5px;
}

.code-info {
  margin-bottom: 15px;
}

.code-name {
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 8px;
  font-size: 15px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-subject {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
  font-size: 14px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.code-from {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 4px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.code-to {
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.code-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.code-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 8px 16px;
  font-size: 13px;
  flex: 1;
  font-weight: 500;
}
</style>

