const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Registrar novo usuário - REMOVIDO: Usuários só podem ser criados diretamente no banco de dados
// Apenas admins podem ser criados manualmente no banco

// Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    const db = getDatabase();

    db.get(
      'SELECT * FROM users WHERE username = ?',
      [username],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao buscar usuário' });
        }

        if (!user) {
          return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = generateToken({
          id: user.id,
          username: user.username,
          role: user.role
        });

        res.json({
          message: 'Login realizado com sucesso',
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Verificar token (usado pelo frontend)
router.get('/verify', verifyToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Obter perfil do usuário
router.get('/profile', verifyToken, (req, res) => {
  const db = getDatabase();

  db.get(
    'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar usuário' });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(user);
    }
  );
});

module.exports = router;







