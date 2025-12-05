const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/database.sqlite');
const DB_DIR = path.dirname(DB_PATH);

// Garantir que o diretório existe
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
      } else {
        console.log('Conectado ao banco de dados SQLite');
      }
    });
  }
  return db;
}

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();

    // Tabela de usuários do sistema
    database.serialize(() => {
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email TEXT,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Erro ao criar tabela users:', err);
          return reject(err);
        }
      });

      // Tabela de tokens OAuth do Gmail
      database.run(`
        CREATE TABLE IF NOT EXISTS gmail_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          token_type TEXT DEFAULT 'Bearer',
          expiry_date INTEGER,
          scope TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Erro ao criar tabela gmail_tokens:', err);
          return reject(err);
        }
      });

      // Tabela de códigos extraídos
      database.run(`
        CREATE TABLE IF NOT EXISTS verification_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          email_id TEXT NOT NULL,
          airline TEXT,
          code TEXT NOT NULL,
          email_subject TEXT,
          email_from TEXT,
          email_to TEXT,
          email_date DATETIME,
          extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(email_id, code)
        )
      `, (err) => {
        if (err) {
          console.error('Erro ao criar tabela verification_codes:', err);
          return reject(err);
        }
        
        // Adicionar colunas se não existirem (para bancos existentes)
        database.run(`
          ALTER TABLE verification_codes 
          ADD COLUMN email_to TEXT
        `, (alterErr) => {
          // Ignorar erro se coluna já existir
        });
        
        database.run(`
          ALTER TABLE verification_codes 
          ADD COLUMN customer_name TEXT
        `, (alterErr2) => {
          // Ignorar erro se coluna já existe
          if (alterErr2 && !alterErr2.message.includes('duplicate column')) {
            console.error('Erro ao adicionar coluna customer_name:', alterErr2);
          }
        });
      });

      // Tabela de logs de acesso
      database.run(`
        CREATE TABLE IF NOT EXISTS access_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          code_id INTEGER,
          action TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (code_id) REFERENCES verification_codes(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          console.error('Erro ao criar tabela access_logs:', err);
          return reject(err);
        }
      });

      // Índices para melhor performance
      database.run(`
        CREATE INDEX IF NOT EXISTS idx_verification_codes_user 
        ON verification_codes(user_id)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_verification_codes_active 
        ON verification_codes(is_active, extracted_at DESC)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_verification_codes_airline 
        ON verification_codes(airline, is_active)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_verification_codes_email_id 
        ON verification_codes(email_id)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user 
        ON gmail_tokens(user_id, expiry_date)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_access_logs_user 
        ON access_logs(user_id, created_at DESC)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_access_logs_code 
        ON access_logs(code_id, created_at DESC)
      `);

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_users_username 
        ON users(username)
      `);

      console.log('Banco de dados inicializado com sucesso');
      resolve();
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          db = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  getDatabase,
  initializeDatabase,
  closeDatabase
};

