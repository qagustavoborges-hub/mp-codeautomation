<template>
  <div class="login-container">
    <div class="login-card">
      <h1>Sistema Gmail Verificação</h1>
      <p class="subtitle">Monitore códigos de verificação de companhias aéreas</p>

      <div class="form-container">
        <h2>Login</h2>
        <form @submit.prevent="handleLogin">
          <div class="input-group">
            <label>Username</label>
            <input v-model="loginForm.username" type="text" required />
          </div>
          <div class="input-group">
            <label>Senha</label>
            <input v-model="loginForm.password" type="password" required />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
        <p class="info-text">
          Contate o administrador para criar uma conta.
        </p>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex';

export default {
  name: 'Login',
  data() {
    return {
      loginForm: {
        username: '',
        password: ''
      }
    };
  },
  computed: {
    ...mapState(['loading', 'error'])
  },
  methods: {
    ...mapActions(['login']),
    async handleLogin() {
      const result = await this.login(this.loginForm);
      if (result.success) {
        this.$router.push('/dashboard');
      }
    }
  }
};
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
  padding: 20px;
}

.login-card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 48px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 2px 6px 0 rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15);
  border: 1px solid var(--border-light);
}

.login-card h1 {
  text-align: center;
  color: var(--text-primary);
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 400;
  letter-spacing: 0;
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 32px;
  font-size: 14px;
  font-weight: 400;
}

.form-container h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0;
}

.switch-form {
  text-align: center;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

.switch-form a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 500;
}

.info-text {
  text-align: center;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  font-style: italic;
}

.btn {
  width: 100%;
  justify-content: center;
}
</style>

