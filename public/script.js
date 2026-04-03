const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Formulário de orçamento
const form = document.getElementById('formOrcamento');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('formMsg');
    msg.textContent = '';
    msg.className = 'form-msg';

    const dados = {
      nome: form.nome.value.trim(),
      telefone: form.telefone.value.trim(),
      servico: form.servico.value,
      mensagem: form.mensagem.value.trim(),
    };

    try {
      const res = await fetch('/api/orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      const json = await res.json();
      if (json.sucesso) {
        msg.textContent = 'Orçamento enviado! Redirecionando para o WhatsApp...';
        msg.classList.add('success');

        // Monta mensagem para o WhatsApp
        let texto = `Olá, vim pelo site e gostaria de um orçamento!\n\n`;
        texto += `*Nome:* ${dados.nome}\n`;
        texto += `*Telefone:* ${dados.telefone}\n`;
        if (dados.servico) texto += `*Serviço:* ${dados.servico}\n`;
        if (dados.mensagem) texto += `*Mensagem:* ${dados.mensagem}\n`;

        const url = `https://wa.me/5527998090137?text=${encodeURIComponent(texto)}`;

        form.reset();
        setTimeout(() => window.open(url, '_blank'), 800);
      } else {
        msg.textContent = json.erro || 'Erro ao enviar. Tente novamente.';
        msg.classList.add('error');
      }
    } catch {
      msg.textContent = 'Erro de conexão. Tente novamente.';
      msg.classList.add('error');
    }
  });
}

// Popup WhatsApp - captura lead antes de redirecionar
const btnWhatsapp = document.getElementById('btnWhatsapp');
const wppOverlay = document.getElementById('wppOverlay');
const wppClose = document.getElementById('wppClose');
const wppForm = document.getElementById('wppForm');

if (btnWhatsapp && wppOverlay) {
  btnWhatsapp.addEventListener('click', () => {
    wppOverlay.classList.add('active');
  });

  wppClose.addEventListener('click', () => {
    wppOverlay.classList.remove('active');
  });

  wppOverlay.addEventListener('click', (e) => {
    if (e.target === wppOverlay) wppOverlay.classList.remove('active');
  });

  wppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('wppNome').value.trim();
    const telefone = document.getElementById('wppTel').value.trim();

    if (!nome || !telefone) return;

    // Salvar lead no banco (não bloqueia o redirecionamento)
    fetch('/api/lead-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone }),
    }).catch(() => {});

    // Redirecionar para o WhatsApp
    const texto = `Olá, meu nome é ${nome} e vim pelo site. Gostaria de solicitar um orçamento!`;
    const url = `https://wa.me/5527998090137?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');

    wppForm.reset();
    wppOverlay.classList.remove('active');
  });
}
