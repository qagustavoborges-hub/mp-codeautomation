<template>
  <div class="code-list">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Carregando códigos...</p>
    </div>
    
    <div v-else-if="codes.length === 0" class="empty-state">
      <p>Nenhum código encontrado</p>
    </div>
    
    <div v-else class="codes-grid">
      <CodeCard 
        v-for="code in codes" 
        :key="code.id" 
        :code="code"
        @copied="handleCopied"
        @deactivated="handleDeactivated"
      />
    </div>
  </div>
</template>

<script>
import CodeCard from './CodeCard.vue';

export default {
  name: 'CodeList',
  components: {
    CodeCard
  },
  props: {
    codes: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    handleCopied(code) {
      this.$emit('copied', code);
    },
    handleDeactivated(codeId) {
      this.$emit('deactivated', codeId);
    }
  }
};
</script>

<style scoped>
.code-list {
  width: 100%;
}

.codes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.empty-state p {
  font-size: 14px;
  font-weight: 400;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 20px;
}

.loading p {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 400;
}

@media (max-width: 768px) {
  .codes-grid {
    grid-template-columns: 1fr;
  }
}
</style>

