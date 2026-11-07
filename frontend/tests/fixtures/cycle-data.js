import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';
import { civilToday } from '../../src/utils/civil-dates.js';

export function createCycleConnection({ catalogConnection, writable = false } = {}) {
  const { ConnectionError, Op } = createRequire(backendPackage)('sequelize');
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
  const participations = new Set(writable ? [1] : []);
  const meetings = writable ? [{ id: 1, cicloId: 2, situacao: 'AGENDADO', inicioEm: `${today}T15:00:00Z` }] : [];
  if (writable) cycles.find((cycle) => cycle.id === 4).situacao = 'CONCLUIDO';
  const books = catalogConnection?.books ?? Array.from({ length: 26 }, (_, index) => ({ id: index + 1, titulo: `Jardins da leitura ${String(index + 1).padStart(2, '0')}`, autor: 'Autoria da fixture', totalPaginas: 101 + index }));
  let nextId = 8;
  let mode = 'normal';
  function available() { if (mode === 'unavailable') throw new ConnectionError(new Error('Ciclos indisponíveis na fixture.')); }
  function publicCycle(cycle) {
    const book = books.find((item) => item.id === cycle.livroId);
    return { ...cycle, livro: book ? { id: book.id, titulo: book.titulo, autor: book.autor, totalPaginas: book.totalPaginas } : cycle.livro };
  }
  function modelCycle(cycle) {
    if (!cycle) return null;
    return {
      ...cycle,
      async update(data) { available(); Object.assign(cycle, data, { atualizadoEm: new Date().toISOString() }); },
      async destroy() { available(); cycles.splice(cycles.indexOf(cycle), 1); },
    };
  }
  return {
    cycles, calls, participations, meetings, books, checkAvailable: available,
    models: {
      Livro: { async findByPk(id) { available(); return books.find((book) => book.id === id) ?? null; } },
      CicloLeitura: {
        async findByPk(id) { available(); return modelCycle(cycles.find((cycle) => cycle.id === id)); },
        async findOne({ where }) { available(); return modelCycle(cycles.find((cycle) => cycle.situacao === where.situacao && cycle.id !== where.id?.[Op.ne])); },
        async create(data) {
          available();
          const now = new Date().toISOString();
          const cycle = { orientacoes: null, ...data, id: nextId++, criadoEm: now, atualizadoEm: now };
          cycles.push(cycle);
          return modelCycle(cycle);
        },
      },
      Encontro: { async findOne({ where }) { available(); return meetings.find((meeting) => meeting.cicloId === where.cicloId && meeting.situacao === where.situacao) ?? null; } },
    },
    async transaction(options, task) {
      available();
      const snapshot = structuredClone(cycles);
      try { return await task({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (error) { cycles.splice(0, cycles.length, ...snapshot); throw error; }
    },
    releaseCurrent() {
      cycles.filter((cycle) => cycle.situacao === 'EM_ANDAMENTO').forEach((cycle) => {
        meetings.filter((meeting) => meeting.cicloId === cycle.id && meeting.situacao === 'AGENDADO').forEach((meeting) => { meeting.situacao = 'CANCELADO'; });
        cycle.situacao = 'CONCLUIDO';
      });
    },
    setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; },
    async query(sql, { bind = {} } = {}) {
      calls.push({ sql, bind: { ...bind } });
      available();
      if (sql.includes('AS possui')) return [{ possui: participations.has(bind.id) || meetings.some((meeting) => meeting.cicloId === bind.id) }];
      if (sql.startsWith('SELECT id FROM encontros')) return meetings.filter((meeting) => meeting.cicloId === bind.id && (civilToday(Date.parse(meeting.inicioEm)) < bind.inicio || civilToday(Date.parse(meeting.inicioEm)) > bind.fim)).slice(0, 1).map(({ id }) => ({ id }));
      if (!sql.includes('FROM ciclos_leitura')) throw new Error('Consulta fora do cenário de ciclos.');
      if (bind.termo?.includes('lenta')) await new Promise((resolve) => setTimeout(resolve, 500));
      let selected = mode === 'empty' ? [] : [...cycles];
      if (bind.id !== undefined) return structuredClone(selected.filter((cycle) => cycle.id === bind.id).map(publicCycle));
      if (bind.termo !== undefined) {
        const q = bind.termo.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLocaleLowerCase('pt-BR');
        selected = selected.filter((cycle) => cycle.nome.toLocaleLowerCase('pt-BR').includes(q));
      }
      if (bind.situacao !== undefined) selected = selected.filter((cycle) => cycle.situacao === bind.situacao);
      if (sql.startsWith('SELECT count')) return [{ total: String(selected.length) }];
      const byName = sql.includes('ORDER BY c."nome"');
      const sign = /ORDER BY c\."[^"]+" DESC/.test(sql) ? -1 : 1;
      selected.sort((a, b) => ((byName ? a.nome.localeCompare(b.nome) : a.dataInicio.localeCompare(b.dataInicio)) || a.id - b.id) * sign);
      return structuredClone(selected.slice(bind.deslocamento, bind.deslocamento + bind.limite).map(publicCycle));
    },
  };
}
