// Script para testar e descobrir o store_id
const accessToken = "1f17aa5e76e31ac96fbdae88b45e2f805c041cfe";
const userId = "6400602";

async function getStoreId() {
  try {
    const url = `https://api.nuvemshop.com.br/v1/${userId}/store`;
    
    const response = await fetch(url, {
      headers: {
        "Authentication": `bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
      },
    });

    if (!response.ok) {
      console.error(`Error: ${response.status}`);
      const errorText = await response.text();
      console.error(errorText);
      return;
    }

    const data = await response.json();
    console.log("Store ID:", data.id);
    console.log("Store Name:", data.name);
    console.log("Store URL:", data.url);
    console.log("Full data:", JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

getStoreId();