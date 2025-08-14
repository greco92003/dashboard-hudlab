"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Send,
  Users,
  User,
  Building2,
  Loader2,
  Bell,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/utils/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

interface NotificationManagerProps {
  className?: string;
}

interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  assigned_brand: string | null;
}

interface Brand {
  brand: string;
  product_count: number;
}

export function NotificationManager({ className }: NotificationManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "success" | "warning" | "error">(
    "info"
  );
  const [targetType, setTargetType] = useState<
    "role" | "user" | "brand_partners"
  >("role");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [sendPush, setSendPush] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const { isOwnerOrAdmin } = usePermissions();
  const supabase = createClient();

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, email, first_name, last_name, role, assigned_brand")
        .eq("approved", true)
        .order("first_name");

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Erro ao carregar usuários");
    }
  }, [supabase]);

  const loadBrands = useCallback(async () => {
    try {
      const response = await fetch("/api/brands");
      if (response.ok) {
        const data = await response.json();
        setBrands(data.brands || []);
      }
    } catch (error) {
      console.error("Error loading brands:", error);
      toast.error("Erro ao carregar marcas");
    }
  }, []);

  // Carregar usuários e marcas
  useEffect(() => {
    if (isOpen && isOwnerOrAdmin) {
      loadUsers();
      loadBrands();
    }
  }, [isOpen, isOwnerOrAdmin, loadUsers, loadBrands]);

  // Obter nome do usuário
  const getUserName = (user: User) => {
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    return name || user.email;
  };

  // Função de busca inteligente
  const smartSearch = (query: string, text: string): boolean => {
    if (!query.trim()) return true;

    const normalizeText = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/g, " ") // Remove caracteres especiais
        .replace(/\s+/g, " ") // Normaliza espaços
        .trim();

    const normalizedQuery = normalizeText(query);
    const normalizedText = normalizeText(text);

    // Busca exata
    if (normalizedText.includes(normalizedQuery)) return true;

    // Busca por palavras individuais
    const queryWords = normalizedQuery.split(" ");
    const textWords = normalizedText.split(" ");

    return queryWords.every((queryWord) =>
      textWords.some(
        (textWord) =>
          textWord.includes(queryWord) || queryWord.includes(textWord)
      )
    );
  };

  // Filtrar usuários baseado na busca
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return users;

    return users.filter((user) => {
      const searchableText = [
        getUserName(user),
        user.email,
        user.role,
        user.assigned_brand || "",
      ].join(" ");

      return smartSearch(userSearchQuery, searchableText);
    });
  }, [users, userSearchQuery]);

  // Resetar formulário
  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("info");
    setTargetType("role");
    setSelectedRoles([]);
    setSelectedUsers([]);
    setSelectedBrand("");
    setSendPush(true);
    setUserSearchQuery("");
  };

  // Enviar notificação
  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Título e mensagem são obrigatórios");
      return;
    }

    // Validar destinatários
    if (targetType === "role" && selectedRoles.length === 0) {
      toast.error("Selecione pelo menos um role");
      return;
    }

    if (targetType === "user" && selectedUsers.length === 0) {
      toast.error("Selecione pelo menos um usuário");
      return;
    }

    if (targetType === "brand_partners" && !selectedBrand) {
      toast.error("Selecione uma marca");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        title: title.trim(),
        message: message.trim(),
        type,
        target_type: targetType,
        target_roles: targetType === "role" ? selectedRoles : undefined,
        target_user_ids: targetType === "user" ? selectedUsers : undefined,
        target_brand:
          targetType === "brand_partners" ? selectedBrand : undefined,
        send_push: sendPush,
      };

      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao enviar notificação");
      }

      const result = await response.json();

      toast.success(
        `Notificação enviada para ${result.targetUsersCount} usuários`
      );
      resetForm();
      setIsOpen(false);
    } catch (error) {
      console.error("Error sending notification:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao enviar notificação"
      );
    } finally {
      setLoading(false);
    }
  };

  // Contar usuários por role
  const getUserCountByRole = (role: string) => {
    return users.filter((u) => u.role === role).length;
  };

  // Contar partners por marca
  const getPartnersCountByBrand = (brand: string) => {
    return users.filter(
      (u) => u.role === "partners-media" && u.assigned_brand === brand
    ).length;
  };

  const roles = [
    { value: "owner", label: "Owners", count: getUserCountByRole("owner") },
    { value: "admin", label: "Admins", count: getUserCountByRole("admin") },
    {
      value: "manager",
      label: "Managers",
      count: getUserCountByRole("manager"),
    },
    {
      value: "partners-media",
      label: "Partners Media",
      count: getUserCountByRole("partners-media"),
    },
    { value: "user", label: "Usuários", count: getUserCountByRole("user") },
  ];

  // Verificar permissões
  if (!isOwnerOrAdmin) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={className} title="Nova Notificação">
          <Plus className="h-4 w-4" />
          <Bell className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Criar Nova Notificação</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 flex-1 overflow-y-auto">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da notificação"
              maxLength={100}
            />
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem *</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Conteúdo da notificação"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Tipo */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select value={type} onValueChange={(value: any) => setType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Informação</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Destinatários */}
          <div className="space-y-2">
            <Label>Destinatários</Label>

            <Select
              value={targetType}
              onValueChange={(value: any) => setTargetType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="role">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Por Role
                  </div>
                </SelectItem>
                <SelectItem value="user">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Usuários Específicos
                  </div>
                </SelectItem>
                <SelectItem value="brand_partners">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Partners de Marca
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Seleção por Role */}
            {targetType === "role" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Selecionar Roles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {roles.map((role) => (
                    <div
                      key={role.value}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={role.value}
                        checked={selectedRoles.includes(role.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRoles([...selectedRoles, role.value]);
                          } else {
                            setSelectedRoles(
                              selectedRoles.filter((r) => r !== role.value)
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={role.value}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        {role.label}
                        <Badge variant="secondary">{role.count}</Badge>
                      </Label>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Seleção por Usuário */}
            {targetType === "user" && (
              <Card className="gap-1">
                <CardHeader className="pb-0 mb-0">
                  <CardTitle className="text-sm mb-2">
                    Selecionar Usuários
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Campo de busca */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar usuários por nome, email ou role..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-10 pr-10"
                    />
                    {userSearchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setUserSearchQuery("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {/* Lista de usuários com scroll */}
                  <div className="max-h-64 overflow-y-auto space-y-2 pb-4">
                    {filteredUsers.length === 0 ? (
                      <div className="text-center text-muted-foreground py-4">
                        {userSearchQuery
                          ? "Nenhum usuário encontrado"
                          : "Nenhum usuário disponível"}
                      </div>
                    ) : (
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={user.id}
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedUsers([...selectedUsers, user.id]);
                              } else {
                                setSelectedUsers(
                                  selectedUsers.filter((u) => u !== user.id)
                                );
                              }
                            }}
                          />
                          <Label
                            htmlFor={user.id}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            {getUserName(user)}
                            <Badge variant="outline">{user.role}</Badge>
                            {user.assigned_brand && (
                              <Badge variant="secondary">
                                {user.assigned_brand}
                              </Badge>
                            )}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Seleção por Marca */}
            {targetType === "brand_partners" && (
              <div>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.brand} value={brand.brand}>
                        <div className="flex items-center justify-between w-full">
                          <span>{brand.brand}</span>
                          <Badge variant="secondary" className="ml-2">
                            {getPartnersCountByBrand(brand.brand)} partners
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Configurações */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendPush"
                checked={sendPush}
                onCheckedChange={(checked) => setSendPush(!!checked)}
              />
              <Label htmlFor="sendPush">
                Enviar push notification (mobile)
              </Label>
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={handleSendNotification} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Notificação
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
