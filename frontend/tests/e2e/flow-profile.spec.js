import { test, expect } from '@playwright/test';
import { account, api, login, open, password, secretFill } from './support.js';

test('perfil, senha inválida, confirmação, troca válida e reautenticação de todas as sessões', async ({ browser, page, context }) => {
  await login(page); const reader = await account(context);
  const first = await browser.newContext(), second = await browser.newContext();
  try {
    const firstPage = await first.newPage(), secondPage = await second.newPage();
    await login(firstPage, reader.email, reader.password); await login(secondPage, reader.email, reader.password);
    await open(firstPage, '/meu-perfil');
    await firstPage.getByRole('textbox', { name: 'Nome', exact: true }).fill('Nome atualizado pela interface');
    await firstPage.getByRole('button', { name: 'Salvar nome', exact: true }).click();
    await expect(firstPage.getByText('Seu nome foi atualizado.', { exact: true })).toBeVisible();
    const next = password();
    const fill = async (current, confirmation) => {
      await secretFill(firstPage.getByRole('textbox', { name: 'Senha atual', exact: true }), current);
      await secretFill(firstPage.getByRole('textbox', { name: 'Nova senha', exact: true }), next);
      await secretFill(firstPage.getByRole('textbox', { name: 'Confirme a nova senha', exact: true }), confirmation);
      await firstPage.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    };
    await fill(reader.password, 'diferente');
    await expect(firstPage.getByText('As senhas precisam ser exatamente iguais, inclusive os espaços.', { exact: true })).toBeVisible();
    await fill('incorreta', next); await expect(firstPage.getByText('A senha atual não foi aceita. Confira o valor informado.', { exact: true })).toBeVisible();
    expect((await api(first, 'auth/me')).data.id).toBe(reader.id);
    await fill(reader.password, next); await expect(firstPage).toHaveURL(/login/);
    await expect(firstPage.getByRole('status')).toContainText('Sua senha foi alterada');
    await secondPage.reload(); await expect(secondPage).toHaveURL(/login/);
    await login(firstPage, reader.email, next); await expect(firstPage.locator('main')).toContainText('Nome atualizado pela interface');
    expect(await firstPage.evaluate(() => Object.values(localStorage).some((value) => /senha|csrf|@e2e\.leia|Nome atualizado pela interface/i.test(value)))).toBe(false);
  } finally { await first.close(); await second.close(); }
});

