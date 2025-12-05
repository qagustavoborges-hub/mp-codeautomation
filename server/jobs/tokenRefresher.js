const cron = require('node-cron');
const { getDatabase } = require('../database/init');
const { refreshTokenProactively } = require('../config/gmail');

// Renovar tokens automaticamente a cada hora para manter conexão sempre ativa
const JOB_SCHEDULE = '0 * * * *'; // A cada hora

function startTokenRefresher() {
  console.log('Iniciando renovador automático de tokens...');
  console.log('Agendado para executar a cada hora para manter conexão sempre ativa');

  cron.schedule(JOB_SCHEDULE, async () => {
    try {
      const db = getDatabase();
      
      // Buscar todos os tokens que precisam ser renovados (próximos de expirar)
      db.all(
        `SELECT id, user_id, expiry_date 
         FROM gmail_tokens 
         WHERE refresh_token IS NOT NULL 
         AND (expiry_date IS NULL OR expiry_date > ?)`,
        [Date.now() - (30 * 60 * 1000)], // Tokens que expiram nos próximos 30 minutos ou já expiraram
        async (err, tokens) => {
          if (err) {
            console.error('Erro ao buscar tokens para renovação:', err);
            return;
          }

          if (tokens.length === 0) {
            console.log('Nenhum token precisa ser renovado no momento');
            return;
          }

          console.log(`Verificando e renovando ${tokens.length} token(s) para manter conexão ativa...`);

          for (const token of tokens) {
            try {
              // Verificar se precisa renovar (30 minutos antes de expirar)
              const expiryBuffer = 30 * 60 * 1000; // 30 minutos
              if (!token.expiry_date || Date.now() >= (token.expiry_date - expiryBuffer)) {
                await refreshTokenProactively(token.id);
              }
            } catch (error) {
              console.error(`Erro ao renovar token ${token.id} do usuário ${token.user_id}:`, error.message);
            }
          }

          console.log('Renovação automática de tokens concluída');
        }
      );
    } catch (error) {
      console.error('Erro no renovador automático de tokens:', error);
    }
  });
}

module.exports = {
  startTokenRefresher
};

