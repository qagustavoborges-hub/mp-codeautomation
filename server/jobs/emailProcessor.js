const cron = require('node-cron');
const { getDatabase } = require('../database/init');
const { processEmails } = require('../services/emailService');

// Processar emails automaticamente a cada 15 minutos
const JOB_SCHEDULE = '*/15 * * * *'; // A cada 15 minutos

function startEmailProcessor() {
  console.log('Iniciando processador automático de emails...');
  console.log('Agendado para executar a cada 15 minutos');

  cron.schedule(JOB_SCHEDULE, async () => {
    try {
      const db = getDatabase();
      
      // Buscar token do email centralizador (milhasplusred@gmail.com)
      // Processar apenas uma vez, pois todos os usuários compartilham o mesmo email
      db.get(
        `SELECT DISTINCT user_id 
         FROM gmail_tokens 
         WHERE expiry_date > ? OR expiry_date IS NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
        [Date.now()],
        async (err, user) => {
          if (err) {
            console.error('Erro ao buscar usuário para processamento:', err);
            return;
          }

          if (!user) {
            console.log('Nenhum token Gmail encontrado. Pulando processamento automático.');
            return;
          }

          console.log(`Processando emails do email centralizador (milhasplusred@gmail.com) para usuário ${user.user_id}...`);

          try {
            await processEmails(user.user_id, true); // onlyNew = true para processar apenas novos emails
          } catch (error) {
            console.error(`Erro ao processar emails:`, error.message);
          }

          console.log('Processamento automático concluído');
        }
      );
    } catch (error) {
      console.error('Erro no processador automático:', error);
    }
  });
}

module.exports = {
  startEmailProcessor
};

