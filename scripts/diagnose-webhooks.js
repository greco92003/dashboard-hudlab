#!/usr/bin/env node

// =====================================================
// SCRIPT DE DIAGNÓSTICO DE WEBHOOKS
// =====================================================
// Script para diagnosticar problemas com webhooks do Nuvemshop

require("dotenv").config({ path: ".env.local" });

// Importar fetch (Node.js 18+ tem fetch nativo)
let fetch;
if (typeof globalThis.fetch === "undefined") {
  fetch = require("node-fetch");
} else {
  fetch = globalThis.fetch;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const NUVEMSHOP_ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;
const NUVEMSHOP_USER_ID = process.env.NUVEMSHOP_USER_ID;

// Cores para output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Fazer requisição para API do Nuvemshop
async function makeNuvemshopRequest(endpoint, options = {}) {
  const url = `https://api.nuvemshop.com.br/v1/${NUVEMSHOP_USER_ID}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authentication: `bearer ${NUVEMSHOP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "HudLab Dashboard Diagnostic Script",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Fazer requisição para nossa API local
async function makeLocalRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// 1. Verificar configuração
async function checkConfiguration() {
  log("🔍 1. VERIFICANDO CONFIGURAÇÃO...", "bright");

  const issues = [];

  if (!NUVEMSHOP_ACCESS_TOKEN) {
    issues.push("NUVEMSHOP_ACCESS_TOKEN não configurado");
  } else {
    log("✅ NUVEMSHOP_ACCESS_TOKEN configurado", "green");
  }

  if (!NUVEMSHOP_USER_ID) {
    issues.push("NUVEMSHOP_USER_ID não configurado");
  } else {
    log("✅ NUVEMSHOP_USER_ID configurado", "green");
  }

  if (!BASE_URL || BASE_URL.includes("localhost")) {
    issues.push("NEXT_PUBLIC_APP_URL deve ser uma URL pública (não localhost)");
  } else {
    log("✅ NEXT_PUBLIC_APP_URL configurado", "green");
  }

  if (issues.length > 0) {
    log("❌ Problemas de configuração encontrados:", "red");
    issues.forEach((issue) => log(`   - ${issue}`, "red"));
    return false;
  }

  log("✅ Configuração válida", "green");
  return true;
}

// 2. Verificar webhooks registrados no Nuvemshop
async function checkNuvemshopWebhooks() {
  log("\n🔍 2. VERIFICANDO WEBHOOKS NO NUVEMSHOP...", "bright");

  try {
    const webhooks = await makeNuvemshopRequest("/webhooks");

    if (webhooks.length === 0) {
      log("❌ Nenhum webhook registrado no Nuvemshop", "red");
      return [];
    }

    log(`✅ Encontrados ${webhooks.length} webhooks no Nuvemshop:`, "green");
    webhooks.forEach((webhook) => {
      log(`   - ${webhook.event} (ID: ${webhook.id})`, "cyan");
      log(`     URL: ${webhook.url}`, "cyan");
      log(`     Criado: ${webhook.created_at}`, "cyan");
    });

    return webhooks;
  } catch (error) {
    log(`❌ Erro ao buscar webhooks: ${error.message}`, "red");
    return [];
  }
}

// 3. Verificar webhooks no banco local
async function checkLocalWebhooks() {
  log("\n🔍 3. VERIFICANDO WEBHOOKS NO BANCO LOCAL...", "bright");

  try {
    const response = await makeLocalRequest("/api/webhooks/manage");
    const localWebhooks = response.data.local_webhooks;

    if (localWebhooks.length === 0) {
      log("❌ Nenhum webhook no banco local", "red");
      return [];
    }

    log(
      `✅ Encontrados ${localWebhooks.length} webhooks no banco local:`,
      "green"
    );
    localWebhooks.forEach((webhook) => {
      const status = webhook.is_registered ? "✅" : "❌";
      log(`   ${status} ${webhook.event} (Status: ${webhook.status})`, "cyan");
      if (webhook.last_error) {
        log(`     Último erro: ${webhook.last_error}`, "red");
      }
    });

    return localWebhooks;
  } catch (error) {
    log(`❌ Erro ao buscar webhooks locais: ${error.message}`, "red");
    return [];
  }
}

// 4. Verificar logs de webhooks recentes
async function checkWebhookLogs() {
  log("\n🔍 4. VERIFICANDO LOGS DE WEBHOOKS...", "bright");

  try {
    const response = await makeLocalRequest("/api/webhooks/logs?limit=10");
    const logs = response.data.logs;

    if (logs.length === 0) {
      log("❌ Nenhum log de webhook encontrado", "red");
      log("   Isso indica que nenhum webhook foi recebido", "yellow");
      return [];
    }

    log(`✅ Encontrados ${logs.length} logs recentes:`, "green");
    logs.forEach((log_entry) => {
      const statusColor =
        log_entry.status === "processed"
          ? "green"
          : log_entry.status === "failed"
          ? "red"
          : "yellow";
      log(
        `   - ${log_entry.event} (${log_entry.resource_id}) - ${log_entry.status}`,
        statusColor
      );
      log(
        `     Recebido: ${new Date(log_entry.received_at).toLocaleString()}`,
        "cyan"
      );
      if (log_entry.error_message) {
        log(`     Erro: ${log_entry.error_message}`, "red");
      }
    });

    return logs;
  } catch (error) {
    log(`❌ Erro ao buscar logs: ${error.message}`, "red");
    return [];
  }
}

// 5. Testar conectividade dos endpoints
async function testEndpoints() {
  log("\n🔍 5. TESTANDO CONECTIVIDADE DOS ENDPOINTS...", "bright");

  const endpoints = [
    "/api/webhooks/nuvemshop",
    "/api/webhooks/nuvemshop/product-updated",
    "/api/webhooks/nuvemshop/order-created",
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "GET",
        headers: {
          "User-Agent": "HudLab Diagnostic Test",
        },
      });

      if (response.ok) {
        log(`✅ ${endpoint} - Acessível`, "green");
      } else {
        log(`⚠️  ${endpoint} - Status ${response.status}`, "yellow");
      }
    } catch (error) {
      log(`❌ ${endpoint} - Erro: ${error.message}`, "red");
    }
  }
}

