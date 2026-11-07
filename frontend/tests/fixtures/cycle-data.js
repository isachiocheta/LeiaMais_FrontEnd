import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';
import { civilToday } from '../../src/utils/civil-dates.js';

export function createCycleConnection() {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  const today = civilToday();
  const cycles = [
    { id: 1, nome: 'Próximas leituras da fixture', dataInicio: '2099-01-01', dataFim: '2099-02-01', situacao: 'PLANEJADO' },
    { id: 2, nome: 'Leitura em andamento da fixture', dataInicio: today, dataFim: today, situacao: 'EM_ANDAMENTO' },
    { id: 3, nome: 'Leitura concluída da fixture', dataInicio: '2020-02-01', dataFim: '2020-02-29', situacao: 'CONCLUIDO' },
    { id: 4, nome: 'Leitura expirada da fixture', dataInicio: '2020-03-01', dataFim: '2020-03-31', situacao: 'EM_ANDAMENTO' },
    { id: 5, nome: 'Planejado no período da fixture', dataInicio: today, dataFim: today, situacao: 'PLANEJADO' },
    { id: 6, nome: 'Planejado expirado da fixture', dataInicio: '2020-01-01', dataFim: '2020-01-31', situacao: 'PLANEJADO' },
    { id: 7, nome: 'Leitura sem orientações da fixture', dataInicio: '2099-03-01', dataFim: '2099-04-01', situacao: 'PLANEJADO' },
  ].map((cycle) => ({ ...cycle, livroId: cycle.id, livro: { id: cycle.id, titulo: `Jardins da leitura ${String(cycle.id).padStart(2, '0')}`, autor: cycle.id % 2 ? 'Marina da fixture' : 'Autoria lenta da fixture', totalPaginas: 100 + cycle.id }, orientacoes: cycle.id === 7 ? null : 'Primeira orientação da fixture.\nSegunda linha: <strong>texto literal</strong>.', criadoEm: '2026-01-01T12:00:00Z', atualizadoEm: '2026-01-02T12:00:00Z' }));
  const calls = [];
  let mode = 'normal';
  return {
    cycles, calls,
    setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; },
    async query(sql, { bind = {} } = {}) {
      calls.push({ sql, bind: { ...bind } });
      if (mode === 'unavailable') throw new ConnectionError(new Error('Ciclos indisponíveis na fixture.'));
      if (!sql.includes('FROM ciclos_leitura')) throw new Error('Consulta fora do cenário de ciclos.');
      if (bind.termo?.includes('lenta')) await new Promise((resolve) => setTimeout(resolve, 500));
      let selected = mode === 'empty' ? [] : [...cycles];
      if (bind.id !== undefined) return structuredClone(selected.filter((cycle) => cycle.id === bind.id));
      if (bind.termo !== undefined) {
        const q = bind.termo.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLocaleLowerCase('pt-BR');
        selected = selected.filter((cycle) => cycle.nome.toLocaleLowerCase('pt-BR').includes(q));
      }
      if (bind.situacao !== undefined) selected = selected.filter((cycle) => cycle.situacao === bind.situacao);
      if (sql.startsWith('SELECT count')) return [{ total: String(selected.length) }];
      const byName = sql.includes('ORDER BY c."nome"');
      const sign = /ORDER BY c\."[^"]+" DESC/.test(sql) ? -1 : 1;
      selected.sort((a, b) => ((byName ? a.nome.localeCompare(b.nome) : a.dataInicio.localeCompare(b.dataInicio)) || a.id - b.id) * sign);
      return structuredClone(selected.slice(bind.deslocamento, bind.deslocamento + bind.limite));
    },
  };
}
