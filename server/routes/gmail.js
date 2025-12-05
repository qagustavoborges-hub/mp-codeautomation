const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getAuthUrl, getTokensFromCode, saveTokens } = require('../config/gmail');
const { processEmails } = require('../services/emailService');

const router = express.Router();

// Callback OAuth não requer autenticação JWT (vem do Google)
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Código de autorização não fornecido' });
    }

    if (!state) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      return res.redirect(`${clientUrl}/dashboard?oauth=error&message=Estado não fornecido`);
    }

    const userId = parseInt(state);
    if (!userId || isNaN(userId)) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      return res.redirect(`${clientUrl}/dashboard?oauth=error&message=ID de usuário inválido`);
    }

    const tokens = await getTokensFromCode(code);
    await saveTokens(userId, tokens);

    // Redirecionar para o frontend com sucesso
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientUrl}/dashboard?oauth=success`);
  } catch (error) {
    console.error('Erro no callback OAuth:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientUrl}/dashboard?oauth=error&message=${encodeURIComponent(error.message)}`);
  }
});

// Todas as outras rotas requerem autenticação
router.use(verifyToken);

// Obter URL de autenticação OAuth (apenas admin)
router.get('/oauth/url', requireRole('admin'), (req, res) => {
  try {
    const { getAuthUrl } = require('../config/gmail');
    // Incluir userId no state para recuperar no callback
    const authUrl = getAuthUrl(req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('Erro ao gerar URL de autenticação:', error);
    res.status(500).json({ error: 'Erro ao gerar URL de autenticação' });
  }
});


// Processar emails manualmente (apenas admin)
router.post('/process', requireRole('admin'), async (req, res) => {
  try {
    const { onlyNew = false } = req.body; // Se true, processa apenas emails novos
    const result = await processEmails(req.user.id, onlyNew);
    res.json({
      message: onlyNew ? 'Novos emails processados com sucesso' : 'Emails processados com sucesso',
      ...result
    });
  } catch (error) {
    console.error('Erro ao processar emails:', error);
    res.status(500).json({ 
      error: 'Erro ao processar emails',
      message: error.message 
    });
  }
});

// Desconectar conta Gmail (limpar tokens) - apenas admin
router.delete('/disconnect', requireRole('admin'), async (req, res) => {
  try {
    const { getDatabase } = require('../database/init');
    const db = getDatabase();

    // Limpar todos os tokens do usuário atual
    db.run(
      'DELETE FROM gmail_tokens WHERE user_id = ?',
      [req.user.id],
      function(err) {
        if (err) {
          console.error('Erro ao desconectar Gmail:', err);
          return res.status(500).json({ error: 'Erro ao desconectar conta Gmail' });
        }

        console.log(`Conta Gmail desconectada para usuário ${req.user.id}`);
        res.json({ 
          message: 'Conta Gmail desconectada com sucesso. Você pode conectar novamente.',
          disconnected: true
        });
      }
    );
  } catch (error) {
    console.error('Erro ao desconectar:', error);
    res.status(500).json({ error: 'Erro ao desconectar conta Gmail' });
  }
});

// Desconectar todas as contas (admin) - útil para limpar e reconectar com conta específica
router.delete('/disconnect-all', requireRole('admin'), async (req, res) => {
  try {
    const { getDatabase } = require('../database/init');
    const db = getDatabase();

    // Limpar todos os tokens (útil para reconectar com conta específica)
    db.run(
      'DELETE FROM gmail_tokens',
      [],
      function(err) {
        if (err) {
          console.error('Erro ao desconectar todas as contas:', err);
          return res.status(500).json({ error: 'Erro ao desconectar contas' });
        }

        console.log('Todas as contas Gmail foram desconectadas');
        res.json({ 
          message: 'Todas as contas Gmail foram desconectadas. Conecte novamente com milhasplusred@gmail.com',
          disconnected: true
        });
      }
    );
  } catch (error) {
    console.error('Erro ao desconectar todas:', error);
    res.status(500).json({ error: 'Erro ao desconectar contas' });
  }
});

// Verificar status da conexão Gmail (sempre verifica o email centralizador)
router.get('/status', async (req, res) => {
  try {
    const { getDatabase } = require('../database/init');
    const { getAuthenticatedClientForEmail } = require('../config/gmail');
    const db = getDatabase();

    // Sempre verificar o status do email centralizador (milhasplusred@gmail.com)
    db.get(
      `SELECT gt.*, u.email, u.username
       FROM gmail_tokens gt
       INNER JOIN users u ON gt.user_id = u.id
       WHERE u.email = 'milhasplusred@gmail.com' OR u.username LIKE '%milhasplusred%'
       ORDER BY gt.updated_at DESC LIMIT 1`,
      [],
      async (err, token) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao verificar status' });
        }

        // Se não encontrou pelo email específico, buscar qualquer token disponível
        if (!token) {
          db.get(
            'SELECT * FROM gmail_tokens ORDER BY updated_at DESC LIMIT 1',
            [],
            async (err2, token2) => {
              if (err2) {
                return res.status(500).json({ error: 'Erro ao verificar status' });
              }

              if (!token2) {
                return res.json({ 
                  connected: false,
                  message: 'Nenhum token Gmail encontrado. Conecte sua conta Gmail.'
                });
              }

              const isExpired = token2.expiry_date && Date.now() >= token2.expiry_date;
              const willExpireSoon = token2.expiry_date && Date.now() >= (token2.expiry_date - (30 * 60 * 1000));

              // Testar se o token está realmente funcionando
              let isWorking = false;
              try {
                await getAuthenticatedClientForEmail('milhasplusred@gmail.com');
                isWorking = true;
              } catch (error) {
                console.error('Token não está funcionando:', error.message);
              }

              res.json({
                connected: isWorking,
                alwaysConnected: true, // Indica que o sistema mantém conexão sempre ativa
                expiresAt: token2.expiry_date ? new Date(token2.expiry_date).toISOString() : null,
                isExpired,
                willExpireSoon,
                lastUpdated: token2.updated_at,
                message: isWorking ? 'Conexão ativa e sendo mantida automaticamente' : 'Token encontrado mas não está funcionando'
              });
            }
          );
          return;
        }

        const isExpired = token.expiry_date && Date.now() >= token.expiry_date;
        const willExpireSoon = token.expiry_date && Date.now() >= (token.expiry_date - (30 * 60 * 1000));

        // Testar se o token está realmente funcionando
        let isWorking = false;
        try {
          await getAuthenticatedClientForEmail('milhasplusred@gmail.com');
          isWorking = true;
        } catch (error) {
          console.error('Token não está funcionando:', error.message);
        }

        res.json({
          connected: isWorking,
          alwaysConnected: true, // Indica que o sistema mantém conexão sempre ativa
          email: token.email || 'milhasplusred@gmail.com',
          expiresAt: token.expiry_date ? new Date(token.expiry_date).toISOString() : null,
          isExpired,
          willExpireSoon,
          lastUpdated: token.updated_at,
          message: isWorking ? 'Conexão ativa e sendo mantida automaticamente' : 'Token encontrado mas não está funcionando'
        });
      }
    );
  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

module.exports = router;

