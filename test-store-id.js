// Script para validar uma conta Nuvemshop sem credenciais embutidas no codigo.
require('dotenv').config({ path: '.env.local' });

const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
const userId = process.env.NUVEMSHOP_USER_ID || process.env.NUVEMSHOP_STORE_ID;

if (!accessToken || !userId) {
  throw new Error(
    'Configure NUVEMSHOP_ACCESS_TOKEN e NUVEMSHOP_USER_ID (ou NUVEMSHOP_STORE_ID).',
  );
}

async function getStoreId() {
  const url = `https://api.nuvemshop.com.br/v1/${encodeURIComponent(userId)}/store`;
  const response = await fetch(url, {
    headers: {
      Authentication: `bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'HUDLAB Dashboard (security@hudlab.com.br)',
    },
  });

  if (!response.ok) {
    throw new Error(`Nuvemshop respondeu com status ${response.status}.`);
  }

  const store = await response.json();
  console.log({ id: store.id, name: store.name });
}

getStoreId().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
