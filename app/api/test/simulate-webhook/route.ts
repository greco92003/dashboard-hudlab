import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("dealId") || "35151";

  try {
    console.log(`🧪 Simulating webhook for deal ID: ${dealId}`);

    // Get the webhook secret from env
    const webhookSecret = process.env.AC_WEBHOOK_SECRET;
    const baseUrl = request.nextUrl.origin;

    // Construct webhook URL
    const webhookUrl = webhookSecret
      ? `${baseUrl}/api/webhooks/active-campaign?token=${webhookSecret}`
      : `${baseUrl}/api/webhooks/active-campaign`;

    console.log(`📡 Calling webhook: ${webhookUrl}`);

    // Simulate ActiveCampaign webhook payload
    const formData = new URLSearchParams();
    formData.append("deal[id]", dealId);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log(`✅ Webhook response status: ${response.status}`);
    console.log(`✅ Webhook response:`, responseData);

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      webhookUrl,
      dealId,
      response: responseData,
    });
  } catch (error: any) {
    console.error(`❌ Error simulating webhook:`, error);
    return NextResponse.json(
      {
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}

