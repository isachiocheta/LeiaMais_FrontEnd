import { test, expect } from '@playwright/test';
import { api, apiUrl, confirm, login, open, password, secretFill, sql, unique } from './support.js';

test('cadastro pendente, aprovação, perfis, bloqueio administrativo, logout e sessão expirada', async ({ browser, page, context }) => {
  await login(page);
  const readerContext = await browser.newContext(); const readerPage = await readerContext.newPage();
  const email = `${unique('cadastro').replaceAll(' ', '')}@e2e.leia.example`, senha = password();
  try {
    await open(readerPage, '/cadastro');
    await readerPage.getByRole('textbox', { name: 'Nome', exact: true }).fill('Leitor pendente de teste');
    await readerPage.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
    await secretFill(readerPage.getByRole('textbox', { name: 'Senha', exact: true }), senha);
    await secretFill(readerPage.getByRole('textbox', { name: 'Confirmação de senha', exact: true }), senha);
    await readerPage.getByRole('button', { name: 'Solicitar cadastro', exact: true }).click();
    await expect(readerPage.getByRole('heading', { name: /cadastro recebido/i })).toBeVisible();
    expect((await readerContext.request.get(`${apiUrl}/auth/me`)).status()).toBe(401);
    await readerPage.goto('/login');
    await readerPage.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
    await secretFill(readerPage.getByRole('textbox', { name: 'Senha', exact: true }), senha);
    await readerPage.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(readerPage.getByRole('alert')).toContainText('Não foi possível entrar');
    await open(page, '/admin/leitores?situacao=PENDENTE');
    const row = page.getByRole('row').filter({ hasText: email });
    await row.getByRole('button', { name: /aprovar cadastro/i }).click();
    await confirm(page, 'Aprovar cadastro');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await login(readerPage, email, senha);
    await readerPage.goto('/admin/livros');
    await expect(readerPage).toHaveURL(/acesso-negado/);
    expect((await readerContext.request.get(`${apiUrl}/usuarios`)).status()).toBe(403);
    await readerPage.goto('/minha-area'); await readerPage.reload();
    await expect(readerPage.getByRole('heading', { name: 'Olá, Leitor pendente de teste!' })).toBeVisible();
    await sql("UPDATE sessoes SET sess = jsonb_set(jsonb_set(sess::jsonb, '{iniciadaEm}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint - 1860000)), '{expiraEm}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint - 60000))::json WHERE sess::jsonb #>> '{passport,user,id}' = $1", [String((await api(context, 'usuarios?situacao=ATIVO')).data.find((u) => u.email === email).id)]);
    await readerPage.reload(); await expect(readerPage).toHaveURL(/login/);
    await expect(readerPage.locator('main')).not.toContainText('Olá, Leitor pendente');
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/login/);
    expect((await context.request.get(`${apiUrl}/auth/me`)).status()).toBe(401);
  } finally { await readerContext.close(); }
});

