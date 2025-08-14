import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const accessToken = process.env.META_ACCESS_TOKEN
    const businessId = process.env.META_BUSINESS_ID

    if (!accessToken) {
      return NextResponse.json(
        { error: 'META_ACCESS_TOKEN não configurado' },
        { status: 500 }
      )
    }

    if (!businessId) {
      return NextResponse.json(
        { error: 'META_BUSINESS_ID não configurado' },
        { status: 500 }
      )
    }

    // Primeiro, vamos buscar as contas de anúncios do business
    const businessUrl = `https://graph.facebook.com/v23.0/${businessId}/owned_ad_accounts`
    const businessParams = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,account_status,currency,timezone_name,amount_spent'
    })

    console.log('Buscando contas de anúncios do business:', businessId)
    
    const businessResponse = await fetch(`${businessUrl}?${businessParams}`)
    
    if (!businessResponse.ok) {
      const errorText = await businessResponse.text()
      console.error('Erro na resposta do business:', errorText)
      return NextResponse.json(
        { error: `Erro ao buscar contas do business: ${businessResponse.status}` },
        { status: businessResponse.status }
      )
    }

    const businessData = await businessResponse.json()
    console.log('Dados do business:', businessData)

    // Se não há contas, retornar erro
    if (!businessData.data || businessData.data.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma conta de anúncios encontrada para este business' },
        { status: 404 }
      )
    }

    // Pegar a primeira conta de anúncios (ou você pode implementar lógica para escolher)
    const adAccount = businessData.data[0]
    
    console.log('Conta de anúncios selecionada:', adAccount)

    return NextResponse.json(adAccount)

  } catch (error) {
    console.error('Erro ao buscar dados da conta Meta:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
