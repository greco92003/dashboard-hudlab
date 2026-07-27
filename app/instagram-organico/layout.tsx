import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Instagram Orgânico | Dashboard HUDLAB',
  description: 'Avaliador de criativos do Instagram orgânico: reels, posts e stories por performance',
}

export default function InstagramOrganicoLayout({
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
