require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

async function fetchDeals(limit = 100, offset = 0) {
  const url = `${BASE_URL}/api/3/deals?limit=${limit}&offset=${offset}`;

  const response = await fetch(url, {
    headers: {
      "Api-Token": API_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch deals: ${response.statusText}`);
  }

  return await response.json();
}

async function findDealById(dealId) {
  console.log(`\n🔍 Searching for deal ${dealId} in ActiveCampaign...`);

  let offset = 0;
  const limit = 100;
  let found = false;

  while (!found && offset < 5000) {
    // Limit search to first 5000 deals
    const data = await fetchDeals(limit, offset);

    if (!data.deals || data.deals.length === 0) {
      break;
    }

    const deal = data.deals.find((d) => d.id === dealId);

    if (deal) {
      console.log("✅ FOUND!");
      console.log(`   ID: ${deal.id}`);
      console.log(`   Title: ${deal.title}`);
      console.log(`   Value (raw): ${deal.value}`);
      console.log(
        `   Value (in reais): R$ ${(
          parseFloat(deal.value || "0") / 100
        ).toFixed(2)}`
      );
      console.log(`   Currency: ${deal.currency}`);
      console.log(`   Status: ${deal.status} (0=Open, 1=Won, 2=Lost)`);
      console.log(`   Owner: ${deal.owner}`);
      console.log(`   Contact: ${deal.contact}`);
      console.log(`   Created: ${deal.cdate}`);
      console.log(`   Updated: ${deal.mdate}`);
      found = true;
      return deal;
    }

    offset += limit;
    console.log(`   Searched ${offset} deals...`);
  }

  if (!found) {
    console.log(`❌ Deal ${dealId} NOT FOUND in ActiveCampaign`);
    console.log(`   This deal may have been deleted or merged.`);
  }

  return null;
}

async function main() {
  console.log("🚀 Starting deal search in ActiveCampaign...\n");
  console.log("=".repeat(60));

  const dealsToFind = [
    "10725",
    "10399",
    "8494",
    "12460",
    "8700",
    "9088",
    "4202",
    "9295",
    "8739",
    "11080",
    "10682",
    "10713",
    "14818",
    "10029",
    "10915",
    "14798",
  ];

  const results = {
    found: [],
    notFound: [],
  };

  for (const dealId of dealsToFind) {
    const deal = await findDealById(dealId);
    if (deal) {
      results.found.push(dealId);
    } else {
      results.notFound.push(dealId);
    }
    console.log("=".repeat(60));
  }

  console.log("\n📊 SUMMARY:");
  console.log(`✅ Found: ${results.found.length} deals`);
  console.log(`❌ Not Found: ${results.notFound.length} deals`);

  if (results.notFound.length > 0) {
    console.log("\n🗑️  Deals to delete from cache:");
    console.log(results.notFound.join(", "));
  }

  console.log("\n✅ Search complete!");
}

main().catch(console.error);
