<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-content">
        <h1>Códigos de Verificação</h1>
        <div class="header-actions">
          <span class="user-info">{{ user?.username }}</span>
          <button class="btn btn-danger" @click="handleLogout">Sair</button>
        </div>
      </div>
    </header>

    <div class="dashboard-content container" style="width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: hidden;">
      <div class="dashboard-grid">
        <aside class="sidebar">
          <GmailConnect :status="gmailStatus" @processed="handleEmailsProcessed" />
          <StatsPanel 
            :stats="stats" 
            :loading="loading"
            :codes="activeCodes"
            @filter="handleFilter"
          />
        </aside>

        <main class="main-content">
          <div class="filters-bar">
            <div class="search-box">
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Buscar códigos..."
                @input="handleSearch"
              />
            </div>
            <div class="filter-group">
              <select v-model="selectedAirline" @change="handleFilterChange">
                <option value="">Todas as companhias</option>
                <option 
                  v-for="airline in availableAirlines" 
                  :key="airline"
                  :value="airline"
                >
                  {{ airline }}
                </option>
              </select>
              <select v-model="selectedEmailTo" @change="handleFilterChange">
                <option value="">Todos os destinatários</option>
                <option 
                  v-for="email in availableEmailsTo" 
                  :key="email"
                  :value="email"
                >
                  {{ email }}
                </option>
              </select>
              <button v-if="isAdmin" class="btn btn-danger" @click="handleClearAndReprocess" :disabled="clearing">
                {{ clearing ? 'Limpando...' : 'Limpar e Reprocessar' }}
              </button>
            </div>
          </div>

          <CodeList 
            :codes="filteredCodes" 
            :loading="loading"
            @copied="handleCodeCopied"
            @deactivated="handleCodeDeactivated"
          />
        </main>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex';
import CodeList from '../components/CodeList.vue';
import StatsPanel from '../components/StatsPanel.vue';
import GmailConnect from '../components/GmailConnect.vue';
import websocket from '../services/websocket';

