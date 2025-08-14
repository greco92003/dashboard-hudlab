import { useState, useEffect } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";

interface UseBrandFilterReturn {
  // Current user's assigned brand (null if not partners-media or no brand assigned)
  assignedBrand: string | null;

  // Whether the current user is partners-media with an assigned brand
  isPartnersMediaWithBrand: boolean;

  // Whether the current user should see filtered data
  shouldFilterByBrand: boolean;

  // Function to check if user can access a specific brand
  canAccessBrand: (brand: string | null) => boolean;

  // Function to filter products array by user's brand access
  filterProducts: <T extends { brand?: string | null }>(products: T[]) => T[];

  // Function to filter orders by checking if any product in the order matches user's brand
  filterOrdersByBrand: <T extends { products?: any }>(orders: T[]) => T[];

  // Loading state
  loading: boolean;
}

export function useBrandFilter(): UseBrandFilterReturn {
  const {
    profile,
    loading: profileLoading,
    isPartnersMedia,
  } = useUserProfile();
  const [loading, setLoading] = useState(true);

  const assignedBrand = profile?.assigned_brand || null;
  const isPartnersMediaWithBrand = isPartnersMedia && !!assignedBrand;

  // Partners-media users with assigned brand should see filtered data
  // All other users (admin, owner, manager, user, partners-media without brand) see all data
  const shouldFilterByBrand = isPartnersMediaWithBrand;

  useEffect(() => {
    if (!profileLoading) {
      setLoading(false);
    }
  }, [profileLoading]);

  const canAccessBrand = (brand: string | null): boolean => {
    // If user doesn't need filtering, they can access all brands
    if (!shouldFilterByBrand) {
      return true;
    }

    // If user needs filtering, they can only access their assigned brand
    return brand === assignedBrand;
  };

  const filterProducts = <T extends { brand?: string | null }>(
    products: T[]
  ): T[] => {
    if (!shouldFilterByBrand) {
      return products;
    }

    return products.filter((product) => canAccessBrand(product.brand ?? null));
  };

  const filterOrdersByBrand = <T extends { products?: any }>(
    orders: T[]
  ): T[] => {
    if (!shouldFilterByBrand) {
      return orders;
    }

    return orders.filter((order) => {
      // If order has no products, exclude it
      if (!order.products || !Array.isArray(order.products)) {
        return false;
      }

      // Check if any product in the order matches the user's assigned brand
      return order.products.some((product: any) => {
        // Handle different product structures
        const productBrand = product.brand || product.product_brand || null;
        return canAccessBrand(productBrand);
      });
    });
  };

  return {
    assignedBrand,
    isPartnersMediaWithBrand,
    shouldFilterByBrand,
    canAccessBrand,
    filterProducts,
    filterOrdersByBrand,
    loading,
  };
}

// Utility function to extract brand from product in order
export function extractBrandFromOrderProduct(product: any): string | null {
  // Try different possible brand field names
  return (
    product.brand ||
    product.product_brand ||
    product.brand_name ||
    product.productBrand ||
    null
  );
}

// Utility function to check if an order contains products from a specific brand
export function orderContainsBrand(order: any, targetBrand: string): boolean {
  if (!order.products || !Array.isArray(order.products)) {
    return false;
  }

  return order.products.some((product: any) => {
    const productBrand = extractBrandFromOrderProduct(product);
    return productBrand === targetBrand;
  });
}
