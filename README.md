# Recall.md

Aprendizagem em etapas, com arquivos Markdown, kanban, quizzes e flashcards. CLI, TUI e interface web operam sobre o mesmo diretório `recall/`. Funciona sem Backlog.md; quando existe uma tarefa correspondente, reconhece o vínculo e apresenta seu contexto.

## Começar

Requer Node.js 22.22.2+, 24.15+ ou 26+, conforme a compatibilidade da suíte DOM. Validado com Node.js 26.8.1.

```bash
npm ci
node bin/recall.js --help
```

Para usar em outro repositório ou pasta de estudo:

```bash
# Na pasta que você quer estudar:
node /caminho/Recall.md/bin/recall.js init
node /caminho/Recall.md/bin/recall.js unit create --title "Entender a entrada da aplicação" --deck "Meu projeto"
node /caminho/Recall.md/bin/recall.js browser
# Abra http://127.0.0.1:6421
```

Você também pode instalar a CLI localmente com `npm install -g /caminho/Recall.md` e usar `recall`. O comando `browser` inicia o servidor; não abre o navegador automaticamente. Use `--port 6422` se a porta estiver ocupada. `--cwd /caminho/do/estudo` permite escolher a pasta a partir de qualquer diretório.

Para experimentar com material de exemplo, em uma pasta de estudo vazia:

```bash
recall init
recall unit import /caminho/Recall.md/examples/primeira-etapa.json
recall browser
```

O exemplo é sintético, não é histórico pessoal de estudo. O código do produto fica neste repositório; os dados ficam na pasta em que você executou `init`.

## Fluxo

1. Crie uma etapa, descreva seu objetivo e escolha um deck.
2. Adicione material, questões de múltipla escolha ou texto livre, e cartões. Web e TUI têm formulários; agentes podem importar JSON pela CLI.
3. Organize o kanban por arrastar e soltar ou pelo estado no formulário de edição.
4. Responda ao quiz. A tentativa registra as respostas e uma cópia da referência daquela versão. Múltipla escolha tem correção automática; texto livre mostra a referência e permite autoavaliação explícita.
5. Crie flashcards manualmente ou a partir do **gabarito atual** de uma questão. Uma resposta incorreta não vira gabarito.
6. Revise por deck: tente lembrar, revele o verso e avalie a recordação. Cada revisão é preservada.

Estados iniciais: **A estudar → Estudando → Praticando → Em revisão → Concluído**. São organização do trabalho, não demonstração de domínio; esta versão não exige nota mínima para mudar de coluna.

## Docker / GHCR

Imagem: `ghcr.io/gmrodrigues/recall.md:latest`. Cada publicação também recebe `sha-<SHA completo do commit>`, e o digest permite selecionar exatamente o artefato publicado. A primeira versão da imagem é Linux/amd64.

Na pasta de estudo, inicialize os arquivos uma vez:

```bash
docker pull ghcr.io/gmrodrigues/recall.md:latest
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  ghcr.io/gmrodrigues/recall.md:latest init
```

Abra a web:

```bash
docker run --rm --name recall --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  -p 127.0.0.1:6421:6421 \
  ghcr.io/gmrodrigues/recall.md:latest
```

Acesse **http://127.0.0.1:6421**. O comando padrão é `browser --host 0.0.0.0`: a aplicação escuta nas interfaces do contêiner e a porta é publicada apenas no localhost da máquina. O padrão fora do Docker continua sendo `127.0.0.1`. Outra porta local, como `-p 127.0.0.1:6422:6421`, também funciona. Ctrl+C encerra a web; os arquivos permanecem na pasta montada.

Para CLI e TUI:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  ghcr.io/gmrodrigues/recall.md:latest unit list

