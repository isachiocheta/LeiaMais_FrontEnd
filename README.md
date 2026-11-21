# Leia+

Frontend do Leia+, um clube do livro escolar, feito com React, JavaScript/JSX, Vite, React Router e Material UI. A aplicação se comunica com um backend separado por HTTP, com cookies de sessão e proteção CSRF.

## Requisitos

- **Node.js 24.x e npm**, para executar o conjunto frontend, backend e testes. O frontend também declara suporte a Node 20.19+ da linha 20 ou 22.12+, mas o backend exige a linha 24.
- Backend do Leia+ disponível e conectado a um PostgreSQL preparado.
- Para os testes de navegador: Chromium do Playwright e um PostgreSQL de teste com permissão para criar bancos temporários.

Confira sua versão antes de instalar:

```bash
node --version
npm --version
```

O código da aplicação está em `frontend/`. Todos os comandos do frontend abaixo devem ser executados nessa pasta.

## Rodar o frontend

Partindo da raiz deste projeto:

```bash
cd frontend
npm ci
test -f .env || cp .env.example .env
```

O comando de cópia preserva um `.env` que já exista. Confira nele o endereço público da API:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

O endereço deve incluir o prefixo `/api`, sem credenciais, parâmetros ou fragmentos. Essa é uma configuração pública, incluída no build: **não coloque senhas, credenciais de banco ou segredos de sessão no `.env` do frontend**.

Inicie a interface:

```bash
npm run dev
```

Acesse **http://localhost:5173**. Use `localhost` também no navegador, para manter a origem esperada pelo backend. A porta é fixa e usa `strictPort`: se estiver ocupada, o servidor encerra com erro em vez de escolher outra porta. Para encerrar, pressione `Ctrl+C` no terminal.

Se alterar `VITE_API_BASE_URL`, reinicie o servidor de desenvolvimento. As páginas públicas podem abrir sem a API, mas login, catálogo e demais funcionalidades integradas precisam do backend disponível.

## Preparar e iniciar o backend local

O backend não está incluído neste repositório. No ambiente de desenvolvimento, a organização utilizada é:

```text
projetos/
├── leia+_frontend/
│   ├── README.md
│   └── frontend/
└── leia+_backend/
    └── backend/
```

Em outro terminal, partindo da raiz de `leia+_frontend`, entre no projeto do backend:

```bash
cd ../leia+_backend/backend
npm ci
```

Prepare um banco PostgreSQL de desenvolvimento e configure as variáveis abaixo no `.env` **do backend**, preservando configurações que já existam:

```dotenv
NODE_ENV=development
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://USUARIO:SENHA@localhost:5432/leia
SESSION_SECRET=
SESSION_COOKIE_SECURE=false
```

Substitua `USUARIO`, `SENHA` e o nome do banco pelos dados da sua instalação. Preencha `SESSION_SECRET` com um segredo aleatório de pelo menos 32 bytes; o valor vazio não é aceito. Não compartilhe nem versione esse arquivo.

Em uma instalação nova, com o banco de desenvolvimento correto selecionado, aplique as migrações e carregue os gêneros de referência:

```bash
npm run db:migrar
npm run db:referencias
```

Esses comandos alteram o banco configurado no backend. Não são necessários a cada inicialização e não devem ser executados contra um banco de outra instalação sem conferir o destino.

Inicie a API:

```bash
npm start
```

Mantenha esse terminal aberto junto com o terminal do frontend. Os endpoints de verificação são:

- `http://localhost:3000/api/health`: verifica se a API está respondendo.
- `http://localhost:3000/api/ready`: verifica a conexão com o banco.

Iniciar a API não cria automaticamente o schema, um administrador ou dados demonstrativos.

### Primeiro acesso

Para criar o administrador inicial, configure `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_SENHA` no ambiente ou no `.env` do backend e execute, na pasta dele:

```bash
npm run db:admin
```

A senha precisa ter pelo menos 10 caracteres Unicode e no máximo 72 bytes UTF-8. Espaços fazem parte da senha. Não há uma senha padrão neste README.

Depois, entre pela página de login do frontend com essa conta administrativa. O cadastro público cria contas de **LEITOR** com situação **PENDENTE**; o administrador precisa aprová-las na área de leitores antes que possam entrar.

## Comandos do frontend

Execute em `frontend/`:

| Comando | Finalidade |
| --- | --- |
| `npm ci` | Instala as dependências conforme o `package-lock.json`. |
| `npm run dev` | Inicia o desenvolvimento em `http://localhost:5173`. |
| `npm run build` | Gera os arquivos de publicação em `dist/`. |
| `npm run preview` | Serve o build localmente em `http://localhost:5173`. |
| `npm test` | Executa a suíte de testes do cliente e das integrações isoladas. |
| `npm run test:e2e` | Executa Playwright com backend real e bancos PostgreSQL temporários. |

