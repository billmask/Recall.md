# Formato inicial — versão 1

`recall/config.yml` identifica o projeto e o comando opcional do Backlog.md. Uma etapa fica em `recall/tasks/<nome>.md`:

```markdown
---
id: RCL-1
title: Entender uma entrada
deck: Arquitetura
status: A estudar
sources:
  - src/entrada.js @ revisão identificada
questions:
  - id: entrada
    type: choice
    prompt: Quem traduz a entrada para o caso de uso?
    options:
      - Adaptador
      - Banco de dados
    answer: 0
    explanation: O adaptador faz a tradução da entrada.
cards:
  - id: papel-adaptador
    front: Qual é o papel de um adaptador de entrada?
    back: Traduzir a entrada para a chamada do caso de uso.
    deck: Arquitetura
---

# Material

Acompanhe uma chamada do adaptador até o domínio.
```

O corpo inteiro após o frontmatter é a descrição. Chaves adicionais de metadados de uma unidade existente são preservadas nas edições pela aplicação; questões e cartões seguem o esquema documentado. Não coloque campos chamados `file`, `description` ou `version` no YAML: são propriedades derivadas/reservadas pela aplicação. IDs de unidades devem ser únicos no projeto. Para alocação de IDs e gravação consistente, prefira os comandos da CLI; edições externas exigem cuidado com o esquema.

Tentativas contêm `unit`, `version` (SHA-256 do Markdown usado naquele momento) e `results`, com enunciado, resposta enviada, referência, explicação e resultado. Texto livre começa com `correct: null`; avaliações ficam em eventos separados com método `self`. Cada tentativa guarda sua referência e enunciado mesmo após a unidade mudar. Não altere os eventos anteriores.

Revisões referenciam unidade, cartão e versão do conteúdo do cartão (frente/verso), além de avaliação, intervalo e próxima data. A revisão avalia recordação declarada, não compreensão demonstrada. A origem dos dados é o conjunto de arquivos, sem projeção paralela em banco de dados.

## Simetria

A associação inicial usa o caminho relativo exato abaixo das duas raízes fixas. O ID externo só é lido depois da correspondência, e duplicidade de ID impede a escrita. O Recall guarda `backlog: {id, file}`; a tarefa conserva `references` contendo `recall/tasks/<caminho>`, adicionada pela CLI do Backlog.md. Após renomeações, reconciliar manualmente os caminhos/referências: esta versão não tenta adivinhar a nova identidade nem remove links antigos automaticamente.

## Gravação

Mutações do Recall usam um lock local `recall/.write-lock` e troca atômica do arquivo da unidade. Eventos usam nomes UUID e criação exclusiva. Interrupção forçada pode deixar o lock: só o remova manualmente após confirmar que não há uma operação de gravação ativa. Edição externa não participa desse lock. A edição web envia a versão lida para detectar conflito com alteração de conteúdo; uma falha de vínculo não desfaz a etapa já salva, e pode ser resolvida com `recall sync`.

## TUI

A interface de terminal usa o mesmo formato de arquivos e Store das demais interfaces. Não persiste seleção de tela, rascunho de formulário nem respostas de quiz antes do envio completo; Esc descarta apenas o rascunho. Tentativas e revisões já enviadas seguem imutáveis. Comparação de versão impede envio de quiz ou avaliação de cartão contra conteúdo alterado durante a sessão.

## Sessões de estudo — JSON compacto, versão 1

A web mantém o provisório em IndexedDB, isolado pela identidade persistente `projectId` de `recall/config.yml`. Abas do mesmo projeto/browser/origem compartilham a sessão; origens/portas e navegadores diferentes não compartilham o provisório. Configurações anteriores recebem identidade na primeira leitura de estado da web, preservando os campos existentes.

Somente confirmação escreve `recall/sessions/<uuid>.json`, sem indentação. O arquivo tem `version`, `id`, `projectId`, `startedAt`, `endedAt`, `reason` (`manual`, `inactivity`, `limit`) e `decks`. Tempos são inteiros epoch em milissegundos, durações são milissegundos. Cada deck tem `durationMs`, `cards` e `flashcards`. Cards são indexados por ID da unidade; flashcards independentes usam como chave a serialização JSON do par `[unitId,cardId]`, sem repetir essas identidades no objeto.

Cada card/flashcard guarda `title` (descritor), `durationMs` e `actions`: cada chave de ação/alvo tem uma lista de horários transacionais. `open`/`close` registram aberturas/fechamentos; contagens são derivadas das listas. `hidden`/`visible` marcam pausa/retomada da visualização; `close_inferred` distingue encerramento estimado pelo último checkpoint de uma aba que não respondeu. Não são persistidos eventos individuais, intervalos provisórios, contadores, duração da sessão ou duração por ação. Campos de respostas de quiz não são copiados para esse registro.

O limiar por card/flashcard independente é >=10000ms visíveis acumulados, incluindo reaberturas. Ao qualificar, entram tempo desde abertura e ações anteriores na sessão. Flashcards internos são ações do card, sem tempo próprio. Intervalos sobrepostos da mesma entidade são unidos; duração do deck é a união dos intervalos das entidades qualificadas, podendo diferir da soma dos cards.

A API aceita o provisório encerrado em `POST /api/sessions`, valida e recalcula a compactação. `GET /api/sessions` lista somente confirmadas e `GET /api/sessions/:id` consulta uma. Mesmo UUID e mesmo conteúdo canônico não duplicam arquivo; conteúdo divergente retorna409. A gravação usa o lock e a troca atômica existentes. Falha mantém o provisório; descarte não altera tentativas, revisões ou material já salvo. Arquivos de sessão existentes não são sobrescritos.

Este registro mede exposição/interações da interface, não atenção, compreensão ou eficácia pedagógica. Fechamento inesperado pode depender do último checkpoint; a ação inferida é identificada, sem prometer timestamp exato da queda do navegador.
