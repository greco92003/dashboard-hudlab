import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Meta Marketing GHL | Dashboard HUDLAB',
  description: 'Cruzamento de dados do Meta Ads com leads e vendas do GoHighLevel',
}

export default function MetaMarketingGhlLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
