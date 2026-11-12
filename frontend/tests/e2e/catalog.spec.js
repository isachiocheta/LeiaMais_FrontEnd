import { test, expect } from '@playwright/test';
import { api, login, noOverflow, open, unique } from './support.js';

test('catálogo: busca, filtros combinados, ordenação, paginação real, voltar e recarregar', async ({ page, context }) => {
  await login(page);
  const prefix = unique('BuscaE2E'), genres = (await api(context, 'generos')).data, ids = [];
  try {
    for (let i = 0; i < 7; i++) ids.push((await api(context, 'livros', { method: 'POST', status: 201, data: { titulo: `${prefix} ${i}`, autor: 'Autor da busca', generoId: genres[0].id, totalPaginas: 100, anoPublicacao: 2000 + i } })).data.id);
    await page.setViewportSize({ width: 360, height: 1000 });
    await open(page, '/catalogo?pageSize=6');
    await page.getByRole('searchbox', { name: 'Buscar por título ou autor', exact: true }).fill(prefix);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(prefix);
    await page.getByRole('combobox', { name: /^Gênero/ }).selectOption(String(genres[0].id));
    await page.getByRole('combobox', { name: 'Ordenar por', exact: true }).selectOption('anoPublicacao');
    await page.getByRole('combobox', { name: 'Direção', exact: true }).selectOption('desc');
    await expect(page.locator('.catalog-results-heading')).toContainText('7 livros encontrados');
    await expect(page.locator('.book-card')).toHaveCount(6);
    await expect(page.locator('.book-card').first()).toContainText(`${prefix} 6`);
    await page.getByRole('button', { name: 'Ir para a página 2', exact: true }).click();
    await expect(page.locator('.book-card')).toHaveCount(1); await noOverflow(page, 'paginação em 360');
    const url = page.url(); await page.reload(); await expect(page.locator('.book-card')).toHaveCount(1);
    await page.locator('.book-card h2 a').click(); await expect(page.locator('main h1')).toHaveText(`${prefix} 0`);
    await page.goBack(); await expect(page).toHaveURL(url); await expect(page.locator('.book-card')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Buscar por título ou autor', exact: true }).fill(`${prefix} 6`);
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).not.toBe('2');
    await expect(page.locator('.catalog-results-heading')).toContainText('1 livro encontrado');
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await expect(page).toHaveURL(/\/catalogo$/);
    const longBook = (await api(context, 'livros', { method: 'POST', status: 201, data: { titulo: 'Título'.repeat(25), autor: 'Autoria'.repeat(16), generoId: genres[0].id, totalPaginas: 100, descricao: 'Palavra'.repeat(200), capaUrl: 'https://example.invalid/capa.jpg' } })).data;
    ids.push(longBook.id);
    for (let i = 0; i < 3; i++) {
      await open(page, `/admin/livros/${longBook.id}/editar`);
      await noOverflow(page, 'formulário de livro antes de carregar a capa');
      await page.locator('.book-form-preview').scrollIntoViewIfNeeded();
      await expect(page.locator('.book-form-preview .book-cover-fallback')).toBeVisible();
      await noOverflow(page, 'formulário de livro após falha de capa');
    }
  } finally { for (const id of ids) await api(context, `livros/${id}`, { method: 'DELETE', status: 204 }); }
});
