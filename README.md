# Recall.md

Aprendizagem em etapas, com arquivos Markdown, kanban, quizzes e flashcards. CLI e interface web operam sobre o mesmo diretório `recall/`. Funciona sem Backlog.md; quando existe uma tarefa correspondente, reconhece o vínculo e apresenta seu contexto.

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
2. Adicione material, questões de múltipla escolha ou texto livre, e cartões. A web tem formulários; agentes podem importar JSON pela CLI.
3. Organize o kanban por arrastar e soltar ou pelo estado no formulário de edição.
4. Responda ao quiz. A tentativa registra as respostas e uma cópia da referência daquela versão. Múltipla escolha tem correção automática; texto livre mostra a referência e permite autoavaliação explícita.
5. Crie flashcards manualmente ou a partir do **gabarito atual** de uma questão. Uma resposta incorreta não vira gabarito.
6. Revise por deck: tente lembrar, revele o verso e avalie a recordação. Cada revisão é preservada.

Estados iniciais: **A estudar → Estudando → Praticando → Em revisão → Concluído**. São organização do trabalho, não demonstração de domínio; esta versão não exige nota mínima para mudar de coluna.

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

Testes incluem dois ensaios DOM dos formulários, quiz, autoavaliação e revisão da web, além de persistência, histórico, conflitos, CLI, HTTP e integração idempotente com a CLI real do Backlog.md quando fornecida. O servidor escuta somente em `127.0.0.1`; não há autenticação para acesso remoto. A revisão visual/interativa está pendente porque não havia navegador disponível no ambiente de implementação.

Referência de produto: [Backlog.md](https://github.com/MrLesk/Backlog.md). Recall.md é uma implementação independente, sem importar seus módulos internos.
