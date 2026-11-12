import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { account, api, confirm, domain, login, noOverflow, open, sql } from './support.js';

test('diálogos com textos longos e realização no horário permitido pelo servidor real', async ({ page, context }) => {
  await login(page);
  const { book, cycle, meeting } = await domain(context, { long: true });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, `/encontros/${meeting.id}`);
    const trigger = page.getByRole('button', { name: 'Excluir encontro', exact: true });
    await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page, `${width} diálogo de exclusão com título e local longos`);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await open(page, '/admin/ciclos/novo');
    await page.getByRole('button', { name: 'Escolher livro', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.loading-state')).toHaveCount(0);
    await noOverflow(page, `${width} seleção de livro`);
    await page.keyboard.press('Escape');
  }
  await account(context, { active: false, name: 'Nome'.repeat(25) });
  await open(page, '/admin/leitores?situacao=PENDENTE');
  await page.getByRole('button', { name: /^Aprovar cadastro:/ }).click(); await confirm(page, 'Aprovar cadastro');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await noOverflow(page, `${width} mensagem com nome longo`);
  }
  await open(page, `/encontros/${meeting.id}`);
  await page.getByRole('button', { name: 'Realizar encontro', exact: true }).click(); await confirm(page, 'Realizar encontro');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  // Somente o registro próprio no banco exclusivo é preparado como encontro passado; o relógio e o backend não são simulados.
  await sql("UPDATE encontros SET inicio_em = now() - interval '1 hour' WHERE id = $1 AND ciclo_id = $2", [meeting.id, cycle.id]);
  await page.reload(); await expect(page.locator('main .loading-state')).toHaveCount(0);
  await page.getByRole('button', { name: 'Realizar encontro', exact: true }).click(); await confirm(page, 'Realizar encontro');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await api(context, `encontros/${meeting.id}`)).data.situacao).toBe('REALIZADO');
  await api(context, `encontros/${meeting.id}`, { method: 'DELETE', status: 204 });
  await api(context, `ciclos/${cycle.id}`, { method: 'DELETE', status: 204 });
  await api(context, `livros/${book.id}`, { method: 'DELETE', status: 204 });
});
