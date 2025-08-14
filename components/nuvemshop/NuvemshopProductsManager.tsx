"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Download,
  Eye,
  Image as ImageIcon,
  Package,
} from "lucide-react";
import { toast } from "sonner";

interface NuvemshopProduct {
  id: number;
  name: { pt?: string; en?: string; es?: string };
  description: { pt?: string; en?: string; es?: string };
  handle: { pt?: string; en?: string; es?: string };
  published: boolean;
  free_shipping: boolean;
  requires_shipping: boolean;
  brand: string;
  created_at: string;
  updated_at: string;
  variants: any[];
  images: any[];
  categories: any[];
  tags: string;
}

interface ProductsResponse {
  success: boolean;
  data: NuvemshopProduct[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
  };
}

export default function NuvemshopProductsManager() {
  const [products, setProducts] = useState<NuvemshopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [filters, setFilters] = useState({
    published: "",
    free_shipping: "",
    category_id: "",
    days: 30,
  });

  // Fetch products from Nuvemshop
  const fetchProducts = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: "20",
        });

        // Add filters
        if (filters.published) params.append("published", filters.published);
        if (filters.free_shipping)
          params.append("free_shipping", filters.free_shipping);
        if (filters.category_id)
          params.append("category_id", filters.category_id);

        // Add date filter for last N days
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - filters.days);
        params.append("created_at_min", daysAgo.toISOString());

        const response = await fetch(
          `/api/nuvemshop/products?${params.toString()}`
        );
        const data: ProductsResponse = await response.json();

        if (data.success) {
          setProducts(data.data);
          setTotalProducts(data.pagination?.total || data.data.length);
          setCurrentPage(page);
        } else {
          toast.error("Erro ao buscar produtos");
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        toast.error("Erro ao buscar produtos");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Sync products to local database
  const syncProducts = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/nuvemshop/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          syncPeriodDays: filters.days,
          batchSize: 50,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `${data.data.totalProducts} produtos sincronizados com sucesso!`
        );
        // Refresh the products list
        fetchProducts(currentPage);
      } else {
        toast.error("Erro ao sincronizar produtos");
      }
    } catch (error) {
      console.error("Error syncing products:", error);
      toast.error("Erro ao sincronizar produtos");
    } finally {
      setSyncing(false);
    }
  };

  // View product details
  const viewProduct = async (productId: number) => {
    try {
      const response = await fetch(`/api/nuvemshop/products/${productId}`);
      const data = await response.json();

      if (data.success) {
        // Open product details in a modal or new page
        console.log("Product details:", data.data);
        toast.success("Detalhes do produto carregados");
      } else {
        toast.error("Erro ao carregar detalhes do produto");
      }
    } catch (error) {
      console.error("Error fetching product details:", error);
      toast.error("Erro ao carregar detalhes do produto");
    }
  };

  // View product images
  const viewProductImages = async (productId: number) => {
    try {
      const response = await fetch(
        `/api/nuvemshop/products/${productId}/images`
      );
      const data = await response.json();

      if (data.success) {
        console.log("Product images:", data.data);
        toast.success("Imagens do produto carregadas");
      } else {
        toast.error("Erro ao carregar imagens do produto");
      }
    } catch (error) {
      console.error("Error fetching product images:", error);
      toast.error("Erro ao carregar imagens do produto");
    }
  };

  // Get product name in Portuguese or fallback
  const getProductName = (product: NuvemshopProduct) => {
    return (
      product.name?.pt || product.name?.en || product.name?.es || "Sem nome"
    );
  };

  // Get product description in Portuguese or fallback
  const getProductDescription = (product: NuvemshopProduct) => {
    const desc =
      product.description?.pt ||
      product.description?.en ||
      product.description?.es ||
      "";
    return desc.length > 100 ? desc.substring(0, 100) + "..." : desc;
  };

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Produtos Nuvemshop</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => fetchProducts(currentPage)}
            disabled={loading}
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button onClick={syncProducts} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Sincronizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Publicado
              </label>
              <select
                value={filters.published}
                onChange={(e) =>
                  setFilters({ ...filters, published: e.target.value })
                }
                className="w-full p-2 border rounded-md"
              >
                <option value="">Todos</option>
                <option value="true">Publicado</option>
                <option value="false">Não Publicado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Frete Grátis
              </label>
              <select
                value={filters.free_shipping}
                onChange={(e) =>
                  setFilters({ ...filters, free_shipping: e.target.value })
                }
                className="w-full p-2 border rounded-md"
              >
                <option value="">Todos</option>
                <option value="true">Com Frete Grátis</option>
                <option value="false">Sem Frete Grátis</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Categoria ID
              </label>
              <input
                type="text"
                value={filters.category_id}
                onChange={(e) =>
                  setFilters({ ...filters, category_id: e.target.value })
                }
                placeholder="ID da categoria"
                className="w-full p-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Período (dias)
              </label>
              <select
                value={filters.days}
                onChange={(e) =>
                  setFilters({ ...filters, days: parseInt(e.target.value) })
                }
                className="w-full p-2 border rounded-md"
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={60}>Últimos 60 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products List */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos ({totalProducts})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum produto encontrado
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {getProductName(product)}
                        </span>
                        <Badge
                          className={
                            product.published
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {product.published ? "Publicado" : "Não Publicado"}
                        </Badge>
                        {product.free_shipping && (
                          <Badge className="bg-blue-100 text-blue-800">
                            Frete Grátis
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>
                          <strong>Descrição:</strong>{" "}
                          {getProductDescription(product)}
                        </p>
                        <p>
                          <strong>Marca:</strong>{" "}
                          {product.brand || "Não informado"}
                        </p>
                        <p>
                          <strong>Variações:</strong>{" "}
                          {product.variants?.length || 0}
                        </p>
                        <p>
                          <strong>Imagens:</strong>{" "}
                          {product.images?.length || 0}
                        </p>
                        <p>
                          <strong>Criado em:</strong>{" "}
                          {new Date(product.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => viewProduct(product.id)}
                        variant="outline"
                        size="sm"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalhes
                      </Button>
                      <Button
                        onClick={() => viewProductImages(product.id)}
                        variant="outline"
                        size="sm"
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Imagens
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalProducts > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => fetchProducts(currentPage - 1)}
            disabled={currentPage === 1 || loading}
            variant="outline"
          >
            Anterior
          </Button>
          <span className="flex items-center px-4">Página {currentPage}</span>
          <Button
            onClick={() => fetchProducts(currentPage + 1)}
            disabled={products.length < 20 || loading}
            variant="outline"
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
