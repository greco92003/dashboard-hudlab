"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Loader2,
  PackagePlus,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ErpContact,
  ErpDeal,
  ErpDealProductPreview,
  ErpProductModel,
  TinyCloner,
  TinyExistingProduct,
} from "@/lib/erp/types";
import type { ErpContactDraft } from "@/lib/erp/contact-rules";
import {
  buildBaseSku,
  buildProductTitle,
  buildVariationSku,
  inferSoleColorFromCloner,
  inferUpperColorFromCloner,
} from "@/lib/erp/product-rules";
import { ContactImportCard } from "./contact-import-card";
import { SalesOrderCard } from "./sales-order-card";
import { artworkEmbedUrl, artworkThumbnailUrl } from "@/lib/erp/artwork-url";

type ProductMapping = {
  mode: "clone" | "existing";
  clonerId: string;
  existingProductId: string;
  color: string;
  soleColor: string;
  title: string;
  baseSku: string;
  variationSkus: Record<string, string>;
};

type ProductCreationResult = {
  modelNumber: number;
  audience: "adulto" | "infantil";
  sku: string;
  title: string;
  status: "created" | "existing" | "failed";
  tinyProductId?: number;
  variationSkus?: Record<string, string>;
  addedSizes?: string[];
  manufacturedSizes?: string[];
  error?: string;
};

type ProductAudience = ErpProductModel["audience"];

function productModelKey(model: Pick<ErpProductModel, "modelNumber" | "audience">) {
  return `${model.modelNumber}:${model.audience}`;
}

function productModelLabel(model: Pick<ErpProductModel, "modelNumber" | "audience">) {
  return `Modelo ${model.modelNumber} ${model.audience}`;
}
function clonerMatchesAudience(cloner: TinyCloner, audience: ProductAudience) {
  const isInfantCloner = /infantil/i.test(cloner.description);
  return audience === "infantil" ? isInfantCloner : !isInfantCloner;
}


const PRODUCT_PREPARATION_TIMEOUT_MS = 295_000;

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Erro inesperado.");
  return body as T;
}

function formatMoney(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    won: "Ganho",
    open: "Aberto",
    lost: "Perdido",
    abandoned: "Abandonado",
  };
  return status ? labels[status] ?? status : "Sem status";
}

function ArtworkPreview({ url, modelNumber }: { url: string | null; modelNumber: number }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  useEffect(() => setThumbnailFailed(false), [url]);
  if (!url) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-muted/20 text-xs text-muted-foreground">
        Sem arte aprovada
      </div>
    );
  }
  const thumbnailUrl = artworkThumbnailUrl(url);
  const embedUrl = artworkEmbedUrl(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex h-32 overflow-hidden rounded-lg border bg-muted/20"
      aria-label={`Abrir arte aprovada do modelo ${modelNumber}`}
    >
      {thumbnailUrl && !thumbnailFailed ? (
        // Google Drive /view pages are HTML. Their thumbnail endpoint returns
        // the actual image bytes that browsers can render inside the card.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} onError={() => setThumbnailFailed(true)} alt={`Arte aprovada do modelo ${modelNumber}`} className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]" />
      ) : embedUrl ? (
        <iframe src={embedUrl} title={`Visualização da arte do modelo ${modelNumber}`} className="pointer-events-none h-full w-full border-0" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <FileImage className="h-7 w-7" />
          <span className="text-xs">Abrir arquivo da arte</span>
        </div>
      )}
      <span className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <ExternalLink className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}

