"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Users,
  Trash2,
  Shield,
  Tag,
} from "lucide-react";
import type { Database } from "@/types/supabase";
import { usePermissions } from "@/hooks/usePermissions";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];

interface UserManagementProps {
  isAdmin: boolean;
}

interface Brand {
  brand: string;
  product_count: number;
}

export function UserManagement({}: UserManagementProps) {
  const permissions = usePermissions();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Brand assignment states
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedBrand, setSelectedBrand] =
    useState<string>("__remove_brand__");
  const [previousRole, setPreviousRole] = useState<string | null>(null);

  const supabase = createClient();

  const fetchUsers = useCallback(async () => {
    if (!permissions.isOwnerOrAdmin) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setUsers(data || []);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao carregar usuários: ${errorMessage}`,
      });
    } finally {
      setLoading(false);
    }
  }, [permissions.isOwnerOrAdmin, supabase]);

  const fetchBrands = useCallback(async () => {
    if (!permissions.isOwnerOrAdmin) return;

    try {
      setBrandsLoading(true);

      // Fetch brands directly from nuvemshop_products table
      const { data, error } = await supabase.rpc("get_available_brands");

      if (error) {
        throw new Error(`Erro ao carregar marcas: ${error.message}`);
      }

      setBrands(data || []);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao carregar marcas: ${errorMessage}`,
      });
    } finally {
      setBrandsLoading(false);
    }
  }, [permissions.isOwnerOrAdmin, supabase]);

  const updateUserRole = async (
    userId: string,
    newRole: "owner" | "admin" | "user" | "manager" | "partners-media"
  ) => {
    setActionLoading(userId);
    setMessage(null);

    try {
      // Special handling for partners-media role due to brand constraint
      if (newRole === "partners-media") {
        // Store the previous role for potential rollback
        const currentUser = users.find((u) => u.id === userId);
        if (currentUser) {
          setPreviousRole(currentUser.role);
        }

        // First, get a default brand to assign temporarily
        const { data: brands } = await supabase
          .from("nuvemshop_products")
          .select("brand")
          .not("brand", "is", null)
          .limit(1);

        const defaultBrand = brands?.[0]?.brand || "Desculpa Qualquer Coisa";

        // Update both role and assign temporary brand in one operation
        const { error } = await supabase
          .from("user_profiles")
          .update({
            role: newRole,
            assigned_brand: defaultBrand,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) throw error;
      } else {
        // For other roles, normal update
        const { error } = await supabase
          .from("user_profiles")
          .update({
            role: newRole,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) throw error;
      }

      setMessage({
        type: "success",
        text:
          newRole === "partners-media"
            ? `Role atualizada para ${newRole}. Selecione a marca definitiva no dialog que será aberto.`
            : `Role do usuário atualizada para ${newRole}`,
      });

      await fetchUsers();

      // If changing to partners-media, automatically open brand selection dialog
      if (newRole === "partners-media") {
        // Get the current user data before the role change to create the updated user object
        const currentUser = users.find((u) => u.id === userId);
        if (currentUser) {
          // Create user object with updated role for the dialog
          const userWithNewRole = { ...currentUser, role: newRole as any };

          // Small delay to ensure UI state is updated
          setTimeout(() => {
            openBrandDialog(userWithNewRole, true); // true indicates this is a new partners-media assignment
          }, 200);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao atualizar role: ${errorMessage}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const updateUserBrand = async (userId: string, brand: string | null) => {
    setActionLoading(userId);
    setMessage(null);

    try {
      // Check if trying to remove brand from a partners-media user
      const user = users.find((u) => u.id === userId);
      if (!brand && user?.role === "partners-media") {
        setMessage({
          type: "error",
          text: "Usuários partners-media devem sempre ter uma marca atribuída. Não é possível remover a marca.",
        });
        setActionLoading(null);
        return;
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({
          assigned_brand: brand,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      setMessage({
        type: "success",
        text: brand
          ? `Marca "${brand}" atribuída ao usuário com sucesso`
          : "Marca removida do usuário com sucesso",
      });
      await fetchUsers();
      setBrandDialogOpen(false);
      setSelectedUser(null);
      setSelectedBrand("__remove_brand__");
      setPreviousRole(null); // Clear previous role after successful save
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao atualizar marca: ${errorMessage}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const revertUserRole = async (userId: string, originalRole: string) => {
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          role: originalRole,
          assigned_brand: null, // Remove the temporary brand
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      setMessage({
        type: "success",
        text: `Role revertida para ${originalRole}`,
      });
      await fetchUsers();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao reverter role: ${errorMessage}`,
      });
    }
  };

  const handleBrandDialogCancel = async () => {
    // If we have a previous role stored, it means we just changed to partners-media
    // and need to revert the change
    if (previousRole && selectedUser) {
      await revertUserRole(selectedUser.id, previousRole);
    }

    // Close dialog and reset states
    setBrandDialogOpen(false);
    setSelectedUser(null);
    setSelectedBrand("__remove_brand__");
    setPreviousRole(null);
  };

  const openBrandDialog = (user: UserProfile, isNewPartnersMedia = false) => {
    setSelectedUser(user);
    // For partners-media users, don't default to "__remove_brand__" if they don't have a brand
    if (user.role === "partners-media") {
      setSelectedBrand(user.assigned_brand || "");
    } else {
      setSelectedBrand(user.assigned_brand || "__remove_brand__");
    }

    // Only keep previousRole if this is a new partners-media assignment
    if (!isNewPartnersMedia) {
      setPreviousRole(null);
    }

    setBrandDialogOpen(true);
    if (brands.length === 0) {
      fetchBrands();
    }
  };

  const updateUserApproval = async (userId: string, approved: boolean) => {
    setActionLoading(userId);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          approved,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select();

      if (error) throw error;

      // Update the local state immediately
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId
            ? { ...user, approved, updated_at: new Date().toISOString() }
            : user
        )
      );

      setMessage({
        type: "success",
        text: `Usuário ${approved ? "aprovado" : "desaprovado"} com sucesso`,
      });

      // Refresh the users list to ensure consistency
      await fetchUsers();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao ${
          approved ? "aprovar" : "desaprovar"
        } usuário: ${errorMessage}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    setActionLoading(userId);
    setMessage(null);

    try {
      // Call the API to delete the user from both auth.users and user_profiles
      const response = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Erro ao deletar usuário");
      }

      setMessage({
        type: "success",
        text: `Usuário ${userEmail} removido com sucesso`,
      });
      await fetchUsers();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao deletar usuário: ${errorMessage}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (!permissions.isOwnerOrAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Você não tem permissão para acessar esta seção.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <Alert
          variant={
            message.type === "error"
              ? "destructive"
              : message.type === "success"
              ? "success"
              : "default"
          }
        >
          {message.type === "success" && <CheckCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gerenciamento de Usuários
          </CardTitle>
          <CardDescription>
            Gerencie roles e permissões dos usuários do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      {user.first_name || user.last_name
                        ? `${user.first_name || ""} ${
                            user.last_name || ""
                          }`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === "owner"
                            ? "default"
                            : user.role === "admin"
                            ? "destructive"
                            : user.role === "manager"
                            ? "secondary"
                            : user.role === "partners-media"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.role === "partners-media" ? (
                        user.assigned_brand ? (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <Tag className="h-3 w-3" />
                            {user.assigned_brand}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Sem marca</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.approved ? "default" : "secondary"}>
                        {user.approved ? "Aprovado" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Approval/Disapproval buttons */}
                        {!user.approved &&
                        permissions.canApproveUser(user.role) ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => updateUserApproval(user.id, true)}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            Aprovar
                          </Button>
                        ) : user.approved &&
                          permissions.canDisapproveUser(user.role) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserApproval(user.id, false)}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Desaprovar
                          </Button>
                        ) : null}

                        {/* Role management buttons */}
                        {user.role !== "admin" &&
                          permissions.canChangeUserRole(user.role, "admin") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(user.id, "admin")}
                              disabled={actionLoading === user.id}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Shield className="h-3 w-3" />
                              )}
                              Admin
                            </Button>
                          )}

                        {user.role !== "partners-media" &&
                          permissions.canChangeUserRole(
                            user.role,
                            "partners-media"
                          ) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateUserRole(user.id, "partners-media")
                              }
                              disabled={actionLoading === user.id}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Shield className="h-3 w-3" />
                              )}
                              Partners Media
                            </Button>
                          )}

                        {user.role !== "user" &&
                          permissions.canChangeUserRole(user.role, "user") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(user.id, "user")}
                              disabled={actionLoading === user.id}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              User
                            </Button>
                          )}

                        {/* Brand assignment button for partners-media */}
                        {user.role === "partners-media" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openBrandDialog(user)}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Tag className="h-3 w-3" />
                            )}
                            {user.assigned_brand
                              ? "Alterar Marca"
                              : "Atribuir Marca"}
                          </Button>
                        )}

                        {permissions.canDeleteUser(user.role) && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionLoading === user.id}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Deletar Usuário</DialogTitle>
                                <DialogDescription>
                                  Tem certeza que deseja deletar o usuário{" "}
                                  {user.email}? Esta ação não pode ser desfeita.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button variant="outline">Cancelar</Button>
                                <Button
                                  variant="destructive"
                                  onClick={() =>
                                    deleteUser(user.id, user.email)
                                  }
                                  disabled={actionLoading === user.id}
                                >
                                  {actionLoading === user.id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Deletando...
                                    </>
                                  ) : (
                                    "Deletar"
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Nenhum usuário encontrado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Assignment Dialog */}
      <Dialog
        open={brandDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleBrandDialogCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Marca ao Usuário</DialogTitle>
            <DialogDescription>
              Selecione uma marca para o usuário {selectedUser?.email}.
              {selectedUser?.role === "partners-media"
                ? "Usuários partners-media devem sempre ter uma marca atribuída e só poderão ver produtos e pedidos da marca selecionada."
                : "Usuários partners-media só poderão ver produtos e pedidos da marca atribuída."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-select">Marca</Label>
              <Select
                value={selectedBrand}
                onValueChange={setSelectedBrand}
                disabled={brandsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma marca" />
                </SelectTrigger>
                <SelectContent>
                  {/* Only show "Remove brand" option if user is not partners-media */}
                  {selectedUser?.role !== "partners-media" && (
                    <SelectItem value="__remove_brand__">
                      Remover marca
                    </SelectItem>
                  )}
                  {brands.map((brand) => (
                    <SelectItem key={brand.brand} value={brand.brand}>
                      {brand.brand} ({brand.product_count} produtos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {brandsLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando marcas...
                </p>
              )}
              {/* Warning for partners-media users without brand selected */}
              {selectedUser?.role === "partners-media" &&
                (!selectedBrand || selectedBrand === "__remove_brand__") && (
                  <p className="text-sm text-destructive">
                    ⚠️ Usuários partners-media devem ter uma marca selecionada.
                  </p>
                )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleBrandDialogCancel}
              disabled={actionLoading === selectedUser?.id}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                selectedUser &&
                updateUserBrand(
                  selectedUser.id,
                  selectedBrand === "__remove_brand__" ? null : selectedBrand
                )
              }
              disabled={
                actionLoading === selectedUser?.id ||
                brandsLoading ||
                // Disable if partners-media user has no brand selected
                (selectedUser?.role === "partners-media" &&
                  (!selectedBrand || selectedBrand === "__remove_brand__"))
              }
            >
              {actionLoading === selectedUser?.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
