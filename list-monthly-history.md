# Plano do Projeto - Histórico Mensal e Comparativo

## Overview
Implementar segmentação histórica mensal dentro de uma mesma lista de compras, permitindo transições automáticas de mês com arquivamento de dados e redefinição de itens ativos, além de um painel de comparação de preços e despesas.

## Project Type
WEB (Next.js / React)

## Success Criteria
- [ ] Detecção automática de mudança de mês na lista.
- [ ] Banner de transição permitindo arquivar o mês anterior e resetar itens ativos para o mês atual.
- [ ] Gravação do snapshot do histórico na subcoleção `lists/[id]/history/[YYYY-MM]`.
- [ ] Modal de histórico exibindo despesas mensais agregadas e comparativos.
- [ ] Comparador de preços de produtos específicos mês a mês.

## Task Breakdown

### Tarefa 1: Estrutura Firebase & Lógica de Arquivamento
- **Agent**: `backend-specialist`
- **Skills**: `database-design`, `clean-code`
- **INPUT**: Identificador da lista e estado atual.
- **OUTPUT**: Função de arquivamento gravando em `lists/[id]/history/[YYYY-MM]` e resetando itens ativos em lote (batch update).
- **VERIFY**: Executar teste manual gerando documento de histórico e confirmando zeramento de preços e status de compra nos itens ativos.

### Tarefa 2: Fluxo de Transição e Banner de Aviso
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `clean-code`
- **INPUT**: Página de detalhes da lista.
- **OUTPUT**: Verificação de mês e renderização de banner informando a transição de mês se o mês atual do calendário for posterior ao `list.month`.
- **VERIFY**: Simular data futura no Firestore e verificar se o banner aparece e executa a transição corretamente ao ser clicado.

### Tarefa 3: Modal de Histórico e Comparativos
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `clean-code`
- **INPUT**: Visualização de histórico de uma lista.
- **OUTPUT**: Modal exibindo a evolução mensal de gastos, lista de compras passadas e gráfico de comparação percentual.
- **VERIFY**: Abrir o modal de histórico e validar se os valores de meses passados batem com os snapshots gravados.

### Tarefa 4: Comparador de Preço de Itens
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `clean-code`
- **INPUT**: Itens arquivados no histórico.
- **OUTPUT**: Interface interativa dentro do modal de histórico para selecionar um item e comparar seu preço histórico ao longo dos meses.
- **VERIFY**: Selecionar um produto (ex: "Arroz") e verificar se exibe corretamente a variação do valor pago nos meses A e B.

## Phase X: Verification
- [ ] `npm run lint` sem erros.
- [ ] `npm run build` bem-sucedido.
