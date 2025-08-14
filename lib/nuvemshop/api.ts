const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Interface para dados de cupom conforme documentação NuvemShop
export interface NuvemshopCouponPayload {
  code: string;
  type: "percentage" | "absolute" | "shipping";
  value: string;
  valid?: boolean;
  start_date?: string; // YYYY-MM-DD format
  end_date?: string; // YYYY-MM-DD format
  min_price?: number;
  max_uses?: number | null;
  includes_shipping?: boolean;
  first_consumer_purchase?: boolean;
  combines_with_other_discounts?: boolean;
  categories?: number[];
  products?: number[];
}

// Helper function to make authenticated requests to Nuvemshop API
export async function fetchNuvemshopAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const userId = process.env.NUVEMSHOP_USER_ID;

  if (!accessToken || !userId) {
    throw new Error("Credenciais do NuvemShop não configuradas");
  }

  const url = `${NUVEMSHOP_API_BASE_URL}/${userId}${endpoint}`;

  try {
    console.log(
      `🌐 NuvemShop API Request: ${options.method || "GET"} ${endpoint}`
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        Authentication: `bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        ...options.headers,
      },
    });

    console.log(
      `📡 NuvemShop API Response: ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ NuvemShop API Error: ${response.status} - ${errorText}`
      );

      // Tentar parsear erro como JSON para mais detalhes
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(
          `NuvemShop API Error ${response.status}: ${JSON.stringify(errorJson)}`
        );
      } catch (parseError) {
        throw new Error(`NuvemShop API Error ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json();
    console.log(`✅ NuvemShop API Success: ${endpoint}`);
    return data;
  } catch (error) {
    console.error(`❌ NuvemShop API Request Failed: ${endpoint}`, error);
    throw error;
  }
}

// Função específica para criar cupons no NuvemShop
export async function createNuvemshopCoupon(
  couponData: NuvemshopCouponPayload
): Promise<any> {
  console.log(`🎫 Creating coupon in NuvemShop: ${couponData.code}`);

  // Validar dados obrigatórios conforme documentação
  if (!couponData.code || !couponData.type) {
    throw new Error("Código e tipo do cupom são obrigatórios");
  }

  if (
    (couponData.type === "percentage" || couponData.type === "absolute") &&
    !couponData.value
  ) {
    throw new Error(
      "Valor é obrigatório para cupons de porcentagem ou valor absoluto"
    );
  }

  // Preparar payload conforme documentação oficial
  const payload: NuvemshopCouponPayload = {
    code: couponData.code,
    type: couponData.type,
    value: couponData.value,
    valid: couponData.valid ?? true,
    start_date: couponData.start_date,
    end_date: couponData.end_date,
    min_price: couponData.min_price ?? 0,
    max_uses: couponData.max_uses ?? null,
    includes_shipping: couponData.includes_shipping ?? false,
    first_consumer_purchase: couponData.first_consumer_purchase ?? false,
    combines_with_other_discounts:
      couponData.combines_with_other_discounts ?? true,
  };

  // Adicionar restrições de produtos ou categorias se especificadas
  if (couponData.products && couponData.products.length > 0) {
    payload.products = couponData.products;
  }
  if (couponData.categories && couponData.categories.length > 0) {
    payload.categories = couponData.categories;
  }

  console.log(`📋 Coupon payload:`, JSON.stringify(payload, null, 2));

  return fetchNuvemshopAPI("/coupons", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