function ExistingProductPicker({ onSelect }: { onSelect: (product: TinyExistingProduct) => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [products, setProducts] = useState<TinyExistingProduct[]>([]);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return toast.error("Digite pelo menos 2 caracteres.");
    setLoading(true);
    try {
      const result = await apiJson<{ products: TinyExistingProduct[] }>(`/api/erp/tiny/products/search?q=${encodeURIComponent(query.trim())}`);
      setProducts(result.products);
      if (result.products.length === 0) toast.info("Nenhum produto pai com variações foi encontrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na busca de produtos.");
    } finally { setLoading(false); }
  };
  const selectProduct = async (id: number) => {
    setSelectingId(id);
    try {
      const result = await apiJson<{ product: TinyExistingProduct }>(`/api/erp/tiny/products/${id}`);
      onSelect(result.product);
      toast.success("Produto e grade carregados do Tiny.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar a grade do produto.");
    } finally { setSelectingId(null); }
  };
  return <div className="space-y-3">
    <form onSubmit={search} className="flex gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou SKU do produto" /><Button type="submit" variant="outline" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Search />}Buscar</Button></form>
    {products.length > 0 && <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{products.map((product) => <button type="button" key={product.id} disabled={selectingId !== null} onClick={() => selectProduct(product.id)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/50 disabled:opacity-60"><span className="block text-sm font-medium">{product.description}</span><span className="block text-xs text-muted-foreground">{product.sku || `Tiny ID ${product.id}`} · {selectingId === product.id ? "Carregando grade…" : "Selecionar e carregar grade"}</span></button>)}</div>}
  </div>;
}

export default function CadastroErpPage() {
  const [query, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      contact: parseAsString.withDefault(""),
      deal: parseAsString.withDefault(""),
    },
    { history: "push" },
  );
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [contacts, setContacts] = useState<ErpContact[]>([]);
  const [deals, setDeals] = useState<ErpDeal[]>([]);
  const [preview, setPreview] = useState<ErpDealProductPreview | null>(null);
  const [cloners, setCloners] = useState<TinyCloner[]>([]);
  const [mappings, setMappings] = useState<Record<string, ProductMapping>>({});
  const [productBaseName, setProductBaseName] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [clonersLoading, setClonersLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creatingProducts, setCreatingProducts] = useState(false);
  const [creationResults, setCreationResults] = useState<ProductCreationResult[]>([]);
  const [tinyContactReady, setTinyContactReady] = useState(false);
  const [tinyContactId, setTinyContactId] = useState<number | null>(null);
  const [tinyContactDraft, setTinyContactDraft] = useState<ErpContactDraft | null>(null);

  useEffect(() => {
    if (query.q.length < 2) return;
    let active = true;
    setContactsLoading(true);
    apiJson<{ contacts: ErpContact[] }>(
      `/api/erp/ghl/contacts?q=${encodeURIComponent(query.q)}`,
    )
      .then((data) => active && setContacts(data.contacts))
      .catch((error) => active && toast.error(error.message))
      .finally(() => active && setContactsLoading(false));
    return () => {
      active = false;
    };
  }, [query.q]);

  useEffect(() => {
    if (!query.contact) {
      setDeals([]);
      return;
    }
    let active = true;
    setDealsLoading(true);
    apiJson<{ deals: ErpDeal[] }>(
      `/api/erp/ghl/deals?contactId=${encodeURIComponent(query.contact)}`,
    )
      .then((data) => active && setDeals(data.deals))
      .catch((error) => active && toast.error(error.message))
      .finally(() => active && setDealsLoading(false));
    return () => {
      active = false;
    };
  }, [query.contact]);

  useEffect(() => {
    if (!query.deal) {
      setPreview(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    apiJson<ErpDealProductPreview>(
      `/api/erp/ghl/deals/${encodeURIComponent(query.deal)}/product-models`,
    )
      .then((data) => {
        if (!active) return;
        setPreview(data);
        setProductBaseName(data.deal.name);
        setMappings(Object.fromEntries(data.models.map((model) => [productModelKey(model), {
          mode: "clone" as const,
          clonerId: "",
          existingProductId: "",
          color: "",
          soleColor: model.soleColor ?? "",
          title: "",
          baseSku: "",
          variationSkus: {},
        }])));
        setCreationResults([]);
      })
      .catch((error) => active && toast.error(error.message))
      .finally(() => active && setPreviewLoading(false));
    return () => {
      active = false;
    };
  }, [query.deal]);

  useEffect(() => {
    if (!query.deal || cloners.length > 0) return;
    let active = true;
    setClonersLoading(true);
    apiJson<{ cloners: TinyCloner[] }>("/api/erp/tiny/cloners")
      .then((data) => active && setCloners(data.cloners))
      .catch((error) => active && toast.error(error.message))
      .finally(() => active && setClonersLoading(false));
    return () => {
      active = false;
    };
  }, [query.deal, cloners.length]);

  const selectedContact = contacts.find((contact) => contact.id === query.contact);
  const selectedDeal = deals.find((deal) => deal.id === query.deal);

  const updateMapping = (model: ErpProductModel, patch: Partial<ProductMapping>) => {
    const key = productModelKey(model);
    setCreationResults([]);
    setMappings((current) => {
      const previous = current[key] ?? {
        mode: "clone" as const,
        clonerId: "",
        existingProductId: "",
        color: "",
        soleColor: model.soleColor ?? "",
        title: "",
        baseSku: "",
        variationSkus: {},
      };
      return {
        ...current,
        [key]: {
          ...previous,
          ...patch,
        },
      };
    });
  };

  const chooseCloner = (model: ErpProductModel, clonerId: string) => {
    const cloner = cloners.find((item) => String(item.id) === clonerId);
    const color = cloner ? inferUpperColorFromCloner(cloner.description) : "";
    const soleColor = cloner
      ? inferSoleColorFromCloner(cloner.description) || model.soleColor || ""
      : model.soleColor || "";
    const date = new Date(preview?.deal.createdAt ?? Date.now());
    const opportunityName = productBaseName;
    updateMapping(model, {
      mode: "clone",
      clonerId,
      existingProductId: "",
      variationSkus: {},
      color,
      soleColor,
      title: color
        ? buildProductTitle({ opportunityName, color, soleColor, modelNumber: model.modelNumber, audience: model.audience, date })
        : "",
      baseSku: color ? buildBaseSku(opportunityName, color, model.audience, soleColor) : "",
    });
  };

  const chooseExistingProduct = (model: ErpProductModel, product: TinyExistingProduct) => {
    updateMapping(model, {
      mode: "existing",
      clonerId: "",
      existingProductId: String(product.id),
      color: "",
      soleColor: "",
      title: product.description,
      baseSku: product.sku,
      variationSkus: product.variationSkus,
    });
  };

  const updateProductBaseName = (value: string) => {
    setProductBaseName(value);
    setCreationResults([]);
    if (!preview) return;
    const date = new Date(preview.deal.createdAt ?? Date.now());
    setMappings((current) => {
      const next = { ...current };
      for (const model of preview.models) {
        const key = productModelKey(model);
        const mapping = current[key];
        if (!mapping?.color || mapping.mode === "existing") continue;
        next[key] = {
          ...mapping,
          title: buildProductTitle({
            opportunityName: value,
            color: mapping.color,
            soleColor: mapping.soleColor || model.soleColor || undefined,
            modelNumber: model.modelNumber,
            date,
            audience: model.audience,
          }),
          baseSku: buildBaseSku(value, mapping.color, model.audience, mapping.soleColor || model.soleColor || undefined),
        };
      }
      return next;
    });
  };

  const updateUpperColor = (model: ErpProductModel, color: string) => {
    const date = new Date(preview?.deal.createdAt ?? Date.now());
    updateMapping(model, {
      color,
      title: color
        ? buildProductTitle({
            opportunityName: productBaseName,
            color,
            soleColor: mappings[productModelKey(model)]?.soleColor || model.soleColor || undefined,
            modelNumber: model.modelNumber,
            audience: model.audience,
            date,
          })
        : "",
      baseSku: color
        ? buildBaseSku(productBaseName, color, model.audience, mappings[productModelKey(model)]?.soleColor || model.soleColor || undefined)
        : "",
    });
  };

  const validations = useMemo(() => {
    if (!preview) return [];
    const problems: string[] = [];
    const hasNewProducts = preview.models.some((model) => mappings[productModelKey(model)]?.mode !== "existing");
    if (hasNewProducts && !productBaseName.trim()) {
      problems.push("Informe o nome-base dos produtos.");
    }
    const skus = new Map<string, string[]>();
    for (const model of preview.models) {
      const mapping = mappings[productModelKey(model)];
      const label = productModelLabel(model);
      if (!mapping) {
        problems.push(`${label}: escolha criar um produto ou usar um existente.`);
        continue;
      }
      if (mapping.mode === "existing") {
        if (!mapping.existingProductId) problems.push(`${label}: escolha um produto existente.`);
      } else if (!mapping.clonerId) {
        problems.push(`${label}: escolha um cloner.`);
      }
      if (mapping.mode === "clone" && mapping.clonerId && !mapping.color) {
        problems.push(`${label}: informe a cor da gáspea.`);
      }
      if (mapping.mode === "clone" && !model.soleColor) {
        problems.push(`${label}: a cor do solado não foi preenchida no GHL.`);
      }
      if (mapping.mode === "clone" && mapping.clonerId && (!mapping.title.trim() || !mapping.baseSku.trim())) {
        problems.push(`${label}: título e SKU são obrigatórios.`);
      }
      if (mapping.mode === "clone" && mapping.title && mapping.title.trim().length > 120) {
        problems.push(`${label}: o nome deve ter no máximo 120 caracteres.`);
      }
      if (mapping.mode === "clone" && mapping.baseSku && mapping.baseSku.trim().length > 50) {
        problems.push(`${label}: o SKU deve ter no máximo 50 caracteres.`);
      }
      if (mapping.mode === "clone" && mapping.baseSku && !/^[A-Za-z0-9_-]+$/.test(mapping.baseSku.trim())) {
        problems.push(`${label}: o SKU possui caracteres inválidos.`);
      }
      if (mapping.mode === "clone" && mapping.baseSku) {
        const key = mapping.baseSku.trim().toUpperCase();
        skus.set(key, [...(skus.get(key) ?? []), label]);
      }
    }
    for (const [sku, modelLabels] of skus) {
      if (modelLabels.length > 1) {
        problems.push(`SKU duplicado ${sku} em ${modelLabels.join(", ")}.`);
      }
    }
    return problems;
  }, [preview, mappings, productBaseName]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = searchDraft.trim();
    if (value.length < 2) {
      toast.error("Digite pelo menos 2 caracteres.");
      return;
    }
    void setQuery({ q: value, contact: null, deal: null });
  };

  const createProducts = async () => {
    if (!preview || validations.length > 0 || creatingProducts) return;
    setCreatingProducts(true);
    setConfirmOpen(false);
    try {
      const response = await apiJson<{ results: ProductCreationResult[] }>(
        "/api/erp/tiny/products",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(PRODUCT_PREPARATION_TIMEOUT_MS),
          body: JSON.stringify({
            dealId: preview.deal.id,
            products: preview.models.map((model) => {
              const mapping = mappings[productModelKey(model)];
              return mapping.mode === "existing"
                ? { mode: "existing", modelNumber: model.modelNumber, audience: model.audience, existingProductId: Number(mapping.existingProductId) }
                : { mode: "clone", modelNumber: model.modelNumber, audience: model.audience, clonerId: Number(mapping.clonerId), title: mapping.title.trim(), baseSku: mapping.baseSku.trim() };
            }),
          }),
        },
      );
      setMappings((current) => {
        const next = { ...current };
        for (const result of response.results) {
          if (!result.variationSkus) continue;
          const key = productModelKey(result);
          next[key] = {
            ...current[key],
            variationSkus: result.variationSkus,
          };
        }
        return next;
      });
      setCreationResults(response.results);
      const created = response.results.filter((item) => item.status === "created").length;
      const existing = response.results.filter((item) => item.status === "existing").length;
      const failed = response.results.filter((item) => item.status === "failed").length;
      if (failed > 0) {
        toast.error(`${failed} produto(s) falharam. ${created} cadastrado(s).`);
      } else {
        toast.success(
          `${created} produto(s) cadastrado(s)${existing ? ` e ${existing} já existente(s)` : ""}.`,
        );
      }
    } catch (error) {
      const timedOut = error instanceof Error
        && (error.name === "AbortError" || error.name === "TimeoutError");
      toast.error(
        timedOut
          ? "A preparação demorou além do limite. Confira os produtos no Tiny antes de tentar novamente."
          : error instanceof Error ? error.message : "Falha ao cadastrar produtos.",
      );
    } finally {
      setCreatingProducts(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <PackagePlus className="h-4 w-4" /> ERP · Cadastro de produtos
          </div>
          <h1 className="text-2xl font-bold tracking-tight">GHL → Tiny</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Escolha o contato e o deal, relacione cada modelo da ficha a um cloner e valide os produtos antes do cadastro.
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          Cadastro real habilitado
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
              Contato do GHL
            </CardTitle>
            <CardDescription>Pesquise por contato, empresa, e-mail, telefone ou nome do deal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={submitSearch}>
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Ex.: José, Metanoia ou contato@empresa.com"
                aria-label="Pesquisar contato ou deal"
              />
              <Button type="submit" disabled={contactsLoading}>
                {contactsLoading ? <Loader2 className="animate-spin" /> : <Search />}
                Pesquisar
              </Button>
            </form>

            {contacts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {contacts.length} contato(s) encontrado(s) · role para ver mais
                </p>
                <TooltipProvider delayDuration={200}>
                  <div className="max-h-80 space-y-2 overflow-y-scroll overscroll-contain pr-2 [scrollbar-color:hsl(var(--muted-foreground))_transparent] [scrollbar-width:thin]">
                {contacts.map((contact) => {
                  const selected = contact.id === query.contact;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => void setQuery({ contact: contact.id, deal: null })}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{contact.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[contact.companyName, contact.email, contact.phone].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="cursor-help">
                            Deals: {contact.deals.length}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-h-72 max-w-sm overflow-y-auto p-3">
                          <p className="font-semibold">Deals vinculados</p>
                          {contact.deals.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                              {contact.deals.map((deal) => <li key={deal.id}>• {deal.name}</li>)}
                            </ul>
                          ) : (
                            <p className="mt-1 opacity-80">Nenhum deal vinculado.</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </button>
                  );
                })}
                  </div>
                </TooltipProvider>
              </div>
            )}
            {query.contact && !selectedContact && (
              <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                Contato selecionado diretamente pela URL: {query.contact}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={!query.contact ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
              Deal e ficha do pedido
            </CardTitle>
            <CardDescription>
              {selectedContact ? `Deals de ${selectedContact.name}` : "Selecione um contato para continuar."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dealsLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" /> Carregando deals…</div>
            ) : deals.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {deals.map((deal) => {
                  const selected = deal.id === query.deal;
                  return (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => void setQuery({ deal: deal.id })}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{deal.name}</span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{statusLabel(deal.status)}</span><span>·</span><span>{formatMoney(deal.monetaryValue)}</span><span>·</span><span>{formatDate(deal.updatedAt)}</span>
                        </span>
                      </span>
                      <ArrowRight className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  );
                })}
              </div>
            ) : query.contact ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum deal encontrado para este contato.</p>
            ) : null}
            {query.deal && !selectedDeal && !previewLoading && (
              <p className="mt-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                Deal selecionado diretamente pela URL: {query.deal}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {query.contact && (
        <ContactImportCard
          contactId={query.contact}
          onReadyChange={setTinyContactReady}
          onTinyContactIdChange={setTinyContactId}
          onContactDraftChange={setTinyContactDraft}
        />
      )}

      {(previewLoading || preview) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">4</span>
              Modelo → Produto-cloner
            </CardTitle>
            <CardDescription>
              {preview ? `${preview.deal.name} · ${preview.models.length} modelo(s) com grade preenchida` : "Interpretando ficha do pedido…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" /> Lendo grades e artes…</div>
            ) : preview && preview.models.length > 0 ? (
              <div className="space-y-5">
                {preview.models.some((model) => (mappings[productModelKey(model)]?.mode ?? "clone") === "clone") && <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div className="space-y-2">
                      <Label htmlFor="product-base-name">Nome-base dos produtos novos</Label>
                      <Input
                        id="product-base-name"
                        value={productBaseName}
                        onChange={(event) => updateProductBaseName(event.target.value)}
                        placeholder="Ex.: VESTORETO"
                      />
                      <p className="text-xs text-muted-foreground">
                        Aplicado somente aos modelos que serão criados a partir de um cloner.
                      </p>
                    </div>
                    <Badge variant="outline">Aplicado a {preview.models.filter((model) => (mappings[productModelKey(model)]?.mode ?? "clone") === "clone").length} produto(s)</Badge>
                  </div>
                </div>}

                {preview.models.map((model) => {
                  const mapping = mappings[productModelKey(model)];
                  const cloner = cloners.find((item) => String(item.id) === mapping?.clonerId);
                  return (
                    <div key={productModelKey(model)} className="grid gap-5 rounded-xl border p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                      <div className="space-y-3">
                        <div>
                          <p className="font-semibold">{productModelLabel(model)}</p>
                          <p className="text-xs text-muted-foreground">{model.totalPairs} pares · {model.grades.length} numerações</p>
                          <Badge variant="outline" className="mt-2 font-normal">Solado no pedido: {model.soleColor ?? "não informado"}</Badge>
                        </div>
                        <ArtworkPreview url={model.artUrl} modelNumber={model.modelNumber} />
                        <div className="flex flex-wrap gap-1.5">
                          {model.grades.map((grade) => (
                            <Badge key={`${grade.audience}-${grade.size}`} variant="secondary" className="font-normal">
                              {grade.size}: {grade.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="grid content-start gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Como usar este modelo?</Label>
                          <Select value={mapping?.mode ?? "clone"} onValueChange={(value: "clone" | "existing") => updateMapping(model, value === "existing" ? { mode: "existing", clonerId: "", existingProductId: "", color: "", title: "", baseSku: "", variationSkus: {} } : { mode: "clone", existingProductId: "", variationSkus: {} })}>
                            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clone">Criar produto novo a partir de um cloner</SelectItem><SelectItem value="existing">Usar produto já cadastrado no Tiny</SelectItem></SelectContent>
                          </Select>
                        </div>
                        {(mapping?.mode ?? "clone") === "clone" ? <>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Produto-cloner do Tiny</Label>
                          <Select value={mapping?.clonerId ?? ""} onValueChange={(value) => chooseCloner(model, value)}>
                            <SelectTrigger className="w-full"><SelectValue placeholder={clonersLoading ? "Carregando cloners…" : "Escolha o cloner correspondente"} /></SelectTrigger>
                            <SelectContent>
                              {cloners.filter((item) => clonerMatchesAudience(item, model.audience)).map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                  {item.description} · {item.variationCount} variações
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {cloner && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>SKU {cloner.sku} · {cloner.variationSizes.join(", ") || "grade não identificada"}</p>
                              <p>Combinação usada no produto: {mapping?.soleColor || "solado não identificado"} - {mapping?.color || "gáspea não identificada"}</p>
                              {model.soleColor && mapping?.soleColor && model.soleColor !== mapping.soleColor ? (
                                <p className="font-medium text-amber-600 dark:text-amber-400">Atenção: o solado do cloner é diferente do solado salvo no pedido.</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`color-${model.modelNumber}-${model.audience}`}>Cor da gáspea</Label>
                          <Input
                            id={`color-${model.modelNumber}-${model.audience}`}
                            value={mapping?.color ?? ""}
                            onChange={(event) => updateUpperColor(model, event.target.value)}
                            placeholder="Ex.: Preto"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`sku-${model.modelNumber}-${model.audience}`}>SKU do produto</Label>
                          <Input
                            id={`sku-${model.modelNumber}-${model.audience}`}
                            value={mapping?.baseSku ?? ""}
                            onChange={(event) => updateMapping(model, { baseSku: event.target.value })}
                            placeholder="CH-SL-NOME-PRT-BRC"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`title-${model.modelNumber}-${model.audience}`}>Nome do produto</Label>
                          <Input
                            id={`title-${model.modelNumber}-${model.audience}`}
                            value={mapping?.title ?? ""}
                            onChange={(event) => updateMapping(model, { title: event.target.value })}
                            placeholder="Gerado ao escolher o cloner"
                          />
                        </div>
                        {mapping?.baseSku && cloner && (
                          <div className="rounded-lg bg-muted/40 p-3 md:col-span-2">
                            <p className="mb-2 text-xs font-medium">Todas as variações que serão copiadas do cloner</p>
                            <div className="flex flex-wrap gap-1.5">
                              {cloner.variationSizes.map((size) => (
                                <code key={size} className="rounded bg-background px-2 py-1 text-[11px]">{size}: {buildVariationSku(mapping.baseSku, size)}</code>
                              ))}
                            </div>
                          </div>
                        )}
                        </> : <div className="space-y-3 md:col-span-2">
                          <Label>Buscar produto já cadastrado</Label>
                          {!mapping?.existingProductId ? (
                            <ExistingProductPicker onSelect={(product) => chooseExistingProduct(model, product)} />
                          ) : (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><p className="text-sm font-medium">{mapping.title}</p><p className="text-xs text-muted-foreground">Tiny ID {mapping.existingProductId} · SKU {mapping.baseSku}</p></div>
                                <Button type="button" size="sm" variant="outline" onClick={() => updateMapping(model, { existingProductId: "", title: "", baseSku: "", variationSkus: {} })}>Trocar produto</Button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">{model.grades.map((grade) => <code key={grade.size} className="rounded bg-background px-2 py-1 text-[11px]">{grade.size}: {mapping.variationSkus[grade.size] || "será adicionada ao preparar"}</code>)}</div>
                            </div>
                          )}
                        </div>}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3">
                    {validations.length === 0 ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-500" />}
                    <div>
                      <p className="text-sm font-medium">{validations.length === 0 ? "Prévia pronta para o próximo teste" : `${validations.length} pendência(s) na prévia`}</p>
                      {validations.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">{validations.slice(0, 5).map((problem) => <li key={problem}>{problem}</li>)}</ul>}
                    </div>
                  </div>
                  <Button
                    disabled={validations.length > 0 || creatingProducts || !tinyContactReady}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {creatingProducts ? <Loader2 className="animate-spin" /> : <PackagePlus />}
                    {creatingProducts ? "Validando…" : "Validar e preparar produtos"}
                  </Button>
                </div>

                {creationResults.length > 0 && (
                  <div className="space-y-2 rounded-xl border p-4">
                    <p className="text-sm font-medium">Resultado do cadastro</p>
                    {creationResults.map((result) => (
                      <div key={`${result.modelNumber}-${result.audience}-${result.sku}`} className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span>{productModelLabel(result)} · {result.sku}</span>
                        <span className={result.status === "failed" ? "text-destructive" : "text-emerald-600"}>
                          {result.status === "created" && `Cadastrado · ID ${result.tinyProductId}${result.manufacturedSizes?.length ? ` · fabricado: ${result.manufacturedSizes.join(", ")}` : ""}`}
                          {result.status === "existing" && `Produto adicionado · ID ${result.tinyProductId}${result.addedSizes?.length ? ` · grade completada: ${result.addedSizes.join(", ")}` : ""}${result.manufacturedSizes?.length ? ` · convertido para fabricado: ${result.manufacturedSizes.join(", ")}` : ""}`}
                          {result.status === "failed" && (result.error || "Falhou")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Este deal não possui grades com quantidades positivas na Ficha do Pedido.</p>
            )}
          </CardContent>
        </Card>
      )}

      {preview && tinyContactReady && tinyContactId && tinyContactDraft && creationResults.length === preview.models.length && creationResults.every((result) => result.status !== "failed") && (
        <SalesOrderCard
          key={`${preview.deal.id}-${creationResults.map((result) => result.sku).join("-")}`}
          preview={preview}
          mappings={mappings}
          tinyContactId={tinyContactId}
          contact={tinyContactDraft}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cadastro no Tiny?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão preparados {preview?.models.length ?? 0} produto(s). Produtos novos copiarão toda a grade do cloner; produtos antigos incompletos poderão receber as numerações necessárias ao pedido. Esta ação cria dados reais no Tiny.{tinyContactId ? ` Cliente vinculado: Tiny ID ${tinyContactId}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-3 text-xs">
            {preview?.models.map((model) => {
              const mapping = mappings[productModelKey(model)];
              const variationCount = mapping?.mode === "clone"
                ? cloners.find((item) => String(item.id) === mapping.clonerId)?.variationCount ?? 0
                : Object.keys(mapping?.variationSkus ?? {}).length;
              return <p key={productModelKey(model)}>{productModelLabel(model)}: {mapping?.title} · {variationCount} variações no cadastro</p>;
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar e revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void createProducts()}>
              Confirmar cadastro real
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
