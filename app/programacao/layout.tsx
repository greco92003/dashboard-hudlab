import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programação | Dashboard HUDLAB",
  description: "Visualização Kanban de deals ganhos organizados por stage",
};

export default function ProgramacaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
