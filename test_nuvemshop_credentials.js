// Script para testar credenciais do NuvemShop
const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
const userId = process.env.NUVEMSHOP_USER_ID;

console.log("🔍 Verificando credenciais do NuvemShop...");
console.log("Access Token:", accessToken ? `${accessToken.substring(0, 10)}...` : "❌ Não configurado");
console.log("User ID:", userId ? userId : "❌ Não configurado");

if (accessToken && userId) {
  console.log("✅ Credenciais encontradas!");
  
  // Testar chamada para a API
  fetch(`https://api.nuvemshop.com.br/v1/${userId}/store`, {
    headers: {
      'Authentication': `bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'HudLab Dashboard (contato@hudlab.com.br)'
    }
  })
  .then(response => {
    if (response.ok) {
      console.log("✅ API do NuvemShop respondeu com sucesso!");
      return response.json();
    } else {
      console.log(`❌ Erro na API: ${response.status}`);
      return response.text();
    }
  })
  .then(data => {
    console.log("Resposta da API:", data);
  })
  .catch(error => {
    console.error("❌ Erro ao testar API:", error);
  });
} else {
  console.log("❌ Configure as variáveis NUVEMSHOP_ACCESS_TOKEN e NUVEMSHOP_USER_ID");
}
