const { getDatabase } = require('../database/init');

let clients = new Set();

function setupWebSocket(app) {
  app.ws('/ws', (ws, req) => {
    // Validar se a conexão é válida
    if (ws.readyState !== 1) {
      return;
    }

    // Evitar logar todas as conexões (pode ser spam em reconexões rápidas)
    const connectionTime = Date.now();
    const shouldLog = !clients.has(ws);
    
    if (shouldLog) {
      console.log('Nova conexão WebSocket');
    }
    
    clients.add(ws);

    // Enviar mensagem de boas-vindas com um pequeno delay para garantir que a conexão está estável
    setTimeout(() => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'Conectado ao servidor WebSocket'
          }));
        } catch (error) {
          // Ignorar erros silenciosamente se a conexão já foi fechada
          if (ws.readyState === 1) {
            console.error('Erro ao enviar mensagem de boas-vindas:', error);
            clients.delete(ws);
          }
        }
      }
    }, 100); // Pequeno delay para estabilizar conexão

    // Lidar com mensagens do cliente
    ws.on('message', (message) => {
      try {
        // Validar se a mensagem é uma string
        if (typeof message !== 'string') {
          message = message.toString('utf8');
        }
        
        const data = JSON.parse(message);
        
        // Validar estrutura da mensagem
        if (!data || typeof data !== 'object') {
          return;
        }

        // Ping/Pong para manter conexão viva
        if (data.type === 'ping') {
          try {
            ws.send(JSON.stringify({ type: 'pong' }));
          } catch (error) {
            console.error('Erro ao enviar pong:', error);
            clients.delete(ws);
          }
        }
      } catch (error) {
        // Ignorar erros de parsing silenciosamente para evitar spam
        if (error.message && !error.message.includes('JSON')) {
          console.error('Erro ao processar mensagem WebSocket:', error.message);
        }
      }
    });

    // Lidar com desconexão
    ws.on('close', (code, reason) => {
      // Não logar desconexões muito rápidas (provavelmente reconexões)
      const connectionDuration = Date.now() - connectionTime;
      if (connectionDuration > 1000 || code === 1000 || code === 1001) {
        // Só logar se a conexão durou mais de 1 segundo ou foi fechamento normal
        if (code !== 1006 || connectionDuration > 5000) {
          // Código 1006 só logar se durou mais de 5 segundos
          console.log('Cliente desconectado', code ? `(código: ${code})` : '');
        }
      }
      clients.delete(ws);
    });

    // Lidar com erros - não logar todos os erros para evitar spam
    ws.on('error', (error) => {
      // Ignorar erros comuns de reconexão
      const errorMsg = error.message || error.toString();
      const shouldLog = !errorMsg.includes('Invalid WebSocket frame') &&
                       !errorMsg.includes('WS_ERR_INVALID_CLOSE_CODE') &&
                       !errorMsg.includes('ECONNRESET') &&
                       error.code !== 'ECONNRESET';
      
      if (shouldLog) {
        console.error('Erro WebSocket:', errorMsg);
      }
      clients.delete(ws);
    });
  });
}

function broadcastNewCode(code) {
  const message = JSON.stringify({
    type: 'new_code',
    data: code
  });

  clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Erro ao enviar mensagem WebSocket:', error);
        clients.delete(client);
      }
    }
  });
}

function broadcastCodeUpdate(codeId, update) {
  const message = JSON.stringify({
    type: 'code_update',
    codeId,
    data: update
  });

  clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Erro ao enviar atualização WebSocket:', error);
        clients.delete(client);
      }
    }
  });
}

// Monitorar banco de dados para novos códigos
function startDatabaseWatcher() {
  const db = getDatabase();
  let lastCheck = Date.now();

  setInterval(() => {
    db.all(
      `SELECT vc.*, u.username 
       FROM verification_codes vc
       LEFT JOIN users u ON vc.user_id = u.id
       WHERE vc.is_active = 1 
       AND vc.extracted_at > datetime(?, 'unixepoch', 'localtime')
       ORDER BY vc.extracted_at DESC`,
      [Math.floor(lastCheck / 1000)],
      (err, codes) => {
        if (err) {
          console.error('Erro ao verificar novos códigos:', err);
          return;
        }

        if (codes && codes.length > 0) {
          console.log(`Enviando ${codes.length} novo(s) código(s) via WebSocket`);
          codes.forEach(code => {
            broadcastNewCode(code);
          });
        }

        lastCheck = Date.now();
      }
    );
  }, 5000); // Verificar a cada 5 segundos
}

// Iniciar watcher quando o módulo for carregado
setTimeout(() => {
  startDatabaseWatcher();
}, 2000);

module.exports = {
  setupWebSocket,
  broadcastNewCode,
  broadcastCodeUpdate
};

