"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, Eye } from "lucide-react";
import { toast } from "sonner";

interface NuvemshopOrder {
  id: number;
  number: number;
  contact_email: string;
  contact_name: string;
  total: string;
  currency: string;
  status: string;
  payment_status: string;
  shipping_status: string;
  created_at: string;
  updated_at: string;
}

interface OrdersResponse {
  success: boolean;
  data: NuvemshopOrder[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
  };
}

export default function NuvemshopOrdersManager() {
  const [orders, setOrders] = useState<NuvemshopOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [filters, setFilters] = useState({
    status: "",
    payment_status: "",
    days: 30,
  });

  // Fetch orders from Nuvemshop
  const fetchOrders = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: "20",
        });

        // Add filters
        if (filters.status) params.append("status", filters.status);
        if (filters.payment_status)
          params.append("payment_status", filters.payment_status);

        // Add date filter for last N days
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - filters.days);
        params.append("created_at_min", daysAgo.toISOString());

        const response = await fetch(
          `/api/nuvemshop/orders?${params.toString()}`
        );
        const data: OrdersResponse = await response.json();

        if (data.success) {
          setOrders(data.data);
          setTotalOrders(data.pagination?.total || data.data.length);
          setCurrentPage(page);
        } else {
          toast.error("Erro ao buscar pedidos");
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
        toast.error("Erro ao buscar pedidos");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Sync orders to local database
  const syncOrders = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/nuvemshop/orders", {
        method: "POST",
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
          `${data.data.totalOrders} pedidos sincronizados com sucesso!`
        );
        // Refresh the orders list
        fetchOrders(currentPage);
      } else {
        toast.error("Erro ao sincronizar pedidos");
      }
    } catch (error) {
      console.error("Error syncing orders:", error);
      toast.error("Erro ao sincronizar pedidos");
    } finally {
      setSyncing(false);
    }
  };

  // View order details
  const viewOrder = async (orderId: number) => {
    try {
      const response = await fetch(`/api/nuvemshop/orders/${orderId}`);
      const data = await response.json();

      if (data.success) {
        // Open order details in a modal or new page
        console.log("Order details:", data.data);
        toast.success("Detalhes do pedido carregados");
      } else {
        toast.error("Erro ao carregar detalhes do pedido");
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
      toast.error("Erro ao carregar detalhes do pedido");
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "closed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "authorized":
        return "bg-blue-100 text-blue-800";
      case "refunded":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pedidos Nuvemshop</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => fetchOrders(currentPage)}
            disabled={loading}
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button onClick={syncOrders} disabled={syncing}>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="w-full p-2 border rounded-md"
              >
                <option value="">Todos</option>
                <option value="open">Aberto</option>
                <option value="closed">Fechado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Status do Pagamento
              </label>
              <select
                value={filters.payment_status}
                onChange={(e) =>
                  setFilters({ ...filters, payment_status: e.target.value })
                }
                className="w-full p-2 border rounded-md"
              >
                <option value="">Todos</option>
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
                <option value="authorized">Autorizado</option>
                <option value="refunded">Reembolsado</option>
              </select>
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

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos ({totalOrders})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum pedido encontrado
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">#{order.number}</span>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                        <Badge
                          className={getPaymentStatusColor(
                            order.payment_status
                          )}
                        >
                          {order.payment_status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>
                          <strong>Cliente:</strong> {order.contact_name} (
                          {order.contact_email})
                        </p>
                        <p>
                          <strong>Total:</strong> {order.currency} {order.total}
                        </p>
                        <p>
                          <strong>Criado em:</strong>{" "}
                          {new Date(order.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => viewOrder(order.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalOrders > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => fetchOrders(currentPage - 1)}
            disabled={currentPage === 1 || loading}
            variant="outline"
          >
            Anterior
          </Button>
          <span className="flex items-center px-4">Página {currentPage}</span>
          <Button
            onClick={() => fetchOrders(currentPage + 1)}
            disabled={orders.length < 20 || loading}
            variant="outline"
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
