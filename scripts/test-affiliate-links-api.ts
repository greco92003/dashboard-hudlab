/**
 * Script para testar a criação de affiliate links diretamente
 * 
 * Como executar:
 * npx tsx scripts/test-affiliate-links-api.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas!');
  console.error('Certifique-se de ter NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testAffiliateLinkCreation() {
  console.log('🔍 Iniciando teste de criação de affiliate links...\n');

  try {
    // 1. Verificar marcas existentes
    console.log('1️⃣ Buscando marcas com produtos publicados...');
    const { data: products, error: productsError } = await supabase
      .from('nuvemshop_products')
      .select('brand')
      .eq('published', true)
      .eq('sync_status', 'synced')
      .not('brand', 'is', null)
      .not('brand', 'eq', '');

    if (productsError) {
      console.error('❌ Erro ao buscar produtos:', productsError);
      return;
    }

    const uniqueBrands = [...new Set(products?.map(p => p.brand) || [])];
    console.log(`✅ Encontradas ${uniqueBrands.length} marcas únicas:`, uniqueBrands);
    console.log('');

    // 2. Verificar links existentes
    console.log('2️⃣ Verificando links de afiliado existentes...');
    const { data: existingLinks, error: linksError } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('is_active', true);

    if (linksError) {
      console.error('❌ Erro ao buscar links:', linksError);
      return;
    }

    console.log(`✅ Encontrados ${existingLinks?.length || 0} links ativos`);
    if (existingLinks && existingLinks.length > 0) {
      console.log('Links existentes:');
      existingLinks.forEach(link => {
        console.log(`  - ${link.brand}: ${link.url}`);
      });
    }
    console.log('');

    // 3. Identificar marcas sem links
    const brandsWithLinks = new Set(existingLinks?.map(l => l.brand) || []);
    const brandsNeedingLinks = uniqueBrands.filter(brand => !brandsWithLinks.has(brand));

    console.log('3️⃣ Marcas que precisam de links:');
    if (brandsNeedingLinks.length === 0) {
      console.log('✅ Todas as marcas já têm links!');
      return;
    }
    console.log(`📋 ${brandsNeedingLinks.length} marcas sem links:`, brandsNeedingLinks);
    console.log('');

    // 4. Buscar um usuário admin para ser o criador
    console.log('4️⃣ Buscando usuário admin...');
    const { data: adminUser, error: adminError } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .in('role', ['admin', 'owner'])
      .eq('approved', true)
      .limit(1)
      .single();

    if (adminError || !adminUser) {
      console.error('❌ Erro ao buscar admin:', adminError);
      return;
    }

    console.log(`✅ Admin encontrado: ${adminUser.email} (${adminUser.role})`);
    console.log('');

    // 5. Criar links para cada marca
    console.log('5️⃣ Criando links de afiliado...');
    let created = 0;
    let errors = 0;

    for (const brand of brandsNeedingLinks) {
      const isZenith = brand.toLowerCase().trim() === 'zenith';

      if (isZenith) {
        console.log(`\n🔷 Processando marca Zenith (3 franquias)...`);
        const franchises = [
          { name: 'Santos-SP', displayName: 'Santos - SP' },
          { name: 'Garopaba-SC', displayName: 'Garopaba - SC' },
          { name: 'Taquara-RS', displayName: 'Taquara - RS' },
        ];

        for (const franchise of franchises) {
          const url = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${brand.replace(/\s+/g, '-')}-${franchise.name}`;
          
          console.log(`  📍 Criando link para ${franchise.displayName}...`);
          console.log(`     URL: ${url}`);

          const { data, error } = await supabase
            .from('affiliate_links')
            .insert({
              url,
              brand,
              created_by: adminUser.id,
              is_active: true,
            })
            .select()
            .single();

          if (error) {
            console.error(`  ❌ Erro:`, error.message);
            errors++;
          } else {
            console.log(`  ✅ Link criado com sucesso! ID: ${data.id}`);
            created++;
          }
        }
      } else {
        const url = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${brand.replace(/\s+/g, '-')}`;
        
        console.log(`\n📦 Criando link para ${brand}...`);
        console.log(`   URL: ${url}`);

        const { data, error } = await supabase
          .from('affiliate_links')
          .insert({
            url,
            brand,
            created_by: adminUser.id,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          console.error(`❌ Erro:`, error.message);
          errors++;
        } else {
          console.log(`✅ Link criado com sucesso! ID: ${data.id}`);
          created++;
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMO:');
    console.log(`✅ Links criados: ${created}`);
    console.log(`❌ Erros: ${errors}`);
    console.log('='.repeat(50));

    // 6. Verificar resultado final
    console.log('\n6️⃣ Verificando resultado final...');
    const { data: finalLinks, error: finalError } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (finalError) {
      console.error('❌ Erro ao verificar resultado:', finalError);
      return;
    }

    console.log(`\n✅ Total de links ativos: ${finalLinks?.length || 0}`);
    if (finalLinks && finalLinks.length > 0) {
      console.log('\nLinks criados:');
      finalLinks.forEach(link => {
        console.log(`  - ${link.brand}: ${link.url}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro inesperado:', error);
  }
}

// Executar
testAffiliateLinkCreation();

