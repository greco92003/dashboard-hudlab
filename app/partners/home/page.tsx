"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { useFranchiseFilter } from "@/hooks/useFranchiseFilter";
import { PartnersGlobalHeader } from "@/components/PartnersGlobalHeader";
import { FranchiseSelector } from "@/components/FranchiseSelector";
import { isZenithProduct } from "@/types/franchise";
import {
  Home,
  Link,
  Copy,
  Percent,
  Tag,
  Edit,
  Save,
  Plus,
  Calendar,
  Gift,
  Trash2,
  RefreshCw,
  Zap,
  DollarSign,
  TrendingUp,
  Wallet,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeModal } from "@/components/QRCodeModal";
import { storage } from "@/lib/storage";
import type { NuvemshopCouponPayload } from "@/lib/nuvemshop/api";

interface AffiliateLink {
  id: string;
  url: string;
  brand: string;
  created_at: string;
  updated_at: string;
}

interface Brand {
  brand: string;
  product_count: number;
}

interface PartnershipContract {
  id: string;
  brand: string;
  franchise?: string;
  contract_url: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

interface PartnerPixKey {
  id: string;
  brand: string;
  franchise?: string;
  pix_key: string;
  pix_type: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

interface CommissionPayment {
  id: string;
  brand: string;
  franchise: string | null;
  partner_user_id: string | null;
  amount: number;
  payment_date: string;
  description: string | null;
  payment_method: string;
  payment_reference: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface CommissionSummary {
  brand: string;
  commission_percentage: number;
  total_earned: number;
  total_paid: number;
  balance: number;
}

export default function PartnersHomePage() {
  const router = useRouter();
  const [affiliateLink, setAffiliateLink] = useState<AffiliateLink | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [editingLink, setEditingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);

  // Coupon state
  const [generatedCoupons, setGeneratedCoupons] = useState<
    NuvemshopCouponPayload[]
  >([]);
  const [refreshingCoupons, setRefreshingCoupons] = useState(false);

  const [processingAutoLinks, setProcessingAutoLinks] = useState(false);

  // Contract and Pix Key state
  const [contract, setContract] = useState<PartnershipContract | null>(null);
  const [pixKey, setPixKey] = useState<PartnerPixKey | null>(null);
  const [editingContract, setEditingContract] = useState(false);
  const [editingPixKey, setEditingPixKey] = useState(false);
  const [newContractUrl, setNewContractUrl] = useState("");
  const [newPixKey, setNewPixKey] = useState("");
  const [newPixType, setNewPixType] = useState("random");

  // Brand selection state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [selectedBrand, setSelectedBrandState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Commission management state
  const [commissionSummary, setCommissionSummary] =
    useState<CommissionSummary | null>(null);
  const [commissionPayments, setCommissionPayments] = useState<
    CommissionPayment[]
  >([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [editingPayment, setEditingPayment] =
    useState<CommissionPayment | null>(null);
  const [newPayment, setNewPayment] = useState({
    amount: "",
    payment_date: "",
    description: "",
    payment_method: "pix",
    payment_reference: "",
    status: "sent",
  });

  const {
    isOwnerOrAdmin,
    isPartnersMedia,
    loading: permissionsLoading,
  } = usePermissions();

  const {
    assignedBrand,
    isPartnersMediaWithBrand,
    loading: brandFilterLoading,
  } = useBrandFilter();

  // Use selected brand for API calls if available, otherwise fall back to assigned brand
  const effectiveBrand = selectedBrand || assignedBrand;

  const { selectedFranchise, shouldShowFranchiseFilter } =
    useFranchiseFilter(effectiveBrand);

  // Check permissions
  const canViewPage = isOwnerOrAdmin || isPartnersMedia;
  const canUseBrandFilter = isOwnerOrAdmin;
  const canEditLinks =
    isOwnerOrAdmin && (selectedBrand !== null || !canUseBrandFilter); // Disable editing when "Todas as Marcas" is selected
  const canEditContracts = isOwnerOrAdmin; // Only owners/admins can edit contracts
  const canEditPixKeys = isOwnerOrAdmin || isPartnersMedia; // Partners-media can edit their own brand's pix keys
  const canViewContracts = isOwnerOrAdmin || isPartnersMedia; // Partners-media can view contracts (copy only)
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
          storage.setItem("hudlab_partners_brand_filter", brand);
        } else {
          storage.removeItem("hudlab_partners_brand_filter");
        }
      } catch (error) {
        console.warn("Error saving brand selection to localStorage:", error);
      }

      // Refresh the page to hydrate with new brand data
      router.refresh();
    },
    [canUseBrandFilter, router],
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
      const saved = storage.getItem("hudlab_partners_brand_filter");
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

  const fetchAffiliateLink = useCallback(async () => {
    try {
      setLoading(true);
      let url = "/api/partners/affiliate-links";
      const params = new URLSearchParams();

      // Add brand filter for owners/admins or partners-media with assigned brand
      if (effectiveBrand) {
        params.append("brand", effectiveBrand);
      }

      // Add cache buster to prevent caching
      params.append("_t", Date.now().toString());

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        cache: "no-store", // Disable caching
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar link de afiliado");
      }

      const data = await response.json();

      // For Zenith brand, filter by selected franchise
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        selectedFranchise
      ) {
        // Find the link that matches the selected franchise
        const franchiseSearchTerm = selectedFranchise.replace(/\s+/g, "-");
        console.log(
          `🔍 Buscando link da Zenith para franquia: ${selectedFranchise}`,
        );
        console.log(`🔍 Termo de busca: ${franchiseSearchTerm}`);
        console.log(
          `🔍 Links disponíveis:`,
          data.links?.map((l: AffiliateLink) => l.url),
        );

        const franchiseLink = data.links?.find((link: AffiliateLink) =>
          link.url.includes(franchiseSearchTerm),
        );

        console.log(`🔍 Link encontrado:`, franchiseLink?.url || "NENHUM");
        setAffiliateLink(franchiseLink || null);
      } else {
        // For other brands or when no franchise is selected, get the first link
        setAffiliateLink(
          data.links && data.links.length > 0 ? data.links[0] : null,
        );
      }
    } catch (error) {
      console.error("Error fetching affiliate link:", error);
      toast.error("Erro ao carregar link de afiliado");
    } finally {
      setLoading(false);
    }
  }, [effectiveBrand, selectedFranchise]);

