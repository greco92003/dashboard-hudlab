const fs = require('fs');
const path = require('path');

const files = [
    'hooks/useGlobalDateRange.ts',
    'hooks/useHydration.ts',
    'hooks/useHydrationFix.ts',
    'hooks/usePersistentAuth.ts',
    'contexts/OptimizedAuthContext.tsx',
    'contexts/StableAuthContext.tsx',
    'contexts/SyncContext.tsx',
    'lib/cache-config.ts',
    'lib/cache-recovery.ts',
    'lib/local-cache.ts',
    'lib/supabase.ts',
    'components/deals-cache-monitor.tsx',
    'components/PWAInstallPrompt.tsx',
    'app/auth/auth-code-error/page.tsx',
    'app/designers/page.tsx',
    'app/partners/dashboard/page.tsx',
    'app/partners/home/page.tsx',
    'app/partners/orders/page.tsx',
    'app/partners/products/page.tsx',
    'app/profile-settings/page.tsx',
    'app/programacao/page.tsx',
    'app/global-error.tsx',
    'utils/debugHelpers.ts'
];

files.forEach(file => {
    const fullPath = path.join(__dirname, '..', file);
    
    if (!fs.existsSync(fullPath)) {
        console.log(`❌ File not found: ${file}`);
        return;
    }
    
    console.log(`📝 Processing ${file}...`);
    
    let content = fs.readFileSync(fullPath, 'utf8');
    const originalContent = content;
    
    // Adiciona import do storage se não existir
    if (!content.includes('import { storage } from "@/lib/storage"')) {
        const lines = content.split('\n');
        let lastImportIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) {
                lastImportIndex = i;
            }
        }
        
        if (lastImportIndex >= 0) {
            lines.splice(lastImportIndex + 1, 0, 'import { storage } from "@/lib/storage";');
            content = lines.join('\n');
        }
    }
    
    // Substitui localStorage.getItem por storage.getItem
    content = content.replace(/localStorage\.getItem\(/g, 'storage.getItem(');
    
    // Substitui localStorage.setItem por storage.setItem
    content = content.replace(/localStorage\.setItem\(/g, 'storage.setItem(');
    
    // Substitui localStorage.removeItem por storage.removeItem
    content = content.replace(/localStorage\.removeItem\(/g, 'storage.removeItem(');
    
    // Substitui localStorage.clear() por storage.clear()
    content = content.replace(/localStorage\.clear\(\)/g, 'storage.clear()');
    
    // Substitui Object.keys(localStorage) por storage.keys()
    content = content.replace(/Object\.keys\(localStorage\)/g, 'storage.keys()');
    
    // Substitui window.localStorage por window.sessionStorage
    content = content.replace(/window\.localStorage/g, 'window.sessionStorage');
    
    // Substitui for loops com localStorage.length
    content = content.replace(/localStorage\.length/g, 'storage.keys().length');
    
    // Substitui localStorage.key(i) por storage.keys()[i]
    content = content.replace(/localStorage\.key\((\w+)\)/g, 'storage.keys()[$1]');
    
    if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`✅ Updated ${file}`);
    } else {
        console.log(`⏭️  No changes needed for ${file}`);
    }
});

console.log('\n✨ Migration complete!');
console.log('⚠️  Please review the changes and test thoroughly.');

