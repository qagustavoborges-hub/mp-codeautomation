<template>
  <div class="stats-panel">
    <h3>Estatísticas</h3>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>
    
    <div v-else class="stats-content">
      <div class="stat-item">
        <span class="stat-label">Total de Códigos</span>
        <span class="stat-value">{{ totalCount }}</span>
      </div>
      
      <div class="airline-stats">
        <h4>Filtrar por Companhia</h4>
        <div class="airline-list">
          <!-- Botão para limpar filtro -->
          <div 
            class="airline-item airline-item-all"
            @click="$emit('filter', '')"
          >
            <span class="airline-name">Todas as companhias</span>
            <span class="airline-count">{{ totalCount }}</span>
          </div>
          <!-- Filtros fixos sempre visíveis - apenas LATAM e SMILES -->
          <div 
            class="airline-item"
            @click="$emit('filter', 'LATAM')"
          >
            <span class="airline-name">LATAM</span>
            <span class="airline-count">{{ getAirlineCount('LATAM') }}</span>
          </div>
          <div 
            class="airline-item"
            @click="$emit('filter', 'SMILES')"
          >
            <span class="airline-name">SMILES</span>
            <span class="airline-count">{{ getAirlineCount('SMILES') }}</span>
          </div>
          <!-- Outras companhias dinâmicas -->
          <div 
            v-for="item in otherAirlines" 
            :key="item.airline"
            class="airline-item"
            @click="$emit('filter', item.airline)"
          >
            <span class="airline-name">{{ item.airline || 'UNKNOWN' }}</span>
            <span class="airline-count">{{ item.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'StatsPanel',
  props: {
    stats: {
      type: Object,
      default: null
    },
    loading: {
      type: Boolean,
      default: false
    },
    codes: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    totalCount() {
      // Usar códigos ativos se disponíveis, senão usar stats
      if (this.activeCodes && this.activeCodes.length > 0) {
        return this.activeCodes.length;
      }
      return (this.stats && this.stats.total) ? this.stats.total : 0;
    },
    otherAirlines() {
      if (!this.stats || !this.stats.byAirline) {
        return [];
      }
      // Filtrar companhias que não são as principais (já mostradas fixas)
      const mainAirlines = ['LATAM', 'SMILES'];
      return this.stats.byAirline.filter(item => 
        !mainAirlines.includes(item.airline)
      );
    },
    activeCodes() {
      // Usar códigos passados como prop ou buscar do store
      if (this.codes && this.codes.length > 0) {
        return this.codes.filter(code => !code.deactivated_at);
      }
      return [];
    }
  },
  methods: {
    getAirlineCount(airlineName) {
      // Contar diretamente dos códigos ativos para garantir precisão
      if (!this.activeCodes || this.activeCodes.length === 0) {
        return 0;
      }
      return this.activeCodes.filter(code => 
        code.airline === airlineName
      ).length;
    }
  }
};
</script>

<style scoped>
.stats-panel {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 24px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
}

.stats-panel h3 {
  margin-bottom: 20px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0;
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-color);
  border-radius: 4px;
  border: 1px solid var(--border-light);
}

.stat-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 400;
}

.stat-value {
  font-size: 22px;
  font-weight: 500;
  color: var(--primary-color);
}

.airline-stats h4 {
  margin-bottom: 12px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.airline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.airline-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 4px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
}

.airline-item:hover {
  background: var(--primary-light);
  border-color: var(--primary-color);
  transform: translateX(2px);
}

.airline-item-all {
  font-weight: 500;
  border: 2px solid var(--primary-color);
}

.airline-name {
  font-weight: 400;
  color: var(--text-primary);
  font-size: 14px;
}

.airline-count {
  background: var(--primary-color);
  color: white;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  min-width: 24px;
  text-align: center;
}
</style>