docker run --rm -it --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  ghcr.io/gmrodrigues/recall.md:latest tui
```

Os exemplos de UID/GID usam shell POSIX. A imagem usa o usuário `node` por padrão; `--user` permite gravar no diretório montado com a identidade do usuário local. O material não fica embutido na imagem. Monte a pasta que deve guardar `recall/`; sem essa montagem, arquivos criados no contêiner são efêmeros. Para projetos com Backlog.md, monte a pasta que contém as duas raízes. O contexto da tarefa pode ser lido, mas a imagem não inclui a CLI do Backlog.md para criar o link de retorno; essa integração requer um executável configurado disponível no ambiente.

O serviço continua sem autenticação: os comandos acima publicam a porta somente no localhost. A distribuição da imagem não hospeda uma instância pública da aplicação.

### Build e publicação

```bash
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t recall-md:local .
npm run test:container -- recall-md:local
```

O Dockerfile fixa a base oficial Node.js por digest, instala apenas dependências de produção e copia uma lista explícita de arquivos. `.dockerignore` exclui os dados locais, Git, credenciais e dependências da máquina por padrão.

O workflow **Container** executa checagens, testes, build e smoke real de CLI/TUI/web antes de publicar no GHCR. Publica em push de `main` ou disparo manual; pull requests testam sem publicar. Usa `GITHUB_TOKEN` com `packages: write`, sem secret adicional. A imagem testada é a que recebe as tags de SHA e `latest`. Actions são fixadas por SHA. O smoke usa pasta temporária, valida persistência e rejeição de Host/Origin inválidos, e percorre a TUI por pseudo-terminal (Python 3).

Na primeira publicação, confira a visibilidade em **Packages → recall.md → Package settings → Change visibility → Public**. A visibilidade do pacote é independente da do repositório. O acesso público só está demonstrado depois de um pull sem credenciais.

## TUI — terminal interativo

```bash
recall tui
# Sem instalação global:
node /caminho/Recall.md/bin/recall.js --cwd /pasta/de/estudo tui
```

Inicie com `recall init` se a pasta ainda não tiver um espaço de estudo. A TUI usa os mesmos arquivos e regras da CLI e da web. Requer terminal interativo de pelo menos **50 colunas × 14 linhas**; em terminais menores, redimensione ou use Ctrl+C para sair. Não aceita `--json`; scripts devem usar os comandos CLI existentes.

O quadro mostra colunas por estado, seleção destacada e rolagem de etapas. Em janelas estreitas, mostra apenas as colunas ao redor da seleção; use ←/→ para alcançar as demais. Tab alterna quadro e lista. A interação se inspira nos atalhos do Backlog.md, com implementação própria em Node.js/readline e sem dependência de sua TUI.

| Onde | Teclas | Ação |
|---|---|---|
| Quadro/lista | Setas ou `h/j/k/l`, Enter | Navegar e abrir etapa |
| Quadro/lista | Tab, `/`, `d` | Alternar quadro/lista, buscar, filtrar deck |
| Quadro/lista | `n`, `e`, `m`, `r` | Criar, editar, mover estado, revisar decks |
| Detalhes | `q`, `a`, `f`, `r`, `t`, `s` | Quiz, nova questão, novo cartão, revisão do deck, tentativas, vínculos |
| Formulário | Tab/Enter, Shift+Tab | Próximo campo, campo anterior |
| Formulário | Ctrl+J, Ctrl+U, Backspace | Nova linha, limpar campo, apagar no final |
| Formulário | Ctrl+S, Esc | Salvar, cancelar |
| Quiz de alternativas | ↑/↓ ou 1–9, Enter | Selecionar e confirmar |
| Quiz de texto | Digitar, Ctrl+J, Enter | Responder, nova linha, confirmar |
| Resultado | ←/→, Enter, `f` | Percorrer, continuar, criar cartão do gabarito atual |
| Resultado de texto | `1`, `2` | Autoavaliar como correto ou retomar |
| Revisão | Espaço/Enter, depois `1`–`4` | Revelar; repetir, difícil, lembrei ou fácil |
| Material/contexto | ↑/↓ ou `j/k`, PgUp/PgDn, Home/End | Rolar |
| Quadro/lista ou detalhes | Ctrl+R | Reler arquivos alterados externamente |
| Navegação | `?`, Esc, Ctrl+C | Ajuda, voltar/cancelar, encerrar |

Na tela principal, `q` também encerra. Nos detalhes, `q` inicia o quiz. Em campos de texto, letras continuam sendo texto, não atalhos. Enter confirma a resposta e avança; a tentativa só é gravada ao enviar a última questão. Esc cancela respostas ainda não enviadas. Se o material mudar enquanto você responde, reinicie o quiz para não misturar versões.

A revisão exige revelar o verso antes de registrar uma avaliação. Encerrar uma sessão conserva as revisões já gravadas. O resultado permite criar flashcard do gabarito **atual**; a referência da tentativa histórica permanece intacta. O contexto da tarefa vinculada aparece ao final dos detalhes; `s` tenta atualizar os vínculos pela CLI oficial do Backlog.md. Ao criar/editar na TUI, a associação é tentada automaticamente, como nas outras interfaces.

Não há banco paralelo nem dependência nova para a TUI. O modo de entrada, cursor e tela anterior são restaurados ao sair normalmente, por Ctrl+C/SIGTERM/SIGHUP ou por erro capturado. Como em qualquer aplicação, encerramento forçado com SIGKILL não permite limpeza.

## CLI

```bash
recall unit list
recall unit view RCL-1
recall unit edit RCL-1 --status "Praticando"
recall quiz RCL-1
recall answer RCL-1 --answers minhas-respostas.json
recall assess ID-DA-TENTATIVA --question fluxo --correct true
recall card from-question RCL-1 --question entrada
recall review --deck "Meu projeto" --due
recall review RCL-1 --card q-entrada --rating good
recall context RCL-1
recall sync
recall instructions
```

As respostas são um objeto JSON, por ID de questão. Alternativas usam índice **a partir de zero**:

```json
{"entrada": 0, "fluxo": "Minha explicação com minhas palavras."}
```

A CLI retorna JSON para operações estruturadas; `unit list --json` retorna a lista para automação. `unit view` e `quiz` omitem o gabarito. `unit import arquivo.json --id RCL-1` atualiza uma unidade, inclusive questões e cartões. Preserve os IDs para manter sua continuidade. Campos omitidos são preservados. Conteúdo inválido não é gravado.

## IA e agentes

A primeira versão integra agentes por comandos e importação, sem SDK, conta ou provedor obrigatório. **Não há geração por IA embutida ou chamada automática a um modelo.** Um agente autorizado lê o material, segue `recall instructions`, propõe etapas/questões com fontes e usa `unit import` para criá-las. Veja [contrato para agentes](docs/agents.md) e [exemplo de importação](examples/primeira-etapa.json).

Cada questão tem fonte opcional para registrar arquivo, revisão, página ou documento. Revise material gerado antes de praticar. O produto não verifica por conta própria se uma afirmação corresponde à fonte indicada.

## Integração com Backlog.md

Correspondência por **mesmo caminho relativo e nome**, dentro da mesma pasta de estudo:

```text
backlog/tasks/back-12 - Autenticacao.md
recall/tasks/back-12 - Autenticacao.md
```

Crie a etapa com `--file 'back-12 - Autenticacao.md'`, informe o arquivo no formulário web ou no JSON de importação. Os IDs de aprendizagem e tarefa continuam independentes. Também são aceitas subpastas simétricas.

Ao criar/editar pela CLI ou web, ou iniciar `recall browser`, Recall.md reconhece a correspondência e tenta criar os vínculos. `recall sync` repete a sincronização, inclusive para arquivos criados manualmente. Se a CLI do Backlog.md estiver ausente, a etapa é salva e aparece um aviso; o contexto continua legível. Reexecute `sync` após instalar/configurar a CLI. Não há observador contínuo de arquivos nesta versão; atualize a página para reler alterações externas.

O link de retorno é registrado pelo comando oficial:

```bash
backlog task edit BACK-12 --add-ref 'recall/tasks/back-12 - Autenticacao.md' --plain
```

Backlog.md conserva seus dados e referências; Recall.md não edita o Markdown da tarefa diretamente. O endereço da tarefa é registrado nos metadados `backlog` da unidade. Por padrão o executável é `backlog`; se necessário defina seu caminho absoluto em `recall/config.yml`:

```yaml
version: 1
name: Meu estudo
backlogCommand: /caminho/node_modules/.bin/backlog
```

Na web, o painel mostra ID, título, descrição, status, critérios de aceite expansíveis e link para o Markdown original servido pelo Recall.md. A descrição é exibida como texto seguro, preservando quebras de linha; não há renderização de HTML embutido. O contexto é lido da origem ao abrir a etapa, não de uma cópia congelada.

Limites: a versão inicial usa as raízes `backlog/tasks` e `recall/tasks`; não busca outros repositórios, branches ou arquivos arquivados. IDs duplicados impedem a vinculação. Tarefa removida ou renomeada fica indisponível até reconciliar os caminhos; não há migração automática. Se o mesmo caminho passar a conter outro ID, a associação é recusada. Links não sincronizam status, conteúdo ou respostas. Renomear uma unidade já existente não é suportado pela CLI inicial.

## Dados e revisão

```text
recall/
  config.yml
  tasks/*.md         # descrição em Markdown; questões e cartões no YAML
  attempts/*.md      # tentativas com referência, resposta e versão da unidade
  assessments/*.md   # autoavaliações de texto; cada avaliação é um novo evento
  reviews/*.md       # avaliações da recordação e próxima data
```

Veja [formato e exemplos](docs/format.md). Esses arquivos podem ser versionados com Git e inspecionados sem executar o produto. Todos os comandos usam os mesmos dados da web; não há banco de dados ou serviço hospedado.

A agenda é simples: **Repetir** em 10 minutos; **Difícil** em 1 dia; **Lembrei** em pelo menos 2 dias, dobrando o intervalo; **Fácil** em pelo menos 4 dias, triplicando o intervalo. Alterar frente/verso recoloca o cartão na fila de novos conteúdos, preservando o histórico anterior. Não é uma implementação de FSRS nem uma alegação de eficácia pedagógica validada.

## Verificar

```bash
npm run check
npm test
# Ensaio opcional com Backlog.md instalado; sempre usa pasta temporária:
RECALL_BACKLOG_BIN=/caminho/do/backlog npm test
```

Testes incluem controlador da TUI e um ensaio em pseudo-terminal POSIX real (requer Python 3) com redimensionamento, navegação, formulário, quiz, revisão, Ctrl+C/SIGTERM e restauração dos atributos do terminal, além de dois ensaios DOM dos formulários, quiz, autoavaliação e revisão da web, além de persistência, histórico, conflitos, CLI, HTTP e integração idempotente com a CLI real do Backlog.md quando fornecida. O servidor escuta por padrão em `127.0.0.1`; `--host 0.0.0.0` é uma opção explícita para o contêiner, cuja porta deve ser publicada no localhost. Não há autenticação para acesso remoto. A revisão visual/interativa está pendente porque não havia navegador disponível no ambiente de implementação.

Referência de produto: [Backlog.md](https://github.com/MrLesk/Backlog.md). Recall.md é uma implementação independente, sem importar seus módulos internos.
