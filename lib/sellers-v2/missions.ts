// Missões da Arena: situações reais da Hud Lab para treinar. Módulo puro.
//
// Cada missão define o cliente simulado (quem é, o que quer, que objeções
// traz) e o objetivo do vendedor. As de ⭐⭐⭐ são o que fica com as pessoas
// agora que a Cami atende o começo da conversa: fechamento e exceções.

export interface Mission {
  id: string;
  /** Posição na trilha do novo vendedor (1 = primeira). */
  ordem: number;
  titulo: string;
  dificuldade: 1 | 2 | 3;
  /** Uma linha para o cartão. */
  resumo: string;
  /** Primeira mensagem do cliente. */
  abertura: string;
  /** Para o cliente simulado: quem é, o que quer, como reage. */
  cliente: string;
  /** Para o vendedor: o que é um bom treino nesta missão. */
  objetivo: string;
  /** Nome curto na trilha. */
  curto: string;
}

export const MISSIONS: readonly Mission[] = [
  {
    id: "primeiro-contato",
    ordem: 1,
    curto: "Contato",
    titulo: "Primeiro contato: entender o evento",
    dificuldade: 1,
    resumo: "Descobrir para que é o chinelo, quantas pessoas e a data.",
    abertura: "Oi! Vi o anúncio de vocês. Queria chinelos personalizados para um evento, como funciona?",
    cliente:
      "Você organiza a confraternização de fim de ano de uma empresa de contabilidade com 40 funcionários, no dia 12 de dezembro. Ainda não sabe quantos pares nem as numerações. Responde de forma vaga até o vendedor fazer boas perguntas; só revela data, quantidade e quem decide (a diretora) quando perguntado.",
    objetivo: "Entender aplicação, quantidade, data e quem decide antes de falar de preço, e levar para o envio do logo.",
  },
  {
    id: "duvidas-produto",
    ordem: 2,
    curto: "Produto",
    titulo: "Dúvidas de produto",
    dificuldade: 1,
    resumo: "Material, grade de numeração, prazo de produção e entrega.",
    abertura: "Boa tarde! Antes de pedir orçamento: o chinelo é confortável mesmo? Qual o material?",
    cliente:
      "Você é dono de uma academia e quer 30 pares para alunos VIP. Tem medo de o chinelo ser duro ou desconfortável, quer saber material, numerações disponíveis (inclusive tamanhos grandes) e quanto tempo leva para chegar. Pergunta uma coisa de cada vez.",
    objetivo: "Responder material, grade e prazos com precisão (manual) e conduzir para a Amostra Digital.",
  },
  {
    id: "doze-pares-caro",
    ordem: 3,
    curto: "12 pares",
    titulo: "12 pares achando caro",
    dificuldade: 2,
    resumo: "Pedido mínimo, cliente sensível a preço. Mostrar valor sem dar desconto.",
    abertura: "Oi, quanto fica 12 pares com a logo da minha loja? Achei meio caro no site.",
    cliente:
      "Você tem uma loja pequena de roupas e quer 12 pares para dar de brinde. Acha R$ 59,90 o par caro e diz que viu chinelo personalizado por R$ 35 no marketplace. Cede se o vendedor mostrar com clareza o que está incluso (caixa personalizada, sola Comfort, amostra digital) sem inventar desconto.",
    objetivo: "Mostrar valor (o que está incluso) sem desconto fora do manual e levar para a amostra.",
  },
  {
    id: "prazo-apertado",
    ordem: 4,
    curto: "Prazo",
    titulo: "Evento com prazo apertado",
    dificuldade: 2,
    resumo: "O evento é daqui a 3 semanas. O que dá para garantir?",
    abertura: "Preciso de 60 pares para um evento daqui a 3 semanas. Vocês conseguem entregar a tempo?",
    cliente:
      "Você organiza uma corrida de rua em outra cidade, daqui a 3 semanas, e precisa de 60 pares. Está ansioso com o prazo e quer garantia de entrega. Testa se o vendedor promete algo que não pode cumprir. Valoriza honestidade sobre produção (20 dias úteis após pagamento) mais 5 dias úteis de entrega.",
    objetivo: "Explicar o prazo real (amostra, pagamento, 20 dias úteis de produção, 5 de entrega) sem prometer o impossível e acelerar as etapas.",
  },
  {
    id: "pedido-desconto",
    ordem: 5,
    curto: "Desconto",
    titulo: "Pedido de desconto",
    dificuldade: 2,
    resumo: "O cliente quer 15% para fechar hoje. O manual permite menos.",
    abertura: "Gostei da amostra! Se vocês fizerem 15% de desconto eu fecho hoje os 50 pares.",
    cliente:
      "Você já aprovou a Amostra Digital de 50 pares para sua empresa e quer 15% de desconto para fechar hoje. Insiste duas vezes. Aceita o PIX à vista com 5% se o vendedor apresentar bem, mas desiste se ele for evasivo ou inventar condição.",
    objetivo: "Negociar dentro do manual (PIX à vista 5%), sem desconto inventado, e fechar forma de pagamento e grade.",
  },
  {
    id: "sumiu-e-voltou",
    ordem: 6,
    curto: "Voltou",
    titulo: "Cliente que sumiu e voltou",
    dificuldade: 2,
    resumo: "Recebeu a amostra há 10 dias e só agora respondeu.",
    abertura: "Oi, desculpa a demora! Ainda dá para fazer aquele orçamento dos chinelos?",
    cliente:
      "Você recebeu a Amostra Digital há 10 dias e sumiu porque o orçamento travou na aprovação interna. Agora voltou meio sem graça, com o prazo mais curto e com uma dúvida sobre trocar a cor da arte. Responde bem a um vendedor que retoma sem cobrar e organiza os próximos passos.",
    objetivo: "Retomar sem constranger, confirmar o que mudou (prazo, arte) e reorganizar os próximos passos.",
  },
  {
    id: "concorrencia",
    ordem: 7,
    curto: "Concorrência",
    titulo: "Comparando com a concorrência",
    dificuldade: 3,
    resumo: "Orçamento mais barato de outra fábrica na mão.",
    abertura: "Recebi o orçamento de vocês, mas outra fábrica me passou R$ 42 o par para os mesmos 60 pares. Por que pagar mais?",
    cliente:
      "Você é compradora de uma rede de academias, quer 60 pares e tem um orçamento de outra fábrica a R$ 42 o par (sem caixa e com frete à parte de uns R$ 90). Decide rápido, mas desconfia de preço alto. Pede para chegar perto de R$ 50. Cede se o vendedor comparar o que está incluso e não baixar o preço sem critério.",
    objetivo: "Comparar o que está incluso (frete grátis a partir de 36, caixa, materiais) sem desconto fora do manual e levar à amostra.",
  },
  {
    id: "pedido-grande",
    ordem: 8,
    curto: "500+ pares",
    titulo: "Pedido grande: 500+ pares",
    dificuldade: 3,
    resumo: "Empresa com vários uniformes, negociação longa e comprador exigente.",
    abertura: "Somos uma rede com 12 unidades e queremos 600 pares para os funcionários. Qual a melhor condição?",
    cliente:
      "Você é comprador corporativo de uma rede de farmácias, precisa de 600 pares com grade variada e entrega dividida em 3 cidades. Pede condição especial, prazo de pagamento faturado e amostra física. É exigente e formal; testa se o vendedor sabe o que pode decidir sozinho e quando envolver a gestão.",
    objetivo: "Qualificar bem (grade, entregas, prazo), usar a tabela de 500+ e saber passar a condição especial para quem decide.",
  },
  {
    id: "reclamacao",
    ordem: 9,
    curto: "Reclamação",
    titulo: "Reclamação de pedido anterior",
    dificuldade: 3,
    resumo: "Um par veio com defeito no último pedido. Recuperar a confiança.",
    abertura: "Olha, no último pedido vieram 3 pares com a tira descolando. Antes de pedir de novo quero entender o que vocês vão fazer.",
    cliente:
      "Você comprou 80 pares há 2 meses e 3 vieram com a tira descolando. Está chateado, quer solução para os defeituosos e garantia de que não vai acontecer no novo pedido de 100 pares. Acalma se o vendedor acolher, pedir fotos e explicar a garantia; irrita se ele se defender ou prometer o que não pode.",
    objetivo: "Acolher, seguir a garantia (fotos, quantidade, pedido) sem prometer além dela e recuperar o novo pedido.",
  },
  {
    id: "fechamento",
    ordem: 10,
    curto: "Fechamento",
    titulo: "Fechamento: pagamento e grade",
    dificuldade: 3,
    resumo: "Arte aprovada. Falta a forma de pagamento e a grade de numerações.",
    abertura: "Arte aprovada! E agora, como faço para pagar e passar os tamanhos?",
    cliente:
      "Você aprovou a arte de 45 pares para o time de futebol amador. Quer parcelar no cartão, ainda não tem a grade (os jogadores calçam de 37 a 44) e pergunta quando chega. Fica confuso se o vendedor mandar tudo de uma vez.",
    objetivo: "Fechar uma coisa por vez: forma de pagamento, grade e endereço/CEP, com prazos corretos.",
  },
];

