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

// WhatsApp Popup
const wppBtn = document.getElementById('wppBtn');
const wppOverlay = document.getElementById('wppOverlay');
const wppClose = document.getElementById('wppClose');
const wppSend = document.getElementById('wppSend');
const heroCta = document.getElementById('heroCta');

function openPopup() {
  wppOverlay.classList.add('active');
}

function closePopup() {
  wppOverlay.classList.remove('active');
}

if (wppBtn) wppBtn.addEventListener('click', openPopup);
if (heroCta) heroCta.addEventListener('click', openPopup);
if (wppClose) wppClose.addEventListener('click', closePopup);

const navContato = document.getElementById('navContato');
if (navContato) {
  navContato.addEventListener('click', (e) => {
    e.preventDefault();
    openPopup();
  });
}
if (wppOverlay) {
  wppOverlay.addEventListener('click', (e) => {
    if (e.target === wppOverlay) closePopup();
  });
}

if (wppSend) {
  wppSend.addEventListener('click', () => {
    const nome = document.getElementById('wppNome').value.trim();
    const tel = document.getElementById('wppTel').value.trim();
    const servico = document.getElementById('wppServico').value;

    let texto = `Olá, vim pelo site e gostaria de um orçamento!\n\n`;
    if (nome) texto += `*Nome:* ${nome}\n`;
    if (tel) texto += `*Telefone:* ${tel}\n`;
    if (servico) texto += `*Serviço:* ${servico}\n`;

    // Salva lead no banco
    if (nome && tel) {
      fetch('/api/lead-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone: tel, servico }),
      }).catch(() => {});
    }

    const url = `https://wa.me/5527998090137?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
    closePopup();
  });
}
