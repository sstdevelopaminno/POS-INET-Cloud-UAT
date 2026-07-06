"use client";

import { memo } from "react";
import { PosProductCard } from "@/components/pos-ui/pos-product-card";
import { PosProductGrid } from "@/components/pos-ui/pos-product-grid";

type ProductCatalogItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  is_active: boolean;
};

type Props = {
  products: ProductCatalogItem[];
  isDeliveryMode: boolean;
  storefrontPriceLabel: string;
  getProductPrice: (product: ProductCatalogItem) => number;
  onAddProduct: (product: ProductCatalogItem) => void;
};

function PosProductCatalogInner({ products, isDeliveryMode, storefrontPriceLabel, getProductPrice, onAddProduct }: Props) {
  return (
    <PosProductGrid>
      {products.map((product) => (
        <PosProductCard
          key={product.id}
          title={product.name}
          subtitle={product.sku && product.sku !== product.id ? product.sku : undefined}
          price={getProductPrice(product)}
          secondaryPrice={isDeliveryMode ? Number(product.price) : null}
          secondaryLabel={isDeliveryMode ? storefrontPriceLabel : undefined}
          onAdd={() => onAddProduct(product)}
        />
      ))}
    </PosProductGrid>
  );
}

export const PosProductCatalog = memo(PosProductCatalogInner);
