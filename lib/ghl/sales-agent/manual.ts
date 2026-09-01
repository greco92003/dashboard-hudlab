// lib/ghl/sales-agent/manual.ts
//
// Transcribed from "Manual_Comercial_e_Agente_Hud_Lab_v1.pdf" (Hud Lab,
// Julho/2026), sections 1-8 only (section 9 "Governança e implantação" and
// "Anexo A. Catálogo 2026" are process/reference material, not needed as
// LLM grounding). Two tables in the source PDF (2.3 "Tipos de
// personalização" reads fine; 4.4 "Argumentação por aplicação" and 7.1
// "Critérios e pesos" had columns visually reflowed by PDF text extraction)
// were reconstructed here by matching rows to their correct column
// semantically — cross-check against the original PDF if the business
// rules described here are ever in doubt.
//
// Whenever this manual changes (new prices, new policy, new criteria),
// bump MANUAL_VERSION and update this file in the same commit — every
// evaluation/insight record stores which version produced it, so old
// records keep their original meaning.

export const MANUAL_VERSION = "1.1 — Setembro/2026";

export const MANUAL_COMERCIAL_TEXT = `# Manual Comercial e Agente de Vendas — Hud Lab

Fonte oficial para vendedores, gestores e agentes de IA. Em caso de conflito com mensagem, campanha ou material antigo, prevalece a versão mais recente deste manual.

## 1. Fonte de verdade comercial

As regras desta seção podem ser usadas diretamente por vendedores, automações e agentes de IA. Nenhuma condição deve ser inventada para acelerar um fechamento.

### 1.1 Regras oficiais

- Produto: Chinelo Slide personalizado.
- Pedido mínimo: 12 pares.
- Grade: livre entre as numerações disponíveis.
- Preço: varia somente pela quantidade total do pedido.
- Personalização: não altera o preço; respeita o mínimo de cada técnica.
- Frete: grátis a partir de 36 pares para todo o Brasil.
- Prazo de produção: 15 dias úteis.
- Início do prazo: data do pagamento, após a Amostra Digital.
- Amostra Digital: entregue antes do pagamento, em até 24 horas úteis.
- Alterações da Amostra Digital: sem limite formal definido.
- Garantia: garantia de fábrica contra defeitos.
- Desconto do vendedor: até 10% sem autorização.
- Follow-up: 1, 3 e 7 dias.

### 1.2 Regras que não podem ser improvisadas

- Não prometer prazo menor do que 15 dias úteis sem validação interna.
- Não oferecer frete grátis abaixo de 36 pares como se fosse regra geral.
- Não conceder desconto superior a 10% sem autorização.
- Não alterar pedido mínimo ou condições de personalização para fechar a venda.
- Não prometer ausência absoluta de variação entre a Amostra Digital e o produto físico.
- Não garantir reposição antes da análise do defeito de fabricação.

**Ponto que ainda exige decisão:** definir se o desconto comercial de até 10% pode ser acumulado com os 5% de desconto do PIX. Até essa decisão, o agente deve sinalizar a dúvida e pedir validação humana — nunca decidir por conta própria.

## 2. Produto, preços e personalizações

### 2.1 Tabela de preços

| Quantidade | Preço por par | Observação |
|---|---|---|
| 12 a 23 pares | R$ 67,90 | Hud Lab Start; Silk em 1 cor |
| 24 a 99 pares | R$ 59,90 | Silk disponível; frete grátis a partir de 36 pares |
| 100 a 499 pares | R$ 54,90 | Desconto progressivo por volume |
| 500 a 999 pares | R$ 52,90 | Desconto progressivo por volume |
| 1.000 pares ou mais | R$ 49,90 | Condição de grande volume |

Os valores acima seguem a quantidade total do pedido. A técnica de personalização não altera o preço, desde que o pedido respeite o mínimo da técnica escolhida.

### 2.2 Formas de pagamento

- PIX à vista: 5% de desconto.
- Cartão de crédito: até 3x sem juros.
- Cartão de crédito: até 6x com juros da operadora.
- Pagamento em 2 etapas: 50% para liberar a produção e 50% antes do envio.

### 2.3 Tipos de personalização

| Técnica | Mínimo | Aplicação conhecida | Observação comercial |
|---|---|---|---|
| Hud Lab Start | 12 pares | Serigrafia Silk em 1 cor | Entrada para pedidos menores |
| Silk | 24 pares | Até 3 cores de serigrafia entre 24 e 35 pares; até 4 cores a partir de 36 pares | Boa relação entre impacto visual e escala |
| Silk Relevo | 60 pares | Serigrafia com relevo + 1 cor de Silk | Maior percepção tátil e visual |
| 3D | 132 pares | Logo em 3D + 1 cor de Silk | Solução premium e de alto impacto |
| Sola colorida | 100 pares | Adicional ao projeto | Acréscimo de R$ 5,00 por par |

### 2.4 Materiais e elementos do produto

- Sola Micro Expandida Comfort.
- Gáspea em Napa Way de aproximadamente 3,5 mm.
- Etiqueta lateral externa em TPU, aproximadamente 1,5 x 1,8 cm.
- Caixa personalizada.
- Cola base d'água e acabamento de fábrica.

### 2.5 Numerações

| Linha | Numeração | Tamanho aproximado |
|---|---|---|
| Infantil | 28/29 | 20 cm |
| Infantil | 30/31 | 21,5 cm |
| Infantil | 32/33 | 22,5 cm |
| Adulto | 34/35 | 24 cm |
| Adulto | 36/37 | 25,5 cm |
| Adulto | 38/39 | 26,5 cm |
| Adulto | 40/41 | 28 cm |
| Adulto | 42/43 | 29,5 cm |
| Adulto | 44/45 | 30,2 cm |

A grade é livre. O cliente distribui a quantidade entre as numerações disponíveis de acordo com sua necessidade.

## 3. Processo do pedido

### 3.1 Fluxo oficial

1. Entendimento inicial da necessidade.
2. Recebimento do logo e das informações básicas do projeto.
3. Criação da Amostra Digital em até 24 horas úteis.
4. Ajustes da Amostra Digital, quando solicitados.
5. Aprovação do cliente.
6. Definição de quantidade, grade, endereço e forma de pagamento.
7. Pagamento ou entrada de 50%.
8. Início da produção: 15 dias úteis a partir do pagamento.
9. Pagamento do saldo, quando aplicável.
10. Expedição e transporte.

**Regra central:** não existe fluxo de pagamento antes da Amostra Digital. A visualização e a aprovação do projeto vêm primeiro; o pagamento libera a produção.

### 3.2 Frete

- Frete grátis: a partir de 36 pares para todo o Brasil.
- Pedidos abaixo de 36 pares: o frete deve ser calculado conforme CEP e condições logísticas.
- Prazo de entrega: é o prazo de produção somado ao prazo da transportadora.
- Comunicação: o vendedor deve sempre separar "prazo de produção" de "prazo de transporte".

### 3.3 Garantia

A Hud Lab oferece garantia de fábrica contra defeitos de fabricação. O vendedor deve coletar informações e evidências do problema antes de prometer reposição, crédito ou reembolso:

- Solicitar fotos ou vídeos claros do defeito.
- Confirmar quantidade de pares afetados e numerações.
- Registrar número do pedido e data do recebimento.
- Encaminhar o caso para análise interna.
- Não caracterizar desgaste, uso inadequado ou divergência estética sem avaliação técnica.

## 4. Método de persuasão Hud Lab

A abordagem comercial deve ser consultiva, objetiva e orientada ao avanço da negociação. O vendedor não deve atuar como atendente passivo nem pressionar o cliente com urgências artificiais.

### 4.1 Método RERA

| Etapa | Ação | Pergunta do vendedor (exemplo) |
|---|---|---|
| Responder | Entregar primeiro a informação objetiva pedida. | "O mínimo começa em 12 pares." |
| Entender | Descobrir a aplicação e o contexto. | "Seria para revenda, equipe, empresa ou evento?" |
| Recomendar | Indicar a solução adequada. | "Para 40 pares, o Silk atende bem e permite até 4 cores." |
| Avançar | Conduzir para um próximo passo claro. | "Pode me enviar o logo para prepararmos a Amostra Digital?" |

### 4.2 Princípios

- Responder a pergunta antes de argumentar.
- Usar o contexto do cliente para construir valor.
- Transformar benefícios genéricos em aplicação concreta.
- Trabalhar microcompromissos: logo, quantidade, aprovação, grade e pagamento.
- Usar prova social compatível com o segmento.
- Usar urgência somente quando houver prazo, capacidade ou condição real.
- Evitar interrogatórios longos; qualificar durante a conversa.

### 4.3 Linguagem da marca

| Preferir | Evitar |
|---|---|
| Chinelo Slide | Slide isolado |
| Produto de marca ou produto de portfólio | Brinde barato ou lembrancinha |
| Amostra Digital | Arte grátis como isca |
| Personalização e uso real | Promessas exageradas |
| Manda um Direct | Palavras-chave artificiais quando não necessárias |
| Prazo real | Falsa urgência |

### 4.4 Argumentação por aplicação

| Aplicação | Valor principal | Direção da conversa |
|---|---|---|
| Marcas e collabs | Extensão do portfólio e identidade | Produto próprio, drop, comunidade e valor percebido |
| Times e CTs | Uso antes e depois do treino | Identidade, equipe, revenda e comunidade |
| Empresas | Experiência de marca e utilidade | Onboarding, eventos, reconhecimento e clientes |
| Eventos | Continuidade da experiência | Participantes, patrocinadores, venda e lembrança de uso |
| Revenda | Margem e diferenciação | Preço, grade, embalagem e potencial de recompra |

## 5. Qualificação e leitura da negociação

### 5.1 Informações essenciais

- Aplicação: revenda, equipe, empresa, evento ou outro projeto.
- Quantidade estimada.
- Data desejada ou evento relacionado.
- Estado ou CEP de entrega.
- Logo ou arte disponível.
- Responsável pela decisão e necessidade de aprovação interna.

Essas informações podem ser obtidas ao longo da conversa. A ausência de uma informação não deve travar o atendimento quando ainda for possível avançar com segurança.

### 5.2 Sinais de compra

- Envia o logo ou solicita a Amostra Digital.
- Pergunta sobre prazo, pagamento, frete ou grade.
- Define quantidade ou faixa de quantidade.
- Solicita alteração na Amostra Digital.
- Menciona sócio, diretoria, cliente final ou aprovação interna.
- Pergunta como realizar o pagamento.

### 5.3 Sinais de risco

- Conversa sem próximo passo definido.
- Prazo incompatível com produção e transporte.
- Cliente compara apenas preço sem reconhecer diferenças de solução.
- Amostra Digital enviada sem retorno após a cadência completa.
- Vendedor repete informações sem tratar a objeção real.
- Dados importantes não foram registrados no CRM.

### 5.4 Próximo melhor passo

O vendedor deve priorizar uma ação por vez. Exemplos: receber o logo, confirmar a quantidade, obter aprovação da arte, definir a grade, validar a condição comercial ou encaminhar o pagamento.

## 6. Biblioteca de scripts

Os textos abaixo são estruturas adaptáveis. O vendedor deve preservar a informação e ajustar a linguagem ao contexto real da conversa.

### 6.1 Entrada e qualificação

**Primeiro contato inbound** (quando o cliente chega sem explicar o projeto):
"Olá! Trabalhamos com Chinelo Slide personalizado a partir de 12 pares. Para eu te orientar pela opção mais adequada, seria para revenda, equipe, empresa ou algum evento?"

**Cliente pergunta somente o preço** (primeira mensagem é "qual o valor?"):
"O valor começa em R$ 67,90 por par de 12 a 23 pares. De 24 a 99 pares, fica R$ 59,90 por par, e a partir de 36 pares o frete é grátis para todo o Brasil. Qual quantidade você está imaginando?"

**Cliente pergunta o pedido mínimo:**
"O pedido mínimo começa em 12 pares. A grade é livre entre as numerações disponíveis. A partir de 24 pares, também liberamos outras possibilidades de personalização. Seria para qual tipo de projeto?"

**Solicitação de logo** (quando já existe contexto suficiente para criar a Amostra Digital):
"Pode me enviar o logo ou a arte que vocês querem aplicar? Com isso, nosso time prepara uma Amostra Digital para você visualizar o projeto antes do pagamento."

### 6.2 Personalização e Amostra Digital

**Explicar as personalizações:**
"Temos Silk em 1 cor a partir de 12 pares; de 24 a 35 pares, Silk com até 3 cores; e, a partir de 36 pares, Silk com até 4 cores. Silk Relevo começa em 60 pares e aplicação 3D em 132 pares. O preço varia pela quantidade do pedido, não pela técnica. Qual efeito combina mais com a identidade de vocês?"

**Prazo da Amostra Digital:**
"A primeira Amostra Digital é preparada em até 24 horas úteis. Depois você pode pedir os ajustes necessários antes de aprovar e realizar o pagamento."

**Envio da Amostra Digital:**
"Sua Amostra Digital ficou pronta. Dá uma olhada na aplicação, nas cores e na composição geral. Você prefere aprovar essa versão ou quer ajustar algum detalhe antes de avançarmos?"

**Após alteração:**
"Fizemos o ajuste solicitado e esta é a nova versão. Agora ela representa o que vocês imaginavam para o projeto?"

### 6.3 Orçamento, pagamento e fechamento

**Resumo comercial** (quando o cliente já definiu quantidade e solução):
"Para [quantidade] pares, o valor fica em [valor por par], com [condição de frete]. A produção leva 15 dias úteis a partir do pagamento, mais o transporte. No PIX há 5% de desconto; no cartão, até 3x sem juros; ou podemos fazer 50% para liberar a produção e 50% antes do envio."

**Aprovação e grade** (quando a Amostra Digital foi aprovada):
"Perfeito, arte aprovada. Agora preciso da distribuição das numerações e do CEP de entrega para deixarmos o pedido pronto para pagamento e produção."

**Envio do pagamento:**
"Está tudo confirmado: arte, quantidade, grade e entrega. Vou te enviar a condição de pagamento escolhida. Assim que o pagamento for identificado, começa o prazo de 15 dias úteis de produção."

### 6.4 Objeções

**Preço acima do esperado:**
"Entendo. Para eu te ajudar de forma objetiva: o ponto é o valor total do projeto ou o valor por par? Dependendo da quantidade, conseguimos reduzir o preço unitário e avaliar uma condição comercial dentro da nossa autonomia."
Atenção: não conceder desconto antes de entender a objeção.

**Comparação com fornecedor mais barato:**
"Faz sentido comparar. Além do valor, vale confirmar se o outro orçamento inclui a mesma personalização, caixa personalizada, etiqueta lateral, Amostra Digital e condições de frete. Se você me passar a quantidade e o que está incluído, eu consigo comparar com transparência."

**Pedido mínimo** (cliente quer menos de 12 pares):
"Nossa produção personalizada começa em 12 pares. A grade é livre, então você pode distribuir entre as numerações que realmente precisa. Abaixo disso, hoje não conseguimos manter o padrão de produção e personalização."

**Frete em pedido menor** (menos de 36 pares):
"O frete grátis começa em 36 pares. Para essa quantidade, calculamos pelo CEP. Posso verificar o valor e também te mostrar quanto ficaria o pedido com 36 pares para você comparar o custo total."

**Prazo curto:**
"Nosso prazo padrão é de 15 dias úteis de produção após o pagamento, mais o transporte. Pela sua data, preciso validar a viabilidade antes de prometer. Qual é o dia exato em que o pedido precisa estar com vocês?"

**Aprovação interna** (pessoa depende de sócio, diretoria ou cliente final):
"Posso te deixar um resumo objetivo com a Amostra Digital, quantidade, valor, prazo e forma de pagamento para facilitar essa aprovação. Quem participa da decisão e qual informação costuma ser mais importante para essa pessoa?"

### 6.5 Follow-up

**Follow-up D1** (um dia depois do envio de orçamento ou Amostra Digital):
"Passando para confirmar se você conseguiu analisar a proposta. O que falta para conseguirmos avançar: ajuste na arte, definição da quantidade ou aprovação interna?"

**Follow-up D3** (três dias depois, sem resposta):
"Retomando seu projeto: a Amostra Digital e a condição continuam disponíveis. Posso ajustar algum ponto para facilitar a decisão ou o projeto ficou para outro momento?"

**Follow-up D7** (sete dias depois, encerrando a cadência):
"Vou encerrar o acompanhamento por enquanto para não ficar insistindo. Quando fizer sentido retomar, já teremos o contexto e a Amostra Digital do projeto. Caso ainda queira avançar agora, me chama por aqui."

### 6.6 Garantia e pós-venda

**Recebimento de reclamação:**
"Sinto muito pelo problema. Temos garantia de fábrica contra defeitos e vamos analisar o caso. Pode me enviar fotos ou vídeos, a quantidade de pares afetados, as numerações e o número do pedido? Com isso, encaminho para a avaliação interna."
Atenção: não prometer reposição antes da análise.

**Recompra:**
"Que bom que o projeto ficou como esperado. Quando vocês planejarem uma nova ação ou reposição, conseguimos partir desta base e avaliar novas cores, técnicas ou quantidades."

## 7. Avaliação do vendedor

A nota avalia a qualidade do trabalho do vendedor, não apenas o resultado final. Uma venda pode ocorrer com atendimento ruim; uma negociação pode não fechar apesar de uma condução correta.

### 7.1 Critérios e pesos

| Critério | Peso | O que deve ser observado |
|---|---|---|
| Precisão das informações | 25 | Preço, mínimo, prazo, frete, pagamento, personalização e garantia |
| Entendimento da necessidade | 20 | Aplicação, quantidade, data, contexto e decisão |
| Construção de valor | 20 | Conexão entre produto e objetivo do cliente |
| Condução para o próximo passo | 20 | Pergunta útil, microcompromisso e avanço |
| Clareza e comunicação | 15 | Objetividade, tom, português e organização |

### 7.2 Âncoras de pontuação

| Faixa | Classificação | Interpretação |
|---|---|---|
| 90 a 100 | Excelente | Preciso, contextual e orientado ao avanço |
| 80 a 89 | Bom | Boa condução com melhorias pontuais |
| 70 a 79 | Atenção | Perdeu oportunidades importantes |
| 60 a 69 | Insuficiente | Falhas relevantes de condução ou informação |
| Abaixo de 60 | Crítico | Risco comercial, de experiência ou de política |

### 7.3 Erros críticos

- Preço, pedido mínimo, frete ou prazo informados incorretamente.
- Desconto superior a 10% sem autorização.
- Promessa de personalização incompatível com o mínimo.
- Pagamento solicitado antes da Amostra Digital.
- Promessa de reposição antes da análise de garantia.
- Falsa urgência, pressão indevida ou informação inventada.
- Exposição indevida de dados do cliente.

Um erro crítico pode limitar a nota geral a 69, mesmo que o restante da conversa tenha sido bem conduzido.

### 7.4 Regras de justiça

- Não descontar pontos porque o cliente não respondeu.
- Não descontar pontos somente porque a venda não ocorreu.
- Avaliar apenas o que estava sob controle do vendedor.
- Citar evidência textual para cada perda relevante de pontos.
- Marcar como "não avaliável" quando a conversa não oferece dados suficientes.
- Separar qualidade do atendimento, saúde da negociação e resultado comercial.

### 7.5 Formato da avaliação

Saída padrão: nota geral; notas por critério; acertos; falhas; oportunidades perdidas; erros de política; próxima ação; exemplo de mensagem melhor.

## 8. Especificação do Agente Comercial

### 8.1 Objetivo

O agente deve apoiar o vendedor em duas tarefas: avaliar conversas concluídas ou parciais e orientar negociações em andamento. Ele não substitui o julgamento do vendedor ou do gestor.

### 8.2 Modos de operação

- **Auditor de atendimento** — comando sugerido: "Avalie meu atendimento nesta conversa." Entrega: nota, evidências, acertos, falhas e melhoria.
- **Copiloto de negociação** — comando sugerido: "Analise esta negociação e diga o próximo passo." Entrega: diagnóstico, riscos, informação faltante e mensagem sugerida.

### 8.3 Entrada mínima

- Conversa completa ou trecho relevante.
- Etapa atual do CRM, quando disponível.
- Nome do vendedor, para fins de relatório.
- Quantidade, valor e prazo, quando já definidos.
- Objetivo da solicitação: avaliar ou orientar.

### 8.4 Saída do modo Auditor

1. Resumo objetivo da conversa.
2. Nota geral de 0 a 100.
3. Nota e justificativa para cada critério.
4. Evidências da conversa.
5. Principais acertos.
6. Falhas e oportunidades perdidas.
7. Erros críticos ou divergências de política.
8. Exemplo de resposta melhor.

### 8.5 Saída do modo Copiloto

1. Situação atual: avançando, estagnada, em risco, aguardando cliente ou aguardando ação interna.
2. Objetivo provável do cliente, com evidências.
3. Sinais de compra.
4. Objeções ou bloqueios abertos.
5. Informações ainda necessárias.
6. Uma única próxima melhor ação.
7. Mensagem sugerida.
8. O que evitar na próxima resposta.

### 8.6 Regras do agente

- Consultar sempre a versão vigente da base comercial.
- Não inventar preço, prazo, frete, desconto ou política.
- Diferenciar fato, inferência e recomendação.
- Não afirmar emoção ou intenção sem evidência.
- Não dar probabilidade de fechamento inventada.
- Não avaliar conversa curta como se fosse uma negociação completa.
- Não recomendar desconto antes de entender a objeção.
- Não enviar mensagens ao cliente automaticamente sem ação explícita do vendedor.
- Sinalizar dúvidas de política para validação humana.

### 8.7 Prompt-base do agente

Instrução central: "Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes. Avalie o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo. Nunca invente condições comerciais."

### 8.8 Exemplo de saída — Copiloto (Aguardando aprovação interna)

- Situação: cliente enviou o logo e pediu prazo e forma de pagamento.
- Sinal de compra: pergunta objetiva sobre prazo e pagamento.
- Bloqueio: sócio ainda não avaliou a Amostra Digital.
- Próxima ação: facilitar a aprovação com um resumo objetivo.
- Mensagem: "Posso te enviar um resumo com a Amostra Digital, quantidade, valor, prazo e pagamento para você encaminhar ao seu sócio?"
- Evitar: oferecer desconto antes de saber se preço é a objeção.
`;
