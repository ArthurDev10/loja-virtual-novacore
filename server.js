const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'novacore2026';

// Sessões admin em memória
const sessions = new Map();
const LOGIN_ATTEMPTS = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 15 * 60 * 1000; // 15 minutos

// Banco de dados
const db = new Database(path.join(__dirname, 'novacore.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    servico TEXT,
    mensagem TEXT,
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: extrair token do header
function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// Middleware: verificar admin autenticado
function requireAdmin(req, res, next) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }
  const session = sessions.get(token);
  // Sessão expira em 4 horas
  if (Date.now() - session.criado > 4 * 60 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ erro: 'Sessão expirada.' });
  }
  next();
}

// Admin - Login
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const attempt = LOGIN_ATTEMPTS.get(ip);

  // Rate limiting por IP
  if (attempt && attempt.count >= MAX_ATTEMPTS) {
    const elapsed = Date.now() - attempt.first;
    if (elapsed < BLOCK_TIME) {
      const restante = Math.ceil((BLOCK_TIME - elapsed) / 60000);
      return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${restante} minutos.` });
    }
    LOGIN_ATTEMPTS.delete(ip);
  }

  const { senha } = req.body;
  if (!senha || senha !== ADMIN_PASS) {
    // Registrar tentativa
    const current = LOGIN_ATTEMPTS.get(ip) || { count: 0, first: Date.now() };
    current.count++;
    LOGIN_ATTEMPTS.set(ip, current);
    return res.status(403).json({ erro: 'Senha incorreta.' });
  }

  // Limpar tentativas ao logar com sucesso
  LOGIN_ATTEMPTS.delete(ip);

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { criado: Date.now() });
  res.json({ sucesso: true, token });
});

// Admin - Logout
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = getToken(req);
  sessions.delete(token);
  res.json({ sucesso: true });
});

// API - Receber orçamento
app.post('/api/orcamento', (req, res) => {
  const { nome, telefone, servico, mensagem } = req.body;

  if (!nome || !telefone) {
    return res.status(400).json({ erro: 'Nome e telefone são obrigatórios.' });
  }

  // Sanitizar entrada
  const dados = {
    nome: String(nome).trim().slice(0, 200),
    telefone: String(telefone).trim().slice(0, 30),
    servico: servico ? String(servico).trim().slice(0, 200) : null,
    mensagem: mensagem ? String(mensagem).trim().slice(0, 1000) : null,
  };

  const stmt = db.prepare(
    'INSERT INTO orcamentos (nome, telefone, servico, mensagem) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(dados.nome, dados.telefone, dados.servico, dados.mensagem);

  res.json({ sucesso: true, id: result.lastInsertRowid });
});

// API - Listar orçamentos (protegido)
app.get('/api/orcamentos', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orcamentos ORDER BY id DESC').all();
  res.json(rows);
});

// API - Excluir orçamento (protegido)
app.delete('/api/orcamentos/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }
  const result = db.prepare('DELETE FROM orcamentos WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ erro: 'Orçamento não encontrado.' });
  }
  res.json({ sucesso: true });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
