import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Produção | HUDLAB",
  description: "Board de chão de fábrica: o que produzir e o que já embarcou",
};

export default function ProducaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
