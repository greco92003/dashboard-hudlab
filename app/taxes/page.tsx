"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
// Removed unused import
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

// Define the tax type
interface Tax {
  id: string;
  name: string;
  percentage: number;
  created_at: string;
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

// Função para formatar valor percentual para exibição
const formatPercentageDisplay = (value: number): string => {
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

export default function TaxesPage() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [totalTax, setTotalTax] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [valuePerPair, setValuePerPair] = useState("");

  // State for editing
  const [editingTax, setEditingTax] = useState<Tax | null>(null);

  // Handle value change
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMoneyInputChange(valuePerPair, e.target.value, setValuePerPair);
  };

  // Load data from Supabase on initial render
  const fetchTaxes = async () => {
    try {
      const response = await fetch("/api/taxes");
      const result = await response.json();

      if (response.ok) {
        setTaxes(result.data);
      } else {
        console.error("Error fetching taxes:", result.error);
      }
    } catch (error) {
      console.error("Error fetching taxes:", error);
    }
  };

  useEffect(() => {
    fetchTaxes();
  }, []);

  // Calculate total tax percentage whenever taxes change
  useEffect(() => {
    const total = taxes.reduce((sum, item) => sum + item.percentage, 0);
    setTotalTax(total);
  }, [taxes]);

  // Define columns for the data table
  const columns: ColumnDef<Tax>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Nome do imposto
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
      accessorKey: "percentage",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Percentual
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
        const value = row.original.percentage;
        return `${formatPercentageDisplay(value)}%`;
      },
    },
    {
      id: "created_by",
      header: "Criado por",
      cell: ({ row }) => {
        const tax = row.original;
        return (
          <UserInfoPopover
            createdByUserId={tax.created_by_user_id}
            createdByName={tax.created_by_name}
            createdByEmail={tax.created_by_email}
            createdByAvatarUrl={tax.created_by_avatar_url}
            createdAt={tax.created_at}
          />
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const tax = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditTax(tax)}
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only">Editar</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive/90"
              onClick={() => handleDeleteTax(tax.id)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Excluir</span>
            </Button>
          </div>
        );
      },
    },
  ];

  // Add new tax
  const handleAddTax = async () => {
    if (!name || !valuePerPair) return;

    const numericValue = parseCurrencyValue(valuePerPair);

    try {
      const response = await fetch("/api/taxes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          percentage: numericValue,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the taxes list
        await fetchTaxes();

        // Reset form
        setName("");
        setValuePerPair("");
        setIsDialogOpen(false);
      } else {
        console.error("Error adding tax:", result.error);
        alert("Erro ao adicionar imposto: " + result.error);
      }
    } catch (error) {
      console.error("Error adding tax:", error);
      alert("Erro ao adicionar imposto");
    }
  };

  // Handle edit tax
  const handleEditTax = (tax: Tax) => {
    setEditingTax(tax);
    setName(tax.name);
    setValuePerPair(formatCurrencyDisplay(tax.percentage));
    setIsDialogOpen(true);
  };

  // Handle delete tax
  const handleDeleteTax = async (id: string) => {
    try {
      const response = await fetch(`/api/taxes?id=${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the taxes list
        await fetchTaxes();
      } else {
        console.error("Error deleting tax:", result.error);
        alert("Erro ao excluir imposto: " + result.error);
      }
    } catch (error) {
      console.error("Error deleting tax:", error);
      alert("Erro ao excluir imposto");
    }
  };

  // Save edited tax
  const handleSaveTax = async () => {
    if (!name || !valuePerPair) return;

    const numericValue = parseCurrencyValue(valuePerPair);

    try {
      if (editingTax) {
        // Update existing tax
        const response = await fetch("/api/taxes", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: editingTax.id,
            name,
            percentage: numericValue,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          // Refresh the taxes list
          await fetchTaxes();
        } else {
          console.error("Error updating tax:", result.error);
          alert("Erro ao atualizar imposto: " + result.error);
          return;
        }
      } else {
        // Add new tax (use the existing handleAddTax function)
        await handleAddTax();
        return;
      }

      // Reset form
      setName("");
      setValuePerPair("");
      setEditingTax(null);
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving tax:", error);
      alert("Erro ao salvar imposto");
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
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold">Impostos</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            Percentual Total de Impostos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl sm:text-3xl font-bold">
            {formatPercentageDisplay(totalTax)}%
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-lg sm:text-xl font-semibold">Lista de Impostos</h2>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Adicionar Imposto</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
          </DialogTrigger>
          <DialogContent onClick={handleDialogInteraction}>
            <DialogHeader>
              <DialogTitle>
                {editingTax ? "Editar Imposto" : "Adicionar Novo Imposto"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do imposto</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do imposto"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="valuePerPair">Percentual</Label>
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
              <Button onClick={handleSaveTax}>
                {editingTax ? "Salvar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={columns} data={taxes} />
    </div>
  );
}
