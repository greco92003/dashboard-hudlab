"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { formatCurrency } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Edit,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserInfoPopover } from "@/components/user-info-popover";

// Define the direct cost type
interface DirectCost {
  id: string;
  name: string;
  value_per_pair: number;
  created_at: string;
  updated_at?: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_by_avatar_url: string | null;
}

// Função para formatar valor monetário para exibição
const formatCurrencyDisplay = (value: number): string => {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Função para processar entrada do usuário em campo monetário
const handleMoneyInputChange = (
  currentValue: string,
  newInput: string,
  setValue: (value: string) => void
) => {
  // Remove tudo que não for dígito
  const digitsOnly = newInput.replace(/\D/g, "");

  if (digitsOnly === "") {
    setValue("");
    return;
  }

  // Converte para número (em centavos)
  const cents = parseInt(digitsOnly);

  // Formata o valor: divide por 100 para obter reais e centavos
  const formattedValue = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  setValue(formattedValue);
  return cents / 100; // Retorna o valor numérico para uso se necessário
};

// Função para converter string formatada para número
const parseCurrencyValue = (formattedValue: string): number => {
  // Remove todos os caracteres não numéricos, exceto vírgula e ponto
  const cleanValue = formattedValue.replace(/[^\d,\.]/g, "");
  // Substitui vírgula por ponto para conversão correta
  const numericString = cleanValue.replace(/\./g, "").replace(",", ".");
  return parseFloat(numericString) || 0;
};

export default function DirectCostsPage() {
  const [costs, setCosts] = useState<DirectCost[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [valuePerPair, setValuePerPair] = useState("");

  // State for editing
  const [editingCost, setEditingCost] = useState<DirectCost | null>(null);

  // Handle value change
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMoneyInputChange(valuePerPair, e.target.value, setValuePerPair);
  };

  // Load data from Supabase on initial render
  const fetchDirectCosts = async () => {
    try {
      const response = await fetch("/api/direct-costs");
      const result = await response.json();

      if (response.ok) {
        setCosts(result.data);
      } else {
        console.error("Error fetching direct costs:", result.error);
      }
    } catch (error) {
      console.error("Error fetching direct costs:", error);
    }
  };

  useEffect(() => {
    fetchDirectCosts();
  }, []);

  // Calculate total cost whenever costs change
  useEffect(() => {
    const total = costs.reduce((sum, item) => sum + item.value_per_pair, 0);
    setTotalCost(total);
  }, [costs]);

  // Define columns for the data table
  const columns: ColumnDef<DirectCost>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Nome do custo
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
    },
    {
      accessorKey: "value_per_pair",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Valor por par
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const value = row.original.value_per_pair;
        return formatCurrency(value);
      },
    },
    {
      id: "created_by",
      header: "Criado por",
      cell: ({ row }) => {
        const cost = row.original;
        return (
          <UserInfoPopover
            createdByUserId={cost.created_by_user_id}
            createdByName={cost.created_by_name}
            createdByEmail={cost.created_by_email}
            createdByAvatarUrl={cost.created_by_avatar_url}
            createdAt={cost.created_at}
          />
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const cost = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditCost(cost)}
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only">Editar</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive/90"
              onClick={() => handleDeleteCost(cost.id)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Excluir</span>
            </Button>
          </div>
        );
      },
    },
  ];

  // Add new direct cost
  const handleAddCost = async () => {
    if (!name || !valuePerPair) return;

    const numericValue = parseCurrencyValue(valuePerPair);

    try {
      const response = await fetch("/api/direct-costs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          value_per_pair: numericValue,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the costs list
        await fetchDirectCosts();

        // Reset form
        setName("");
        setValuePerPair("");
        setIsDialogOpen(false);
      } else {
        console.error("Error adding direct cost:", result.error);
        alert("Erro ao adicionar custo direto: " + result.error);
      }
    } catch (error) {
      console.error("Error adding direct cost:", error);
      alert("Erro ao adicionar custo direto");
    }
  };

  // Handle edit cost
  const handleEditCost = (cost: DirectCost) => {
    setEditingCost(cost);
    setName(cost.name);
    setValuePerPair(formatCurrencyDisplay(cost.value_per_pair));
    setIsDialogOpen(true);
  };

  // Handle delete cost
  const handleDeleteCost = async (id: string) => {
    try {
      const response = await fetch(`/api/direct-costs?id=${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the costs list
        await fetchDirectCosts();
      } else {
        console.error("Error deleting direct cost:", result.error);
        alert("Erro ao excluir custo direto: " + result.error);
      }
    } catch (error) {
      console.error("Error deleting direct cost:", error);
      alert("Erro ao excluir custo direto");
    }
  };

  // Save edited cost
  const handleSaveCost = async () => {
    if (!name || !valuePerPair) return;

    const numericValue = parseCurrencyValue(valuePerPair);

    if (editingCost) {
      // Update existing cost
      try {
        const response = await fetch("/api/direct-costs", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: editingCost.id,
            name,
            value_per_pair: numericValue,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          // Refresh the costs list
          await fetchDirectCosts();

          // Reset form
          setName("");
          setValuePerPair("");
          setEditingCost(null);
          setIsDialogOpen(false);
        } else {
          console.error("Error updating direct cost:", result.error);
          alert("Erro ao atualizar custo direto: " + result.error);
        }
      } catch (error) {
        console.error("Error updating direct cost:", error);
        alert("Erro ao atualizar custo direto");
      }
    } else {
      // Add new cost (use handleAddCost)
      await handleAddCost();
    }
  };

  // Adicione uma função para lidar com cliques no dialog
  const handleDialogInteraction = (
    e: React.MouseEvent | React.KeyboardEvent
  ) => {
    // Impede que o evento se propague para o Dialog
    e.stopPropagation();
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold">Custos Diretos</h1>

      <Card className="mb-6 mt-4">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            Custo Total por Par
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl sm:text-3xl font-bold">
            {formatCurrency(totalCost)}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h2 className="text-lg sm:text-xl font-semibold">
          Lista de Custos Diretos
        </h2>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Adicionar Custo Direto</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
          </DialogTrigger>
          <DialogContent onClick={handleDialogInteraction}>
            <DialogHeader>
              <DialogTitle>
                {editingCost
                  ? "Editar Custo Direto"
                  : "Adicionar Novo Custo Direto"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do custo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do custo direto"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="valuePerPair">Valor por par</Label>
                <Input
                  id="valuePerPair"
                  type="text"
                  value={valuePerPair}
                  onChange={handleValueChange}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleSaveCost}>
                {editingCost ? "Salvar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={columns} data={costs} />
    </div>
  );
}
