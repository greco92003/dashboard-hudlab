import { createClient } from "@supabase/supabase-js";

// Create a Supabase client for the secondary database (Website 2.0 Hudlab)
// This is a server-side client that uses the service role key to bypass RLS
export function createSecondaryServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_SECONDARY_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_SECONDARY_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase secondary environment variables for server client"
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "hudlab-dashboard-secondary-server",
      },
    },
  });
}

// Types for representantes and afiliates
export interface Representante {
  id: number;
  nome_completo: string;
  vendedor: string;
  email: string;
  telefone: string;
  cpf: string;
  estado_civil: string;
  chave_pix: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  contract_url?: string | null;
  created_at: string;
}

export interface Afiliate {
  id: number;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  chave_pix: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  created_at: string;
}

