import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programação | Dashboard HUDLAB",
  description:
    "Kanban dos pedidos ganhos em produção, organizados por data de embarque",
};

export default function ProgramacaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
