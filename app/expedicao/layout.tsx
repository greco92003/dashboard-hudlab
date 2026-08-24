import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Expedição | Dashboard HUDLAB",
  description:
    "Kanban do pós-produção: cobrança, fiscal, coleta e trânsito até o cliente receber",
};

export default function ExpedicaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
