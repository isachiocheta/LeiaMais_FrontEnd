import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function attachParticipationData(connection, users, { seed = false } = {}) {
  const { UniqueConstraintError } = createRequire(backendPackage)('sequelize');
  const rows = [];
  let nextId = 1;
  const now = () => new Date().toISOString();
  const add = (usuarioId, cicloId, paginaAtual, concluidaEm = null) => { const row = { id: nextId++, usuarioId, cicloId, paginaAtual, concluidaEm, criadoEm: now(), atualizadoEm: now() }; rows.push(row); return row; };
  if (seed) {
    const book = connection.books.find((item) => item.id === 2);
    book.totalPaginas = 20000;
    for (let index = 0; index < 15; index++) {
      const id = 100 + index;
      users.push({ ...users[0], id, nome: `Leitor de teste ${index + 1}`, email: `leitor${id}@fixture.test`, situacao: index === 14 ? 'INATIVO' : 'ATIVO' });
      const page = index % 3 === 0 ? book.totalPaginas : index * 100;
      add(id, 2, page, page === book.totalPaginas ? now() : null);
    }
    for (let index = 0; index < 13; index++) {
      const id = 100 + index;
      const book = connection.books[index % connection.books.length];
      connection.cycles.push({ id, nome: `Leitura histórica de teste ${index + 1}`, livroId: book.id, dataInicio: '2020-01-01', dataFim: '2020-01-31', situacao: 'CONCLUIDO', orientacoes: null, criadoEm: '2020-01-01T12:00:00Z', atualizadoEm: '2020-02-01T12:00:00Z' });
      const page = index % 2 ? Math.floor(book.totalPaginas / 2) : book.totalPaginas;
      add(1, id, page, page === book.totalPaginas ? '2020-01-30T12:00:00Z' : null);
    }
  }
  function model(row) {
    if (!row) return null;
    return { ...row, async update(data) { connection.checkAvailable(); Object.assign(row, data, { concluidaEm: data.concluidaEm instanceof Date ? data.concluidaEm.toISOString() : data.concluidaEm, atualizadoEm: now() }); } };
  }
  connection.models.Usuario = { async findByPk(id) { connection.checkAvailable(); return users.find((user) => user.id === id) ?? null; } };
  connection.models.ParticipacaoLeitura = {
    async findOne({ where }) { connection.checkAvailable(); return model(rows.find((row) => row.cicloId === where.cicloId && row.usuarioId === where.usuarioId)); },
    async create(data) {
      connection.checkAvailable();
      if (rows.some((row) => row.cicloId === data.cicloId && row.usuarioId === data.usuarioId)) throw new UniqueConstraintError({});
      return model(add(data.usuarioId, data.cicloId, data.paginaAtual, data.concluidaEm));
    },
  };
  const originalTransaction = connection.transaction.bind(connection);
  connection.transaction = async (options, task) => {
    const snapshot = structuredClone(rows);
    try { return await originalTransaction(options, task); }
    catch (error) { rows.splice(0, rows.length, ...snapshot); throw error; }
  };
  const originalQuery = connection.query.bind(connection);
  connection.query = async (sql, options = {}) => {
    if (!sql.includes('FROM participacoes_leitura') || sql.includes('AS possui')) {
      if (sql.includes('AS possui') && rows.some((row) => row.cicloId === options.bind?.id)) return [{ possui: true }];
      return originalQuery(sql, options);
    }
    connection.checkAvailable();
    const bind = options.bind || {};
    connection.calls.push({ sql, bind: { ...bind } });
    const personal = Object.hasOwn(bind, 'usuario');
    const selected = rows.filter((row) => (!personal || row.usuarioId === bind.usuario) && (bind.ciclo === null || row.cicloId === bind.ciclo));
    if (sql.includes('count(*)')) return [{ total: String(selected.length) }];
    selected.sort((a, b) => personal ? b.id - a.id : a.id - b.id);
    return selected.slice(bind.deslocamento, bind.deslocamento + bind.limite).map((row) => {
      const cycle = connection.cycles.find((item) => item.id === row.cicloId);
      const book = connection.books.find((item) => item.id === cycle.livroId);
      const { usuarioId, ...publicRow } = row;
      const result = { ...publicRow, percentual: Math.round(row.paginaAtual * 10000 / book.totalPaginas) / 100, concluida: row.paginaAtual === book.totalPaginas, livro: { id: book.id, titulo: book.titulo, totalPaginas: book.totalPaginas } };
      if (personal) result.ciclo = { id: cycle.id, nome: cycle.nome, situacao: cycle.situacao, dataInicio: cycle.dataInicio, dataFim: cycle.dataFim };
      else { const user = users.find((item) => item.id === usuarioId); result.usuario = { id: user.id, nome: user.nome }; }
      return structuredClone(result);
    });
  };
  return { rows };
}
