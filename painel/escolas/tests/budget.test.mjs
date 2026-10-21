import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBudget} from '../src/budget.mjs';

const zero = {tuition: 0, upfront: 0, transport: 0, meals: 0, housing: 0, other: 0, installments: 1, months: 1};
const budget = extra => calculateBudget({...zero, ...extra});

test('a propina multiplica pelas prestações e o dia a dia pelos meses', () => {
  const result = budget({tuition: 50000, transport: 10000, meals: 20000, housing: 30000, other: 5000, upfront: 75000, installments: 10, months: 12});
  assert.equal(result.tuition, 500000);
  assert.equal(result.living, (10000 + 20000 + 30000 + 5000) * 12);
  assert.equal(result.upfront, 75000);
  assert.equal(result.total, 500000 + 65000 * 12 + 75000);
});

test('as despesas únicas não são multiplicadas por nenhum período', () => {
  const um = budget({upfront: 1000, installments: 1, months: 1});
  const muitos = budget({upfront: 1000, installments: 24, months: 24});
  assert.equal(um.upfront, 1000);
  assert.equal(muitos.upfront, 1000);
  assert.equal(muitos.total, 1000);
});

test('o total é sempre a soma exacta das três parcelas', () => {
  for (const extra of [
    {tuition: 1, months: 3, transport: 2},
    {tuition: 33.33, installments: 3, upfront: 0.01},
    {tuition: 99999.99, installments: 24, meals: 0.05, months: 24},
  ]) {
    const r = budget(extra);
    assert.equal(r.total, Number((r.tuition + r.living + r.upfront).toFixed(2)), JSON.stringify(extra));
  }
});

test('conta em cêntimos: 0,1 + 0,2 não escorrega', () => {
  // O cálculo arredonda para cêntimos antes de somar. Em aritmética de ponto
  // flutuante directa, 0.1*3 daria 0.30000000000000004.
  const result = budget({transport: 0.1, meals: 0.1, housing: 0.1, months: 1});
  assert.equal(result.living, 0.3);
  assert.equal(budget({tuition: 0.07, installments: 3}).tuition, 0.21);
});

test('arredonda cada valor ao cêntimo antes de multiplicar', () => {
  // 0.005 -> 1 cêntimo (Math.round), depois 10 prestações = 0,10.
  assert.equal(budget({tuition: 0.005, installments: 10}).tuition, 0.1);
  assert.equal(budget({tuition: 0.004, installments: 10}).tuition, 0);
});

test('recusa valores monetários fora do domínio', () => {
  for (const key of ['tuition', 'upfront', 'transport', 'meals', 'housing', 'other']) {
    for (const value of [-1, -0.01, 100000001, NaN, Infinity, '1000', null, undefined]) {
      assert.throws(() => budget({[key]: value}), /Valor monetário inválido/, `${key}=${String(value)}`);
    }
  }
});

test('aceita os extremos do domínio monetário', () => {
  assert.equal(budget({tuition: 0}).tuition, 0);
  assert.equal(budget({tuition: 100000000}).tuition, 100000000);
});

test('recusa períodos não inteiros ou fora de 1..24', () => {
  for (const key of ['installments', 'months']) {
    for (const value of [0, -1, 25, 1.5, NaN, '12', null, undefined]) {
      assert.throws(() => budget({[key]: value}), /Período inválido/, `${key}=${String(value)}`);
    }
    assert.doesNotThrow(() => budget({[key]: 1}));
    assert.doesNotThrow(() => budget({[key]: 24}));
  }
});

test('não devolve nenhuma parcela negativa', () => {
  const r = budget({tuition: 1000, installments: 24, transport: 1000, months: 24, upfront: 1000});
  for (const [key, value] of Object.entries(r)) assert.ok(value >= 0, `${key} = ${value}`);
});
