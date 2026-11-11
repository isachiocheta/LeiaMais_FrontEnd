import { createRequire } from 'node:module';
import { backendPackage } from './passport-app.js';

export function attachProfileData(model, users) {
  const { ConnectionError } = createRequire(backendPackage)('sequelize');
  let mode = 'normal';
  let conflict = false;
  const calls = [];
  const available = () => { if (mode === 'unavailable') throw new ConnectionError(new Error('Persistência indisponível no teste de perfil.')); };
  model.findByPk = async (id, options = {}) => {
    available();
    const row = users.find((item) => item.id === id);
    calls.push({ operation: 'read', id, locked: Boolean(options.lock), attributes: options.attributes });
    if (!row) return null;
    const data = Object.fromEntries((options.attributes ?? Object.keys(row)).map((key) => [key, row[key]]));
    if (conflict && options.lock && options.attributes?.includes('senhaHash')) {
      conflict = false;
      data.senhaHash = 'credencial concorrente da fixture';
    }
    return { ...data, async update(values, updateOptions) {
      available();
      if (mode === 'conflict') {
        const { OptimisticLockError } = createRequire(backendPackage)('sequelize');
        throw new OptimisticLockError({ modelName: 'Usuario' });
      }
      calls.push({ operation: 'update', id, fields: updateOptions.fields });
      Object.assign(row, values); Object.assign(this, values);
      return this;
    } };
  };
  if (!model.sequelize) {
    let queue = Promise.resolve();
    model.sequelize = { async transaction(task) {
      const previous = queue; let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone(users);
      try { available(); return await task({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (error) { users.splice(0, users.length, ...snapshot); throw error; }
      finally { release(); }
    } };
  }
  return {
    calls,
    conflictNextPassword() { conflict = true; },
    setMode(value) { if (['normal', 'conflict', 'unavailable'].includes(value)) mode = value; },
  };
}
