const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

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

// API - Listar orçamentos (acesso simples para você consultar)
app.get('/api/orcamentos', (req, res) => {
  const rows = db.prepare('SELECT * FROM orcamentos ORDER BY id DESC').all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
