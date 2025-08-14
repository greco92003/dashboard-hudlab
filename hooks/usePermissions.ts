"use client";

import { useUserProfile } from "./useUserProfile";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Tables"]["user_profiles"]["Row"]["role"];

interface UsePermissionsReturn {
  // Role checks
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isUser: boolean;
  isPartnersMedia: boolean;

  // Combined checks
  isOwnerOrAdmin: boolean;
  isAdminOrManager: boolean;

  // Permission checks
  canApproveUsers: boolean;
  canDisapproveUsers: boolean;
  canDeleteUsers: boolean;
  canPromoteToAdmin: boolean;
  canDemoteAdmin: boolean;
  canCreateOwner: boolean;
  canManageUserRoles: boolean;

  // User-specific permission checks
  canDeleteUser: (targetUserRole: UserRole) => boolean;
  canChangeUserRole: (targetUserRole: UserRole, newRole: UserRole) => boolean;
  canApproveUser: (targetUserRole: UserRole) => boolean;
  canDisapproveUser: (targetUserRole: UserRole) => boolean;

  // Current user info
  currentRole: UserRole | null;
  loading: boolean;
}

export function usePermissions(): UsePermissionsReturn {
  const {
    profile,
    loading,
    isOwner,
    isAdmin,
    isManager,
    isPartnersMedia,
    isOwnerOrAdmin,
  } = useUserProfile();

  const currentRole = profile?.role || null;
  const isUser = profile?.role === "user";

  // Basic permission checks
  const canApproveUsers = isOwnerOrAdmin;
  const canManageUserRoles = isOwnerOrAdmin;

  // Permission hierarchy
  const canDisapproveUsers = isOwnerOrAdmin; // Owners e admins podem desaprovar (com restrições)
  const canDeleteUsers = isOwnerOrAdmin; // Owners e admins podem deletar (com restrições)
  const canPromoteToAdmin = isOwnerOrAdmin; // Owners e admins podem promover para admin
  const canDemoteAdmin = isOwner; // Apenas owners podem rebaixar admins
  const canCreateOwner = isOwner; // Apenas owners podem criar outros owners

  // Combined checks
  const isAdminOrManager = isAdmin || isManager;

  // User-specific permission functions
  const canDeleteUser = (targetUserRole: UserRole): boolean => {
    // Owners podem deletar qualquer usuário (exceto outros owners)
    if (isOwner) {
      if (targetUserRole === "owner") return false; // Não pode deletar outros owners
      return true;
    }

    // Admins podem deletar usuários (exceto owners)
    if (isAdmin) {
      if (targetUserRole === "owner") return false; // Não pode deletar owners
      return true;
    }

    return false;
  };

  const canChangeUserRole = (
    targetUserRole: UserRole,
    newRole: UserRole
  ): boolean => {
    // Owners podem alterar qualquer role (exceto criar outros owners)
    if (isOwner) {
      // Não pode alterar role de outros owners
      if (targetUserRole === "owner") return false;
      // Não pode criar owners (isso deve ser feito através de processo especial)
      if (newRole === "owner") return false;
      return true;
    }

    // Admins podem alterar roles, mas não de owners
    if (isAdmin) {
      // Não pode alterar role de owners
      if (targetUserRole === "owner") return false;
      // Não pode criar owners
      if (newRole === "owner") return false;
      return true;
    }

    return false;
  };

  const canApproveUser = (targetUserRole: UserRole): boolean => {
    // Owners e admins podem aprovar usuários
    if (!isOwnerOrAdmin) return false;

    // Não faz sentido aprovar owners (eles já têm acesso total)
    if (targetUserRole === "owner") return false;

    return true;
  };

  const canDisapproveUser = (targetUserRole: UserRole): boolean => {
    // Owners podem desaprovar qualquer usuário (exceto outros owners)
    if (isOwner) {
      // Não pode desaprovar outros owners
      if (targetUserRole === "owner") return false;
      return true;
    }

    // Admins podem desaprovar usuários (exceto owners)
    if (isAdmin) {
      // Não pode desaprovar owners
      if (targetUserRole === "owner") return false;
      return true;
    }

    return false;
  };

  return {
    // Role checks
    isOwner,
    isAdmin,
    isManager,
    isUser,
    isPartnersMedia,

    // Combined checks
    isOwnerOrAdmin,
    isAdminOrManager,

    // Permission checks
    canApproveUsers,
    canDisapproveUsers,
    canDeleteUsers,
    canPromoteToAdmin,
    canDemoteAdmin,
    canCreateOwner,
    canManageUserRoles,

    // User-specific permission checks
    canDeleteUser,
    canChangeUserRole,
    canApproveUser,
    canDisapproveUser,

    // Current user info
    currentRole,
    loading,
  };
}

// Utility function to get role hierarchy level (higher number = more permissions)
export function getRoleLevel(role: UserRole): number {
  switch (role) {
    case "owner":
      return 5;
    case "admin":
      return 4;
    case "manager":
      return 3;
    case "partners-media":
      return 2;
    case "user":
      return 1;
    default:
      return 0;
  }
}

// Utility function to check if a role can manage another role
export function canManageRole(
  managerRole: UserRole,
  targetRole: UserRole
): boolean {
  // Owners can manage everyone except other owners
  if (managerRole === "owner" && targetRole !== "owner") {
    return true;
  }

  // Admins can manage users and managers, but not owners
  if (managerRole === "admin" && targetRole !== "owner") {
    return true;
  }

  return false;
}
