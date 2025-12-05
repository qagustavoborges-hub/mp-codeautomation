const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { logAccess } = require('../middleware/auth');
const { getDatabase } = require('../database/init');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(verifyToken);

// Obter todos os códigos (ativos)
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, airline } = req.query;

    let query = `
      SELECT vc.*, u.username 
      FROM verification_codes vc
      LEFT JOIN users u ON vc.user_id = u.id
      WHERE vc.is_active = 1 AND vc.user_id = ?
    `;
    const params = [req.user.id];

    if (airline) {
      query += ' AND vc.airline = ?';
      params.push(airline.toUpperCase());
    }

    query += ' ORDER BY COALESCE(vc.email_date, vc.extracted_at) DESC, vc.extracted_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, codes) => {
      if (err) {
        console.error('Erro ao buscar códigos:', err);
        return res.status(500).json({ error: 'Erro ao buscar códigos' });
      }

      // Registrar acesso
      logAccess(req.user.id, null, 'VIEW_CODES', req);

      res.json({
        codes,
        total: codes.length
      });
    });
  } catch (error) {
    console.error('Erro ao obter códigos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Obter código específico
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    db.get(
      `SELECT vc.*, u.username 
       FROM verification_codes vc
       LEFT JOIN users u ON vc.user_id = u.id
       WHERE vc.id = ?`,
      [id],
      (err, code) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao buscar código' });
        }

        if (!code) {
          return res.status(404).json({ error: 'Código não encontrado' });
        }

        // Registrar acesso
        logAccess(req.user.id, id, 'VIEW_CODE', req);

        res.json(code);
      }
    );
  } catch (error) {
    console.error('Erro ao obter código:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Marcar código como inativo
router.patch('/:id/deactivate', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    db.run(
      'UPDATE verification_codes SET is_active = 0 WHERE id = ?',
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erro ao desativar código' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Código não encontrado' });
        }

        // Registrar acesso
        logAccess(req.user.id, id, 'DEACTIVATE_CODE', req);

        res.json({ message: 'Código desativado com sucesso' });
      }
    );
  } catch (error) {
    console.error('Erro ao desativar código:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Obter estatísticas
router.get('/stats/summary', (req, res) => {
  try {
    const db = getDatabase();

    db.all(
      `SELECT 
        airline,
        COUNT(*) as count,
        MAX(extracted_at) as last_extracted
       FROM verification_codes
       WHERE is_active = 1 AND user_id = ?
       GROUP BY airline
       ORDER BY count DESC`,
      [req.user.id],
      (err, stats) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }

        db.get(
          'SELECT COUNT(*) as total FROM verification_codes WHERE is_active = 1 AND user_id = ?',
          [req.user.id],
          (err2, total) => {
            if (err2) {
              return res.status(500).json({ error: 'Erro ao buscar total' });
            }

            // Sempre retornar um objeto válido, mesmo quando não há códigos
            res.json({
              byAirline: stats || [],
              total: total ? total.total : 0
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpar todos os códigos (apenas do usuário atual)
router.delete('/clear', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    db.run(
      'DELETE FROM verification_codes WHERE user_id = ?',
      [userId],
      function(err) {
        if (err) {
          console.error('Erro ao limpar códigos:', err);
          return res.status(500).json({ error: 'Erro ao limpar códigos' });
        }

        // Registrar acesso
        logAccess(userId, null, 'CLEAR_ALL_CODES', req);

        console.log(`Códigos limpos para usuário ${userId}. Total removido: ${this.changes}`);
        res.json({ 
          message: 'Todos os códigos foram removidos com sucesso',
          deleted: this.changes
        });
      }
    );
  } catch (error) {
    console.error('Erro ao limpar códigos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;

