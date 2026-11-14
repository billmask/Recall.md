# Sessões de implementação

## 14/11/2026 — versão inicial

- Ferramenta: Codex.
- ID: 01a1dbc7-9b7c-7631-a2aa-5a45f080acdf.
- Origem: CODEX_THREAD_ID e CODEX_SESSION_ID conferidos na sessão.
- Solicitação: SOL-20261114-ESTUDO-11, no gmr-planning.
- Tarefa: GMR-26 no gmr-planning.
- Autorização: implementar Recall.md neste repositório; sem solicitação de commit, push ou publicação.
- Referência local: /home/glauber/gmrodrigues.github.com/Backlog.md, revisão consultada 52b4ea3b938874f8e2f9e063aa973777318d4bcd. Consultados manifesto, instruções, parser e contratos da CLI; implementação independente.
- Limite de validação: navegador integrado indisponível; revisão visual e interação no navegador não executadas. HTTP, CLI, persistência e integração real testados separadamente.

- Validação final automatizada: 11 testes, incluindo dois fluxos DOM (criação/quiz/flashcard/revisão e contexto/texto/autoavaliação). DOM não comprova aparência visual no navegador.

## 14/11/2026 — publicação autorizada

Glauber solicitou commit e push nos repositórios Recall.md e gmr-planning. Mesma sessão Codex registrada acima. Escopo público: código, testes, documentação e exemplo sintético; dados locais de estudo em recall/ ficam fora do commit. Destino: gmrodrigues/Recall.md, main.

## 14/11/2026 — TUI, GMR-27

- Ferramenta: Codex; sessão 01a1dbc7-9b7c-7631-a2aa-5a45f080acdf, origem CODEX_THREAD_ID/CODEX_SESSION_ID conferidos.
- Solicitação: SOL-20261114-ESTUDO-16, implementar TUI inspirada no Backlog.md.
- Escopo: quadro/lista, busca, formulários, detalhes/contexto, quizzes, histórico e revisão por deck no terminal, usando Store existente.
- Referência: atalhos de src/ui/board.ts do fork Backlog.md. Implementação própria em Node.js/readline, sem importar módulos internos do Backlog.md.
- Sem nova autorização de publicação remota nesta rodada.

- Validação final: npm run check e 21 testes passaram, incluindo PTY POSIX real com redimensionamento, formulário, quiz, revisão, Ctrl+C/SIGTERM e restauração de termios/cursor/tela. Dois fluxos DOM e integração real com Backlog.md continuam passando. Ensaio manual na ferramenta de terminal, com dados sintéticos em /tmp, conferiu quadro e detalhes. Evidências registradas no gmr-planning, nomes recall-tui-check e recall-tui-tests. Sem commit ou push da TUI nesta rodada.

## 14/11/2026 — publicação da TUI, SOL-17

Glauber solicitou commit e push após concluir a TUI. Mesma sessão Codex registrada acima. Escopo: TUI, integração à CLI, testes e documentação; dados locais em recall/ ficam fora do commit. Destino autorizado: gmrodrigues/Recall.md, main. Planejamento e GMR-27 publicados separadamente no gmr-planning. A validação final da implementação já passou com 21 testes e check, sem mudança posterior de código.
