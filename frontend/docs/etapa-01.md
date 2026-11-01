# Leia+ — entrega da etapa 01

Implementação local da página inicial pública, em React com JavaScript/JSX,
Vite, React Router e Material UI. Todos os arquivos de aplicação desta entrega
foram criados em `frontend/`; a pasta estava vazia antes da implementação.

## Inspeção anterior à implementação

- Backend de referência: `/home/isabela/Documentos/ChatGPT/leia+_backend/backend`.
  Também existe uma implementação em `/home/isabela/Documentos/ChatGPT/backend/backend`.
  Foi adotada a pasta específica `leia+_backend`, sem modificar nenhuma das duas.
- Não foi encontrado arquivo OpenAPI/Swagger no backend de referência.
  O contrato foi conferido diretamente em `app.js`, `autenticacao/rotas.js`,
  `autenticacao/passaporte.js`, `autenticacao/csrf.js`, `configuracao/sessao.js`,
  `intermediarios/http.js`, `servicos/usuarios.js` e nas rotas dos recursos.
- O ZIP foi lido como referência visual, sem executar seus scripts.
  Foram examinados `style.css`, `tela1.html` e as imagens, incluindo as capas.
  Apenas `flor1.png` e `flor2.png` foram copiadas. Os logos com o nome antigo
  foram descartados. O Bootstrap e as fontes remotas da referência não foram incorporados.

## Contrato observado para as próximas etapas

Esta etapa não implementa integração HTTP nem executa fluxos de autenticação.
Os itens abaixo registram a leitura do código do servidor.

- API prevista em `http://localhost:3000`; origem permitida padrão do backend:
  `http://localhost:5173`, com credenciais habilitadas no CORS.
- Passport com cookie `leia.sid`, HttpOnly, SameSite=Lax e prazo absoluto de
  30 minutos. Sessões persistidas no servidor; não há JWT.
- `GET /api/auth/csrf`: responde `{ data: { csrfToken } }` e cria a sessão
  anônima usada pelo cadastro/login. Mutações usam o cabeçalho `X-CSRF-Token`.
- `POST /api/auth/cadastro`: aceita somente `nome`, `email` e `senha`;
  retorna 201 com usuário público em `data`, como `LEITOR` e `PENDENTE`.
  Não realiza login automático. Nome: 2–100 caracteres; e-mail: até 254;
  senha: mínimo de 10 caracteres e máximo de 72 bytes UTF-8, preservando espaços.
- `POST /api/auth/login`: recebe `email` e `senha`, exige CSRF e aceita apenas
  contas `ATIVO`. Retorna usuário público em `data`. A sessão é regenerada;
  o token CSRF anônimo não é preservado e deverá ser obtido novamente após login.
- `GET /api/auth/me`: retorna o usuário autenticado em `data`.
- `POST /api/auth/logout`: exige autenticação e CSRF; retorna 204.
- Usuário público: `id`, `nome`, `email`, `perfil`, `situacao`.
  Os perfis internos são `ADMIN_CLUBE` e `LEITOR`.
- A administração decide a situação por `PATCH /api/usuarios/:id/situacao`.
- Recursos autenticados disponíveis: gêneros, livros, ciclos, encontros,
  participações em ciclos, progresso, inscrições em encontros e perfil.
  Listas usam `data` e `meta`; erros usam `error`.
- O backend de referência não registra `/api/dashboard`, presente apenas na outra
  implementação encontrada. Essa diferença deverá ser resolvida pela escolha
  explícita do backend antes de uma futura etapa de indicadores.

## Arquivos da entrega

- Configuração: `package.json`, `package-lock.json`, `vite.config.js`,
  `.gitignore`, `index.html` e `public/favicon.svg`.
- Entrada e aplicação: `src/main.jsx`, `src/app/App.jsx`, `src/app/theme.js`.
- Página: `src/pages/HomePage.jsx`.
- Componentes: `src/components/Brand.jsx`, `SiteHeader.jsx`, `SiteFooter.jsx`
  e `BookIllustration.jsx`.
