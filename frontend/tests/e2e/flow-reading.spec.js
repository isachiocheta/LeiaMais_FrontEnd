import { test, expect } from '@playwright/test';
import { account, api, confirm, domain, login, open, sql } from './support.js';

test('participação, redução e conclusão exata, inscrição/cancelamento e dashboards reais', async ({ browser, page, context }) => {
  await login(page); const reader = await account(context), { book, cycle, meeting } = await domain(context, { start: true });
  const readerContext = await browser.newContext({ timezoneId: 'America/Los_Angeles' }); const readerPage = await readerContext.newPage();
  try {
    await login(readerPage, reader.email, reader.password);
    await open(readerPage, `/ciclos/${cycle.id}`);
    await readerPage.getByRole('button', { name: 'Participar deste ciclo', exact: true }).click();
    await expect(readerPage.getByRole('spinbutton', { name: 'Página atual', exact: true })).toHaveValue('0');
    for (const value of ['10000', '19999', '20000', '10']) {
      await readerPage.getByRole('spinbutton', { name: 'Página atual', exact: true }).fill(value);
      await readerPage.getByRole('button', { name: 'Salvar página', exact: true }).click();
      await expect(readerPage.getByRole('button', { name: 'Salvar página', exact: true })).toBeEnabled();
      await expect.poll(async () => (await api(readerContext, `ciclos/${cycle.id}/minha-participacao`)).data.paginaAtual).toBe(Number(value));
    }
    await open(readerPage, `/encontros/${meeting.id}`);
    await readerPage.getByRole('button', { name: 'Inscrever-me', exact: true }).click();
    await expect(readerPage.getByRole('button', { name: 'Cancelar minha inscrição', exact: true })).toBeVisible();
    await readerPage.goto('/minha-area');
    await expect(readerPage.getByRole('link', { name: meeting.titulo, exact: true })).toBeVisible();
    const mine = (await api(readerContext, 'dashboard/me')).data;
    expect(mine.totalParticipacoes).toBe(1); expect(mine.leiturasConcluidas).toBe(0); expect(mine.minhaParticipacao.paginaAtual).toBe(10);
    await open(page, '/admin/dashboard');
    const dashboard = (await api(context, 'dashboard/admin')).data;
    expect(dashboard.cicloAtual.id).toBe(cycle.id);
    const stored = await sql('SELECT count(*)::integer AS total FROM livros');
    expect(dashboard.totalLivros).toBe(stored[0].total);
    await expect(page.locator('main')).toContainText(cycle.nome);
    await open(readerPage, `/encontros/${meeting.id}`);
    await readerPage.getByRole('button', { name: 'Cancelar minha inscrição', exact: true }).click(); await confirm(readerPage, 'Confirmar cancelamento');
    await expect(readerPage.getByRole('dialog')).toHaveCount(0);
    expect((await api(readerContext, 'dashboard/me')).data.totalInscricoesFuturas).toBe(0);
    await open(readerPage, '/minhas-leituras'); await expect(readerPage.locator('main')).toContainText(book.titulo);
    await api(context, `encontros/${meeting.id}`, { method: 'PATCH', data: { situacao: 'CANCELADO' } });
    await api(context, `ciclos/${cycle.id}`, { method: 'PATCH', data: { situacao: 'CONCLUIDO' } });
    await open(readerPage, `/ciclos/${cycle.id}`); await expect(readerPage.getByRole('button', { name: 'Salvar página', exact: true })).toHaveCount(0);
  } finally { await readerContext.close(); }
});

