const { google } = require('googleapis');
const { getDatabase } = require('../database/init');

// Configuração OAuth 2.0 do Gmail
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/gmail/oauth/callback'
);

// Escopos necessários (mínimos necessários)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly', // Apenas leitura
  'https://www.googleapis.com/auth/gmail.modify'    // Para marcar como lido
];

function getAuthUrl(userId = null) {
  const options = {
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Força a obtenção do refresh token
  };
  
  // Incluir userId no state para recuperar no callback
  if (userId) {
    options.state = userId.toString();
  }
  
  return oauth2Client.generateAuthUrl(options);
}

async function getTokensFromCode(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Erro ao obter tokens:', error);
    throw error;
  }
}

// Função para buscar token do email específico milhasplusred@gmail.com
async function getAuthenticatedClientForEmail(targetEmail = 'milhasplusred@gmail.com') {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    // Primeiro, tentar encontrar o usuário pelo email
    db.get(
      `SELECT u.id, gt.* 
       FROM users u
       INNER JOIN gmail_tokens gt ON u.id = gt.user_id
       WHERE u.email = ? OR u.username LIKE ?
       ORDER BY gt.updated_at DESC LIMIT 1`,
      [targetEmail, `%${targetEmail}%`],
      async (err, row) => {
        if (err) {
          return reject(err);
        }

        // Se não encontrou pelo email, buscar qualquer token disponível (assumindo que é do email centralizador)
        if (!row) {
          db.get(
            'SELECT * FROM gmail_tokens ORDER BY updated_at DESC LIMIT 1',
            [],
            async (err2, row2) => {
              if (err2) {
                return reject(err2);
              }
              
              if (!row2) {
                return reject(new Error(`Token não encontrado para o email ${targetEmail}`));
              }
              
              // Usar o token encontrado
              await processTokenRow(row2, resolve, reject);
            }
          );
          return;
        }
        
        // Usar o token encontrado
        await processTokenRow(row, resolve, reject);
      }
    );
  });
}

// Função auxiliar para processar o token
async function processTokenRow(row, resolve, reject) {
  // Configurar o cliente OAuth com os tokens salvos
  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date
  });

  // Verificar se o token expirou ou está próximo de expirar (renovar 30 minutos antes para manter sempre conectado)
  const expiryBuffer = 30 * 60 * 1000; // 30 minutos antes (renovação proativa)
  if (row.expiry_date && Date.now() >= (row.expiry_date - expiryBuffer)) {
    try {
      if (!row.refresh_token) {
        return reject(new Error('Refresh token não disponível. É necessário reautenticar.'));
      }

      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Atualizar tokens no banco
      const db = getDatabase();
      db.run(
        `UPDATE gmail_tokens 
         SET access_token = ?, 
             refresh_token = ?,
             expiry_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          credentials.access_token,
          credentials.refresh_token || row.refresh_token,
          credentials.expiry_date,
          row.id
        ],
        (updateErr) => {
          if (updateErr) {
            console.error('Erro ao atualizar tokens:', updateErr);
          } else {
            console.log('Token renovado automaticamente para manter conexão ativa');
          }
        }
      );

      oauth2Client.setCredentials(credentials);
    } catch (refreshError) {
      console.error('Erro ao renovar token:', refreshError);
      return reject(new Error('Erro ao renovar token: ' + refreshError.message));
    }
  }

  resolve(oauth2Client);
}

// Função para renovar token proativamente (mantém conexão sempre ativa)
async function refreshTokenProactively(tokenId) {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM gmail_tokens WHERE id = ?',
      [tokenId],
      async (err, row) => {
        if (err) {
          return reject(err);
        }

        if (!row) {
          return reject(new Error('Token não encontrado'));
        }

        // Renovar se estiver próximo de expirar (30 minutos antes)
        const expiryBuffer = 30 * 60 * 1000; // 30 minutos
        if (row.expiry_date && Date.now() >= (row.expiry_date - expiryBuffer)) {
          try {
            if (!row.refresh_token) {
              return reject(new Error('Refresh token não disponível'));
            }

            oauth2Client.setCredentials({
              access_token: row.access_token,
              refresh_token: row.refresh_token,
              expiry_date: row.expiry_date
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            
            db.run(
              `UPDATE gmail_tokens 
               SET access_token = ?, 
                   refresh_token = ?,
                   expiry_date = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                credentials.access_token,
                credentials.refresh_token || row.refresh_token,
                credentials.expiry_date,
                row.id
              ],
              (updateErr) => {
                if (updateErr) {
                  console.error('Erro ao renovar token proativamente:', updateErr);
                  return reject(updateErr);
                } else {
                  console.log('Token renovado proativamente - conexão mantida ativa');
                  resolve(credentials);
                }
              }
            );
          } catch (refreshError) {
            console.error('Erro ao renovar token proativamente:', refreshError);
            return reject(refreshError);
          }
        } else {
          resolve(null); // Token ainda válido, não precisa renovar
        }
      }
    );
  });
}

async function getAuthenticatedClient(userId) {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM gmail_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [userId],
      async (err, row) => {
        if (err) {
          return reject(err);
        }

        if (!row) {
          return reject(new Error('Token não encontrado para este usuário'));
        }

        // Usar a função auxiliar para processar o token
        await processTokenRow(row, resolve, reject);
      }
    );
  });
}

async function saveTokens(userId, tokens) {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    // Verificar se já existe token para este usuário
    db.get(
      'SELECT id FROM gmail_tokens WHERE user_id = ?',
      [userId],
      (err, existing) => {
        if (err) {
          return reject(err);
        }

        if (existing) {
          // Atualizar token existente
          db.run(
            `UPDATE gmail_tokens 
             SET access_token = ?,
                 refresh_token = ?,
                 expiry_date = ?,
                 scope = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [
              tokens.access_token,
              tokens.refresh_token,
              tokens.expiry_date,
              tokens.scope,
              userId
            ],
            function(updateErr) {
              if (updateErr) {
                return reject(updateErr);
              }
              resolve(this.lastID);
            }
          );
        } else {
          // Inserir novo token
          db.run(
            `INSERT INTO gmail_tokens 
             (user_id, access_token, refresh_token, expiry_date, scope)
             VALUES (?, ?, ?, ?, ?)`,
            [
              userId,
              tokens.access_token,
              tokens.refresh_token,
              tokens.expiry_date,
              tokens.scope
            ],
            function(insertErr) {
              if (insertErr) {
                return reject(insertErr);
              }
              resolve(this.lastID);
            }
          );
        }
      }
    );
  });
}

module.exports = {
  oauth2Client,
  getAuthUrl,
  getTokensFromCode,
  getAuthenticatedClient,
  getAuthenticatedClientForEmail,
  saveTokens,
  refreshTokenProactively,
  SCOPES
};

