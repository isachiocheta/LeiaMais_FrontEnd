import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function attachUserAdministration(model, users, { seed = false } = {}) {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  if (seed) for (let i = 1; i <= 19; i++) users.push({ ...users[0], id: Math.max(...users.map((u) => u.id)) + 1, nome: `Cadastro de teste ${String(i).padStart(2, '0')}`, email: `cadastro${String(i).padStart(2, '0')}@fixture.test`, situacao: ['PENDENTE', 'ATIVO', 'INATIVO'][(i - 1) % 3], sessionVersion: 0, criadoEm: `2026-11-${String(i).padStart(2, '0')}T12:00:00.000Z` });
  const calls = [];
  let mode = 'normal', queue = Promise.resolve();
  const available = () => { if (mode === 'unavailable') throw new ConnectionError(new Error('Administração indisponível na fixture.')); };
  function wrap(row) {
    if (!row) return null;
    const view = { ...row, async update(data) { available(); Object.assign(row, data); Object.assign(view, data); return view; } };
    return view;
  }
  const findCredentials = model.findOne.bind(model);
  model.findOne = async (options) => {
    if (Object.hasOwn(options.where, 'email')) return findCredentials(options);
    available(); return wrap(users.find((row) => Object.entries(options.where).every(([key, value]) => row[key] === value)));
  };
  model.findAndCountAll = async ({ where, order, limit, offset, attributes }) => {
    available(); calls.push({ where: { ...where }, order, limit, offset, attributes });
    const selected = mode === 'empty' ? [] : users.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value));
    selected.sort((a, b) => {
      for (const [column, direction] of order) {
        const field = column === 'criado_em' ? 'criadoEm' : column;
        const av = a[field] ?? '2026-10-01T12:00:00Z', bv = b[field] ?? '2026-10-01T12:00:00Z';
        const comparison = typeof av === 'number' ? av - bv : av.localeCompare(bv, 'pt-BR');
        if (comparison) return comparison * (direction === 'DESC' ? -1 : 1);
      }
      return 0;
    });
    return { rows: selected.slice(offset, offset + limit).map(wrap), count: selected.length };
  };
  model.sequelize = { async transaction(task) {
    const previous = queue; let release; queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const snapshot = structuredClone(users);
    try { available(); return await task({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { users.forEach((row) => { const original = snapshot.find((item) => item.id === row.id); if (original) Object.assign(row, original); }); throw error; }
    finally { release(); }
  } };
  return { calls, setMode(value) { if (['normal', 'empty', 'unavailable'].includes(value)) mode = value; } };
}
