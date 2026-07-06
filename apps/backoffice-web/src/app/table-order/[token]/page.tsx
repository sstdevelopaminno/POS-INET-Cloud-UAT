import { TableOrderMobile } from "@/components/table-order/table-order-mobile";

export default async function TableOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TableOrderMobile token={token} />;
}
