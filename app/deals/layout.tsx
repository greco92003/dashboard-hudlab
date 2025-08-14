export default function DealsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex-1">{children}</div>
    </div>
  )
}