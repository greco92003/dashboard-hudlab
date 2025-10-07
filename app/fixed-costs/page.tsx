"use client";

import { useState, useEffect, useCallback } from "react";
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
  Trash2,
  Edit,
} from "lucide-react";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { SyncChecker } from "@/components/ui/sync-checker";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserInfoPopover } from "@/components/user-info-popover";

// Define the fixed cost type
interface FixedCost {
  id: string;
  description: string;
  date: Date;
  value: number;
  recurrence: "none" | "monthly" | "annually";
  tag: string;
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

// Função para processar entrada do usuário em campo monetário
const handleMoneyInputChange = (
  _currentValue: string,
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

// Função para criar uma data local a partir de uma string YYYY-MM-DD sem problemas de timezone
const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // month é 0-indexed
};

export default function FixedCostsPage() {
  const [costs, setCosts] = useState<FixedCost[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    handleDateRangeChange,
    getApiUrl,
  } = useGlobalDateRange();

  const [editingCost, setEditingCost] = useState<FixedCost | null>(null);

  // Form state
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [value, setValue] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "monthly" | "annually">(
    "none"
  );
  const [tag, setTag] = useState("");
  const [isCustomTag, setIsCustomTag] = useState(false);
  const [customTag, setCustomTag] = useState("");

  // Handle value change
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMoneyInputChange(value, e.target.value, setValue);
  };

  // Handle tag change
  const handleTagChange = (value: string) => {
    if (value === "outro") {
      setIsCustomTag(true);
      setTag("");
    } else {
      setIsCustomTag(false);
      setCustomTag("");
      setTag(value);
    }
  };

  // Load data from Supabase on initial render
  const fetchFixedCosts = useCallback(async () => {
    try {
      // Use global date range for API filtering when available
      const apiUrl =
        useCustomPeriod && dateRange?.from && dateRange?.to
          ? getApiUrl("/api/fixed-costs")
          : "/api/fixed-costs";

      const response = await fetch(apiUrl);
      const result = await response.json();

      if (response.ok) {
        const parsedCosts = result.data.map((cost: { date: string }) => ({
          ...cost,
          date: parseLocalDate(cost.date),
        }));
        setCosts(parsedCosts);
      } else {
        console.error("Error fetching fixed costs:", result.error);
      }
    } catch (error) {
      console.error("Error fetching fixed costs:", error);
    }
  }, [useCustomPeriod, dateRange, getApiUrl]);

  useEffect(() => {
    fetchFixedCosts();
  }, [useCustomPeriod, dateRange, period, fetchFixedCosts]);

