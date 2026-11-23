// Aplica o tema guardado antes de desenhar a página (evita o "flash" de tema errado).
try {
  var t = localStorage.getItem('remind.site.theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch (e) {}
