import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function createDashboardConnection({ users, books, cycles, meetings, participations, registrations = [] }) {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  const live = { users, books, cycles, meetings, participations, registrations };
  const initial = structuredClone(live);
  let unavailable = false;
  const calls = [], transactions = [];
  function available() { if (unavailable) throw new ConnectionError(new Error('Dashboard indisponível na fixture.')); }
  const records = (transaction) => transaction?.records ?? live;
  function usedBooks(r, minimum) {
    return r.books.map((b) => ({ id: b.id, titulo: b.titulo, autor: b.autor, generoId: b.generoId, totalPaginas: b.totalPaginas, totalCiclos: r.cycles.filter((c) => c.livroId === b.id).length }))
      .filter((b) => b.totalCiclos >= minimum).sort((a, b) => b.totalCiclos - a.totalCiclos || a.id - b.id);
  }
  function missingReaders(r, cycle) {
    return r.users.filter((u) => u.perfil === 'LEITOR' && u.situacao === 'ATIVO' && !r.participations.some((p) => p.cicloId === cycle && p.usuarioId === u.id)).sort((a, b) => a.id - b.id).map((u) => ({ id: u.id, nome: u.nome }));
  }
  return {
    live, calls, transactions,
    models: { Livro: {}, CicloLeitura: {
      async findOne({ where, transaction }) {
        available(); const r = records(transaction), matches = r.cycles.filter((c) => c.situacao === where.situacao);
        if (matches.length > 1) throw new Error('Fixture de dashboard exige um único ciclo em andamento.');
        const cycle = matches[0]; if (!cycle) return null;
        const b = r.books.find((b) => b.id === cycle.livroId);
        if (!b) return null;
        return { ...cycle, livro: { get() { return { id: b.id, titulo: b.titulo, autor: b.autor, totalPaginas: b.totalPaginas }; } } };
      },
      async findByPk(id, { transaction } = {}) { available(); return records(transaction).cycles.find((c) => c.id === id) ?? null; },
    } },
    async transaction(options, task) {
      available(); transactions.push(options);
      const transaction = { records: structuredClone(live), readOnly: options.readOnly };
      return task(transaction);
    },
    async query(sql, { bind = {}, transaction } = {}) {
      available(); calls.push({ sql, bind, transaction });
      if (!transaction?.readOnly) throw new Error('Dashboard deve usar transação somente de leitura.');
      if (sql === 'SET TRANSACTION READ ONLY') return [];
      const r = records(transaction);
      if (sql.includes('AS "totalParticipacoes"')) {
        const own = r.participations.filter((p) => p.usuarioId === bind.usuario && r.cycles.some((c) => c.id === p.cicloId));
        return [{ totalParticipacoes: own.length, leiturasConcluidas: own.filter((p) => { const c = r.cycles.find((c) => c.id === p.cicloId), b = r.books.find((b) => b.id === c.livroId); return p.paginaAtual === b.totalPaginas; }).length }];
      }
      if (sql.includes('FROM participacoes_leitura p') && sql.includes('AS "paginaAtual"')) {
        return r.participations.filter((p) => p.usuarioId === bind.usuario && (bind.ciclo == null || p.cicloId === bind.ciclo)).sort((a, b) => b.id - a.id).slice(bind.deslocamento, bind.deslocamento + bind.limite).map((p) => {
          const c = r.cycles.find((c) => c.id === p.cicloId), b = r.books.find((b) => b.id === c.livroId);
          return { id: p.id, cicloId: p.cicloId, paginaAtual: p.paginaAtual, percentual: Math.round(p.paginaAtual * 10000 / b.totalPaginas) / 100, concluida: p.paginaAtual === b.totalPaginas, concluidaEm: p.concluidaEm,
            criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm, livro: { id: b.id, titulo: b.titulo, totalPaginas: b.totalPaginas }, ciclo: { id: c.id, nome: c.nome, situacao: c.situacao, dataInicio: c.dataInicio, dataFim: c.dataFim } };
        });
      }
      if (sql.includes('FROM inscricoes_encontro i')) {
        const own = r.registrations.filter((i) => i.usuarioId === bind.usuario && (bind.encontro == null || i.encontroId === bind.encontro)).filter((i) => {
          const e = r.meetings.find((e) => e.id === i.encontroId);
          return e && (!bind.somenteFuturos || Date.parse(e.inicioEm) > Number(bind.agora)) && (!bind.somenteAgendados || e.situacao === 'AGENDADO');
        });
        if (/SELECT count\(\*\) AS total/i.test(sql)) return [{ total: own.length }];
        own.sort((a, b) => Date.parse(r.meetings.find((e) => e.id === a.encontroId).inicioEm) - Date.parse(r.meetings.find((e) => e.id === b.encontroId).inicioEm) || a.id - b.id);
        return own.slice(bind.deslocamento, bind.deslocamento + bind.limite).map((i) => {
          const e = r.meetings.find((e) => e.id === i.encontroId), c = r.cycles.find((c) => c.id === e.cicloId), b = r.books.find((b) => b.id === c.livroId);
          return { id: i.id, encontroId: e.id, criadoEm: i.criadoEm, atualizadoEm: i.atualizadoEm, inicioEm: e.inicioEm, encontro: { id: e.id, titulo: e.titulo, local: e.local, situacao: e.situacao }, ciclo: { id: c.id, nome: c.nome, situacao: c.situacao, dataInicio: c.dataInicio, dataFim: c.dataFim }, livro: { id: b.id, titulo: b.titulo, autor: b.autor } };
        });
      }
      if (sql.includes('AS "leitoresAtivos"')) return [{ leitoresAtivos: r.users.filter((u) => u.perfil === 'LEITOR' && u.situacao === 'ATIVO').length, leitoresPendentes: r.users.filter((u) => u.perfil === 'LEITOR' && u.situacao === 'PENDENTE').length,
        totalLivros: r.books.length, totalCiclos: r.cycles.length, encontrosAgendadosFuturos: r.meetings.filter((e) => e.situacao === 'AGENDADO' && Date.parse(e.inicioEm) > Number(bind.agora)).length }];
      if (sql.includes('AS "mediaProgresso"')) {
        const c = r.cycles.find((c) => c.id === bind.ciclo); if (!c) return [];
        const b = r.books.find((b) => b.id === c.livroId), rows = r.participations.filter((p) => p.cicloId === c.id);
        const conclusoes = rows.filter((p) => p.paginaAtual === b.totalPaginas).length;
        return [{ cicloId: c.id, nome: c.nome, livroId: b.id, participantes: rows.length, conclusoes, taxaConclusao: rows.length ? Math.round(10000 * conclusoes / rows.length) / 100 : 0,
          mediaProgresso: rows.length ? Math.round(rows.reduce((sum, p) => sum + p.paginaAtual * 100 / b.totalPaginas, 0) * 100 / rows.length) / 100 : 0 }];
      }
      if (sql.includes('AS obras')) return [{ total: usedBooks(r, bind.minimo).length }];
      if (sql.includes('HAVING COUNT(c.id) >= $minimo')) return usedBooks(r, bind.minimo).slice(bind.deslocamento, bind.deslocamento + bind.limite);
      if (sql.includes('NOT EXISTS')) {
        const rows = missingReaders(r, bind.ciclo);
        return /SELECT COUNT\(\*\)/i.test(sql) ? [{ total: rows.length }] : rows.slice(bind.deslocamento, bind.deslocamento + bind.limite);
      }
      throw new Error('Consulta fora do cenário de dashboard.');
    },
    setScenario(value) {
      if (value === 'unavailable') { unavailable = true; return; }
      if (!['normal', 'no-current', 'zero-participants', 'expired', 'empty', 'reader-page-zero', 'reader-progress', 'reader-complete', 'reader-rounded', 'reader-agenda'].includes(value)) return;
      unavailable = false;
      for (const key of Object.keys(live)) live[key].splice(0, live[key].length, ...structuredClone(initial[key]));
      const current = cycles.find((c) => c.situacao === 'EM_ANDAMENTO');
      if (value === 'no-current') cycles.forEach((c) => { if (c.situacao === 'EM_ANDAMENTO') c.situacao = 'CONCLUIDO'; });
      if (value === 'zero-participants' && current) participations.splice(0, participations.length, ...participations.filter((p) => p.cicloId !== current.id));
      if (value === 'expired' && current) { current.dataInicio = '2020-01-01'; current.dataFim = '2020-01-31'; }
      if (value === 'empty') for (const key of ['books', 'cycles', 'meetings', 'participations', 'registrations']) live[key].splice(0);
      if (value.startsWith('reader-') && current) {
        const book = books.find((b) => b.id === current.livroId), now = new Date().toISOString();
        if (value === 'reader-rounded') book.totalPaginas = 20000;
        let mine = participations.find((p) => p.usuarioId === 1 && p.cicloId === current.id);
        if (!mine) { mine = { id: 100000, usuarioId: 1, cicloId: current.id, criadoEm: now, atualizadoEm: now }; participations.push(mine); }
        mine.paginaAtual = value === 'reader-complete' ? book.totalPaginas : value === 'reader-rounded' ? book.totalPaginas - 1 : value === 'reader-progress' ? Math.floor(book.totalPaginas / 2) : 0;
        mine.concluidaEm = value === 'reader-complete' ? now : null;
        if (value === 'reader-agenda') for (let index = 0; index < 7; index++) {
          const id = 100000 + index;
          meetings.push({ id, cicloId: current.id, titulo: `Encontro pessoal de teste ${index + 1}`, inicioEm: `2030-02-${String(index + 1).padStart(2, '0')}T15:00:00.000Z`, situacao: 'AGENDADO', local: 'Biblioteca de teste', descricao: null, criadoEm: now, atualizadoEm: now });
          registrations.push({ id, usuarioId: 1, encontroId: id, criadoEm: now, atualizadoEm: now });
        }
      }
    },
  };
}