Para conferir o build local:

```bash
npm run build
npm run preview
```

Encerre `npm run dev` antes de iniciar o preview, pois ambos usam a porta 5173. O preview serve para conferir o build localmente.

## Testes

### Suíte existente

```bash
cd frontend
npm test
```

Diversos testes usam as rotas e os serviços do backend com persistência simulada, sem acessar o banco normal. Para executar a suíte completa, o backend e suas dependências precisam estar disponíveis na estrutura de pastas apresentada acima. O caminho desses testes isolados é relativo ao repositório irmão; a variável `LEIA_BACKEND_DIR` descrita a seguir se aplica ao executor E2E.

### Playwright com PostgreSQL real

Na pasta `frontend/`, instale o navegador utilizado pelos testes:

```bash
npx playwright install chromium
```

O PostgreSQL precisa estar em execução. Prepare previamente um banco de controle de teste e um usuário com permissão `CREATEDB`. Esse banco deve ter nome terminado em `_test` ou `_teste`, diferente do nome do banco normal.

Configure as variáveis no terminal que executará os testes. Substitua os endereços de exemplo pelos da sua instalação:

```bash
export NODE_ENV=test
export DATABASE_URL='postgres://USUARIO:SENHA@localhost:5432/leia'
export TEST_DATABASE_URL='postgres://USUARIO_DE_TESTE:SENHA_DE_TESTE@localhost:5432/leia_frontend_control_test'
npm run test:e2e
```

O executor lê essas variáveis do ambiente; ele não carrega automaticamente as URLs de um arquivo `.env`. Não as coloque no `.env` público do frontend.

Deixe a porta 5173 livre. O executor cria um banco exclusivo para cada arquivo de cenário, instala o schema e as referências pelos SQLs do backend, prepara uma conta administrativa de teste e inicia a API e o preview. Ao terminar, encerra os servidores e remove os bancos e arquivos temporários que criou. As credenciais das contas de teste são geradas durante a execução.

`DATABASE_URL` é usada para validar a separação dos destinos; os cenários utilizam os bancos temporários criados a partir de `TEST_DATABASE_URL`. Não use o banco normal como destino de teste. O executor não instala nem inicia o serviço PostgreSQL para você.

Por padrão, o backend é procurado em `../leia+_backend/backend`, relativo à raiz deste projeto. Se ele estiver em outro local, configure o caminho absoluto antes dos testes E2E:

```bash
export LEIA_BACKEND_DIR='/caminho/para/leia+_backend/backend'
```

Para executar somente um cenário:

```bash
npm run test:e2e -- flow-auth.spec.js
```

Os cenários cobrem cadastro e aprovação, autenticação e permissões, CRUD, leituras e progresso, inscrições, dashboards, perfil e senha, falhas de rede, conflitos e revisão de acessibilidade e responsividade.

## Publicação

Configure `VITE_API_BASE_URL` com o endereço público da API **antes** de gerar o build. Uma mudança posterior exige um novo build.

Publique o conteúdo de `frontend/dist/` em um servidor de arquivos estáticos com fallback de SPA: as rotas do frontend, como `/meu-perfil` e `/catalogo/1`, precisam entregar `index.html` ao acessar diretamente ou recarregar. Arquivos estáticos existentes devem continuar sendo servidos normalmente. Caso a API compartilhe o mesmo domínio, encaminhe `/api` ao backend, sem aplicar o fallback a essas requisições.

No backend, ajuste `ALLOWED_ORIGIN` para a origem exata do frontend. Em produção com HTTPS, utilize `SESSION_COOKIE_SECURE=true` e uma configuração de domínios compatível com os cookies de sessão. O frontend já envia cookies nas chamadas e obtém o CSRF automaticamente.

## Problemas comuns

- **Erro de versão do Node:** utilize Node 24.x para executar frontend e backend juntos; Node 18 não atende aos requisitos deste projeto.
- **Porta 5173 ocupada:** encerre a outra execução de desenvolvimento ou preview. A aplicação não muda de porta automaticamente.
- **Falha de conexão:** confira se a API está em execução, se o endereço termina em `/api` e se `/api/ready` responde com sucesso.
- **Login não mantém a sessão:** confira a origem do navegador, `ALLOWED_ORIGIN` e a configuração de cookies. Em HTTP local, use `SESSION_COOKIE_SECURE=false`.
- **Conta recém-cadastrada não entra:** o cadastro precisa ser aprovado pelo administrador e a conta deve estar ativa.
- **Rota funciona por navegação, mas dá 404 ao recarregar:** configure o fallback de SPA na hospedagem.
- **E2E não inicia:** confira Node 24, dependências do backend, Chromium instalado, porta 5173 livre e acesso ao PostgreSQL de controle com permissão para criar bancos.