// 6. Verificar se URLs dos webhooks estão corretas
async function validateWebhookUrls(nuvemshopWebhooks) {
  log("\n🔍 6. VALIDANDO URLs DOS WEBHOOKS...", "bright");

  if (nuvemshopWebhooks.length === 0) {
    log("⏭️  Pulando - nenhum webhook para validar", "yellow");
    return;
  }

  const expectedBaseUrl = BASE_URL.replace(/\/$/, "");

  nuvemshopWebhooks.forEach((webhook) => {
    const expectedUrl = `${expectedBaseUrl}/api/webhooks/nuvemshop/${webhook.event.replace(
      "/",
      "-"
    )}`;

    if (webhook.url === expectedUrl) {
      log(`✅ ${webhook.event} - URL correta`, "green");
    } else {
      log(`❌ ${webhook.event} - URL incorreta:`, "red");
      log(`   Esperado: ${expectedUrl}`, "cyan");
      log(`   Atual: ${webhook.url}`, "cyan");
    }
  });
}

// 7. Testar webhook manualmente
async function testWebhook() {
  log("\n🔍 7. TESTANDO WEBHOOK MANUALMENTE...", "bright");

  try {
    const response = await makeLocalRequest("/api/webhooks/test", {
      method: "POST",
      body: JSON.stringify({
        event: "product/updated",
      }),
    });

    if (response.success) {
      log("✅ Teste de webhook bem-sucedido", "green");
      log(`   Status: ${response.data.webhook_status}`, "cyan");
    } else {
      log("❌ Teste de webhook falhou", "red");
      log(`   Erro: ${response.error}`, "red");
    }
  } catch (error) {
    log(`❌ Erro no teste de webhook: ${error.message}`, "red");
  }
}

