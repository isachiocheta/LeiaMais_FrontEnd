import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function createDashboardConnection({ users, books, cycles, meetings, participations }) {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  const live = { users, books, cycles, meetings, participations };
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
      if (!['normal', 'no-current', 'zero-participants', 'expired', 'empty'].includes(value)) return;
      unavailable = false;
      for (const key of Object.keys(live)) live[key].splice(0, live[key].length, ...structuredClone(initial[key]));
      const current = cycles.find((c) => c.situacao === 'EM_ANDAMENTO');
      if (value === 'no-current') cycles.forEach((c) => { if (c.situacao === 'EM_ANDAMENTO') c.situacao = 'CONCLUIDO'; });
      if (value === 'zero-participants' && current) participations.splice(0, participations.length, ...participations.filter((p) => p.cicloId !== current.id));
      if (value === 'expired' && current) { current.dataInicio = '2020-01-01'; current.dataFim = '2020-01-31'; }
      if (value === 'empty') for (const key of ['books', 'cycles', 'meetings', 'participations']) live[key].splice(0);
    },
  };
}
