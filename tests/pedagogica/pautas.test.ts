import { describe, expect, it } from 'vitest';
import { calculateTrimesterAverage, calculateFinalDisciplineAverage, deriveElectronicStatusClass, evaluateAngolanStatus } from '@/features/pedagogica/components/pautas/assessment';
import { miniPautaDemo, finalPautaDemo, trimesterPautaDemo, examPautaDemo } from '@/features/pedagogica/components/pautas/pautas-demo';

describe('SIGA Pautas Angola - Contextos de Ensino e Decreto 424/25', () => {
  it('calculates trimester average MT = (MACT + NPT) / 2', () => {
    expect(calculateTrimesterAverage(14, 12)).toBe(13);
    expect(calculateTrimesterAverage(10, 8)).toBe(9);
    expect(calculateTrimesterAverage(null, 12)).toBeNull();
  });

  it('evaluates Angolan student status per cycle', () => {
    expect(evaluateAngolanStatus(14, 0, 'primario')).toBe('TRANSITA');
    expect(evaluateAngolanStatus(8, 0, 'primario')).toBe('NÃO TRANSITA');

    expect(evaluateAngolanStatus(11, 1, 'i_ciclo')).toBe('TRANSITA');
    expect(evaluateAngolanStatus(11, 3, 'i_ciclo')).toBe('NÃO TRANSITA');

    expect(evaluateAngolanStatus(9.5, 0, 'ii_ciclo')).toBe('ADMITIDO A EXAME');
    expect(evaluateAngolanStatus(12, 0, 'tecnico', 15)).toBe('APTO (PAP)');
    expect(evaluateAngolanStatus(12, 0, 'tecnico', 8)).toBe('NÃO APTO (PAP)');
  });

  it('validates document structures across all modes', () => {
    expect(miniPautaDemo.students.length).toBeGreaterThan(0);
    expect(trimesterPautaDemo.subjects.length).toBe(7);
    expect(finalPautaDemo.subjects.length).toBe(7);
    expect(examPautaDemo.students.length).toBeGreaterThan(0);
    expect(examPautaDemo.isTechnical).toBe(true);
  });
});
