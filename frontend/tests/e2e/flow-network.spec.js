import { test, expect } from '@playwright/test';
import { api, login, open } from './support.js';

test('erro de rede preserva dados anteriores e nova consulta recupera o painel sem repetir escrita', async ({ page, context }) => {
  await login(page); await open(page, '/admin/dashboard');
  const stamp = await page.locator('main time').getAttribute('datetime');
  await page.route('**/api/dashboard/admin', (route) => route.abort('failed'));
  await page.getByRole('button', { name: /atualizar indicadores/i }).click();
  await expect(page.locator('.dashboard-stale-alert')).toBeVisible();
  await expect(page.locator('main time')).toHaveAttribute('datetime', stamp);
  await page.unroute('**/api/dashboard/admin');
  await page.getByRole('button', { name: /atualizar indicadores/i }).click(); await expect(page.locator('.dashboard-stale-alert')).toHaveCount(0);
  expect((await api(context, 'auth/me')).data.perfil).toBe('ADMIN_CLUBE');
});
