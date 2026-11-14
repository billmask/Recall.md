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