  // Define columns for the data table
  const columns: ColumnDef<FixedCost>[] = [
    {
      accessorKey: "description",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Descrição
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
      accessorKey: "date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Data
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
        const date = row.original.date;
        return date.toLocaleDateString("pt-BR");
      },
    },
    {
      accessorKey: "value",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Valor
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
        const value = row.original.value;
        return formatCurrency(value);
      },
    },
    {
      accessorKey: "recurrence",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Recorrência
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
        const recurrence = row.original.recurrence;
        return recurrence === "none"
          ? "-"
          : recurrence === "monthly"
          ? "Mensal"
          : "Anual";
      },
    },
    {
      accessorKey: "tag",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Tag
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
        const tag = row.original.tag;
        return <Badge variant="outline">{tag}</Badge>;
      },
    },
    {
      id: "created_by",
      header: "Criado por",
      size: 80,
      cell: ({ row }) => {
        const cost = row.original;
        return (
          <div className="flex justify-center">
            <UserInfoPopover
              createdByUserId={cost.created_by_user_id}
              createdByName={cost.created_by_name}
              createdByEmail={cost.created_by_email}
              createdByAvatarUrl={cost.created_by_avatar_url}
              createdAt={cost.created_at}
            />
          </div>
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
              onClick={() => handleStartEdit(cost)}
            >
              <Edit className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="text-destructive h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDelete(cost, "single")}>
                  Apagar apenas essa ocorrência
                </DropdownMenuItem>
                {(cost.recurrence === "monthly" ||
                  cost.recurrence === "annually") && (
                  <DropdownMenuItem
                    onClick={() => handleDelete(cost, "future")}
                  >
                    Apagar essa ocorrência e ocorrências futuras
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  // Filter costs based on date range
  const filterCostsByDateRange = useCallback(() => {
    if (!dateRange?.from || !dateRange?.to) return [];

    return costs.filter((cost) => {
      const costDate = cost.date; // A data já está corretamente parseada
      return costDate >= dateRange.from! && costDate <= dateRange.to!;
    });
  }, [costs, dateRange]);

  // Calculate total cost based on date range
  useEffect(() => {
    const filtered = filterCostsByDateRange();
    const total = filtered.reduce((sum, item) => sum + item.value, 0);
    setTotalCost(total);
  }, [costs, dateRange, filterCostsByDateRange]);

  // Add new fixed cost
  const handleAddCost = async () => {
    const finalTag = isCustomTag ? customTag : tag;
    if (!description || !date || !value || !finalTag) return;

    // Converte o valor formatado para número
    const numericValue = parseCurrencyValue(value);

    try {
      const response = await fetch("/api/fixed-costs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
          date: date.toISOString().split("T")[0], // Format as YYYY-MM-DD
          value: numericValue,
          recurrence,
          tag: finalTag,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the costs list
        await fetchFixedCosts();

        // Reset form
        setDescription("");
        setDate(new Date());
        setValue("");
        setRecurrence("none");
        setTag("");
        setIsCustomTag(false);
        setCustomTag("");
        setIsDialogOpen(false);
      } else {
        console.error("Error adding fixed cost:", result.error);
        alert("Erro ao adicionar custo fixo: " + result.error);
      }
    } catch (error) {
      console.error("Error adding fixed cost:", error);
      alert("Erro ao adicionar custo fixo");
    }
  };

  // Delete cost
  const handleDelete = async (
    costToDelete: FixedCost,
    mode: "single" | "future"
  ) => {
    try {
      const params = new URLSearchParams({
        id: costToDelete.id,
        mode,
      });

      if (mode === "future") {
        params.append("description", costToDelete.description);
        params.append("recurrence", costToDelete.recurrence);
        params.append("tag", costToDelete.tag);
        params.append("date", costToDelete.date.toISOString().split("T")[0]);
      }

      const response = await fetch(`/api/fixed-costs?${params.toString()}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the costs list
        await fetchFixedCosts();
      } else {
        console.error("Error deleting fixed cost:", result.error);
        alert("Erro ao deletar custo fixo: " + result.error);
      }
    } catch (error) {
      console.error("Error deleting fixed cost:", error);
      alert("Erro ao deletar custo fixo");
    }
  };

  // Start editing a cost
  const handleStartEdit = (cost: FixedCost) => {
    setEditingCost(cost);
    setDescription(cost.description);
    setDate(cost.date); // A data já está corretamente parseada
    setValue(formatCurrencyDisplay(cost.value)); // Formata o valor ao editar
    setRecurrence(cost.recurrence);

    // Check if the tag is one of the predefined options
    const predefinedTags = [
      "marketing",
      "logística",
      "insumos",
      "escritório",
      "comida",
      "hospedagem",
      "viagem",
      "colaboradores",
    ];
    if (predefinedTags.includes(cost.tag)) {
      setTag(cost.tag);
      setIsCustomTag(false);
      setCustomTag("");
    } else {
      setTag("");
      setIsCustomTag(true);
      setCustomTag(cost.tag);
    }

    setIsEditDialogOpen(true);
  };

  // Save edited cost - agora só para itens sem recorrência
  const handleSaveEdit = async () => {
    const finalTag = isCustomTag ? customTag : tag;
    if (!editingCost || !description || !date || !value || !finalTag) return;

    // Se não tem recorrência, editar diretamente
    await performEdit("single");
  };

  // Função para executar a edição baseada no modo selecionado
  const performEdit = async (mode: "single" | "all") => {
    const finalTag = isCustomTag ? customTag : tag;
    if (!editingCost || !description || !date || !value || !finalTag) return;

    // Converte o valor formatado para número
    const numericValue = parseCurrencyValue(value);

    try {
      const response = await fetch("/api/fixed-costs", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingCost.id,
          description,
          date: date.toISOString().split("T")[0], // Format as YYYY-MM-DD
          value: numericValue,
          recurrence,
          tag: finalTag,
          editMode: mode, // Adicionar o modo de edição
          originalDescription: editingCost.description,
          originalRecurrence: editingCost.recurrence,
          originalTag: editingCost.tag,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the costs list
        await fetchFixedCosts();

        // Reset form
        setEditingCost(null);
        setDescription("");
        setDate(new Date());
        setValue("");
        setRecurrence("none");
        setTag("");
        setIsCustomTag(false);
        setCustomTag("");
        setIsEditDialogOpen(false);
      } else {
        console.error("Error updating fixed cost:", result.error);
        alert("Erro ao atualizar custo fixo: " + result.error);
      }
    } catch (error) {
      console.error("Error updating fixed cost:", error);
      alert("Erro ao atualizar custo fixo");
    }
  };

  // Adicione esta função para lidar com cliques no dialog
  const handleDialogInteraction = (
    e: React.MouseEvent | React.KeyboardEvent
  ) => {
    // Impede que o evento se propague para o Dialog
    e.stopPropagation();
  };

  // Functions for closing dialogs (currently unused but kept for future use)
  // const handleCloseDialog = () => {
  //   setIsDialogOpen(false);
  //   // Resetar os estados do formulário quando o dialog for fechado
  //   setDescription("");
  //   setDate(new Date());
  //   setValue("");
  //   setRecurrence("none");
  //   setTag("");
  // };

  // const handleCloseEditDialog = () => {
  //   setIsEditDialogOpen(false);
  //   setEditingCost(null);
  //   // Resetar os estados do formulário quando o dialog for fechado
  //   setDescription("");
  //   setDate(new Date());
  //   setValue("");
  //   setRecurrence("none");
  //   setTag("");
  // };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl sm:text-2xl font-bold">Custos Fixos</h1>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <Card className="w-full sm:w-1/2">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Custos Fixos Totais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold">
              {formatCurrency(totalCost)}
            </p>
          </CardContent>
        </Card>

        <Card className="w-full sm:w-1/2">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Período</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar23 value={dateRange} onChange={handleDateRangeChange} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-lg sm:text-xl font-semibold">
          Lista de Custos Fixos
        </h2>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Adicionar Custo Fixo</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
          </DialogTrigger>
          <DialogContent onClick={handleDialogInteraction}>
            <DialogHeader>
              <DialogTitle>Adicionar Novo Custo Fixo</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição do custo fixo"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={date.toISOString().split("T")[0]}
                  onChange={(e) => setDate(parseLocalDate(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="value">Valor</Label>
                <Input
                  id="value"
                  value={value}
                  onChange={handleValueChange}
                  placeholder="0,00"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="recurrence">Valor se repete?</Label>
                <Select
                  value={recurrence}
                  onValueChange={(value: "none" | "monthly" | "annually") =>
                    setRecurrence(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a recorrência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não se repete</SelectItem>
                    <SelectItem value="monthly">Mensalmente</SelectItem>
                    <SelectItem value="annually">Anualmente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tag">Tag</Label>
                <Select
                  value={isCustomTag ? "outro" : tag}
                  onValueChange={handleTagChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="logística">Logística</SelectItem>
                    <SelectItem value="insumos">Insumos</SelectItem>
                    <SelectItem value="escritório">Escritório</SelectItem>
                    <SelectItem value="comida">Comida</SelectItem>
                    <SelectItem value="hospedagem">Hospedagem</SelectItem>
                    <SelectItem value="viagem">Viagem</SelectItem>
                    <SelectItem value="colaboradores">Colaboradores</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                {isCustomTag && (
                  <Input
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Digite uma tag personalizada"
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleAddCost}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={columns} data={filterCostsByDateRange()} />

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent onClick={handleDialogInteraction}>
          <DialogHeader>
            <DialogTitle>Editar Custo Fixo</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição do custo fixo"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-date">Data</Label>
              <Input
                id="edit-date"
                type="date"
                value={date.toISOString().split("T")[0]}
                onChange={(e) => setDate(parseLocalDate(e.target.value))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-value">Valor</Label>
              <Input
                id="edit-value"
                value={value}
                onChange={handleValueChange}
                placeholder="0,00"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-recurrence">Valor se repete?</Label>
              <Select
                value={recurrence}
                onValueChange={(value: "none" | "monthly" | "annually") =>
                  setRecurrence(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a recorrência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não se repete</SelectItem>
                  <SelectItem value="monthly">Mensalmente</SelectItem>
                  <SelectItem value="annually">Anualmente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-tag">Tag</Label>
              <Select
                value={isCustomTag ? "outro" : tag}
                onValueChange={handleTagChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="logística">Logística</SelectItem>
                  <SelectItem value="insumos">Insumos</SelectItem>
                  <SelectItem value="escritório">Escritório</SelectItem>
                  <SelectItem value="comida">Comida</SelectItem>
                  <SelectItem value="hospedagem">Hospedagem</SelectItem>
                  <SelectItem value="viagem">Viagem</SelectItem>
                  <SelectItem value="colaboradores">Colaboradores</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              {isCustomTag && (
                <Input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="Digite uma tag personalizada"
                  className="mt-2"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            {editingCost &&
            (editingCost.recurrence === "monthly" ||
              editingCost.recurrence === "annually") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>Salvar</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => performEdit("single")}>
                    Alterar apenas esta ocorrência
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => performEdit("all")}>
                    Alterar todas as ocorrências
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleSaveEdit}>Salvar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
