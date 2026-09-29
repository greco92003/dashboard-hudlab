// Uso (só com autorização do Greco, num contato de teste da equipe):
//   node --env-file=.env.local scripts/ai-seller-verify-ghl.mjs <contactId> [--enviar]
// Sem --enviar, não manda WhatsApp.
const BASE = "https://services.leadconnectorhq.com";
const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const [contactId, flag] = process.argv.slice(2);
if (!contactId) {
  console.error("Informe o contactId de teste.");
  process.exit(1);
}

async function call(path, method, version, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

const TAG = "ia-verificacao";

const add = await call(`/contacts/${contactId}/tags`, "POST", "2021-07-28", { tags: [TAG] });
let contact = await call(`/contacts/${contactId}`, "GET", "2021-07-28");
console.log("adicionar tag:", add.status, "| tag presente:", contact.json.contact?.tags?.includes(TAG));

const del = await call(`/contacts/${contactId}/tags`, "DELETE", "2021-07-28", { tags: [TAG] });
contact = await call(`/contacts/${contactId}`, "GET", "2021-07-28");
console.log("remover tag:", del.status, "| tag presente:", contact.json.contact?.tags?.includes(TAG));

console.log("assignedTo atual:", contact.json.contact?.assignedTo ?? null);

if (flag === "--enviar") {
  const sent = await call("/conversations/messages", "POST", "2021-04-15", {
    type: "WhatsApp",
    contactId,
    message: "Teste de integração da IA vendedora — pode ignorar.",
  });
  console.log("envio:", sent.status, JSON.stringify(sent.json));
  const messageId = sent.json.messageId;
  const conversationId = sent.json.conversationId;
  if (messageId && conversationId) {
    await new Promise((r) => setTimeout(r, 5000));
    const list = await call(
      `/conversations/${conversationId}/messages?limit=20`,
      "GET",
      "2021-04-15",
    );
    const found = (list.json.messages?.messages ?? []).find((m) => m.id === messageId);
    console.log("mensagem aparece na conversa com o mesmo id:", Boolean(found), "| source:", found?.source);
  }
}
