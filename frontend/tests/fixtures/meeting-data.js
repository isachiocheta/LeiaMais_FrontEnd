import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function createMeetingConnection(cycles) {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  const current = cycles.cycles.find((cycle) => cycle.id === 2);
  current.dataInicio = '2000-01-01'; current.dataFim = '2099-12-31';
  const meetings = Array.from({ length: 18 }, (_, index) => {
    const id = index + 1;
    const situacao = id <= 2 ? 'AGENDADO' : ['AGENDADO', 'CANCELADO', 'REALIZADO'][id % 3];
    const cicloId = situacao === 'AGENDADO' ? 2 : situacao === 'CANCELADO' ? 1 : 3;
    const inicioEm = id === 1 ? '2026-11-07T02:59:00.000Z' : id === 2 ? '2026-11-07T03:01:00.000Z'
      : cicloId === 1 ? `2099-01-${String(id).padStart(2, '0')}T03:30:00.000Z` : cicloId === 3 ? `2020-02-${String(id).padStart(2, '0')}T12:00:00.000Z` : `2026-11-${String(id).padStart(2, '0')}T15:00:00.000Z`;
    return { id, cicloId, titulo: `${id <= 9 ? 'Roda' : 'Conversa'} de leitura de teste ${String(id).padStart(2, '0')}`, inicioEm, local: `Sala de teste ${id}`, descricao: id === 5 ? null : 'Descrição do encontro de teste.\n<b>Texto literal, sem HTML.</b>', situacao, quantidadeInscritos: id % 4, criadoEm: '2020-01-01T12:00:00.000Z', atualizadoEm: '2026-01-01T12:00:00.000Z' };
  });
  const calls = [];
  let mode = 'normal';
  function project(meeting) {
    const cycle = cycles.cycles.find((cycle) => cycle.id === meeting.cicloId);
    return { ...meeting, ciclo: { id: cycle.id, nome: cycle.nome, situacao: cycle.situacao } };
  }
  return {
    meetings, calls,
    setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; },
    async query(sql, { bind = {} } = {}) {
      calls.push({ sql, bind: { ...bind } });
      if (mode === 'unavailable') throw new ConnectionError(new Error('Encontros indisponíveis na fixture.'));
      if (!sql.includes('FROM encontros e')) throw new Error('Consulta fora do cenário de encontros.');
      let selected = mode === 'empty' ? [] : [...meetings];
      if (bind.id !== undefined) return structuredClone(selected.filter((meeting) => meeting.id === bind.id).map(project));
      if (bind.termo !== undefined) {
        const q = bind.termo.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLocaleLowerCase('pt-BR');
        selected = selected.filter((meeting) => meeting.titulo.toLocaleLowerCase('pt-BR').includes(q));
        if (q.includes('lenta')) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (bind.ciclo !== undefined) selected = selected.filter((meeting) => meeting.cicloId === bind.ciclo);
      if (bind.situacao !== undefined) selected = selected.filter((meeting) => meeting.situacao === bind.situacao);
      if (sql.startsWith('SELECT count')) return [{ total: String(selected.length) }];
      const byTitle = sql.includes('ORDER BY e."titulo"');
      const sign = /ORDER BY e\."[^"]+" DESC/.test(sql) ? -1 : 1;
      selected.sort((a, b) => ((byTitle ? a.titulo.localeCompare(b.titulo) : Date.parse(a.inicioEm) - Date.parse(b.inicioEm)) || a.id - b.id) * sign);
      return structuredClone(selected.slice(bind.deslocamento, bind.deslocamento + bind.limite).map(project));
    },
  };
}
