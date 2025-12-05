class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 5000; // 5 segundos base
    this.listeners = new Map();
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.lastCloseTime = 0;
  }

  connect() {
    // Habilitar reconexão se foi desabilitada
    this.shouldReconnect = true;
    
    // Evitar múltiplas conexões simultâneas
    if (this.isConnecting) {
      return;
    }

    // Se já está conectado, não reconectar
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // Fechar conexão anterior se existir
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignorar erros ao fechar
      }
      this.ws = null;
    }

    this.isConnecting = true;
    
    // Detectar URL do WebSocket baseado no ambiente
    let wsUrl;
    if (process.env.VUE_APP_WS_URL) {
      wsUrl = process.env.VUE_APP_WS_URL;
    } else {
      // Em desenvolvimento, usar o proxy do Vue (porta 3000)
      // Em produção ou quando acessado por IP, usar a porta do backend diretamente
      const hostname = window.location.hostname;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // Se estiver em localhost ou 127.0.0.1, usar proxy do Vue
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        wsUrl = `${protocol}//${hostname}:3000/ws`;
      } else {
        // Para IPs da rede local, conectar diretamente na porta do backend
        wsUrl = `${protocol}//${hostname}:3001/ws`;
      }
    }
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket conectado');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected', {});
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          // Validar se os dados são válidos
          if (!event.data) {
            return;
          }
          
          const data = JSON.parse(event.data);
          
          // Validar estrutura
          if (data && typeof data === 'object' && data.type) {
            this.emit(data.type, data);
          }
        } catch (error) {
          // Ignorar erros de parsing silenciosamente
          if (error.message && !error.message.includes('JSON')) {
            console.error('Erro ao processar mensagem WebSocket:', error);
          }
        }
      };

      this.ws.onerror = (error) => {
        // Não logar todos os erros (muitos são normais durante reconexão)
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        const now = Date.now();
        const timeSinceLastClose = now - this.lastCloseTime;
        this.lastCloseTime = now;
        
        // Não logar se foi desconexão muito recente (evita spam)
        if (timeSinceLastClose > 2000) {
          console.log('WebSocket desconectado', event.code ? `(código: ${event.code})` : '');
        }
        
        this.isConnecting = false;
        this.stopPing();
        
        // Limpar referência
        this.ws = null;
        
        // Só tentar reconectar se:
        // 1. Não foi um fechamento intencional (1000, 1001)
        // 2. A reconexão está habilitada
        // 3. Não houve muitas tentativas recentes
        if (this.shouldReconnect && 
            event.code !== 1000 && 
            event.code !== 1001 &&
            this.reconnectAttempts < this.maxReconnectAttempts) {
          // Aguardar um pouco antes de reconectar (evita loop rápido)
          setTimeout(() => {
            if (this.shouldReconnect && !this.ws) {
              this.attemptReconnect();
            }
          }, 2000); // Aguardar 2 segundos antes de tentar
        }
      };
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  disconnect() {
    this.shouldReconnect = false; // Desabilitar reconexão automática
    this.stopPing();
    
    // Limpar timeout de reconexão
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      try {
        // Fechar com código normal para não tentar reconectar
        this.ws.close(1000, 'Desconexão normal');
      } catch (e) {
        // Ignorar erros
      }
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.listeners.clear();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Erro ao executar callback para evento ${event}:`, error);
        }
      });
    }
  }

  attemptReconnect() {
    // Evitar múltiplas tentativas simultâneas
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    // Limpar tentativa anterior se existir
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Backoff exponencial: delay aumenta com cada tentativa
      const delay = Math.min(
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        30000 // Máximo de 30 segundos
      );
      
      // Só logar a cada 3 tentativas para evitar spam
      if (this.reconnectAttempts % 3 === 1 || this.reconnectAttempts === 1) {
        console.log(`Tentando reconectar... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delay/1000}s`);
      }
      
      this.reconnectTimeout = setTimeout(() => {
        if (this.shouldReconnect && !this.ws) {
          this.connect();
        }
      }, delay);
    } else {
      console.warn('Máximo de tentativas de reconexão atingido. Aguardando 1 minuto antes de tentar novamente...');
      // Resetar após um tempo para permitir nova tentativa
      setTimeout(() => {
        this.reconnectAttempts = 0;
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      }, 60000); // 1 minuto
    }
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping a cada 30 segundos
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export default new WebSocketService();

