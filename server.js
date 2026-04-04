const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'novacore2026';

// Configuração de e-mail
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO || 'arthurodev10@gmail.com';

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

async function enviarNotificacao(dados) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: `"NovaCore IT" <${EMAIL_USER}>`,
      to: EMAIL_TO,
      subject: `📋 Novo orçamento de ${dados.nome}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f4f7fb;border-radius:12px;">
          <h2 style="color:#0e6ae8;margin-top:0;">Novo Orçamento Recebido!</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:bold;color:#333;">Nome:</td><td style="padding:8px 0;color:#555;">${dados.nome}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;color:#333;">Telefone:</td><td style="padding:8px 0;color:#555;">${dados.telefone}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;color:#333;">Serviço:</td><td style="padding:8px 0;color:#555;">${dados.servico || 'Não informado'}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;color:#333;">Mensagem:</td><td style="padding:8px 0;color:#555;">${dados.mensagem || 'Nenhuma'}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">
          <p style="color:#888;font-size:13px;">Acesse o painel admin para gerenciar: <a href="https://novacore-it.onrender.com/admin.html">Painel Admin</a></p>
        </div>
      `,
    });
    console.log('E-mail de notificação enviado.');
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err.message);
  }
}

// Sessões admin em memória
const sessions = new Map();
const LOGIN_ATTEMPTS = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 15 * 60 * 1000; // 15 minutos

// Banco de dados Turso (nuvem)
const db = createClient({
  url: process.env.TURSO_URL || 'libsql://novacore-arthurdev10.aws-us-east-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT,
      mensagem TEXT,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leads_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  // Adicionar coluna servico se não existir (migração)
  try {
    await db.execute(`ALTER TABLE leads_whatsapp ADD COLUMN servico TEXT`);
  } catch {}
  console.log('Banco Turso conectado.');
}

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
app.post('/api/orcamento', async (req, res) => {
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

  try {
    const result = await db.execute({
      sql: 'INSERT INTO orcamentos (nome, telefone, servico, mensagem) VALUES (?, ?, ?, ?)',
      args: [dados.nome, dados.telefone, dados.servico, dados.mensagem],
    });

    // Enviar notificação por e-mail (não bloqueia a resposta)
    enviarNotificacao(dados);

    res.json({ sucesso: true, id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('Erro ao salvar orçamento:', err.message);
    res.status(500).json({ erro: 'Erro ao salvar orçamento.' });
  }
});

// API - Registrar lead do WhatsApp
app.post('/api/lead-whatsapp', async (req, res) => {
  const { nome, telefone, servico } = req.body;
  if (!nome || !telefone) {
    return res.status(400).json({ erro: 'Nome e telefone são obrigatórios.' });
  }
  const dados = {
    nome: String(nome).trim().slice(0, 200),
    telefone: String(telefone).trim().slice(0, 30),
    servico: servico ? String(servico).trim().slice(0, 200) : null,
  };
  try {
    await db.execute({
      sql: 'INSERT INTO leads_whatsapp (nome, telefone, servico) VALUES (?, ?, ?)',
      args: [dados.nome, dados.telefone, dados.servico],
    });
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao salvar lead:', err.message);
    res.status(500).json({ erro: 'Erro ao salvar lead.' });
  }
});

// API - Listar leads WhatsApp (protegido)
app.get('/api/leads-whatsapp', requireAdmin, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM leads_whatsapp ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar leads:', err.message);
    res.status(500).json({ erro: 'Erro ao listar leads.' });
  }
});

// API - Excluir lead (protegido)
app.delete('/api/leads-whatsapp/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }
  try {
    const result = await db.execute({ sql: 'DELETE FROM leads_whatsapp WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ erro: 'Lead não encontrado.' });
    }
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao excluir lead:', err.message);
    res.status(500).json({ erro: 'Erro ao excluir lead.' });
  }
});

// API - Listar orçamentos (protegido)
app.get('/api/orcamentos', requireAdmin, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM orcamentos ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar orçamentos:', err.message);
    res.status(500).json({ erro: 'Erro ao listar orçamentos.' });
  }
});

// API - Excluir orçamento (protegido)
app.delete('/api/orcamentos/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }
  try {
    const result = await db.execute({ sql: 'DELETE FROM orcamentos WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    }
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao excluir orçamento:', err.message);
    res.status(500).json({ erro: 'Erro ao excluir orçamento.' });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Erro ao conectar ao banco:', err.message);
  process.exit(1);
});
