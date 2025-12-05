<template>
  <div id="app">
    <router-view />
    <Toast v-if="toast.show" :message="toast.message" :type="toast.type" @close="hideToast" />
  </div>
</template>

<script>
import { mapState } from 'vuex';
import Toast from './components/Toast.vue';

export default {
  name: 'App',
  components: {
    Toast
  },
  data() {
    return {
      toast: {
        show: false,
        message: '',
        type: 'success'
      }
    };
  },
  computed: {
    ...mapState(['error'])
  },
  watch: {
    error(newError) {
      if (newError) {
        this.showToast(newError, 'error');
      }
    }
  },
  methods: {
    showToast(message, type = 'success') {
      this.toast = {
        show: true,
        message,
        type
      };
      setTimeout(() => {
        this.hideToast();
      }, 3000);
    },
    hideToast() {
      this.toast.show = false;
    }
  },
  mounted() {
    // Conectar WebSocket quando app carregar
    const ws = require('./services/websocket').default;
    ws.connect();
    
    // Restaurar usuário do localStorage
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.$store.commit('SET_USER', JSON.parse(savedUser));
    }
    
    // Expor método showToast globalmente
    this.$root.showToast = this.showToast;
  }
};
</script>

<style>
#app {
  min-height: 100vh;
}
</style>

