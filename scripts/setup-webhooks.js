#!/usr/bin/env node

// =====================================================
// SCRIPT PARA CONFIGURAR WEBHOOKS ESSENCIAIS
// =====================================================
// Script para registrar webhooks essenciais do Nuvemshop automaticamente

const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const NUVEMSHOP_ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;
const NUVEMSHOP_USER_ID = process.env.NUVEMSHOP_USER_ID;

// Eventos essenciais para o sistema
const ESSENTIAL_EVENTS = [
  {
    event: 'order/created',
    description: 'Webhook essencial para novos pedidos criados'
  },
  {
    event: 'order/paid',
    description: 'Webhook essencial para pedidos pagos'
  },
  {
    event: 'order/updated',
    description: 'Webhook essencial para atualizações de pedidos'
  },
  {
    event: 'order/cancelled',
    description: 'Webhook essencial para pedidos cancelados'
  },
  {
    event: 'product/created',
    description: 'Webhook essencial para novos produtos criados'
  },
  {
    event: 'product/updated',
    description: 'Webhook essencial para atualizações de produtos'
  },
  {
    event: 'product/deleted',
    description: 'Webhook essencial para produtos deletados'
  }
];

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Verificar configuração
function checkConfiguration() {
  log('🔍 Verificando configuração...', 'blue');
  
  if (!NUVEMSHOP_ACCESS_TOKEN) {
    log('❌ NUVEMSHOP_ACCESS_TOKEN não configurado', 'red');
    return false;
  }
  
  if (!NUVEMSHOP_USER_ID) {
    log('❌ NUVEMSHOP_USER_ID não configurado', 'red');
    return false;
  }
  
  if (!BASE_URL) {
    log('❌ NEXT_PUBLIC_APP_URL não configurado', 'red');
    return false;
  }
  
  log('✅ Configuração válida', 'green');
  log(`   - Base URL: ${BASE_URL}`, 'cyan');
  log(`   - User ID: ${NUVEMSHOP_USER_ID}`, 'cyan');
  return true;
}

// Fazer requisição para API do Nuvemshop
async function makeNuvemshopRequest(endpoint, options = {}) {
  const url = `https://api.nuvemshop.com.br/v1/${NUVEMSHOP_USER_ID}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authentication': `bearer ${NUVEMSHOP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'HudLab Dashboard Setup Script',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Listar webhooks existentes
async function listExistingWebhooks() {
  try {
    log('📋 Listando webhooks existentes...', 'blue');
    const webhooks = await makeNuvemshopRequest('/webhooks');
    
    if (webhooks.length === 0) {
      log('   Nenhum webhook encontrado', 'yellow');
    } else {
      log(`   Encontrados ${webhooks.length} webhooks:`, 'cyan');
      webhooks.forEach(webhook => {
        log(`   - ${webhook.event} (ID: ${webhook.id})`, 'cyan');
      });
    }
    
    return webhooks;
  } catch (error) {
    log(`❌ Erro ao listar webhooks: ${error.message}`, 'red');
    return [];
  }
}

// Registrar webhook
async function registerWebhook(eventConfig) {
  const webhookUrl = `${BASE_URL}/api/webhooks/nuvemshop/${eventConfig.event.replace('/', '-')}`;
  
  try {
    log(`🔗 Registrando webhook: ${eventConfig.event}`, 'blue');
    log(`   URL: ${webhookUrl}`, 'cyan');
    
    const result = await makeNuvemshopRequest('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        event: eventConfig.event,
        url: webhookUrl,
      }),
    });
    
    log(`✅ Webhook registrado com sucesso (ID: ${result.id})`, 'green');
    return result;
  } catch (error) {
    log(`❌ Erro ao registrar webhook ${eventConfig.event}: ${error.message}`, 'red');
    return null;
  }
}

