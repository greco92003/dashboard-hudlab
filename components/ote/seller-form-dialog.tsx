"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OTESeller } from "@/types/ote";
import { Loader2 } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface SellerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seller?: OTESeller;
  onSuccess: () => void;
}

export function SellerFormDialog({
  open,
  onOpenChange,
  seller,
  onSuccess,
}: SellerFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [formData, setFormData] = useState({
    user_id: seller?.user_id || "",
    seller_name: seller?.seller_name || "",
    salary_fixed: seller?.salary_fixed || 0,
    commission_percentage: seller?.commission_percentage || 2,
    active: seller?.active ?? true,
  });

  // Atualizar formData quando seller mudar
  useEffect(() => {
    if (seller) {
      setFormData({
        user_id: seller.user_id,
        seller_name: seller.seller_name,
        salary_fixed: seller.salary_fixed,
        commission_percentage: seller.commission_percentage,
        active: seller.active,
      });
    } else {
      // Reset form quando não houver seller (novo cadastro)
      setFormData({
        user_id: "",
        seller_name: "",
        salary_fixed: 0,
        commission_percentage: 2,
        active: true,
      });
    }
  }, [seller]);

  // Buscar usuários quando o diálogo abrir
  useEffect(() => {
    if (open && !seller) {
      fetchUsers();
    }

    // Limpar erro quando abrir/fechar
    if (!open) {
      setError(null);
    }
  }, [open, seller]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch("/api/users/list");

      console.log("Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Users data:", data);
        setUsers(data.users || []);
      } else {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        setError(errorData.error || "Erro ao carregar usuários");
      }
    } catch (err) {
      console.error("Erro ao buscar usuários:", err);
      setError("Erro ao carregar usuários");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = "/api/ote/sellers";
      const method = seller ? "PATCH" : "POST";

      // Se for edição, não enviar user_id (não pode ser alterado)
      let body;
      if (seller) {
        const { user_id, ...editableFields } = formData;
        body = { id: seller.id, ...editableFields };
      } else {
        body = formData;
      }

      console.log("Enviando dados:", { method, body });

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao salvar vendedor");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {seller ? "Editar Vendedor" : "Novo Vendedor"}
          </DialogTitle>
          <DialogDescription>
            {seller
              ? "Atualize as informações do vendedor"
              : "Cadastre um novo vendedor no sistema OTE"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* User Selection */}
            {!seller ? (
              <div className="grid gap-2">
                <Label htmlFor="user_id">
                  Usuário <span className="text-red-500">*</span>
                </Label>
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      Carregando usuários...
                    </span>
                  </div>
                ) : (
                  <Select
                    value={formData.user_id}
                    onValueChange={(value) => {
                      const selectedUser = users.find((u) => u.id === value);
                      setFormData({
                        ...formData,
                        user_id: value,
                        seller_name: selectedUser?.name || "",
                      });
                    }}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          Nenhum usuário encontrado
                        </div>
                      ) : (
                        users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione o usuário que será vinculado como vendedor
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Usuário</Label>
                <div className="text-sm text-muted-foreground">
                  Não é possível alterar o usuário após o cadastro
                </div>
              </div>
            )}

            {/* Seller Name */}
            <div className="grid gap-2">
              <Label htmlFor="seller_name">
                Nome do Vendedor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="seller_name"
                value={formData.seller_name}
                onChange={(e) =>
                  setFormData({ ...formData, seller_name: e.target.value })
                }
                placeholder="Ex: Schaiany, João, etc"
                required
              />
              <p className="text-xs text-muted-foreground">
                Nome conforme aparece no campo "vendedor" dos deals. Preenchido
                automaticamente com o nome do usuário, mas pode ser editado.
              </p>
            </div>

            {/* Salary Fixed */}
            <div className="grid gap-2">
              <Label htmlFor="salary_fixed">
                Salário Fixo (R$) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="salary_fixed"
                type="number"
                step="0.01"
                min="0"
                value={formData.salary_fixed}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    salary_fixed: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="1846.25"
                required
              />
            </div>

            {/* Commission Percentage */}
            <div className="grid gap-2">
              <Label htmlFor="commission_percentage">
                % de Comissão Base <span className="text-red-500">*</span>
              </Label>
              <Input
                id="commission_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.commission_percentage}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    commission_percentage: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="2.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Percentual da meta que vira comissão base
              </p>
            </div>

            {/* Active */}
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Vendedor Ativo</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, active: checked })
                }
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {seller ? "Atualizar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
