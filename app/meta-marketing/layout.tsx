import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Meta Marketing | Dashboard HUDLAB',
  description: 'Visualização de dados de marketing do Meta (Facebook/Instagram)',
}

export default function MetaMarketingLayout({
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
