import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function createCatalogConnection() {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  const genres = Array.from({ length: 62 }, (_, index) => ({ id: index + 1, nome: `Gênero da fixture ${String(index + 1).padStart(2, '0')}` }));
  genres[0].nome = 'Romance da fixture';
  genres[1].nome = 'Poesia da fixture';
  genres[60].nome = 'Fantasia da fixture';
  const books = Array.from({ length: 26 }, (_, index) => {
    const id = index + 1;
    const generoId = [1, 2, 61][index % 3];
    return {
      id, titulo: `${id <= 13 ? 'Jardins' : 'Caminhos'} da leitura ${String(id).padStart(2, '0')}`,
      autor: id % 2 ? 'Marina da fixture' : 'Autoria lenta da fixture', generoId,
      genero: genres.find((genre) => genre.id === generoId), totalPaginas: 100 + id,
      anoPublicacao: id % 5 === 0 ? null : 2000 + id,
      descricao: id === 3 ? null : 'Descrição exclusiva dos livros de teste. Estas obras pertencem somente à fixture de validação.',
      capaUrl: id === 2 ? 'https://127.0.0.1:1/capa-da-fixture.png' : null,
      criadoEm: '2026-01-02T12:00:00.000Z', atualizadoEm: '2026-02-03T12:00:00.000Z',
    };
  });
  const calls = [];
  const linkedBookIds = new Set([1]);
  let nextId = 27;
  let mode = 'normal';
  function available() {
    if (mode === 'unavailable') throw new ConnectionError(new Error('Catálogo indisponível na fixture.'));
  }
  function modelBook(book) {
    if (!book) return null;
    return {
      ...book,
      async update(data) { available(); Object.assign(book, data, { genero: genres.find((genre) => genre.id === (data.generoId ?? book.generoId)), atualizadoEm: new Date().toISOString() }); },
      async destroy() { available(); books.splice(books.indexOf(book), 1); },
    };
  }
  return {
    books, genres, calls, linkedBookIds,
    models: {
      Genero: { async findByPk(id) { available(); return genres.find((genre) => genre.id === id) || null; } },
      CicloLeitura: { async findOne({ where }) { available(); return linkedBookIds.has(where.livroId) ? { id: 1 } : null; } },
      Livro: {
        async findByPk(id) { available(); return modelBook(books.find((book) => book.id === id)); },
        async create(data) {
          available();
          const now = new Date().toISOString();
          const book = { anoPublicacao: null, descricao: null, capaUrl: null, ...data, id: nextId++, genero: genres.find((genre) => genre.id === data.generoId), criadoEm: now, atualizadoEm: now };
          books.push(book);
          return modelBook(book);
        },
      },
    },
    async transaction(options, task) {
      available();
      const snapshot = structuredClone(books);
      try { return await task({ LOCK: { KEY_SHARE: 'KEY_SHARE', UPDATE: 'UPDATE' } }); }
      catch (error) { books.splice(0, books.length, ...snapshot); throw error; }
    },
    setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; },
    async query(sql, { bind = {} } = {}) {
      calls.push({ sql, bind: { ...bind } });
      available();
      if (bind.termo?.includes('lenta')) await new Promise((resolve) => setTimeout(resolve, 1000));
      if (sql.includes('FROM generos')) {
        if (sql.startsWith('SELECT count')) return [{ total: String(genres.length) }];
        return structuredClone([...genres].sort((a, b) => a.nome.localeCompare(b.nome) || a.id - b.id).slice(bind.deslocamento, bind.deslocamento + bind.limite));
      }
      if (!sql.includes('FROM livros')) throw new Error('Consulta fora do cenário de catálogo.');
      let selected = mode === 'empty' ? [] : [...books];
      if (bind.id !== undefined) return structuredClone(selected.filter((book) => book.id === bind.id));
      if (bind.termo !== undefined) {
        const q = bind.termo.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLocaleLowerCase('pt-BR');
        selected = selected.filter((book) => book.titulo.toLocaleLowerCase('pt-BR').includes(q) || book.autor.toLocaleLowerCase('pt-BR').includes(q));
      }
      if (bind.genero !== undefined) selected = selected.filter((book) => book.generoId === bind.genero);
      if (sql.startsWith('SELECT count')) return [{ total: String(selected.length) }];
      const byYear = sql.includes('ORDER BY l."ano_publicacao"');
      const sign = /ORDER BY l\."[^"]+" DESC/.test(sql) ? -1 : 1;
      selected.sort((a, b) => {
        if (byYear && (a.anoPublicacao === null || b.anoPublicacao === null)) {
          if (a.anoPublicacao === null && b.anoPublicacao !== null) return 1;
          if (b.anoPublicacao === null && a.anoPublicacao !== null) return -1;
        }
        const compared = byYear ? (a.anoPublicacao ?? 0) - (b.anoPublicacao ?? 0) : a.titulo.localeCompare(b.titulo);
        return (compared || a.id - b.id) * sign;
      });
      return structuredClone(selected.slice(bind.deslocamento, bind.deslocamento + bind.limite));
    },
  };
}