// 8. Verificar produtos recentes no Nuvemshop
async function checkRecentProducts() {
  log("\n🔍 8. VERIFICANDO PRODUTOS RECENTES NO NUVEMSHOP...", "bright");

  try {
    const products = await makeNuvemshopRequest("/products?limit=5&per_page=5");

    if (products.length === 0) {
      log("❌ Nenhum produto encontrado", "red");
      return;
    }

    log(`✅ Encontrados ${products.length} produtos recentes:`, "green");
    products.forEach((product) => {
      log(
        `   - ${product.name?.pt || product.name} (ID: ${product.id})`,
        "cyan"
      );
      log(`     Atualizado: ${product.updated_at}`, "cyan");
    });

    // Sugerir teste manual
    const latestProduct = products[0];
    log(
      `\n💡 SUGESTÃO: Tente atualizar o produto "${
        latestProduct.name?.pt || latestProduct.name
      }" (ID: ${latestProduct.id}) no Nuvemshop`,
      "magenta"
    );
    log(
      "   e verifique se o webhook é recebido nos próximos minutos.",
      "magenta"
    );
  } catch (error) {
    log(`❌ Erro ao buscar produtos: ${error.message}`, "red");
  }
}

// Função principal de diagnóstico
async function runDiagnosis() {
  log("🔍 DIAGNÓSTICO COMPLETO DE WEBHOOKS NUVEMSHOP", "bright");
  log("================================================\n", "bright");

  // 1. Verificar configuração
  const configOk = await checkConfiguration();
  if (!configOk) {
    log("\n❌ Corrija os problemas de configuração antes de continuar.", "red");
    return;
  }

  // 2. Verificar webhooks no Nuvemshop
  const nuvemshopWebhooks = await checkNuvemshopWebhooks();

  // 3. Verificar webhooks no banco local
  const localWebhooks = await checkLocalWebhooks();

  // 4. Verificar logs
  const logs = await checkWebhookLogs();

  // 5. Testar endpoints
  await testEndpoints();

  // 6. Validar URLs
  await validateWebhookUrls(nuvemshopWebhooks);

  // 7. Testar webhook
  await testWebhook();

  // 8. Verificar produtos recentes
  await checkRecentProducts();

  // Resumo e recomendações
  log("\n📋 RESUMO E RECOMENDAÇÕES:", "bright");
  log("============================", "bright");

  if (nuvemshopWebhooks.length === 0) {
    log("🔧 AÇÃO NECESSÁRIA: Registrar webhooks no Nuvemshop", "yellow");
    log("   Execute: npm run webhooks:setup", "cyan");
  } else if (logs.length === 0) {
    log(
      "🔧 POSSÍVEL PROBLEMA: Webhooks registrados mas nenhum recebido",
      "yellow"
    );
    log(
      "   1. Verifique se a URL da aplicação está acessível publicamente",
      "cyan"
    );
    log("   2. Teste atualizando um produto no Nuvemshop", "cyan");
    log("   3. Verifique logs do servidor para erros", "cyan");
  } else {
    const recentLogs = logs.filter((log) => {
      const logDate = new Date(log.received_at);
      const now = new Date();
      return now - logDate < 24 * 60 * 60 * 1000; // últimas 24h
    });

    if (recentLogs.length > 0) {
      log(
        "✅ Sistema de webhooks funcionando - logs recentes encontrados",
        "green"
      );
    } else {
      log("⚠️  Webhooks configurados mas sem atividade recente", "yellow");
      log("   Teste atualizando um produto no Nuvemshop", "cyan");
    }
  }

  log("\n🔗 Para mais informações, acesse: /admin/webhooks", "cyan");
}

// Executar diagnóstico
if (require.main === module) {
  runDiagnosis().catch((error) => {
    log(`❌ Erro fatal no diagnóstico: ${error.message}`, "red");
    process.exit(1);
  });
}

module.exports = { runDiagnosis };
