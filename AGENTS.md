# Recall.md

Leia README.md, docs/agents.md e docs/format.md antes de alterar o produto. Este é um produto independente, com CLI e web para aprendizagem em etapas. Backlog.md é integração opcional; não importar sua API interna como dependência.

- Mantenha regras de persistência, avaliação e revisão em src/core.js, compartilhadas pelas interfaces.
- Preserve tentativas e revisões; não invente respostas de estudantes nem promova geração de IA a material validado.
- Use a CLI oficial para alterar tarefas do Backlog.md. A correspondência usa os caminhos relativos nas raízes documentadas.
- Testes: npm run check; npm test. Ensaio real opcional: RECALL_BACKLOG_BIN=/caminho/do/backlog npm test. Usa projetos temporários.
- Declare separadamente testes automatizados, validação visual e execução remota.
- Antes de implementar uma tarefa, registre ferramenta, ID real da sessão, data e origem em docs/sessions.md ou na tarefa correspondente. Não invente IDs.