export default {
  name: 'Dashboard',
  components: {
    CodeList,
    StatsPanel,
    GmailConnect
  },
  data() {
    return {
      searchQuery: '',
      selectedAirline: '',
      selectedEmailTo: '',
      clearing: false
    };
  },
  computed: {
    ...mapState(['user', 'codes', 'stats', 'gmailStatus', 'loading']),
    ...mapGetters(['activeCodes']),
    filteredCodes() {
      let filtered = [...this.activeCodes];
      
      // Filtrar por companhia aérea
      if (this.selectedAirline) {
        filtered = filtered.filter(c => c.airline === this.selectedAirline);
      }
      
      // Filtrar por destinatário (Para)
      if (this.selectedEmailTo) {
        filtered = filtered.filter(c => 
          c.email_to && c.email_to.toLowerCase() === this.selectedEmailTo.toLowerCase()
        );
      }
      
      // Filtrar por busca
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(c => 
          c.code.toLowerCase().includes(query) ||
          (c.email_subject && c.email_subject.toLowerCase().includes(query)) ||
          (c.email_from && c.email_from.toLowerCase().includes(query)) ||
          (c.email_to && c.email_to.toLowerCase().includes(query)) ||
          (c.airline && c.airline.toLowerCase().includes(query))
        );
      }
      
      // Ordenar por data do email (mais recentes primeiro)
      filtered.sort((a, b) => {
        const dateA = a.email_date ? new Date(a.email_date).getTime() : 0;
        const dateB = b.email_date ? new Date(b.email_date).getTime() : 0;
        // Se não tiver data do email, usar data de extração
        if (dateA === 0 && dateB === 0) {
          const extractedA = a.extracted_at ? new Date(a.extracted_at).getTime() : 0;
          const extractedB = b.extracted_at ? new Date(b.extracted_at).getTime() : 0;
          return extractedB - extractedA; // Mais recente primeiro
        }
        return dateB - dateA; // Mais recente primeiro
      });
      
      return filtered;
    },
    availableAirlines() {
      const airlines = new Set();
      this.activeCodes.forEach(code => {
        if (code.airline) {
          airlines.add(code.airline);
        }
      });
      return Array.from(airlines).sort();
    },
    availableEmailsTo() {
      const emails = new Set();
      this.activeCodes.forEach(code => {
        if (code.email_to) {
          emails.add(code.email_to);
        }
      });
      return Array.from(emails).sort();
    },
    isAdmin() {
      return this.user && this.user.role === 'admin';
    }
  },
  methods: {
    ...mapActions(['logout', 'fetchCodes', 'fetchStats', 'fetchGmailStatus', 'clearAllCodes', 'processEmails']),
    handleLogout() {
      this.logout();
      websocket.disconnect();
      this.$router.push('/login');
    },
    handleSearch() {
      // Busca em tempo real já está implementada via computed
    },
    handleFilter(airline) {
      this.selectedAirline = airline;
    },
    handleFilterChange() {
      // Filtro já está aplicado via computed
    },
    handleCodeCopied(code) {
      // Mostrar toast via root
      if (this.$root.showToast) {
        this.$root.showToast(`Código ${code} copiado!`, 'success');
      }
    },
    handleCodeDeactivated(codeId) {
      // Atualizar stats após desativar código
      this.fetchStats().catch(() => {
        // Ignorar erros silenciosamente
      });
    },
    handleEmailsProcessed(result) {
      // WebSocket irá atualizar automaticamente quando novos códigos forem processados
      // Apenas atualizar stats se necessário
      setTimeout(() => {
        this.fetchStats().catch(() => {
          // Ignorar erros silenciosamente
        });
      }, 2000);
    },
    async handleClearAndReprocess() {
      if (!confirm('Tem certeza que deseja limpar todos os códigos e reprocessar os emails?')) {
        return;
      }
      
      try {
        this.clearing = true;
        
        // Limpar códigos
        await this.clearAllCodes();
        this.$root.showToast('Códigos limpos com sucesso', 'success');
        
        // Aguardar um pouco antes de reprocessar
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reprocessar emails
        await this.processEmails();
        this.$root.showToast('Emails sendo processados...', 'info');
        
        // WebSocket irá atualizar automaticamente quando novos códigos forem processados
        // Atualizar stats após um tempo
        setTimeout(() => {
          this.fetchStats().catch(() => {
            // Ignorar erros silenciosamente
          });
        }, 3000);
        
      } catch (error) {
        console.error('Erro ao limpar e reprocessar:', error);
        this.$root.showToast('Erro ao limpar códigos', 'error');
      } finally {
        this.clearing = false;
      }
    },
    setupWebSocket() {
      let statsUpdateTimeout = null;
      
      // Evento quando um novo código é adicionado
      websocket.on('new_code', (data) => {
        if (data.data) {
          this.$store.commit('ADD_CODE', data.data);
          // Debounce: atualizar stats após 1 segundo (evita múltiplas chamadas)
          if (statsUpdateTimeout) {
            clearTimeout(statsUpdateTimeout);
          }
          statsUpdateTimeout = setTimeout(() => {
            this.fetchStats().catch(() => {
              // Ignorar erros silenciosamente
            });
          }, 1000);
        }
      });

      // Evento quando um código é atualizado
      websocket.on('code_update', (data) => {
        if (data.data) {
          this.$store.commit('UPDATE_CODE', data.data);
          // Atualizar stats se o código foi desativado
          if (data.data.is_active === 0) {
            if (statsUpdateTimeout) {
              clearTimeout(statsUpdateTimeout);
            }
            statsUpdateTimeout = setTimeout(() => {
              this.fetchStats().catch(() => {
                // Ignorar erros silenciosamente
              });
            }, 500);
          }
        }
      });

      // Evento quando WebSocket conecta
      websocket.on('connected', () => {
        console.log('WebSocket conectado - atualização em tempo real ativa');
        // Sincronizar dados ao conectar
        this.fetchCodes().catch(() => {
          // Ignorar erros silenciosamente
        });
        this.fetchStats().catch(() => {
          // Ignorar erros silenciosamente
        });
      });
    }
  },
  async mounted() {
    // Carregar dados iniciais
    await Promise.all([
      this.fetchCodes(),
      this.fetchStats(),
      this.fetchGmailStatus()
    ]);

    // Configurar WebSocket
    this.setupWebSocket();

    // Verificar se veio do callback OAuth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('oauth') === 'success') {
      if (this.$root.showToast) {
        this.$root.showToast('Gmail conectado com sucesso!', 'success');
      }
      this.fetchGmailStatus();
      // Limpar URL
      window.history.replaceState({}, document.title, '/dashboard');
    } else if (urlParams.get('oauth') === 'error') {
      if (this.$root.showToast) {
        this.$root.showToast('Erro ao conectar Gmail', 'error');
      }
      window.history.replaceState({}, document.title, '/dashboard');
    }
  },
  beforeUnmount() {
    // WebSocket será desconectado automaticamente quando necessário
  }
};
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--bg-color);
}

.dashboard-header {
  background: var(--card-bg);
  box-shadow: var(--shadow-card);
  padding: 16px 0;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border-light);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dashboard-header h1 {
  font-size: 22px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-info {
  color: var(--text-secondary);
  font-size: 14px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 30px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

.filters-bar {
  background: var(--card-bg);
  padding: 16px 20px;
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
  display: flex !important;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 20px;
  width: 100%;
  visibility: visible !important;
  opacity: 1 !important;
}

.search-box {
  flex: 1;
  min-width: 200px;
  display: block !important;
  visibility: visible !important;
}

.search-box input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-box input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light);
}

.filter-group {
  display: flex !important;
  gap: 8px;
  align-items: center;
  visibility: visible !important;
}

.filter-group select {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.filter-group select:focus {
  outline: none;
  border-color: var(--primary-color);
}

@media (max-width: 968px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    order: 2;
  }
  
  .main-content {
    order: 1;
  }
}
</style>