  const fetchGeneratedCoupons = useCallback(async () => {
    try {
      setRefreshingCoupons(true);

      // Owners/admins without a selected brand see an empty list (avoid leaking other brands)
      if (!effectiveBrand) {
        setGeneratedCoupons([]);
        return;
      }

      const params = new URLSearchParams({
        brand: effectiveBrand,
        _t: Date.now().toString(),
      });
      const response = await fetch(`/api/nuvemshop/coupons?${params}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("API da Nuvemshop indisponível");
      }

      const data = await response.json();
      setGeneratedCoupons(data.coupons || []);
    } catch (error) {
      console.error("Error fetching coupons:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao carregar cupons da Nuvemshop",
      );
    } finally {
      setRefreshingCoupons(false);
    }
  }, [effectiveBrand]);

  const fetchContract = useCallback(async () => {
    try {
      // Don't fetch if no effective brand is selected for owners/admins
      if (!effectiveBrand && isOwnerOrAdmin) {
        setContract(null);
        return;
      }

      // For Zenith, don't fetch if no franchise is selected
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        !selectedFranchise
      ) {
        setContract(null);
        return;
      }

      let url = "/api/partners/contracts";
      const params = new URLSearchParams();

      // Add brand filter for owners/admins or partners-media with assigned brand
      if (effectiveBrand) {
        params.append("brand", effectiveBrand);
      }

      // Add franchise filter for Zenith
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        selectedFranchise
      ) {
        params.append("franchise", selectedFranchise);
      }

      // Add cache buster to prevent caching
      params.append("_t", Date.now().toString());

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        cache: "no-store", // Disable caching
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar contrato");
      }

      const data = await response.json();

      // For Zenith, filter by franchise
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        selectedFranchise
      ) {
        const franchiseContract = data.contracts?.find(
          (c: PartnershipContract) => c.franchise === selectedFranchise,
        );
        setContract(franchiseContract || null);
      } else {
        // Get the first (and only) contract for the brand
        setContract(
          data.contracts && data.contracts.length > 0
            ? data.contracts[0]
            : null,
        );
      }
    } catch (error) {
      console.error("Error fetching contract:", error);
      toast.error("Erro ao carregar contrato");
    }
  }, [effectiveBrand, isOwnerOrAdmin, selectedFranchise]);

  const fetchPixKey = useCallback(async () => {
    try {
      // Don't fetch if no effective brand is selected for owners/admins
      if (!effectiveBrand && isOwnerOrAdmin) {
        setPixKey(null);
        return;
      }

      // For Zenith, don't fetch if no franchise is selected
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        !selectedFranchise
      ) {
        setPixKey(null);
        return;
      }

      let url = "/api/partners/pix-keys";
      const params = new URLSearchParams();

      // Add brand filter for owners/admins or partners-media with assigned brand
      if (effectiveBrand) {
        params.append("brand", effectiveBrand);
      }

      // Add franchise filter for Zenith
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        selectedFranchise
      ) {
        params.append("franchise", selectedFranchise);
      }

      // Add cache buster to prevent caching
      params.append("_t", Date.now().toString());

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        cache: "no-store", // Disable caching
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar chave pix");
      }

      const data = await response.json();

      // For Zenith, filter by franchise
      if (
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        selectedFranchise
      ) {
        const franchisePixKey = data.pixKeys?.find(
          (p: PartnerPixKey) => p.franchise === selectedFranchise,
        );
        setPixKey(franchisePixKey || null);
      } else {
        // Get the first (and only) pix key for the brand
        setPixKey(
          data.pixKeys && data.pixKeys.length > 0 ? data.pixKeys[0] : null,
        );
      }
    } catch (error) {
      console.error("Error fetching pix key:", error);
      toast.error("Erro ao carregar chave pix");
    }
  }, [effectiveBrand, isOwnerOrAdmin, selectedFranchise]);

  const fetchCommissionSummary = useCallback(async () => {
    try {
      // Don't fetch if no effective brand is selected
      if (!effectiveBrand) {
        setCommissionSummary(null);
        return;
      }

      // For Zenith brand, don't fetch if no franchise is selected
      if (isZenithProduct(effectiveBrand) && !selectedFranchise) {
        setCommissionSummary(null);
        return;
      }

      const url = "/api/partners/commission-summary";
      const params = new URLSearchParams();
      params.append("brand", effectiveBrand);
      if (selectedFranchise) {
        params.append("franchise", selectedFranchise);
      }
      params.append("_t", Date.now().toString());

      const response = await fetch(`${url}?${params.toString()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar resumo de comissão");
      }

      const data = await response.json();
      console.log("[Commission Summary] Fetched data:", {
        brand: effectiveBrand,
        franchise: selectedFranchise,
        total_earned: data.total_earned,
        total_paid: data.total_paid,
        balance: data.balance,
        timestamp: new Date().toISOString(),
      });
      setCommissionSummary(data);
    } catch (error) {
      console.error("Error fetching commission summary:", error);
      toast.error("Erro ao carregar resumo de comissão");
    }
  }, [effectiveBrand, selectedFranchise]);

  const fetchCommissionPayments = useCallback(async () => {
    try {
      // Don't fetch if no effective brand is selected
      if (!effectiveBrand) {
        setCommissionPayments([]);
        return;
      }

      // For Zenith brand, don't fetch if no franchise is selected
      if (isZenithProduct(effectiveBrand) && !selectedFranchise) {
        setCommissionPayments([]);
        return;
      }

      const url = "/api/partners/commission-payments";
      const params = new URLSearchParams();
      params.append("brand", effectiveBrand);
      if (selectedFranchise) {
        params.append("franchise", selectedFranchise);
      }
      params.append("_t", Date.now().toString());

      const response = await fetch(`${url}?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar pagamentos de comissão");
      }

      const data = await response.json();
      setCommissionPayments(data.payments || []);
    } catch (error) {
      console.error("Error fetching commission payments:", error);
      toast.error("Erro ao carregar pagamentos de comissão");
    }
  }, [effectiveBrand, selectedFranchise]);

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
      fetchAffiliateLink();
      fetchGeneratedCoupons();
      fetchContract();
      fetchPixKey();
      fetchCommissionSummary();
      fetchCommissionPayments();
    } else {
      // Clear data when user doesn't have permission (partners-media without assigned brand)
      setAffiliateLink(null);
      setGeneratedCoupons([]);
      setContract(null);
      setPixKey(null);
      setCommissionSummary(null);
      setCommissionPayments([]);
      setLoading(false);
    }
  }, [
    canViewPage,
    brandFilterLoading,
    shouldShowData,
    selectedBrand, // Track selected brand changes
    assignedBrand, // Track assigned brand changes
    selectedFranchise, // Track selected franchise changes
    fetchAffiliateLink,
    fetchGeneratedCoupons,
    fetchContract,
    fetchPixKey,
    fetchCommissionSummary,
    fetchCommissionPayments,
    isHydrated,
  ]);

  // Reload commission data when franchise changes
  useEffect(() => {
    if (!canViewPage || !isHydrated || !effectiveBrand) return;

    // Only reload if Zenith brand is selected
    if (isZenithProduct(effectiveBrand)) {
      console.log(
        "[Franchise Change] Reloading commission data for franchise:",
        selectedFranchise,
      );
      fetchCommissionSummary();
      fetchCommissionPayments();
    }
  }, [
    selectedFranchise,
    canViewPage,
    isHydrated,
    effectiveBrand,
    fetchCommissionSummary,
    fetchCommissionPayments,
  ]);

  // Debug: Log all brand-related values on every render (disabled for production)
  // console.log("=== RENDER DEBUG ===");
  // console.log("selectedBrand:", selectedBrand);
  // console.log("assignedBrand:", assignedBrand);
  // console.log("effectiveBrand:", effectiveBrand);
  // console.log("selectedFranchise:", selectedFranchise);
  // console.log("shouldShowData:", shouldShowData);

  // Reset form states when brand changes
  useEffect(() => {
    if (isHydrated && canViewPage) {
      setEditingLink(false);
      setNewLinkUrl("");
      setEditingContract(false);
      setNewContractUrl("");
      setEditingPixKey(false);
      setNewPixKey("");
      setNewPixType("random");
    }
  }, [selectedBrand, isHydrated, canViewPage]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado para a área de transferência!`);
    } catch (error) {
      toast.error("Erro ao copiar para a área de transferência");
    }
  };

  const formatCurrency = (value: number, currency = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const getMotivationalMessage = (totalEarned: number) => {
    if (totalEarned >= 100000) {
      return "🏆 CEM MIL REAIS! LENDÁRIO! Você alcançou o topo absoluto!";
    } else if (totalEarned >= 60000) {
      return "💰 Mais de 50k! Você está construindo um império de vendas!";
    } else if (totalEarned >= 50000) {
      return "👑 CINQUENTA MIL! Você é um verdadeiro REI/RAINHA das vendas!";
    } else if (totalEarned >= 40000) {
      return "🚀 QUARENTA MIL! Você está voando alto! Sem limites!";
    } else if (totalEarned >= 30000) {
      return "🌟 TRINTA MIL! Resultado extraordinário! Continue brilhando!";
    } else if (totalEarned >= 20000) {
      return "💎 VINTE MIL! Performance excepcional! Você é inspiração!";
    } else if (totalEarned >= 11000) {
      return "🔥 Mais de 10k! Você está no grupo de elite dos nossos parceiros!";
    } else if (totalEarned >= 10000) {
      return "🏅 DEZ MIL! Você alcançou um marco incrível! Parabéns!";
    } else if (totalEarned >= 9000) {
      return "🎯 Nove mil! Quase chegando aos cinco dígitos!";
    } else if (totalEarned >= 8000) {
      return "⚡ Oito mil! Energia e foco levando você ao topo!";
    } else if (totalEarned >= 7000) {
      return "💪 Sete mil! Você está dominando o mercado!";
    } else if (totalEarned >= 6000) {
      return "🚀 Seis mil! Sua performance está impressionante!";
    } else if (totalEarned >= 5000) {
      return "🌟 Cinco mil! Você está entre os melhores parceiros!";
    } else if (totalEarned >= 4000) {
      return "🏆 Quatro mil conquistados! Continue escalando suas vendas!";
    } else if (totalEarned >= 3000) {
      return "💎 Três mil! Você está se tornando um verdadeiro especialista em vendas!";
    } else if (totalEarned >= 2000) {
      return "🔥 Dois mil reais! Sua estratégia está funcionando perfeitamente!";
    } else if (totalEarned >= 1000) {
      return "🎯 Primeiro mil! Agora é hora de acelerar e conquistar novos horizontes!";
    } else if (totalEarned >= 500) {
      return "⭐ Meio milhar conquistado! Você tem potencial para muito mais!";
    } else if (totalEarned >= 300) {
      return "💪 Você está no caminho certo! Sua dedicação está rendendo frutos!";
    } else if (totalEarned >= 100) {
      return "🚀 Primeiros passos dados! Continue assim e alcance novos patamares!";
    } else {
      return "🌱 Comece sua jornada! Cada venda é um passo rumo ao sucesso!";
    }
  };

  const handleSavePayment = async () => {
    if (!newPayment.amount || !newPayment.payment_date) {
      toast.error("Valor e data do pagamento são obrigatórios");
      return;
    }

    const amount = parseFloat(newPayment.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor deve ser um número positivo");
      return;
    }

    try {
      setCommissionLoading(true);

      const method = editingPayment ? "PUT" : "POST";
      const url = editingPayment
        ? `/api/partners/commission-payments/${editingPayment.id}`
        : "/api/partners/commission-payments";

      const requestBody = {
        brand: effectiveBrand,
        franchise: selectedFranchise || null,
        amount,
        payment_date: newPayment.payment_date,
        description: newPayment.description || null,
        payment_method: newPayment.payment_method,
        payment_reference: newPayment.payment_reference || null,
        status: newPayment.status,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao salvar pagamento");
      }

      toast.success(
        editingPayment
          ? "Pagamento atualizado com sucesso!"
          : "Pagamento registrado com sucesso!",
      );

      // Reset form
      setNewPayment({
        amount: "",
        payment_date: "",
        description: "",
        payment_method: "pix",
        payment_reference: "",
        status: "sent",
      });
      setShowAddPayment(false);
      setEditingPayment(null);

      // Refresh data
      fetchCommissionSummary();
      fetchCommissionPayments();
    } catch (error) {
      console.error("Error saving payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar pagamento",
      );
    } finally {
      setCommissionLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Tem certeza que deseja excluir este pagamento?")) {
      return;
    }

    try {
      setCommissionLoading(true);

      const response = await fetch(
        `/api/partners/commission-payments/${paymentId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao excluir pagamento");
      }

      toast.success("Pagamento excluído com sucesso!");

      // Refresh data
      fetchCommissionSummary();
      fetchCommissionPayments();
    } catch (error) {
      console.error("Error deleting payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao excluir pagamento",
      );
    } finally {
      setCommissionLoading(false);
    }
  };

  const handleEditPayment = (payment: CommissionPayment) => {
    setEditingPayment(payment);
    setNewPayment({
      amount: payment.amount.toString(),
      payment_date: payment.payment_date,
      description: payment.description || "",
      payment_method: payment.payment_method,
      payment_reference: payment.payment_reference || "",
      status: payment.status,
    });
    setShowAddPayment(true);
  };

  const handleSaveLink = async () => {
    if (!newLinkUrl.trim()) {
      toast.error("URL é obrigatória");
      return;
    }

    const brandToUse = selectedBrand || assignedBrand;
    if (!brandToUse && !affiliateLink) {
      toast.error("Selecione uma marca para criar o link");
      return;
    }

    try {
      // Validate URL format
      new URL(newLinkUrl);
    } catch {
      toast.error("URL inválida");
      return;
    }

    try {
      const method = affiliateLink ? "PUT" : "POST";
      const url = affiliateLink
        ? `/api/partners/affiliate-links/${affiliateLink.id}`
        : "/api/partners/affiliate-links";

      const requestBody = affiliateLink
        ? { url: newLinkUrl.trim() }
        : { url: newLinkUrl.trim(), brand: brandToUse };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorData: { error?: string } = {};
        let responseText = "";

        try {
          responseText = await response.text();
          console.log("Raw response text:", responseText);

          if (responseText) {
            errorData = JSON.parse(responseText);
          }
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
          console.error("Response text:", responseText);
          errorData = { error: `Failed to parse response: ${responseText}` };
        }

        const errorMessage =
          errorData.error || `Erro ${response.status}: ${response.statusText}`;
        console.error("Error saving affiliate link:", {
          status: response.status,
          statusText: response.statusText,
          errorData,
          responseText,
          url: response.url,
          method,
        });
        throw new Error(errorMessage);
      }

      toast.success(
        affiliateLink
          ? "Link atualizado com sucesso!"
          : "Link criado com sucesso!",
      );
      setEditingLink(false);
      setNewLinkUrl("");
      fetchAffiliateLink();
    } catch (error) {
      console.error("Error in handleSaveLink:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar link",
      );
    }
  };

  const handleSaveContract = async () => {
    if (!newContractUrl.trim()) {
      toast.error("URL do contrato é obrigatória");
      return;
    }

    const brandToUse = selectedBrand || assignedBrand;
    if (!brandToUse && !contract) {
      toast.error("Selecione uma marca para criar o contrato");
      return;
    }

    // For Zenith, franchise is required
    const isZenith = brandToUse && isZenithProduct(brandToUse);
    if (isZenith && !selectedFranchise && !contract) {
      toast.error("Selecione uma franquia Zenith para criar o contrato");
      return;
    }

    try {
      // Validate URL format
      new URL(newContractUrl);
    } catch {
      toast.error("URL inválida");
      return;
    }

    try {
      const method = contract ? "PUT" : "POST";
      const url = contract
        ? `/api/partners/contracts/${contract.id}`
        : "/api/partners/contracts";

      const requestBody: any = contract
        ? { contract_url: newContractUrl.trim() }
        : { contract_url: newContractUrl.trim(), brand: brandToUse };

      // Add franchise for Zenith when creating
      if (!contract && isZenith && selectedFranchise) {
        requestBody.franchise = selectedFranchise;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao salvar contrato");
      }

      toast.success(
        contract
          ? "Contrato atualizado com sucesso!"
          : "Contrato criado com sucesso!",
      );
      setEditingContract(false);
      setNewContractUrl("");
      fetchContract();
    } catch (error) {
      console.error("Error in handleSaveContract:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar contrato",
      );
    }
  };

  const handleSavePixKey = async () => {
    if (!newPixKey.trim()) {
      toast.error("Chave pix é obrigatória");
      return;
    }

    const brandToUse = selectedBrand || assignedBrand;
    if (!brandToUse && !pixKey) {
      toast.error("Selecione uma marca para criar a chave pix");
      return;
    }

    // For Zenith, franchise is required
    const isZenith = brandToUse && isZenithProduct(brandToUse);
    if (isZenith && !selectedFranchise && !pixKey) {
      toast.error("Selecione uma franquia Zenith para criar a chave pix");
      return;
    }

    try {
      const method = pixKey ? "PUT" : "POST";
      const url = pixKey
        ? `/api/partners/pix-keys/${pixKey.id}`
        : "/api/partners/pix-keys";

      const requestBody: any = pixKey
        ? { pix_key: newPixKey.trim(), pix_type: newPixType }
        : {
            pix_key: newPixKey.trim(),
            brand: brandToUse,
            pix_type: newPixType,
          };

      // Add franchise for Zenith when creating
      if (!pixKey && isZenith && selectedFranchise) {
        requestBody.franchise = selectedFranchise;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao salvar chave pix");
      }

      toast.success(
        pixKey
          ? "Chave pix atualizada com sucesso!"
          : "Chave pix criada com sucesso!",
      );
      setEditingPixKey(false);
      setNewPixKey("");
      setNewPixType("random");
      fetchPixKey();
    } catch (error) {
      console.error("Error in handleSavePixKey:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar chave pix",
      );
    }
  };

  const processAutoLinks = async () => {
    if (!isOwnerOrAdmin) {
      toast.error("Apenas admins e owners podem processar auto-links");
      return;
    }

    try {
      setProcessingAutoLinks(true);

      const response = await fetch("/api/admin/process-auto-affiliate-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao processar auto-links");
      }

      const data = await response.json();
      console.log("Process auto-affiliate-links response:", data);

      const processedCount = data.stats?.processed || 0;
      const errorCount = data.stats?.errors || 0;
      const totalBrands = data.stats?.total || 0;

      if (processedCount > 0) {
        toast.success(
          `Auto-links criados! ${processedCount} de ${totalBrands} marcas processadas.`,
        );
      } else if (errorCount > 0) {
        toast.warning(
          `Processamento concluído com ${errorCount} erros. Verifique os logs.`,
        );
      } else {
        toast.info("Todas as marcas já possuem auto-links.");
      }

      // Refresh the affiliate links
      fetchAffiliateLink();
    } catch (error) {
      console.error("Error processing auto-affiliate-links:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao processar auto-links",
      );
    } finally {
      setProcessingAutoLinks(false);
    }
  };

  // Show loading while checking permissions
  if (permissionsLoading || brandFilterLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />

          {/* Loading skeleton for the main content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Affiliate Link Card Skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
              </CardContent>
            </Card>

            {/* Coupon Management Card Skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Partnership Contract Card Skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
              </CardContent>
            </Card>

            {/* Partner Pix Key Card Skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Show access denied only after permissions are loaded and user doesn't have access
  if (!canViewPage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
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

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <Home className="h-6 w-6 sm:h-8 sm:w-8" />
        Início - Parceiros
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
      </div>

      {/* Message when no brand is selected for owners/admins */}
      {!shouldShowData && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">🏷️</div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Selecione uma marca para visualizar os dados
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Como owner/admin, você precisa escolher uma marca específica para
              filtrar as informações da página.
            </p>
          </div>
        </div>
      )}

      {/* Content when brand is selected or user doesn't need brand filter */}
      {shouldShowData && (
        <div
          key={`partners-content-${effectiveBrand || "no-brand"}`}
          className="space-y-6"
        >
          {/* Commission Management Card - Full Width */}
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Gerenciamento de Comissões
              </CardTitle>
              {effectiveBrand && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <Tag className="h-3 w-3" />
                    {effectiveBrand}
                  </Badge>
                  {selectedFranchise && isZenithProduct(effectiveBrand) && (
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      🏪 {selectedFranchise}
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {!effectiveBrand ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="text-6xl">💰</div>
                    <h3 className="text-xl font-semibold text-muted-foreground">
                      Selecione uma marca para ver as informações de comissões
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Escolha uma marca específica para visualizar o resumo de
                      comissões, histórico de pagamentos e saldo disponível.
                    </p>
                  </div>
                </div>
              ) : effectiveBrand &&
                isZenithProduct(effectiveBrand) &&
                !selectedFranchise ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="text-6xl">🏪</div>
                    <h3 className="text-xl font-semibold text-muted-foreground">
                      Selecione uma franquia para ver as informações de
                      comissões
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Escolha uma franquia específica para visualizar o resumo
                      de comissões, histórico de pagamentos e saldo disponível.
                    </p>
                  </div>
                </div>
              ) : loading || !commissionSummary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </div>
                  <Skeleton className="h-32" />
                </div>
              ) : (
                <>
                  {/* Motivational Checkpoint */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800 p-4 text-center">
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {getMotivationalMessage(commissionSummary.total_earned)}
                    </p>
                  </div>

                  {/* Commission Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        <span className="font-semibold text-green-800 dark:text-green-200">
                          Total Ganho
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(commissionSummary.total_earned)}
                      </p>
                      <p className="text-sm text-green-600">
                        {commissionSummary.commission_percentage}% de comissão
                      </p>
                    </div>

                    <div className="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Wallet className="h-5 w-5 text-yellow-600" />
                        <span className="font-semibold text-yellow-800 dark:text-yellow-200">
                          Total Pago
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-yellow-600">
                        {formatCurrency(commissionSummary.total_paid)}
                      </p>
                      <p className="text-sm text-yellow-600">
                        {commissionPayments.length} pagamento(s)
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <DollarSign className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                          Saldo Disponível
                        </span>
                      </div>
                      <p
                        className="text-2xl font-bold text-blue-600"
                        onClick={() =>
                          console.log(
                            "[Balance Display] Current balance:",
                            commissionSummary.balance,
                            "Full summary:",
                            commissionSummary,
                          )
                        }
                      >
                        {formatCurrency(commissionSummary.balance)}
                      </p>
                      <p className="text-sm text-blue-600">
                        Liberado para saque
                      </p>
                    </div>
                  </div>

                  {/* Payment Management - Only for Admins/Owners */}
                  {isOwnerOrAdmin && (
                    <div className="border-t pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          Histórico de Pagamentos
                        </h3>
                        <Button
                          onClick={() => {
                            setEditingPayment(null);
                            setNewPayment({
                              amount: "",
                              payment_date: "",
                              description: "",
                              payment_method: "pix",
                              payment_reference: "",
                              status: "sent",
                            });
                            setShowAddPayment(true);
                          }}
                          disabled={commissionLoading}
                        >
                          <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">Registrar Pagamento</span>
                        </Button>
                      </div>

                      {/* Payment Form */}
                      {showAddPayment && (
                        <div className="bg-muted/30 rounded-lg p-4 mb-4 space-y-4">
                          <h4 className="font-semibold">
                            {editingPayment
                              ? "Editar Pagamento"
                              : "Novo Pagamento"}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="amount">Valor (R$)</Label>
                              <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                value={newPayment.amount}
                                onChange={(e) =>
                                  setNewPayment({
                                    ...newPayment,
                                    amount: e.target.value,
                                  })
                                }
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <Label htmlFor="payment_date">
                                Data do Pagamento
                              </Label>
                              <Input
                                id="payment_date"
                                type="date"
                                value={newPayment.payment_date}
                                onChange={(e) =>
                                  setNewPayment({
                                    ...newPayment,
                                    payment_date: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="payment_method">
                                Método de Pagamento
                              </Label>
                              <Select
                                value={newPayment.payment_method}
                                onValueChange={(value) =>
                                  setNewPayment({
                                    ...newPayment,
                                    payment_method: value,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pix">PIX</SelectItem>
                                  <SelectItem value="bank_transfer">
                                    Transferência Bancária
                                  </SelectItem>
                                  <SelectItem value="other">Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="status">Status</Label>
                              <Select
                                value={newPayment.status}
                                onValueChange={(value) =>
                                  setNewPayment({
                                    ...newPayment,
                                    status: value,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="sent">Enviado</SelectItem>
                                  <SelectItem value="confirmed">
                                    Confirmado
                                  </SelectItem>
                                  <SelectItem value="cancelled">
                                    Cancelado
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="description">
                                Descrição (opcional)
                              </Label>
                              <Input
                                id="description"
                                value={newPayment.description}
                                onChange={(e) =>
                                  setNewPayment({
                                    ...newPayment,
                                    description: e.target.value,
                                  })
                                }
                                placeholder="Observações sobre o pagamento"
                              />
                            </div>
                            <div>
                              <Label htmlFor="payment_reference">
                                Referência/ID (opcional)
                              </Label>
                              <Input
                                id="payment_reference"
                                value={newPayment.payment_reference}
                                onChange={(e) =>
                                  setNewPayment({
                                    ...newPayment,
                                    payment_reference: e.target.value,
                                  })
                                }
                                placeholder="ID da transação, comprovante, etc."
                              />
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={handleSavePayment}
                              disabled={commissionLoading}
                              className="flex-1 sm:flex-none"
                            >
                              {commissionLoading ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                  Salvando...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-2" />
                                  {editingPayment ? "Atualizar" : "Salvar"}
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowAddPayment(false);
                                setEditingPayment(null);
                              }}
                              className="flex-1 sm:flex-none"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Payments List */}
                      <div className="space-y-3">
                        {commissionPayments.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum pagamento registrado ainda.</p>
                          </div>
                        ) : (
                          commissionPayments.map((payment) => (
                            <div
                              key={payment.id}
                              className="border rounded-lg p-4 space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                  <div>
                                    <p className="font-semibold text-lg">
                                      {formatCurrency(payment.amount)}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {new Date(
                                        payment.payment_date,
                                      ).toLocaleDateString("pt-BR")}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <Badge
                                      variant={
                                        payment.status === "confirmed"
                                          ? "default"
                                          : payment.status === "sent"
                                            ? "secondary"
                                            : "destructive"
                                      }
                                    >
                                      {payment.status === "sent"
                                        ? "Enviado"
                                        : payment.status === "confirmed"
                                          ? "Confirmado"
                                          : "Cancelado"}
                                    </Badge>
                                    {payment.franchise && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        🏪 {payment.franchise}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2 self-start sm:self-center">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditPayment(payment)}
                                    className="flex-1 sm:flex-none"
                                  >
                                    <Edit className="h-3 w-3 sm:mr-0 mr-2" />
                                    <span className="sm:hidden">Editar</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleDeletePayment(payment.id)
                                    }
                                    className="flex-1 sm:flex-none"
                                  >
                                    <Trash2 className="h-3 w-3 sm:mr-0 mr-2" />
                                    <span className="sm:hidden">Excluir</span>
                                  </Button>
                                </div>
                              </div>
                              {payment.description && (
                                <p className="text-sm text-muted-foreground">
                                  {payment.description}
                                </p>
                              )}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                                <span>
                                  Método:{" "}
                                  {payment.payment_method === "pix"
                                    ? "PIX"
                                    : payment.payment_method === "bank_transfer"
                                      ? "Transferência"
                                      : "Outro"}
                                </span>
                                {payment.payment_reference && (
                                  <span className="break-all">
                                    Ref: {payment.payment_reference}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* View-only for Partners-Media */}
                  {isPartnersMedia && !isOwnerOrAdmin && (
                    <div className="border-t pt-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Histórico de Recebimentos
                      </h3>
                      <div className="space-y-3">
                        {commissionPayments.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum pagamento recebido ainda.</p>
                          </div>
                        ) : (
                          commissionPayments.map((payment) => (
                            <div
                              key={payment.id}
                              className="border rounded-lg p-4 space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                  <div>
                                    <p className="font-semibold text-lg">
                                      {formatCurrency(payment.amount)}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {new Date(
                                        payment.payment_date,
                                      ).toLocaleDateString("pt-BR")}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={
                                      payment.status === "confirmed"
                                        ? "default"
                                        : payment.status === "sent"
                                          ? "secondary"
                                          : "destructive"
                                    }
                                  >
                                    {payment.status === "sent"
                                      ? "Enviado"
                                      : payment.status === "confirmed"
                                        ? "Confirmado"
                                        : "Cancelado"}
                                  </Badge>
                                </div>
                              </div>
                              {payment.description && (
                                <p className="text-sm text-muted-foreground">
                                  {payment.description}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Other Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Affiliate Link Card */}
            <Card key={`affiliate-link-${effectiveBrand || "no-brand"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Link de Afiliado
                </CardTitle>
                {effectiveBrand && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {effectiveBrand}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Auto-links processing for admins/owners */}
                {isOwnerOrAdmin && (
                  <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-base">
                        Links de Afiliado Automáticos
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Gere links automaticamente para todas as marcas
                      </p>
                    </div>
                    <Button
                      onClick={processAutoLinks}
                      disabled={processingAutoLinks}
                      variant="outline"
                      className="w-full sm:w-auto"
                      size="lg"
                    >
                      {processingAutoLinks ? (
                        <>
                          <Link className="h-4 w-4 mr-2 animate-pulse flex-shrink-0" />
                          <span className="truncate">
                            Criando Auto-Links...
                          </span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">Criar Auto-Links</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    {!affiliateLink ||
                    (selectedBrand === null && canUseBrandFilter) ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">
                          {canEditLinks
                            ? selectedBrand === null && canUseBrandFilter
                              ? "Selecione uma marca para ver ou criar link de afiliados."
                              : effectiveBrand &&
                                  isZenithProduct(effectiveBrand) &&
                                  !selectedFranchise
                                ? "Selecione uma franquia Zenith para ver o link de afiliado."
                                : effectiveBrand
                                  ? `Nenhum link de afiliado criado para a marca "${effectiveBrand}".`
                                  : "Selecione uma marca para ver ou criar link de afiliados."
                            : "Selecione uma marca para ver ou criar link de afiliados."}
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-3">
                        <div className="space-y-3">
                          {/* Badge para mostrar a franquia (apenas para Zenith) */}
                          {effectiveBrand &&
                            isZenithProduct(effectiveBrand) &&
                            selectedFranchise && (
                              <div className="flex items-center gap-2 pb-2 border-b">
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  🏪 Franquia: {selectedFranchise}
                                </Badge>
                              </div>
                            )}

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm break-all font-mono bg-muted p-2 rounded">
                                {affiliateLink.url}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  copyToClipboard(affiliateLink.url, "Link")
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowQRCodeModal(true)}
                                title="Gerar QR Code"
                              >
                                <QrCode className="h-3 w-3" />
                              </Button>
                              {canEditLinks && selectedBrand !== null && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingLink(true);
                                    setNewLinkUrl(affiliateLink.url);
                                  }}
                                  disabled={
                                    selectedBrand === null && canUseBrandFilter
                                  }
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-sm text-muted-foreground text-center">
                              Divulgue os slides personalizados da Hud Lab com
                              este link e ganhe comissão!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Edit form for when editing is active */}
                    {canEditLinks && editingLink && selectedBrand !== null && (
                      <div className="pt-4 border-t">
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="url">URL do Link de Afiliado</Label>
                            <Input
                              id="url"
                              value={newLinkUrl}
                              onChange={(e) => setNewLinkUrl(e.target.value)}
                              placeholder="https://..."
                              disabled={
                                selectedBrand === null && canUseBrandFilter
                              }
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={handleSaveLink}
                              className="flex-1"
                              disabled={
                                selectedBrand === null && canUseBrandFilter
                              }
                            >
                              <Save className="h-4 w-4 mr-2" />
                              Salvar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingLink(false);
                                setNewLinkUrl("");
                              }}
                              className="flex-1 sm:flex-none"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Add link button for when no link exists and not editing */}
                    {canEditLinks &&
                      !affiliateLink &&
                      !editingLink &&
                      effectiveBrand && (
                        <div className="pt-4 border-t">
                          <Button
                            onClick={() => {
                              setEditingLink(true);
                              // Generate default affiliate URL for the brand
                              let defaultUrl = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${effectiveBrand.replace(
                                /\s+/g,
                                "-",
                              )}`;

                              // For Zenith brand, include franchise name if selected
                              if (
                                isZenithProduct(effectiveBrand) &&
                                selectedFranchise
                              ) {
                                defaultUrl = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${effectiveBrand.replace(
                                  /\s+/g,
                                  "-",
                                )}-${selectedFranchise.replace(/\s+/g, "-")}`;
                              }

                              setNewLinkUrl(defaultUrl);
                            }}
                            className="w-full"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">
                              Adicionar Link para {effectiveBrand}
                              {isZenithProduct(effectiveBrand) &&
                                selectedFranchise &&
                                ` - ${selectedFranchise}`}
                            </span>
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Coupon Management Card */}
            <Card key={`coupon-management-${effectiveBrand || "no-brand"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  {isOwnerOrAdmin
                    ? "Gerenciamento de Cupons"
                    : "Cupons Disponíveis"}
                </CardTitle>
                {isPartnersMedia && (
                  <p className="text-sm text-muted-foreground">
                    Você pode visualizar e copiar os cupons da sua marca.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Coupons List - auto-loaded live from Nuvemshop */}
                {(isOwnerOrAdmin || isPartnersMedia) &&
                  (() => {
                    if (refreshingCoupons && generatedCoupons.length === 0) {
                      return (
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      );
                    }

                    const validCoupons = generatedCoupons.filter(
                      (coupon) => coupon.valid === true,
                    );

                    if (validCoupons.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                          <p className="text-sm text-muted-foreground">
                            Nenhum cupom válido encontrado.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="pt-4 border-t">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                          <h4 className="font-medium">
                            {isOwnerOrAdmin ? "Cupons Ativos" : "Seus Cupons"}
                          </h4>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {validCoupons.map((coupon, index) => (
                            <div
                              key={`${coupon.code}-${index}`}
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted rounded-lg gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <p className="font-mono text-sm font-medium break-all">
                                    {coupon.code}
                                  </p>
                                  <Badge
                                    variant="default"
                                    className="text-xs bg-green-100 text-green-800 border-green-200"
                                  >
                                    ✓ Ativo
                                  </Badge>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">
                                    {coupon.type === "percentage"
                                      ? `${coupon.value}% de desconto`
                                      : coupon.type === "absolute"
                                        ? `R$ ${coupon.value} de desconto`
                                        : "Frete grátis"}
                                  </p>
                                  {coupon.end_date && (
                                    <p className="text-xs text-muted-foreground">
                                      Válido até{" "}
                                      {new Date(
                                        coupon.end_date,
                                      ).toLocaleDateString("pt-BR")}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 self-start sm:self-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    copyToClipboard(coupon.code, "Cupom")
                                  }
                                  title="Copiar código do cupom"
                                  className="flex-1 sm:flex-none"
                                >
                                  <Copy className="h-3 w-3 sm:mr-0 mr-2" />
                                  <span className="sm:hidden">Copiar</span>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                {/* Information for users without access */}
                {!isPartnersMedia && !isOwnerOrAdmin && (
                  <div className="text-center py-8">
                    <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      Acesso Restrito
                    </h3>
                    <p className="text-muted-foreground">
                      Apenas usuários partners-media, admins e owners podem
                      acessar a funcionalidade de cupons.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Partnership Contract Card */}
            <Card key={`partnership-contract-${effectiveBrand || "no-brand"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Contrato de Parceria
                </CardTitle>
                {effectiveBrand && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {effectiveBrand}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    {!contract ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">
                          {canEditContracts
                            ? effectiveBrand
                              ? `Nenhum contrato criado para a marca "${effectiveBrand}".`
                              : "Selecione uma marca para ver ou criar contratos."
                            : "Nenhum contrato disponível."}
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm break-all font-mono bg-muted p-2 rounded">
                                {contract.contract_url}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  copyToClipboard(
                                    contract.contract_url,
                                    "Contrato",
                                  )
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              {canEditContracts && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingContract(true);
                                    setNewContractUrl(contract.contract_url);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-sm text-muted-foreground text-center">
                              {isPartnersMedia
                                ? "Link do contrato de parceria (somente visualização)"
                                : "Link do contrato de parceria"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Edit form for when editing is active */}
                    {canEditContracts && editingContract && (
                      <div className="pt-4 border-t">
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="contract-url">
                              URL do Contrato
                            </Label>
                            <Input
                              id="contract-url"
                              value={newContractUrl}
                              onChange={(e) =>
                                setNewContractUrl(e.target.value)
                              }
                              placeholder="https://..."
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={handleSaveContract}
                              className="flex-1"
                            >
                              <Save className="h-4 w-4 mr-2" />
                              Salvar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingContract(false);
                                setNewContractUrl("");
                              }}
                              className="flex-1 sm:flex-none"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Add contract button for when no contract exists and not editing */}
                    {canEditContracts &&
                      !contract &&
                      !editingContract &&
                      effectiveBrand && (
                        <div className="pt-4 border-t">
                          <Button
                            onClick={() => {
                              setEditingContract(true);
                              setNewContractUrl("");
                            }}
                            className="w-full"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">
                              Adicionar Contrato para {effectiveBrand}
                            </span>
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Partner Pix Key Card */}
            <Card key={`partner-pix-key-${effectiveBrand || "no-brand"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Chave Pix
                </CardTitle>
                {effectiveBrand && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {effectiveBrand}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    {!pixKey ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">
                          {canEditPixKeys
                            ? effectiveBrand
                              ? `Nenhuma chave pix criada para a marca "${effectiveBrand}".`
                              : "Selecione uma marca para ver ou criar chaves pix."
                            : "Nenhuma chave pix disponível."}
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm break-all font-mono bg-muted p-2 rounded">
                                {pixKey.pix_key}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Tipo: {pixKey.pix_type}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  copyToClipboard(pixKey.pix_key, "Chave Pix")
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              {canEditPixKeys && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingPixKey(true);
                                    setNewPixKey(pixKey.pix_key);
                                    setNewPixType(pixKey.pix_type);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-sm text-muted-foreground text-center">
                              Chave pix para recebimento de pagamentos
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Edit form for when editing is active */}
                    {canEditPixKeys && editingPixKey && (
                      <div className="pt-4 border-t">
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="pix-key">Chave Pix</Label>
                            <Input
                              id="pix-key"
                              value={newPixKey}
                              onChange={(e) => setNewPixKey(e.target.value)}
                              placeholder="Digite a chave pix..."
                            />
                          </div>
                          <div>
                            <Label htmlFor="pix-type">Tipo da Chave</Label>
                            <Select
                              value={newPixType}
                              onValueChange={setNewPixType}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cpf">CPF</SelectItem>
                                <SelectItem value="cnpj">CNPJ</SelectItem>
                                <SelectItem value="email">E-mail</SelectItem>
                                <SelectItem value="phone">Telefone</SelectItem>
                                <SelectItem value="random">
                                  Chave Aleatória
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={handleSavePixKey}
                              className="flex-1"
                            >
                              <Save className="h-4 w-4 mr-2" />
                              Salvar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingPixKey(false);
                                setNewPixKey("");
                                setNewPixType("random");
                              }}
                              className="flex-1 sm:flex-none"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Add pix key button for when no pix key exists and not editing */}
                    {canEditPixKeys &&
                      !pixKey &&
                      !editingPixKey &&
                      effectiveBrand && (
                        <div className="pt-4 border-t">
                          <Button
                            onClick={() => {
                              setEditingPixKey(true);
                              setNewPixKey("");
                              setNewPixType("random");
                            }}
                            className="w-full"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">
                              Adicionar Chave Pix para {effectiveBrand}
                            </span>
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {affiliateLink && (
        <QRCodeModal
          isOpen={showQRCodeModal}
          onClose={() => setShowQRCodeModal(false)}
          affiliateUrl={affiliateLink.url}
          brand={effectiveBrand || undefined}
        />
      )}
    </div>
  );
}
