"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { RewardsManager } from "./rewards-manager";

interface Reward {
  id: string;
  description: string;
}

interface Goal {
  id?: string;
  title: string;
  description: string;
  created_date?: string;
  start_date: string;
  end_date: string;
  general_goal_value: number | null;
  individual_goal_value: number | null;
  goal_type: "total_sales" | "pairs_sold";
  target_type: "sellers" | "designers";
  status?: "active" | "archived";
  rewards: Reward[];
}

interface GoalFormProps {
  goal?: Goal;
  targetType: "sellers" | "designers";
  onSubmit: (goalData: Partial<Goal>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// Função para formatar valor monetário para exibição
const formatCurrencyDisplay = (value: number): string => {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function GoalForm({
  goal,
  targetType,
  onSubmit,
  onCancel,
  isLoading = false,
}: GoalFormProps) {
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const [startDate, setStartDate] = useState<Date | undefined>(
    goal?.start_date ? new Date(goal.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    goal?.end_date ? new Date(goal.end_date) : undefined
  );
  const [goalType, setGoalType] = useState<"total_sales" | "pairs_sold">(
    goal?.goal_type || "total_sales"
  );
  const [hasGeneralGoal, setHasGeneralGoal] = useState(
    !!goal?.general_goal_value
  );
  const [hasIndividualGoal, setHasIndividualGoal] = useState(
    !!goal?.individual_goal_value
  );
  const [generalGoalValue, setGeneralGoalValue] = useState(
    goal?.general_goal_value
      ? formatCurrencyDisplay(goal.general_goal_value)
      : ""
  );
  const [individualGoalValue, setIndividualGoalValue] = useState(
    goal?.individual_goal_value
      ? formatCurrencyDisplay(goal.individual_goal_value)
      : ""
  );
  const [rewards, setRewards] = useState<Reward[]>(
    goal?.rewards || [{ id: Date.now().toString(), description: "" }]
  );

  // Update form fields when goal changes (for edit mode)
  useEffect(() => {
    if (goal) {
      setTitle(goal.title || "");
      setDescription(goal.description || "");
      setStartDate(goal.start_date ? new Date(goal.start_date) : undefined);
      setEndDate(goal.end_date ? new Date(goal.end_date) : undefined);
      setGoalType(goal.goal_type || "total_sales");
      setHasGeneralGoal(!!goal.general_goal_value);
      setHasIndividualGoal(!!goal.individual_goal_value);
      setGeneralGoalValue(
        goal.general_goal_value
          ? formatCurrencyDisplay(goal.general_goal_value)
          : ""
      );
      setIndividualGoalValue(
        goal.individual_goal_value
          ? formatCurrencyDisplay(goal.individual_goal_value)
          : ""
      );
      if (goal.rewards) {
        setRewards(goal.rewards);
      }
    }
  }, [goal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !description || !startDate || !endDate) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    // Validar se a data de início é anterior à data de finalização
    if (startDate >= endDate) {
      alert("A data de início deve ser anterior à data de finalização.");
      return;
    }

    if (!hasGeneralGoal && !hasIndividualGoal) {
      alert("Selecione pelo menos um tipo de meta (geral ou individual).");
      return;
    }

    // Validar premiações - filtrar apenas as que têm descrição
    const validRewards = rewards.filter((reward) => reward.description.trim());
    if (validRewards.length === 0) {
      alert("Por favor, adicione pelo menos uma premiação válida.");
      return;
    }

    const goalData: Partial<Goal> = {
      title,
      description,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      goal_type: goalType,
      target_type: targetType,
      general_goal_value: hasGeneralGoal
        ? goalType === "total_sales"
          ? parseCurrencyValue(generalGoalValue) || null
          : parseFloat(generalGoalValue) || null
        : null,
      individual_goal_value: hasIndividualGoal
        ? goalType === "total_sales"
          ? parseCurrencyValue(individualGoalValue) || null
          : parseFloat(individualGoalValue) || null
        : null,
      rewards: validRewards,
    };

    if (goal?.id) {
      goalData.id = goal.id;
    }

    await onSubmit(goalData);
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

  // Handler para tecla Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="title">Título da Meta *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Meta de vendas Q3 2024"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição da Meta *</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva os objetivos e detalhes da meta..."
          required
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Data de Início *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate
                ? format(startDate, "dd/MM/yyyy", { locale: ptBR })
                : "Selecione a data de início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Data de Finalização *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate
                ? format(endDate, "dd/MM/yyyy", { locale: ptBR })
                : "Selecione a data de finalização"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              disabled={(date) =>
                startDate ? date <= startDate : date < new Date()
              }
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Tipo de Meta *</Label>
        <Select
          value={goalType}
          onValueChange={(value: "total_sales" | "pairs_sold") =>
            setGoalType(value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total_sales">Total Vendido (R$)</SelectItem>
            <SelectItem value="pairs_sold">Pares Vendidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="general-goal"
            checked={hasGeneralGoal}
            onCheckedChange={(checked) => setHasGeneralGoal(checked as boolean)}
          />
          <Label htmlFor="general-goal">Meta Geral</Label>
        </div>

        {hasGeneralGoal && (
          <div className="space-y-2">
            <Label htmlFor="general-value">
              Valor da Meta Geral{" "}
              {goalType === "total_sales" ? "(R$)" : "(Pares)"}
            </Label>
            <Input
              id="general-value"
              value={generalGoalValue}
              onChange={(e) => {
                if (goalType === "total_sales") {
                  handleMoneyInputChange(
                    generalGoalValue,
                    e.target.value,
                    setGeneralGoalValue
                  );
                } else {
                  setGeneralGoalValue(e.target.value.replace(/\D/g, ""));
                }
              }}
              placeholder={goalType === "total_sales" ? "100.000,00" : "1000"}
            />
          </div>
        )}

        <div className="flex items-center space-x-2">
          <Checkbox
            id="individual-goal"
            checked={hasIndividualGoal}
            onCheckedChange={(checked) =>
              setHasIndividualGoal(checked as boolean)
            }
          />
          <Label htmlFor="individual-goal">
            Meta por {targetType === "sellers" ? "Vendedor" : "Designer"}
          </Label>
        </div>

        {hasIndividualGoal && (
          <div className="space-y-2">
            <Label htmlFor="individual-value">
              Valor da Meta por{" "}
              {targetType === "sellers" ? "Vendedor" : "Designer"}{" "}
              {goalType === "total_sales" ? "(R$)" : "(Pares)"}
            </Label>
            <Input
              id="individual-value"
              value={individualGoalValue}
              onChange={(e) => {
                if (goalType === "total_sales") {
                  handleMoneyInputChange(
                    individualGoalValue,
                    e.target.value,
                    setIndividualGoalValue
                  );
                } else {
                  setIndividualGoalValue(e.target.value.replace(/\D/g, ""));
                }
              }}
              placeholder={goalType === "total_sales" ? "20.000,00" : "200"}
            />
          </div>
        )}
      </div>

      <RewardsManager
        rewards={rewards}
        onChange={setRewards}
        disabled={isLoading}
      />

      <div className="flex flex-col gap-2 pt-4">
        <div className="text-xs text-muted-foreground text-center">
          Pressione Ctrl+Enter para salvar rapidamente
        </div>
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Salvando..." : goal?.id ? "Atualizar" : "Criar"} Meta
          </Button>
        </div>
      </div>
    </form>
  );
}
