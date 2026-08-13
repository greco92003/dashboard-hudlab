import type { ErpGradeItem } from "./product-rules";
import type { ErpContactDraft } from "./contact-rules";
import type { ErpOrderSource } from "./order-rules";

export type ErpContact = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

export type ErpDeal = {
  id: string;
  name: string;
  status: string | null;
  monetaryValue: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ErpProductModel = {
  modelNumber: number;
  artUrl: string | null;
  grades: ErpGradeItem[];
  totalPairs: number;
};

export type ErpDealProductPreview = {
  deal: ErpDeal & { contactId: string | null };
  models: ErpProductModel[];
  order: ErpOrderSource;
};

export type TinyCloner = {
  id: number;
  sku: string;
  description: string;
  price: number | null;
  variationSizes: string[];
  variationCount: number;
};

export type TinyExistingProduct = {
  id: number;
  sku: string;
  description: string;
  variationSkus: Record<string, string>;
  variationSizes: string[];
};

export type ErpContactPreview = {
  draft: ErpContactDraft;
  existingTinyContact: {
    id: number;
    name: string;
    fantasy: string;
    document: string;
  } | null;
};