// Configurar webhooks essenciais
async function setupEssentialWebhooks() {
  log('🚀 Iniciando configuração de webhooks essenciais...', 'bright');
  
  // Verificar configuração
  if (!checkConfiguration()) {
    process.exit(1);
  }
  
  // Listar webhooks existentes
  const existingWebhooks = await listExistingWebhooks();
  const existingEvents = existingWebhooks.map(w => w.event);
  
  // Registrar webhooks essenciais
  let registered = 0;
  let skipped = 0;
  let failed = 0;
  
  log('\n🎯 Registrando webhooks essenciais...', 'bright');
  
  for (const eventConfig of ESSENTIAL_EVENTS) {
    if (existingEvents.includes(eventConfig.event)) {
      log(`⏭️  Webhook ${eventConfig.event} já existe - pulando`, 'yellow');
      skipped++;
    } else {
      const result = await registerWebhook(eventConfig);
      if (result) {
        registered++;
      } else {
        failed++;
      }
      
      // Pequena pausa entre registros
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Resumo
  log('\n📊 Resumo da configuração:', 'bright');
  log(`   ✅ Registrados: ${registered}`, 'green');
  log(`   ⏭️  Já existiam: ${skipped}`, 'yellow');
  log(`   ❌ Falharam: ${failed}`, 'red');
  log(`   📋 Total: ${ESSENTIAL_EVENTS.length}`, 'cyan');
  
  if (failed === 0) {
    log('\n🎉 Configuração de webhooks concluída com sucesso!', 'green');
    log('   Os webhooks estão prontos para receber notificações do Nuvemshop.', 'cyan');
  } else {
    log('\n⚠️  Configuração concluída com alguns erros.', 'yellow');
    log('   Verifique os logs acima e tente novamente se necessário.', 'cyan');
  }
}

// Verificar saúde dos webhooks
async function checkWebhookHealth() {
  try {
    log('\n🏥 Verificando saúde dos webhooks...', 'blue');
    
    const webhooks = await listExistingWebhooks();
    const baseUrl = BASE_URL.replace(/\/$/, ''); // Remove trailing slash
    
    let healthy = 0;
    let issues = 0;
    
    for (const webhook of webhooks) {
      const expectedUrl = `${baseUrl}/api/webhooks/nuvemshop/${webhook.event.replace('/', '-')}`;
      
      if (webhook.url === expectedUrl) {
        log(`✅ ${webhook.event} - URL correta`, 'green');
        healthy++;
      } else {
        log(`⚠️  ${webhook.event} - URL incorreta:`, 'yellow');
        log(`   Esperado: ${expectedUrl}`, 'cyan');
        log(`   Atual: ${webhook.url}`, 'cyan');
        issues++;
      }
    }
    
    log(`\n📊 Saúde dos webhooks:`, 'bright');
    log(`   ✅ Saudáveis: ${healthy}`, 'green');
    log(`   ⚠️  Com problemas: ${issues}`, 'yellow');
    
  } catch (error) {
    log(`❌ Erro na verificação de saúde: ${error.message}`, 'red');
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';
  
  switch (command) {
    case 'setup':
      await setupEssentialWebhooks();
      break;
    case 'list':
      await listExistingWebhooks();
      break;
    case 'health':
      await checkWebhookHealth();
      break;
    case 'help':
      log('📖 Comandos disponíveis:', 'bright');
      log('   setup  - Configurar webhooks essenciais (padrão)', 'cyan');
      log('   list   - Listar webhooks existentes', 'cyan');
      log('   health - Verificar saúde dos webhooks', 'cyan');
      log('   help   - Mostrar esta ajuda', 'cyan');
      break;
    default:
      log(`❌ Comando desconhecido: ${command}`, 'red');
      log('   Use "help" para ver comandos disponíveis', 'yellow');
      process.exit(1);
  }
}

// Executar script
if (require.main === module) {
  main().catch(error => {
    log(`❌ Erro fatal: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = {
  setupEssentialWebhooks,
  listExistingWebhooks,
  checkWebhookHealth,
};
