import test from 'node:test';
import assert from 'node:assert/strict';
import {getCourseSpecs} from '../src/course-specs.mjs';
import {courses} from '../src/data.mjs';

const AREAS = ['tecnologia', 'gestao', 'saude', 'engenharia', 'educacao', 'criatividade'];
const base = {area: 'tecnologia', years: 3, level: 'Licenciatura', mode: 'Presencial', modules: ['M1', 'M2']};
const specs = extra => getCourseSpecs({...base, ...extra});

test('a duração distingue menos de um ano de semestres', () => {
  assert.equal(specs({years: 0.5}).structure, '6 meses · percurso de exemplo');
  assert.equal(specs({years: 1}).structure, '2 semestres · percurso de exemplo');
  assert.equal(specs({years: 3}).structure, '6 semestres · percurso de exemplo');
});

test('o acesso depende do nível e nunca afirma um requisito oficial', () => {
  assert.match(specs({level: 'Pós-graduação'}).access, /Formação superior prévia/);
  assert.match(specs({level: 'Licenciatura'}).access, /Ensino secundário concluído/);
  assert.match(specs({level: 'Curso de curta duração'}).access, /a confirmar pela instituição/);
  for (const level of ['Pós-graduação', 'Licenciatura', 'Curso de curta duração']) {
    assert.match(specs({level}).access, /oficia|confirmar/, level);
  }
});

test('a modalidade cobre os três modos', () => {
  assert.match(specs({mode: 'Online'}).delivery, /recursos digitais/);
  assert.match(specs({mode: 'Híbrido'}).delivery, /presenciais e recursos digitais/);
  assert.match(specs({mode: 'Presencial'}).delivery, /Actividades presenciais/);
});

test('cada módulo do curso recebe uma descrição', () => {
  const result = specs({modules: ['A', 'B', 'C']});
  assert.equal(result.modules.length, 3);
  assert.deepEqual(result.modules.map(m => m.title), ['A', 'B', 'C']);
  for (const m of result.modules) assert.ok(m.description.length > 20, m.title);
});

test('mais módulos do que descrições volta ao início em vez de ficar sem', () => {
  // O perfil tem 6 descrições; o 7.º módulo reutiliza a 1.ª.
  const result = specs({modules: Array.from({length: 8}, (_, i) => 'M' + i)});
  assert.equal(result.modules.length, 8);
  assert.equal(result.modules[6].description, result.modules[0].description);
  assert.equal(result.modules[7].description, result.modules[1].description);
  for (const m of result.modules) assert.equal(typeof m.description, 'string');
});

test('todas as áreas têm um perfil completo', () => {
  for (const area of AREAS) {
    const result = specs({area});
    for (const key of ['audience', 'preparation', 'practice', 'assessment', 'resources']) {
      assert.equal(typeof result[key], 'string', `${area}.${key}`);
      assert.ok(result[key].length > 30, `${area}.${key} curto`);
    }
    assert.equal(result.outcomes.length, 3, area);
    assert.equal(result.language, 'Português');
  }
});

test('cada curso dos dados produz especificações utilizáveis', () => {
  // build.mjs chama getCourseSpecs para cada curso ao gerar as 18 páginas:
  // uma área nova em data.mjs sem perfil correspondente parte a build.
  assert.ok(courses.length > 0);
  for (const course of courses) {
    assert.ok(AREAS.includes(course.area), `área sem perfil: ${course.area} (${course.id})`);
    const result = getCourseSpecs(course);
    assert.equal(result.modules.length, course.modules.length, course.id);
    assert.ok(result.structure && result.access && result.delivery, course.id);
  }
});

test('uma área sem perfil falha de imediato, em vez de publicar vazio', () => {
  assert.throws(() => specs({area: 'inexistente'}), TypeError);
});
