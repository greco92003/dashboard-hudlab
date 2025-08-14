export default function FixedCostsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex-1 flex flex-col h-screen">{children}</div>
    </div>
  );
}
