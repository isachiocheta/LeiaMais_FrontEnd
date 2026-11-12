import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DateTime } from 'luxon';

export const apiUrl = process.env.LEIA_E2E_API_URL;
export const adminEmail = 'admin@e2e.leia.example';
export const adminPassword = process.env.LEIA_E2E_ADMIN_PASSWORD;
if (!apiUrl || !adminPassword || !/^leia_demonstracao_[a-f0-9]{12}_teste$/.test(process.env.LEIA_E2E_DATABASE_NAME || '')) throw new Error('Execute pelo script test:e2e, com banco temporário próprio.');
export const password = () => `  ${randomBytes(12).toString('hex')} 🐝  `;
export const unique = (prefix) => `${prefix} ${randomBytes(4).toString('hex')}`;
export const dates = () => {
  const now = DateTime.now().setZone('America/Sao_Paulo');
  return { start: now.minus({ days: 2 }).toISODate(), end: now.plus({ days: 2 }).toISODate(), future: now.plus({ hours: 2 }).toFormat("yyyy-MM-dd'T'HH:mm"), iso: now.plus({ hours: 2 }).toISO() };
};

export async function secretFill(locator, value) {
  try { await locator.fill(value); } catch { throw new Error('Campo sensível indisponível.'); }
}
export async function login(page, email = adminEmail, value = adminPassword) {
  const navigation = await page.goto('/login');
  try { await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email); }
  catch { throw new Error(`Tela de login indisponível (HTTP ${navigation?.status()}).`); }
  await secretFill(page.getByRole('textbox', { name: 'Senha', exact: true }), value);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/minha-area/);
  await expect(page.locator('main .loading-state')).toHaveCount(0);
}
export async function api(context, path, { method = 'GET', data, status = 200 } = {}) {
  const headers = {};
  if (method !== 'GET') {
    const csrf = await context.request.get(`${apiUrl}/auth/csrf`);
    if (csrf.status() !== 200) throw new Error('Não foi possível obter CSRF real.');
    headers['X-CSRF-Token'] = (await csrf.json()).data.csrfToken;
  }
  const response = await context.request.fetch(`${apiUrl}/${path}`, { method, data, headers });
  expect(response.status(), `Status de ${method} ${path.split('?')[0]}`).toBe(status);
  return response.status() === 204 ? null : response.json();
}
export async function account(context, { active = true, name = unique('Leitor de teste') } = {}) {
  const email = `${randomBytes(6).toString('hex')}@e2e.leia.example`, senha = password();
  const { data } = await api(context, 'auth/cadastro', { method: 'POST', data: { nome: name, email, senha }, status: 201 });
  if (active) await api(context, `usuarios/${data.id}/situacao`, { method: 'PATCH', data: { situacao: 'ATIVO' } });
  return { ...data, email, password: senha };
}
export async function domain(context, { start = false, long = false } = {}) {
  const { data: genres } = await api(context, 'generos');
  const { data: book } = await api(context, 'livros', { method: 'POST', status: 201, data: {
    titulo: long ? 'Título'.repeat(25) : unique('Livro de teste'), autor: long ? 'Autoria'.repeat(16) : 'Autoria de teste', generoId: genres[0].id,
    totalPaginas: 20000, descricao: 'Texto seguro com quebra de linha.\n<script>texto sem interpretar HTML</script> ' + (long ? 'Palavra'.repeat(100) : ''), capaUrl: 'https://example.invalid/capa.jpg',
  } });
  const { start: dataInicio, end: dataFim, iso } = dates();
  const { data: cycle } = await api(context, 'ciclos', { method: 'POST', status: 201, data: { nome: long ? 'Ciclo'.repeat(24) : unique('Ciclo de teste'), livroId: book.id, dataInicio, dataFim, orientacoes: 'Orientação segura.\nSegunda linha.' } });
  if (start) await api(context, `ciclos/${cycle.id}`, { method: 'PATCH', data: { situacao: 'EM_ANDAMENTO' } });
  const { data: meeting } = await api(context, 'encontros', { method: 'POST', status: 201, data: { cicloId: cycle.id, titulo: long ? 'Encontro'.repeat(15) : unique('Encontro de teste'), inicioEm: iso, local: long ? 'Local'.repeat(36) : 'Sala de teste', descricao: 'Descrição segura.\nSegunda linha.' } });
  return { book, cycle, meeting };
}
export async function open(page, path) {
  const response = await page.goto(path);
  expect(response.status(), `Fallback SPA: ${path}`).toBe(200);
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main .loading-state')).toHaveCount(0);
}
export async function noOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('main *,header,footer')].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((element) => element.className) }));
  expect(result.scroll, `${label}: ${JSON.stringify(result.overflowing)}`).toBeLessThanOrEqual(result.width + 1);
  const dialogs = await page.locator('.MuiDialogContent-root').evaluateAll((elements) => elements.map((element) => ({ width: element.clientWidth, scroll: element.scrollWidth })));
  for (const dialog of dialogs) expect(dialog.scroll, `${label}: conteúdo do diálogo`).toBeLessThanOrEqual(dialog.width + 1);
}
export async function confirm(page, name) {
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name, exact: true }).click();
}
export async function sql(query, values = []) {
  const require = createRequire(join(process.env.LEIA_BACKEND_DIR, 'package.json'));
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.LEIA_E2E_DATABASE_URL });
  try {
    await client.connect();
    const actual = await client.query('SELECT current_database() AS name');
    if (actual.rows[0].name !== process.env.LEIA_E2E_DATABASE_NAME) throw new Error('Banco temporário não confirmado.');
    return (await client.query(query, values)).rows;
  } catch { throw new Error('Consulta de teste não concluída no banco exclusivo.'); }
  finally { await client.end(); }
}
