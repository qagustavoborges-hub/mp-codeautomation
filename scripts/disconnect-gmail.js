/**
 * Script para desconectar todas as contas Gmail
 * Execute: node scripts/disconnect-gmail.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    process.exit(1);
  }
  console.log('Conectado ao banco de dados SQLite');
});

// Limpar todos os tokens Gmail
db.run('DELETE FROM gmail_tokens', [], function(err) {
  if (err) {
    console.error('Erro ao desconectar contas Gmail:', err);
    db.close();
    process.exit(1);
  }
  
  console.log(`✓ Todas as contas Gmail foram desconectadas (${this.changes} token(s) removido(s))`);
  console.log('');
  console.log('Agora você pode conectar novamente com milhasplusred@gmail.com:');
  console.log('1. Acesse o dashboard');
  console.log('2. Clique em "Conectar Gmail"');
  console.log('3. Faça login com milhasplusred@gmail.com');
  console.log('4. Autorize o acesso');
  
  db.close((err) => {
    if (err) {
      console.error('Erro ao fechar banco de dados:', err);
    }
    process.exit(0);
  });
});

