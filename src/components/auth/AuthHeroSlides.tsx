import { useEffect, useState } from "react";

const slides = [
  {
    eyebrow: "Sistema Integrado de Gestão",
    title: "A instituição em pleno controlo operacional.",
    text: "Secretaria académica, estudantes, turmas, contabilidade, propinas e relatórios integrados com segurança e rapidez.",
  },
  {
    eyebrow: "Aulas presenciais e à distância",
    title: "A sala de aula ligada a cada aluno.",
    text: "Aulas em directo, presenças, sumários e materiais partilhados com os estudantes onde quer que estejam.",
  },
  {
    eyebrow: "Tesouraria e propinas",
    title: "Cobranças claras, recibos imediatos.",
    text: "Facturas, pagamentos, caixa e extractos acompanhados em tempo real, com relatórios prontos a imprimir.",
  },
  {
    eyebrow: "Pautas e avaliações",
    title: "Notas oficiais sem erros de cálculo.",
    text: "Mini-pautas, pautas finais e boletins gerados automaticamente segundo as regras em vigor.",
  },
];

/** Textos do painel de entrada que deslizam suavemente para a esquerda. */
export function AuthHeroSlides() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative max-w-xl">
      <div className="relative min-h-[15rem] overflow-hidden">
        {slides.map((s, i) => {
          const offset =
            i === index
              ? "translate-x-0 opacity-100"
              : i === (index - 1 + slides.length) % slides.length
                ? "-translate-x-10 opacity-0"
                : "translate-x-10 opacity-0";
          return (
            <div
              key={s.title}
              aria-hidden={i !== index}
              className={`absolute inset-x-0 bottom-0 transition-all duration-700 ease-out ${offset}`}
            >
              <p className="text-xs font-semibold opacity-80">{s.eyebrow}</p>
              <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight">{s.title}</h1>
              <p className="mt-4 max-w-lg text-sm leading-6 opacity-85">{s.text}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={`Mostrar: ${s.eyebrow}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full bg-primary-foreground transition-all duration-500 ${i === index ? "w-6 opacity-90" : "w-1.5 opacity-40"}`}
          />
        ))}
      </div>
    </div>
  );
}