- Estilos: `src/styles/tokens.js` e `src/styles/global.css`.
- Imagens locais: `src/assets/flor1.png` e `src/assets/flor2.png`.
- Diretórios reservados, com `.gitkeep`: `src/services/`, `src/hooks/` e `src/utils/`.
- Registro de inspeção e validação: este documento. Nenhum README foi criado ou atualizado.

## Identidade e acessibilidade

Marca exclusivamente textual Leia+, caixa creme com bordas e sombra deslocada,
fundo azul, destaques amarelos, faixa xadrez em CSS e flores decorativas com
texto alternativo vazio. A ilustração de livro é um SVG de apresentação,
sem representar um livro ou dado do catálogo.

Os tokens de cores, espaçamentos, raios, bordas e sombras são compartilhados
entre ThemeProvider e variáveis CSS. Poppins nos pesos 400, 500, 600 e 700 é
empacotada localmente pelo Fontsource, com Segoe UI, Arial e sans-serif como
alternativas. A página não precisa buscar fontes ou imagens em serviços externos.

Contrastes calculados pela fórmula de luminância relativa sRGB:

| Texto / fundo | Razão |
| --- | --- |
| `#1D1D1D` / creme | 15,43:1 |
| `#1D1D1D` / azul | 4,62:1 |
| `#1D1D1D` / amarelo | 10,36:1 |
| `#1D1D1D` / areia | 12,08:1 |
| `#4D4A43` / creme | 8,09:1 |
| `#4D4A43` / areia | 6,33:1 |
| `#35516B` / creme | 7,57:1 |

O azul original `#6A89A7` sobre creme alcança somente 3,34:1;
por isso não foi usado para texto pequeno. A navegação inclui foco visível,
atalho para o conteúdo, títulos hierárquicos, regiões semânticas e respeito
à preferência por movimento reduzido. Todas as chamadas possuem destino real.

## Verificações executadas

- Consulta ao registro oficial npm para versões estáveis e compatibilidade dos pares.
- Instalação com sucesso e `package-lock.json` preservado.
- `npm ci --offline`: reinstalação reproduzível concluída pelo lockfile.
- `npm ls --depth=0`: árvore final sem dependências inválidas ou extras.
- `npm run build`: build final concluído, com 382 módulos transformados.
- `npm run dev`: execução em `http://localhost:5173`, com resposta HTTP 200.
- Segunda execução de desenvolvimento com porta ocupada: erro esperado
  `Port 5173 is already in use`, sem troca de porta.
- `npm run preview`: build de produção servido em `http://localhost:5173`;
  HTML, JavaScript e CSS retornaram HTTP 200. Fontes e imagens carregaram.
- Inspeção no navegador em larguras CSS de 320, 390 e 1366 pixels;
  sem rolagem horizontal, com revisão visual e capturas.
- Links de apresentação, funcionamento e retorno ao topo executados.
- Ativação da chamada principal por teclado e atalho para conteúdo:
  o foco foi transferido para `main#conteudo`.
- Rota inexistente apresentou mensagem e link de retorno funcional.
- Console verificado no desenvolvimento e no preview, sem erros ou avisos.

Não foram executados testes de API, banco ou autenticação: não há integração
nesta etapa. Carregamento, envio duplicado e estados de dados não se aplicam
à página informativa sem formulários ou requisições.

## Execução local

Com Node compatível com Vite (`20.19+` na linha 20 ou `22.12+`) e npm no PATH:

```sh
cd frontend
npm ci
npm run dev
```

Para produção local: `npm run build` e depois `npm run preview`.
Desenvolvimento e preview usam `localhost:5173` com `strictPort: true`;
execute um servidor por vez.

Na validação desta entrega, o terminal não tinha Node/npm no PATH. Foram usados
Node 24.22.1 do runtime do aplicativo e npm 12.2.1 do registro oficial,
disponibilizado temporariamente em `/tmp/leia-toolchain/bin`.
Os servidores usados na validação foram encerrados ao final.

Referências técnicas consultadas: [Vite](https://vite.dev/guide/) e
[instalação do Material UI](https://mui.com/material-ui/getting-started/installation/).