/** Treino livre (o cliente sorteado de antes). Sempre liberado; não faz parte da trilha. */
export const FREE_MISSION_ID = "livre";

export const missionById = (id: string | null | undefined): Mission | null =>
  (id && MISSIONS.find((m) => m.id === id)) || null;

/** Nota mínima para liberar a próxima missão da trilha. */
export const TRILHA_NOTA_MINIMA = 70;

/**
 * Missões liberadas: a primeira da trilha, as seguintes depois de 70+ na
 * anterior, e o desafio da semana (sempre liberado). Treino livre sempre.
 */
export function unlockedMissions(bestScores: Record<string, number>, desafioId: string | null): Set<string> {
  const unlocked = new Set<string>([FREE_MISSION_ID]);
  if (desafioId) unlocked.add(desafioId);
  const ordered = [...MISSIONS].sort((a, b) => a.ordem - b.ordem);
  for (const m of ordered) {
    unlocked.add(m.id);
    if ((bestScores[m.id] ?? -1) < TRILHA_NOTA_MINIMA) break;
  }
  return unlocked;
}

/** Desafio da semana: missões ⭐⭐ e ⭐⭐⭐ em rodízio, trocando toda segunda (horário de Brasília). */
export function weeklyChallenge(nowMs: number): { mission: Mission; semana: string; terminaEm: number } {
  const local = new Date(nowMs - 3 * 60 * 60 * 1000);
  const weekday = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - weekday);
  const weekIndex = Math.floor(monday / (7 * 24 * 60 * 60 * 1000));
  const pool = MISSIONS.filter((m) => m.dificuldade >= 2);
  const mission = pool[((weekIndex % pool.length) + pool.length) % pool.length];
  // Próxima segunda 00:00 em Brasília, em ms UTC.
  const terminaEm = monday + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000;
  return { mission, semana: new Date(monday).toISOString().slice(0, 10), terminaEm };
}
