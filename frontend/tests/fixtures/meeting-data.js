import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function createMeetingConnection(cycles) {
  const { ConnectionError, UniqueConstraintError } = createRequire(backendPackage)('sequelize');
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
  const registrations = meetings.flatMap((meeting) => Array.from({ length: meeting.quantidadeInscritos }, (_, index) => ({ id: meeting.id * 10 + index, encontroId: meeting.id, usuarioId: 100 + index, criadoEm: '2020-01-01T12:00:00.000Z', atualizadoEm: '2020-01-01T12:00:00.000Z' })));
  let nextRegistrationId = 1000;
  let nextId = 19;
  let mode = 'normal';
  function available() { if (mode === 'unavailable') throw new ConnectionError(new Error('Encontros indisponíveis na fixture.')); }
  function syncCycles() { cycles.meetings.splice(0, cycles.meetings.length, ...meetings.map(({ id, cicloId, situacao, inicioEm }) => ({ id, cicloId, situacao, inicioEm }))); }
  function model(meeting) {
    if (!meeting) return null;
    return { ...meeting, inicioEm: new Date(meeting.inicioEm),
      async update(data) { available(); Object.assign(meeting, data, { inicioEm: data.inicioEm instanceof Date ? data.inicioEm.toISOString() : data.inicioEm ?? meeting.inicioEm, atualizadoEm: new Date().toISOString() }); syncCycles(); },
      async destroy() { available(); meetings.splice(meetings.indexOf(meeting), 1); registrations.splice(0, registrations.length, ...registrations.filter((row) => row.encontroId !== meeting.id)); syncCycles(); },
    };
  }
  const meetingModel = {
    async findByPk(id) { available(); return model(meetings.find((meeting) => meeting.id === id)); },
    async findOne({ where }) { available(); return model(meetings.find((meeting) => meeting.cicloId === where.cicloId && meeting.situacao === where.situacao)); },
    async create(data) { available(); const now = new Date().toISOString(); const meeting = { descricao: null, ...data, id: nextId++, inicioEm: data.inicioEm.toISOString(), quantidadeInscritos: 0, criadoEm: now, atualizadoEm: now }; meetings.push(meeting); syncCycles(); return model(meeting); },
  };
  cycles.models.Encontro = meetingModel;
  syncCycles();
  function project(meeting) {
    const cycle = cycles.cycles.find((cycle) => cycle.id === meeting.cicloId);
    return { ...meeting, quantidadeInscritos: registrations.filter((row) => row.encontroId === meeting.id).length, ciclo: { id: cycle.id, nome: cycle.nome, situacao: cycle.situacao } };
  }
  return {
    meetings, calls, registrations,
    models: { ...cycles.models, Encontro: meetingModel, InscricaoEncontro: {
      async findOne({ where }) { available(); const row = registrations.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)); return row ? { ...row, async destroy() { registrations.splice(registrations.indexOf(row), 1); } } : null; },
      async create(data) { available(); if (registrations.some((row) => row.usuarioId === data.usuarioId && row.encontroId === data.encontroId)) throw new UniqueConstraintError({}); const now = new Date().toISOString(); const row = { ...data, id: nextRegistrationId++, criadoEm: now, atualizadoEm: now }; registrations.push(row); return row; },
    } },
    async transaction(options, task) {
      available();
      const snapshot = structuredClone(meetings); const links = structuredClone(registrations);
      try { return await cycles.transaction(options, task); }
      catch (error) { meetings.splice(0, meetings.length, ...snapshot); registrations.splice(0, registrations.length, ...links); syncCycles(); throw error; }
    },
    setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; },
    async query(sql, { bind = {} } = {}) {
      calls.push({ sql, bind: { ...bind } });
      available();
      if (sql.includes('FROM inscricoes_encontro') && !sql.includes('quantidadeInscritos')) {
        const personal = bind.usuario !== undefined;
        let selected = mode === 'empty' ? [] : registrations.filter((row) => (!personal || row.usuarioId === bind.usuario) && (bind.encontro == null || row.encontroId === bind.encontro));
        if (bind.somenteFuturos) selected = selected.filter((row) => Date.parse(meetings.find((m) => m.id === row.encontroId).inicioEm) > Number(bind.agora));
        if (bind.somenteAgendados) selected = selected.filter((row) => meetings.find((m) => m.id === row.encontroId).situacao === 'AGENDADO');
        if (sql.includes('count(*) AS total')) return [{ total: String(selected.length) }];
        selected.sort((a, b) => (personal ? Date.parse(meetings.find((m) => m.id === a.encontroId).inicioEm) - Date.parse(meetings.find((m) => m.id === b.encontroId).inicioEm) : 0) || a.id - b.id);
        return Promise.all(selected.slice(bind.deslocamento, bind.deslocamento + bind.limite).map(async (row) => {
          if (!personal) { const user = await cycles.models.Usuario.findByPk(row.usuarioId); return { id: row.id, encontroId: row.encontroId, criadoEm: row.criadoEm, usuario: { id: user.id, nome: user.nome } }; }
          const meeting = meetings.find((m) => m.id === row.encontroId), cycle = cycles.cycles.find((c) => c.id === meeting.cicloId), book = cycles.books.find((b) => b.id === cycle.livroId);
          return { id: row.id, encontroId: row.encontroId, criadoEm: row.criadoEm, atualizadoEm: row.atualizadoEm, inicioEm: meeting.inicioEm,
            encontro: { id: meeting.id, titulo: meeting.titulo, local: meeting.local, situacao: meeting.situacao }, ciclo: { id: cycle.id, nome: cycle.nome, situacao: cycle.situacao, dataInicio: cycle.dataInicio, dataFim: cycle.dataFim }, livro: { id: book.id, titulo: book.titulo, autor: book.autor } };
        }));
      }
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
