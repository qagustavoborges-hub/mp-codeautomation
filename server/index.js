const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const expressWs = require('express-ws');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gmailRoutes = require('./routes/gmail');
const codesRoutes = require('./routes/codes');
const usersRoutes = require('./routes/users');
const { initializeDatabase } = require('./database/init');
const { setupWebSocket } = require('./websocket/websocket');
const { startEmailProcessor } = require('./jobs/emailProcessor');
const { startTokenRefresher } = require('./jobs/tokenRefresher');

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3001;

// Middlewares de segurança
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - mais flexível para desenvolvimento
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // máximo 200 requests por IP (aumentado)
  message: 'Muitas requisições. Tente novamente em alguns instantes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting mais restritivo apenas para autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10 // máximo 10 tentativas de login por IP
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', limiter);

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/codes', codesRoutes);
app.use('/api/users', usersRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configurar WebSocket
setupWebSocket(app);

// Inicializar banco de dados e iniciar servidor
initializeDatabase()
  .then(() => {
    // Iniciar renovador automático de tokens (mantém conexão sempre ativa)
    startTokenRefresher();
    
    // Iniciar processador automático de emails
    startEmailProcessor();
    
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Sistema de verificação Gmail iniciado`);
      console.log(`Conexão Gmail será mantida sempre ativa através de renovação automática`);
    });
  })
  .catch((error) => {
    console.error('Erro ao inicializar banco de dados:', error);
    process.exit(1);
  });

module.exports = app;

