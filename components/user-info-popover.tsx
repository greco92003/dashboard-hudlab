"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserInfoPopoverProps {
  createdByUserId: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdByAvatarUrl: string | null;
  createdAt: string;
  className?: string;
}

export function UserInfoPopover({
  createdByUserId,
  createdByName,
  createdByEmail,
  createdByAvatarUrl,
  createdAt,
  className = "",
}: UserInfoPopoverProps) {
  // If no user data is available, don't render anything
  if (!createdByUserId && !createdByName && !createdByEmail) {
    return null;
  }

  // Format the creation date
  const formatCreatedAt = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return "Data inválida";
    }
  };

  // Get user initials for avatar fallback
  const getUserInitials = (name: string | null, email: string | null) => {
    if (name && name.trim()) {
      const nameParts = name.trim().split(" ");
      if (nameParts.length >= 2) {
        return `${nameParts[0][0]}${
          nameParts[nameParts.length - 1][0]
        }`.toUpperCase();
      }
      return nameParts[0][0].toUpperCase();
    }

    if (email) {
      return email[0].toUpperCase();
    }

    return "?";
  };

  const displayName = createdByName || createdByEmail || "Usuário desconhecido";
  const initials = getUserInitials(createdByName, createdByEmail);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center justify-center hover:opacity-80 transition-opacity ${className}`}
          type="button"
        >
          <Avatar className="h-6 w-6 cursor-pointer">
            <AvatarImage
              src={createdByAvatarUrl || undefined}
              alt={displayName}
            />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 sm:w-64 p-3 max-w-[calc(100vw-2rem)]"
        align="end"
        side="bottom"
        avoidCollisions={true}
        collisionPadding={8}
      >
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage
              src={createdByAvatarUrl || undefined}
              alt={displayName}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1 min-w-0">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none truncate">
                {displayName}
              </p>
              {createdByEmail && (
                <p className="text-xs text-muted-foreground truncate">
                  {createdByEmail}
                </p>
              )}
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Criado {formatCreatedAt(createdAt)}
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
