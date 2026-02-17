"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAvatarCache } from "@/hooks/useAvatarCache";
import { createClient } from "@/utils/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StableAvatar } from "@/components/StableAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Upload, Trash2, CheckCircle } from "lucide-react";
import { UserManagement } from "@/components/UserManagement";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { storage } from "@/lib/storage";

export default function ProfileSettingsPage() {
  const { user, signOut } = useAuth();
  const {
    profile,
    loading,
    isOwnerOrAdmin,
    updateProfile,
    deleteProfile,
    refreshProfile,
  } = useUserProfile();
  const { clearAvatarCache, generateCacheBustedUrl } = useAvatarCache();
  const router = useRouter();
  const supabase = createClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("profile");

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load active tab from localStorage on component mount
  useEffect(() => {
    const savedTab = storage.getItem("profile-settings-active-tab");
    if (savedTab) {
      setActiveTab(savedTab);
    }
  }, []);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    storage.setItem("profile-settings-active-tab", activeTab);
  }, [activeTab]);

  // Update form fields when profile loads
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
    }
  }, [profile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setMessage({
          type: "error",
          text: "Por favor, selecione apenas arquivos de imagem.",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setMessage({
          type: "error",
          text: "O arquivo deve ter no máximo 5MB.",
        });
        return;
      }

      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Clear any previous error messages
      setMessage(null);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user?.id) {
      return null;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = avatarFile.name.split(".").pop();
      // Use timestamp in filename to avoid cache issues
      const timestamp = Date.now();
      const fileName = `avatar_${timestamp}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // First, try to delete any existing avatar files to prevent accumulation
      try {
        const { data: existingFiles } = await supabase.storage
          .from("avatars")
          .list(user.id);

        if (existingFiles && existingFiles.length > 0) {
          const filesToDelete = existingFiles
            .filter((file) => file.name.startsWith("avatar"))
            .map((file) => `${user.id}/${file.name}`);

          if (filesToDelete.length > 0) {
            await supabase.storage.from("avatars").remove(filesToDelete);
          }
        }
      } catch {
        // Continue with upload even if deletion fails
      }

      // Upload new avatar file
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, avatarFile, {
          cacheControl: "0", // Disable caching
          upsert: false, // Don't upsert since we deleted old files
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Clear any existing avatar cache for this user
      clearAvatarCache(user.id);

      // Generate cache-busted URL
      const avatarUrlWithTimestamp = generateCacheBustedUrl(data.publicUrl);

      return avatarUrlWithTimestamp;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao fazer upload do avatar: ${errorMessage}`,
      });
      return null;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    setMessage(null);

    try {
      let avatarUrl = profile?.avatar_url;

      if (avatarFile) {
        avatarUrl = await uploadAvatar();
        if (!avatarUrl) {
          setIsUpdating(false);
          return;
        }
      }

      const updates: {
        first_name: string | null;
        last_name: string | null;
        avatar_url?: string;
      } = {
        first_name: firstName || null,
        last_name: lastName || null,
      };

      if (avatarUrl) {
        updates.avatar_url = avatarUrl;
      }

      const { error } = await updateProfile(updates);

      if (error) {
        throw error;
      }

      // Force refresh of profile data to update avatar in sidebar and other components
      await refreshProfile();

      setMessage({ type: "success", text: "Perfil atualizado com sucesso!" });
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao atualizar perfil: ${errorMessage}`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "As senhas não coincidem" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "A senha deve ter pelo menos 8 caracteres",
      });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setMessage({ type: "success", text: "Senha atualizada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao atualizar senha: ${errorMessage}`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProfile = async () => {
    setIsDeleting(true);
    setMessage(null);

    try {
      const { error } = await deleteProfile();

      if (error) throw error;

      await signOut();
      router.push("/login");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      setMessage({
        type: "error",
        text: `Erro ao deletar perfil: ${errorMessage}`,
      });
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold">Configurações de Perfil</h1>

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
          <AlertDescription className="text-sm sm:text-base">
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="text-xs sm:text-sm">
            Perfil
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs sm:text-sm">
            Segurança
          </TabsTrigger>
          {isOwnerOrAdmin && (
            <TabsTrigger value="admin" className="text-xs sm:text-sm">
              Administração
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">
                Informações do Perfil
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Atualize suas informações pessoais e avatar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-4">
                <StableAvatar
                  src={avatarPreview || profile?.avatar_url}
                  fallback={
                    profile?.first_name?.[0]?.toUpperCase() ||
                    profile?.email?.[0]?.toUpperCase() ||
                    "U"
                  }
                  alt="Avatar do usuário"
                  loading={loading}
                  size="lg"
                  updatedAt={profile?.updated_at}
                  className="h-16 w-16 sm:h-20 sm:w-20"
                />
                <div className="text-center sm:text-left">
                  <Label htmlFor="avatar" className="cursor-pointer">
                    <div className="flex items-center justify-center sm:justify-start space-x-2 text-sm text-blue-600 hover:text-blue-800">
                      <Upload className="h-4 w-4" />
                      <span>Alterar Avatar</span>
                    </div>
                  </Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Primeiro Nome</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Seu primeiro nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Último Nome</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Seu último nome"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              <Button
                onClick={handleUpdateProfile}
                disabled={isUpdating || isUploadingAvatar}
                className="w-full"
              >
                {isUpdating || isUploadingAvatar ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isUploadingAvatar ? "Fazendo upload..." : "Atualizando..."}
                  </>
                ) : (
                  "Atualizar Perfil"
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alterar Senha</CardTitle>
              <CardDescription>
                Atualize sua senha para manter sua conta segura
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <PasswordInput
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite sua nova senha (mín. 8 caracteres)"
                />
                <PasswordRequirements password={newPassword} showOnlyLength />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                />
              </div>
              <Button
                onClick={handleUpdatePassword}
                disabled={isUpdating || !newPassword || !confirmPassword}
                className="w-full"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  "Atualizar Senha"
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Zona de Perigo</CardTitle>
              <CardDescription>
                Ações irreversíveis que afetam permanentemente sua conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Deletar Conta
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tem certeza?</DialogTitle>
                    <DialogDescription>
                      Esta ação não pode ser desfeita. Isso irá deletar
                      permanentemente sua conta e remover todos os seus dados
                      dos nossos servidores.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancelar</Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteProfile}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deletando...
                        </>
                      ) : (
                        "Sim, deletar conta"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {isOwnerOrAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <UserManagement isAdmin={isOwnerOrAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
