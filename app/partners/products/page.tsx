"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { useFranchiseFilter } from "@/hooks/useFranchiseFilter";
import { isZenithProduct } from "@/types/franchise";
import { useNuvemshopSync } from "@/hooks/useNuvemshopSync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Package, ExternalLink, Tag } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { PartnersGlobalHeader } from "@/components/PartnersGlobalHeader";
import { FranchiseSelector } from "@/components/FranchiseSelector";

interface ProductVariant {
  id: string;
  price: string;
  compare_at_price?: string;
  sku?: string;
  stock?: number;
}

interface Product {
  id: string;
  product_id: string;
  name_pt: string;
  brand?: string;
  description?: string;
  handle?: string;
  canonical_url?: string;
  variants: ProductVariant[];
  featured_image_src?: string;
  published: boolean;
  free_shipping: boolean;
  tags?: string[];
  last_synced_at: string;
  sync_status: string;
}

interface Brand {
  brand: string;
  product_count: number;
}

export default function PartnersProductsPage() {
  const router = useRouter();
  const {
    isOwnerOrAdmin,
    isPartnersMedia,
    loading: permissionsLoading,
  } = usePermissions();
  const {
    assignedBrand,
    isPartnersMediaWithBrand,
    shouldFilterByBrand,
    loading: brandFilterLoading,
  } = useBrandFilter();
  const { isSyncing, syncProducts } = useNuvemshopSync();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  // Brand selection state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [selectedBrand, setSelectedBrandState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Franchise filter hook - must be after selectedBrand declaration
  const { selectedFranchise, shouldShowFranchiseFilter } =
    useFranchiseFilter(selectedBrand);

  // Use selected brand for API calls if available, otherwise fall back to assigned brand
  const effectiveBrand = selectedBrand || assignedBrand;

  const [lastUpdateCheck, setLastUpdateCheck] = useState<string | null>(null);

  const itemsPerPage = 12;

  // Check permissions
  const canViewPage = isOwnerOrAdmin || isPartnersMedia;
  const canSync = isOwnerOrAdmin;
  const canUseBrandFilter = isOwnerOrAdmin;
  // For owners/admins: always show data (filtered by selected brand if any)
  // For partners-media: only show data if they have an assigned brand
  const shouldShowData = canUseBrandFilter ? true : isPartnersMediaWithBrand;

  // Brand selection functions
  const setSelectedBrand = useCallback(
    (brand: string | null) => {
      if (!canUseBrandFilter) return;

      setSelectedBrandState(brand);

      try {
        if (brand) {
          localStorage.setItem("hudlab_partners_brand_filter", brand);
        } else {
          localStorage.removeItem("hudlab_partners_brand_filter");
        }
      } catch (error) {
        console.warn("Error saving brand selection to localStorage:", error);
      }

      // Refresh the page to hydrate with new brand data
      router.refresh();
    },
    [canUseBrandFilter, router]
  );

  // Load brands from API
  const fetchBrands = useCallback(async () => {
    if (!canUseBrandFilter) return;

    try {
      setBrandsLoading(true);
      const response = await fetch("/api/brands");

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setBrands(data.brands || []);
    } catch (error) {
      console.error("Error fetching brands:", error);
      toast.error("Erro ao carregar marcas");
    } finally {
      setBrandsLoading(false);
    }
  }, [canUseBrandFilter]);

  // Load selected brand from localStorage on mount
  useEffect(() => {
    if (!canUseBrandFilter) {
      setSelectedBrandState(null);
      setIsHydrated(true);
      return;
    }

    try {
      const saved = localStorage.getItem("hudlab_partners_brand_filter");
      if (saved) {
        setSelectedBrandState(saved);
      }
    } catch (error) {
      console.warn("Error loading brand selection from localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, [canUseBrandFilter]);

  // Load brands on mount
  useEffect(() => {
    if (canUseBrandFilter) {
      fetchBrands();
    }
  }, [canUseBrandFilter, fetchBrands]);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString(),
        _t: Date.now().toString(), // Cache buster
      });

      // Add brand filter for owners/admins or partners-media with assigned brand
      if (effectiveBrand) {
        params.append("brand", effectiveBrand);
      }

      // Add franchise filter for Zenith brand
      if (selectedFranchise) {
        params.append("franchise", selectedFranchise);
      }

      const response = await fetch(`/api/nuvemshop-sync/products?${params}`, {
        cache: "no-store", // Disable caching
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar produtos");
      }

      const data = await response.json();
      setProducts(data.products || []);
      setTotalProducts(data.total || 0);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, effectiveBrand, selectedFranchise]);

  // Function to check for recent updates
  const checkForUpdates = useCallback(async () => {
    if (!canViewPage) return;

    try {
      const response = await fetch("/api/nuvemshop-sync/products/last-update", {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        const latestUpdate = data.last_update;
        const includesDeletions = data.includes_deletions;

        if (lastUpdateCheck && latestUpdate && latestUpdate > lastUpdateCheck) {
          // There's a newer update, refresh the products
          if (includesDeletions) {
            console.log("🗑️ Detected product deletions, refreshing...");
          } else {
            console.log("🔄 Detected product updates, refreshing...");
          }
          fetchProducts();
        }

        setLastUpdateCheck(latestUpdate);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    }
  }, [canViewPage, lastUpdateCheck, fetchProducts]);

  // Single effect to handle both initial load and brand changes
  useEffect(() => {
    if (!canViewPage || brandFilterLoading) {
      return;
    }

    // Wait for brand filter to be hydrated before making API calls
    if (!isHydrated) {
      return;
    }

    // Only fetch data if we should show data
    if (shouldShowData) {
      setLoading(true);
      fetchProducts();
    } else {
      // Clear data when user doesn't have permission (partners-media without assigned brand)
      setProducts([]);
      setTotalProducts(0);
      setLoading(false);
    }
  }, [
    canViewPage,
    brandFilterLoading,
    shouldShowData,
    selectedBrand, // Track selected brand changes
    assignedBrand, // Track assigned brand changes
    currentPage,
    fetchProducts,
    isHydrated,
  ]);

  // Reset form states when brand changes
  useEffect(() => {
    if (isHydrated && canViewPage) {
      setCurrentPage(1); // Reset to first page when brand changes
    }
  }, [selectedBrand, isHydrated, canViewPage]);

  // Reload products when franchise changes for Zenith brand
  useEffect(() => {
    if (!isHydrated || !effectiveBrand || !shouldShowFranchiseFilter) return;

    console.log(
      "[Franchise Change] Reloading products for franchise:",
      selectedFranchise
    );

    // Reset to first page and reload products
    setCurrentPage(1);
    fetchProducts();
  }, [
    selectedFranchise,
    isHydrated,
    effectiveBrand,
    shouldShowFranchiseFilter,
    fetchProducts,
  ]);

  // Set up polling for updates every 10 seconds
  useEffect(() => {
    if (!canViewPage) return;

    // Initial check
    checkForUpdates();

    // Set up interval for periodic checks
    const interval = setInterval(() => {
      checkForUpdates();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [canViewPage, checkForUpdates]);

  const handleSync = async () => {
    if (!canSync) {
      toast.error("Você não tem permissão para sincronizar dados");
      return;
    }

    toast.info("Iniciando sincronização de produtos...");
    const result = await syncProducts({ limit: 100, page: 1 });

    if (result.success) {
      // Refresh data after successful sync
      await fetchProducts();
    }
  };

  const formatPrice = (price: string) => {
    const numPrice = parseFloat(price);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numPrice);
  };

  const getLowestPrice = (variants: ProductVariant[]) => {
    if (!variants || variants.length === 0) return null;
    const prices = variants
      .map((v) => parseFloat(v.price))
      .filter((p) => !isNaN(p));
    return prices.length > 0 ? Math.min(...prices).toString() : null;
  };

  // Show loading while checking permissions
  if (permissionsLoading || brandFilterLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="space-y-4 flex-1">
          <Skeleton className="h-8 w-64" />

          {/* Loading skeleton for controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>

          {/* Loading skeleton for the main content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 flex-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <Card key={i} className="h-fit">
                <Skeleton className="aspect-square w-full rounded-t-lg" />
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show access denied only after permissions are loaded and user doesn't have access
  if (!canViewPage) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
            <p className="text-muted-foreground mt-2">
              Você não tem permissão para acessar esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalProducts / itemsPerPage);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <Package className="h-6 w-6 sm:h-8 sm:w-8" />
        Produtos dos Parceiros
      </h1>

      {/* Controls Section */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Brand Selection for Owners/Admins */}
        {canUseBrandFilter && isHydrated && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Label className="text-sm sm:text-base whitespace-nowrap">
              Selecione uma marca:
            </Label>
            <div className="flex items-center gap-2 w-full sm:max-w-xs">
              {brandsLoading ? (
                <Skeleton className="h-9 flex-1" />
              ) : (
                <Select
                  value={selectedBrand || "all"}
                  onValueChange={(value) =>
                    setSelectedBrand(value === "all" ? null : value)
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione uma marca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3" />
                        Todas as Marcas
                      </div>
                    </SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.brand} value={brand.brand}>
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3" />
                          {brand.brand}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={fetchBrands}
                disabled={brandsLoading}
                title="Atualizar lista de marcas"
                className="shrink-0"
              >
                {brandsLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Selected Brand Display */}
            {selectedBrand && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {selectedBrand}
              </Badge>
            )}
          </div>
        )}

        {/* Franchise Selection for Zenith brand */}
        {shouldShowFranchiseFilter && isHydrated && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <FranchiseSelector
              className="w-full sm:max-w-xs"
              selectedBrand={effectiveBrand}
            />
          </div>
        )}

        {/* Partners-media brand badge */}
        {isPartnersMediaWithBrand && assignedBrand && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Marca: {assignedBrand}
            </Badge>
          </div>
        )}

        {/* Sync Button */}
        {canSync && (
          <div className="flex justify-start">
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isSyncing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isSyncing ? "Sincronizando..." : "Sincronizar Produtos"}
            </Button>
          </div>
        )}
      </div>

      {/* Message when no brand is selected for owners/admins */}
      {!shouldShowData && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">🏷️</div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Selecione uma marca para visualizar os produtos
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Como owner/admin, você precisa escolher uma marca específica para
              filtrar os produtos da página.
            </p>
          </div>
        </div>
      )}

      {/* Message when Zenith brand is selected but no franchise is chosen */}
      {shouldShowData &&
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        !selectedFranchise && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="text-6xl">🏪</div>
              <h3 className="text-xl font-semibold text-muted-foreground">
                Selecione uma franquia para ver os produtos
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                A marca Zenith possui múltiplas franquias. Escolha uma franquia
                específica para visualizar os produtos disponíveis.
              </p>
            </div>
          </div>
        )}

      {/* Content when brand is selected or user doesn't need brand filter */}
      {shouldShowData &&
        (!effectiveBrand ||
          !isZenithProduct(effectiveBrand) ||
          selectedFranchise) && (
          <>
            {/* Products Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i}>
                    <Skeleton className="aspect-square w-full rounded-t-lg" />
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-6 w-20" />
                          <Skeleton className="h-5 w-16" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">
                    Nenhum produto encontrado
                  </h3>
                  <p className="text-muted-foreground">
                    {canSync
                      ? "Clique em 'Sincronizar Produtos' para importar produtos da Nuvemshop."
                      : "Não há produtos disponíveis no momento."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.map((product) => {
                    const lowestPrice = getLowestPrice(product.variants);

                    return (
                      <Card
                        key={product.id}
                        className="overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        {/* Product Image */}
                        <div className="aspect-square relative bg-gray-100">
                          {product.featured_image_src ? (
                            <Image
                              src={product.featured_image_src}
                              alt={product.name_pt || "Produto"}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <Package className="h-12 w-12 text-muted-foreground" />
                            </div>
                          )}

                          {/* Status Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            <Badge
                              variant={
                                product.published ? "default" : "secondary"
                              }
                            >
                              {product.published ? "Publicado" : "Rascunho"}
                            </Badge>
                            {product.free_shipping && (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700"
                              >
                                Frete Grátis
                              </Badge>
                            )}
                          </div>
                        </div>

                        <CardContent className="p-4">
                          <div className="space-y-2">
                            {/* Product Name */}
                            <h3 className="font-semibold text-sm line-clamp-2">
                              {product.name_pt || "Produto sem nome"}
                            </h3>

                            {/* Brand */}
                            {product.brand && (
                              <p className="text-xs text-muted-foreground">
                                {product.brand}
                              </p>
                            )}

                            {/* Price */}
                            {lowestPrice && (
                              <p className="text-lg font-bold text-primary">
                                {formatPrice(lowestPrice)}
                                {product.variants.length > 1 && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    a partir de
                                  </span>
                                )}
                              </p>
                            )}

                            {/* Variants Count */}
                            {product.variants.length > 1 && (
                              <p className="text-xs text-muted-foreground">
                                {product.variants.length} variações
                              </p>
                            )}

                            {/* Tags */}
                            {product.tags && product.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {product.tags.slice(0, 2).map((tag, index) => (
                                  <Badge
                                    key={index}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {product.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{product.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                              {product.canonical_url ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  asChild
                                >
                                  <a
                                    href={product.canonical_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Ver Produto na Loja
                                  </a>
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  disabled
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver Produto na Loja
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>

                    <span className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages} ({totalProducts}{" "}
                      produtos)
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
    </div>
  );
}
