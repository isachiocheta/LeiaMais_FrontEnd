import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { account, api, confirm, domain, login, noOverflow, open } from './support.js';

async function inspect(page, label) {
  await noOverflow(page, label);
  await expect(page.locator('main h1')).toHaveCount(1);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
  if (problems.length) throw new Error(`${label}: ${JSON.stringify(problems)}`);
  if (!page.url().includes('sort=invalido')) await expect(page.locator('main .error-state'), label).toHaveCount(0);
  const invalidLinks = await page.locator('a[href]').evaluateAll((links) => links.filter((link) => {
    const url = new URL(link.href);
    if (url.origin !== location.origin) return true;
    if (url.hash && url.pathname === location.pathname) return !document.getElementById(decodeURIComponent(url.hash.slice(1)));
    return !/^\/(?:$|sobre$|login$|cadastro$|meu-perfil$|minha-area$|minha-agenda$|minhas-leituras$|acesso-negado$|catalogo(?:\/\d+)?$|ciclos(?:\/\d+)?$|encontros(?:\/\d+)?$|admin\/(?:dashboard$|leitores$|livros(?:\/(?:novo|\d+\/editar))?$|ciclos\/(?:novo|\d+\/(?:editar|participantes))$|encontros\/(?:novo|\d+\/(?:editar|inscritos))$))/.test(url.pathname);
  }).map((link) => link.getAttribute('href')));
  expect(invalidLinks, label).toEqual([]);
}

test('todas as páginas: 360, 768 e 1440, textos longos, capas quebradas, estados vazios, teclado e diálogos', async ({ browser, page, context }) => {
  test.setTimeout(360000);
  const failures = [];
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/', '/sobre', '/login', '/cadastro', '/rota-inexistente']) {
      await open(page, path);
      try { await inspect(page, `${width} ${path}`); } catch (error) { failures.push(error.message); }
    }
  }
  await login(page);
  expect((await api(context, 'dashboard/admin')).data.totalLivros).toBe(0);
  await page.setViewportSize({ width: 360, height: 1000 });
  for (const path of ['/catalogo', '/ciclos', '/encontros', '/admin/leitores', '/admin/dashboard']) {
    await open(page, path);
    try { await inspect(page, `vazio 360 ${path}`); } catch (error) { failures.push(error.message); }
  }
  const reader = await account(context, { name: 'Leitor'.repeat(16) });
  const { book, cycle, meeting } = await domain(context, { start: true, long: true });
  const paths = ['/', '/sobre', '/minha-area', '/catalogo', `/catalogo/${book.id}`, '/ciclos', `/ciclos/${cycle.id}`,
    '/encontros', `/encontros/${meeting.id}`, '/admin/encontros/novo', `/admin/encontros/${meeting.id}/editar`, `/admin/encontros/${meeting.id}/inscritos`,
    '/admin/ciclos/novo', `/admin/ciclos/${cycle.id}/editar`, `/admin/ciclos/${cycle.id}/participantes`, '/admin/livros', '/admin/livros/novo', `/admin/livros/${book.id}/editar`,
    '/admin/leitores', '/admin/dashboard', '/meu-perfil', '/minha-agenda', '/minhas-leituras', '/acesso-negado', '/catalogo/2147483647', '/ciclos/2147483647', '/encontros/2147483647',
    '/catalogo?q=SemResultadoExclusivoE2E', '/ciclos?sort=invalido', '/encontros?q=SemResultadoExclusivoE2E'];
  try {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of paths) {
        await open(page, path);
        try { await inspect(page, `${width} ${path}`); } catch (error) { failures.push(error.message); }
        if (process.env.LEIA_E2E_REVIEW_DIR && ['/catalogo', '/admin/dashboard', '/admin/leitores', '/meu-perfil'].includes(path)) {
          await mkdir(process.env.LEIA_E2E_REVIEW_DIR, { recursive: true });
          await page.screenshot({ path: join(process.env.LEIA_E2E_REVIEW_DIR, `${width}-${path.replaceAll('/', '_')}.png`), fullPage: true });
        }
      }
      await open(page, `/encontros/${meeting.id}`);
      const trigger = page.getByRole('button', { name: 'Excluir encontro', exact: true });
      await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
      await noOverflow(page, `${width} confirmação`);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).press('Escape');
      await expect(trigger).toBeFocused();
      await open(page, '/admin/ciclos/novo'); await page.getByRole('button', { name: 'Escolher livro', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();
      await noOverflow(page, `${width} seleção de livro`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Escolher livro', exact: true })).toBeFocused();
    }
    const readerContext = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const readerPage = await readerContext.newPage(); await login(readerPage, reader.email, reader.password);
      await expect(readerPage.getByRole('heading', { name: 'Você ainda não participa deste ciclo', exact: true })).toBeVisible();
      await open(readerPage, `/encontros/${meeting.id}`);
      await expect(readerPage.getByRole('button', { name: 'Inscrever-me', exact: true })).toBeDisabled();
      await api(readerContext, `ciclos/${cycle.id}/participacoes`, { method: 'POST', status: 201 });
      await api(readerContext, `ciclos/${cycle.id}/meu-progresso`, { method: 'PATCH', data: { paginaAtual: 19999 } });
      await api(readerContext, `encontros/${meeting.id}/inscricoes`, { method: 'POST', status: 201 });
      for (const width of [360, 768, 1440]) {
        await readerPage.setViewportSize({ width, height: 1000 });
        for (const path of ['/minha-area', '/minhas-leituras', '/minha-agenda', `/ciclos/${cycle.id}`, `/encontros/${meeting.id}`, '/meu-perfil']) {
          await open(readerPage, path);
          try { await inspect(readerPage, `leitor ${width} ${path}`); } catch (error) { failures.push(error.message); }
        }
        await readerPage.getByRole('link', { name: 'Pular para o conteúdo', exact: true }).focus();
        await readerPage.keyboard.press('Enter'); await expect(readerPage.locator('main')).toBeFocused();
        if (width === 360) {
          const menu = readerPage.getByRole('button', { name: 'Abrir menu', exact: true });
          await menu.press('Enter'); await expect(readerPage.getByRole('button', { name: 'Fechar menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
          await readerPage.getByRole('link', { name: 'Minha área', exact: true }).press('Enter');
          await expect(readerPage.getByRole('button', { name: 'Abrir menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
        }
      }
    } finally { await readerContext.close(); }
  } finally {
    await api(context, `encontros/${meeting.id}`, { method: 'PATCH', data: { situacao: 'CANCELADO' } });
    await api(context, `ciclos/${cycle.id}`, { method: 'PATCH', data: { situacao: 'CONCLUIDO' } });
  }
  expect(failures, 'Problemas encontrados na revisão de telas').toEqual([]);
});
