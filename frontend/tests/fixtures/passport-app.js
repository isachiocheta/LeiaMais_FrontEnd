import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const backendPackage = fileURLToPath(new URL('../../../../leia+_backend/backend/package.json', import.meta.url));

export async function createPassportFixture({ limiteCadastro = { maximo: 100 } } = {}) {
  const require = createRequire(backendPackage);
  const express = require('express');
  const bcrypt = require('bcrypt');
  const { UniqueConstraintError, ConnectionError } = require('sequelize');
  const { criarAutenticacao } = require('./autenticacao/rotas');
  const { carregarConfiguracaoSessao } = require('./configuracao/sessao');
  const { configurarHttp } = require('./intermediarios/http');
  const { tratarErros, rotaNaoEncontrada } = require('./intermediarios/erros');
  const sessions = new Map();
  let offset = 0;
  let registrationUnavailable = false;
  const password = '  Leitura da fixture 🐝  ';
  const hash = await bcrypt.hash(password, 4);
  const users = [
    { id: 1, nome: 'Leitora da fixture', email: 'leitor@fixture.test', perfil: 'LEITOR', situacao: 'ATIVO', sessionVersion: 0, senhaHash: hash },
    { id: 2, nome: 'Admin da fixture', email: 'admin@fixture.test', perfil: 'ADMIN_CLUBE', situacao: 'ATIVO', sessionVersion: 0, senhaHash: hash },
    { id: 3, nome: 'Pessoa inativa da fixture', email: 'inativo@fixture.test', perfil: 'LEITOR', situacao: 'INATIVO', sessionVersion: 0, senhaHash: hash },
  ];
  const pool = {
    async query(sql, params) {
      if (sql.startsWith('SELECT sess')) {
        const row = sessions.get(params[0]);
        return { rows: row && row.expire >= params[1] ? [{ sess: structuredClone(row.sess) }] : [] };
      }
      if (sql.startsWith('INSERT INTO')) {
        sessions.set(params[2], { sess: JSON.parse(JSON.stringify(params[0])), expire: params[1] });
        return { rows: [{ sid: params[2] }] };
      }
      if (sql.startsWith('DELETE FROM')) { sessions.delete(params[0]); return { rows: [] }; }
      throw new Error('Consulta fora do cenário de teste.');
    },
  };
  const model = {
    scope() { return this; },
    async findOne({ where }) { return users.find((user) => user.email === where.email) ?? null; },
    async findByPk(id) { return users.find((user) => user.id === id) ?? null; },
    async create(values) {
      if (registrationUnavailable) throw new ConnectionError(new Error('Persistência indisponível na fixture.'));
      if (users.some((user) => user.email === values.email)) throw new UniqueConstraintError({});
      const user = { ...values, id: Math.max(...users.map((item) => item.id)) + 1 };
      users.push(user);
      return user;
    },
  };
  const authentication = criarAutenticacao({
    configuracao: { ...carregarConfiguracaoSessao({ NODE_ENV: 'test', SESSION_SECRET: 'Segredo exclusivo da fixture frontend sem banco real', SESSION_COOKIE_SECURE: 'false' }), nomeCookie: 'leia.fixture.sid' },
    pool, obterUsuario: () => model, agora: () => Date.now() + offset,
    limiteLogin: { maximo: 100 }, limiteCadastro,
  });
  const app = express();
  configurarHttp(app, { origemPermitida: 'http://localhost:5173' });
  app.use('/api/auth', authentication.roteador);
  app.get('/__fixture', (req, res) => res.type('html').send('<!doctype html><html lang="pt-BR"><title>Fixture de autenticação</title><h1>Teste isolado de Passport</h1><p>Não acessa o banco real.</p><form method="post" action="/__fixture/expire"><button>Expirar sessões da fixture</button></form></html>'));
  app.post('/__fixture/expire', (req, res) => {
    offset += 31 * 60 * 1000;
    res.type('html').send('<!doctype html><html lang="pt-BR"><title>Fixture expirada</title><h1>Sessões da fixture expiradas</h1></html>');
  });
  app.use(rotaNaoEncontrada);
  app.use(tratarErros);
  return {
    app, password, sessions, users, close: authentication.encerrar,
    advance: (milliseconds) => { offset += milliseconds; },
    setRegistrationUnavailable: (value) => { registrationUnavailable = value; },
    verifyPassword: (email, candidate) => bcrypt.compare(candidate, users.find((user) => user.email === email).senhaHash),
  };
}
