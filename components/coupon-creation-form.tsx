"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Percent, Tag, Package, Store } from "lucide-react";

interface Product {
  product_id: string;
  name_pt: string;
  brand: string;
  published: boolean;
}

interface CouponFormData {
  code: string;
  type: "percentage" | "absolute" | "shipping";
  value: string;
  startDate: string;
  endDate: string;
  maxUses: string;
  minPrice: string;
  includesShipping: boolean;
  firstConsumerPurchase: boolean;
  combinesWithOtherDiscounts: boolean;
  restrictionType: "store" | "products";
  selectedProducts: string[];
}

interface CouponCreationFormProps {
  selectedBrand: string;
  onSubmit: (formData: CouponFormData) => void;
  isLoading: boolean;
}

export function CouponCreationForm({ selectedBrand, onSubmit, isLoading }: CouponCreationFormProps) {
  const [formData, setFormData] = useState<CouponFormData>({
    code: "",
    type: "percentage",
    value: "15",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    maxUses: "",
    minPrice: "0",
    includesShipping: false,
    firstConsumerPurchase: false,
    combinesWithOtherDiscounts: true,
    restrictionType: "products",
    selectedProducts: [],
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Fetch products for the selected brand
  useEffect(() => {
    if (!selectedBrand) return;

    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const response = await fetch(`/api/nuvemshop-sync/products?brand=${encodeURIComponent(selectedBrand)}&published=true`);
        if (response.ok) {
          const data = await response.json();
          setProducts(data.products || []);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [selectedBrand]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleProductToggle = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.includes(productId)
        ? prev.selectedProducts.filter(id => id !== productId)
        : [...prev.selectedProducts, productId]
    }));
  };

  const selectAllProducts = () => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: products.map(p => p.product_id)
    }));
  };

  const clearAllProducts = () => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: []
    }));
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Criar Cupom de Desconto
        </CardTitle>
        <CardDescription>
          Configure os detalhes do cupom para a marca: <strong>{selectedBrand}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código do Cupom *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: DESCONTO15"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo de Desconto *</Label>
              <Select value={formData.type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                  <SelectItem value="absolute">Valor Fixo (R$)</SelectItem>
                  <SelectItem value="shipping">Frete Grátis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type !== "shipping" && (
              <div className="space-y-2">
                <Label htmlFor="value">
                  Valor do Desconto * {formData.type === "percentage" ? "(%)" : "(R$)"}
                </Label>
                <Input
                  id="value"
                  type="number"
                  value={formData.value}
                  onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                  placeholder={formData.type === "percentage" ? "15" : "50.00"}
                  min="0"
                  max={formData.type === "percentage" ? "100" : undefined}
                  step={formData.type === "percentage" ? "1" : "0.01"}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="maxUses">Máximo de Usos</Label>
              <Input
                id="maxUses"
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData(prev => ({ ...prev, maxUses: e.target.value }))}
                placeholder="Deixe vazio para ilimitado"
                min="1"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data de Início</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Data de Expiração</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Restrictions */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="minPrice">Valor Mínimo do Pedido (R$)</Label>
              <Input
                id="minPrice"
                type="number"
                value={formData.minPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, minPrice: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>Aplicação do Cupom</Label>
              <Select value={formData.restrictionType} onValueChange={(value: any) => setFormData(prev => ({ ...prev, restrictionType: value, selectedProducts: [] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Loja Toda
                    </div>
                  </SelectItem>
                  <SelectItem value="products">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Produtos Específicos
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Product Selection */}
            {formData.restrictionType === "products" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Produtos da Marca {selectedBrand}</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllProducts}>
                      Selecionar Todos
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={clearAllProducts}>
                      Limpar Seleção
                    </Button>
                  </div>
                </div>

                {loadingProducts ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Carregando produtos...
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Nenhum produto encontrado para esta marca
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2">
                    {products.map((product) => (
                      <div key={product.product_id} className="flex items-center space-x-2">
                        <Checkbox
                          id={product.product_id}
                          checked={formData.selectedProducts.includes(product.product_id)}
                          onCheckedChange={() => handleProductToggle(product.product_id)}
                        />
                        <Label htmlFor={product.product_id} className="flex-1 cursor-pointer">
                          {product.name_pt}
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          ID: {product.product_id}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {formData.selectedProducts.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {formData.selectedProducts.length} produto(s) selecionado(s)
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Options */}
          <div className="space-y-3">
            <Label>Opções Adicionais</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includesShipping"
                  checked={formData.includesShipping}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, includesShipping: !!checked }))}
                />
                <Label htmlFor="includesShipping">Aplicar desconto também no frete</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="firstConsumerPurchase"
                  checked={formData.firstConsumerPurchase}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, firstConsumerPurchase: !!checked }))}
                />
                <Label htmlFor="firstConsumerPurchase">Apenas para primeira compra do cliente</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="combinesWithOtherDiscounts"
                  checked={formData.combinesWithOtherDiscounts}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, combinesWithOtherDiscounts: !!checked }))}
                />
                <Label htmlFor="combinesWithOtherDiscounts">Combinar com outras promoções</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading || (formData.restrictionType === "products" && formData.selectedProducts.length === 0)}>
              {isLoading ? "Criando Cupom..." : "Criar Cupom"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
