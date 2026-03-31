import { NctsNavbar } from "@/components/NctsNavbar";

export default function NctsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <NctsNavbar />
      <div className="p-4 pt-6 md:p-6 md:pt-8">
        {children}
      </div>
    </div>
  );
}

