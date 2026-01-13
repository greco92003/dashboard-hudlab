import { createBrowserClient } from "@supabase/ssr";

const supabaseSecondaryUrl = process.env.NEXT_PUBLIC_SUPABASE_SECONDARY_URL!;
const supabaseSecondaryAnonKey = process.env.NEXT_PUBLIC_SUPABASE_SECONDARY_ANON_KEY!;

// Create Supabase client for secondary database (Website 2.0 Hudlab)
export const supabaseSecondary = createBrowserClient(
  supabaseSecondaryUrl,
  supabaseSecondaryAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false, // Don't persist session for secondary database
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "hudlab-dashboard-secondary",
      },
    },
  }
);

// Types for representantes table
export interface Representante {
  id: string;
  nome_completo: string;
  vendedor: string;
  telefone: string;
  email: string;
  cpf: string;
  cnpj: string | null;
  rua_avenida: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  complemento: string | null;
  chave_pix: string;
  estado_civil: string;
  created_at: string;
  updated_at: string;
  slug: string | null;
  contract_url: string | null;
}

// Types for afiliates table
export interface Afiliate {
  id: string;
  nome: string;
  sobrenome: string;
  cpf: string;
  cnpj: string | null;
  email: string;
  telefone: string;
  instagram: string;
  endereco: string;
  chave_pix: string;
  affiliate_code: string;
  created_at: string;
  affiliate_link: string;
}

