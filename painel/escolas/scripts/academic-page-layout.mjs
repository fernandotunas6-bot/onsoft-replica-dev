const pages = {
  '/cursos/': ['hero', 'learning'],
  '/ingresso/': ['student', 'learning'],
  '/sobre/': ['campus', 'community'],
  '/vida-academica/': ['community', 'community'],
  '/servicos/': ['teacher', 'support'],
  '/biblioteca/': ['hero', 'learning'],
  '/apoio-ao-estudante/': ['student', 'support'],
  '/servicos/secretaria/': ['teacher', 'support'],
  '/carreiras/': ['gestao', 'learning'],
  '/investigacao/': ['tecnologia', 'learning'],
  '/bolsas/': ['student', 'support'],
  '/campus/': ['campus', 'community'],
  '/novos-estudantes/': ['community', 'community'],
  '/eventos/': ['community', 'community'],
  '/contactos/': ['teacher', 'support'],
  '/ajuda/': ['student', 'support'],
};

// Scoped image fields add visual options without renumbering published text or links.
export function decorateAcademicPage(url, body) {
  if (url === '/') {
    const closing = '</div></div><div class="hero-float">';
    if (!body.includes(closing)) throw Error('A composição do destaque inicial mudou.');
    const slides = [
      ['home-admissions', 'student', 'Estudantes a celebrar a sua formação', '/ingresso/', 'O próximo passo começa com uma escolha.'],
      ['home-community', 'community', 'Encontro numa comunidade académica', '/vida-academica/', 'Aprender é também fazer parte.'],
    ].map(([scope, photo, alt, href, caption]) => `<div class="hero-photo hero-additional-slide" hidden data-site-scope="${scope}"><img src="/assets/${photo}.webp" alt="${alt}" loading="lazy" decoding="async"><div class="hero-photo-caption"><a href="${href}">${caption}<span aria-hidden="true">↗</span></a></div></div>`).join('');
    body = body.replace('<div class="hero-photo">', '<div class="hero-carousel" data-hero-carousel><div class="hero-photo">');
    body = body.replace(closing, '</div></div>' + slides + '</div><div class="hero-float">');
  }
  const art = pages[url];
  if (art && body.includes('<section class="page-head">')) {
    body = body.replace('<section class="page-head">', `<section class="page-head academic-page-head" data-academic-theme="${art[1]}">`);
    const figure = `<figure class="academic-page-art" data-site-scope="page-illustration"><img src="/assets/${art[0]}.webp" alt="" width="1200" height="800" decoding="async"><span class="academic-photo-orbit" aria-hidden="true"></span></figure>`;
    body = body.replace('<span class="head-spark"', figure + '<span class="head-spark"');
  }
  if (url === '/servicos/') {
    const photos = ['teacher', 'hero', 'student', 'gestao', 'community', 'campus'];let index = 0;
    body = body.replace(/<a class="service-card"[^>]*>/g, opening => {
      const id = index++, photo = photos[id % photos.length];
      return opening + `<div class="service-card-photo" data-site-scope="service-illustration-${id}"><img src="/assets/${photo}.webp" alt="" width="1200" height="800" loading="lazy" decoding="async"></div>`;
    });
  }
  return body;
}
