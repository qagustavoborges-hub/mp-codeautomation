const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getDatabase } = require('../database/init');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(verifyToken);

// Obter lista de usuários (apenas admin)
router.get('/', requireRole('admin'), (req, res) => {
  try {
    const db = getDatabase();

    db.all(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC',
      [],
      (err, users) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao buscar usuários' });
        }

        res.json(users);
      }
    );
  } catch (error) {
    console.error('Erro ao obter usuários:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;







