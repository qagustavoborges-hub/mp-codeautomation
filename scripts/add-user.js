/**
 * Script para adicionar usuário ao banco de dados
 * Execute: node scripts/add-user.js <username> <password> [email] [role]
 * 
 * Exemplos:
 * node scripts/add-user.js usuario123 senha123
 * node scripts/add-user.js usuario123 senha123 usuario@email.com
 * node scripts/add-user.js admin123 senha123 admin@email.com admin
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

// Obter argumentos da linha de comando
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Uso: node scripts/add-user.js <username> <password> [email] [role]');
  console.error('');
  console.error('Exemplos:');
  console.error('  node scripts/add-user.js usuario123 senha123');
  console.error('  node scripts/add-user.js usuario123 senha123 usuario@email.com');
  console.error('  node scripts/add-user.js admin123 senha123 admin@email.com admin');
  process.exit(1);
}

const username = args[0];
const password = args[1];
const email = args[2] || null;
const role = args[3] || 'user';

// Validar role
if (role !== 'user' && role !== 'admin') {
  console.error('Erro: role deve ser "user" ou "admin"');
  process.exit(1);
}

// Validar senha
if (password.length < 6) {
  console.error('Erro: senha deve ter no mínimo 6 caracteres');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    process.exit(1);
  }
  console.log('Conectado ao banco de dados SQLite');
});

// Verificar se usuário já existe
db.get('SELECT id, username FROM users WHERE username = ?', [username], async (err, existingUser) => {
  if (err) {
    console.error('Erro ao verificar usuário existente:', err);
    db.close();
    process.exit(1);
  }

  if (existingUser) {
    console.error(`Erro: Usuário "${username}" já existe!`);
    db.close();
    process.exit(1);
  }

  // Fazer hash da senha
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserir usuário
    db.run(
      'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
      [username, passwordHash, email, role],
      function(err) {
        if (err) {
          console.error('Erro ao criar usuário:', err);
          db.close();
          process.exit(1);
        }

        console.log('');
        console.log('✓ Usuário criado com sucesso!');
        console.log('');
        console.log('Detalhes:');
        console.log(`  ID: ${this.lastID}`);
        console.log(`  Username: ${username}`);
        console.log(`  Email: ${email || '(não informado)'}`);
        console.log(`  Role: ${role}`);
        console.log('');
        console.log('Agora você pode fazer login com este usuário.');

        db.close((err) => {
          if (err) {
            console.error('Erro ao fechar banco de dados:', err);
          }
          process.exit(0);
        });
      }
    );
  } catch (error) {
    console.error('Erro ao fazer hash da senha:', error);
    db.close();
    process.exit(1);
  }
});

