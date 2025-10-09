# Troubleshooting - Links de Franquia Zenith

## 🔍 Problema: Link não aparece ao selecionar franquia

### Passos para Diagnosticar:

#### 1. Verificar Links no Banco de Dados

Execute no Supabase SQL Editor:

```sql
SELECT 
  id,
  brand,
  url,
  is_active,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN '🏖️ Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN '🌊 Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN '🏔️ Taquara-RS'
    ELSE '❓ Sem franquia'
  END as franchise
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
  AND is_active = true;
```

**Resultado Esperado:** 3 links ativos, um para cada franquia

#### 2. Verificar Logs do Console

Abra o Console do navegador (F12) e selecione uma franquia. Procure por logs como:

```
🔍 Buscando link da Zenith para franquia: Garopaba - SC
🔍 Termo de busca: Garopaba-SC
🔍 Links disponíveis: [...]
🔍 Link encontrado: ...
```

#### 3. Verificar Formato dos Links

Os links devem estar no formato:
```
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS
```

**ATENÇÃO:** O formato da franquia no link deve corresponder ao formato usado na busca!

## 🐛 Problemas Comuns

### Problema 1: "Já existe um link de afiliado ativo"

**Causa:** A API estava bloqueando múltiplos links para a mesma marca

**Solução:** ✅ Corrigido - Agora permite múltiplos links para Zenith

### Problema 2: Link não aparece ao selecionar franquia

**Possíveis Causas:**

1. **Formato da franquia não corresponde**
   - No banco: `Garopaba-SC`
   - Na busca: `Garopaba - SC` (com espaços)
   - **Solução:** Verificar se o `.replace(/\s+/g, "-")` está funcionando

2. **Link não foi criado**
   - Verificar se o link existe no banco
   - **Solução:** Executar processamento de auto-links

3. **Link está inativo**
   - Verificar se `is_active = true`
   - **Solução:** Ativar o link no banco

### Problema 3: Constraint de unicidade

**Erro:** `duplicate key value violates unique constraint`

**Causa:** Constraint antiga permitia apenas 1 link por marca

**Solução:** ✅ Corrigido - Removida constraint `idx_affiliate_links_unique_brand_active`

## 🔧 Soluções Rápidas

### Recriar Links da Zenith

```sql
-- 1. Desativar todos os links da Zenith
UPDATE affiliate_links
SET is_active = false
WHERE brand ILIKE '%zenith%';

-- 2. Criar links para cada franquia
INSERT INTO affiliate_links (url, brand, created_by, is_active)
VALUES 
  (
    'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP',
    'Zenith',
    (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
    true
  ),
  (
    'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC',
    'Zenith',
    (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
    true
  ),
  (
    'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS',
    'Zenith',
    (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
    true
  );
```

### Verificar Formato da Franquia

No console do navegador:

```javascript
// Ver valor da franquia selecionada
console.log('Franquia selecionada:', localStorage.getItem('zenith-franchise-filter'));

// Ver como está sendo transformado
const franchise = "Garopaba - SC";
const searchTerm = franchise.replace(/\s+/g, "-");
console.log('Termo de busca:', searchTerm); // Deve ser: Garopaba-SC
```

### Forçar Recarga dos Links

No console do navegador:

```javascript
// Limpar cache e recarregar
localStorage.removeItem('zenith-franchise-filter');
window.location.reload();
```

## 📋 Checklist de Verificação

- [ ] Constraint de unicidade foi removida
- [ ] 3 links da Zenith existem no banco (Santos, Garopaba, Taquara)
- [ ] Todos os 3 links estão ativos (`is_active = true`)
- [ ] Formato dos links está correto (com hífen, sem espaços)
- [ ] API permite múltiplos links para Zenith
- [ ] Frontend filtra corretamente por franquia
- [ ] Logs do console mostram a busca correta

## 🎯 Teste Completo

1. **Selecionar marca Zenith**
2. **Selecionar franquia Santos-SP**
   - ✅ Deve mostrar: `...utm_medium=Zenith-Santos-SP`
3. **Selecionar franquia Garopaba-SC**
   - ✅ Deve mostrar: `...utm_medium=Zenith-Garopaba-SC`
4. **Selecionar franquia Taquara-RS**
   - ✅ Deve mostrar: `...utm_medium=Zenith-Taquara-RS`
5. **Não selecionar franquia**
   - ✅ Deve mostrar: "Selecione uma franquia Zenith para ver o link de afiliado."

## 📞 Suporte

Se o problema persistir, forneça:

1. Resultado do SQL de verificação
2. Logs do console (🔍)
3. Screenshot da tela
4. Franquia selecionada

