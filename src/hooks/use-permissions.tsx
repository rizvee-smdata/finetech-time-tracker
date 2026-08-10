import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getMyPermissions } from "@/lib/permissions/permissions.functions";
import {
  DEFAULT_PERMISSIONS,
  isFieldHidden,
  isFieldReadonly,
  maskField,
  type EffectivePermissions,
} from "@/lib/permissions/fields";

/**
 * Effective field/record permissions for the signed-in user.
 * Falls back to full visibility while loading so the UI never flashes masks.
 */
export function usePermissions() {
  const { user } = useAuth();
  const fetchPerms = useServerFn(getMyPermissions);

  const query = useQuery<EffectivePermissions>({
    queryKey: ["my-permissions", user?.id],
    queryFn: () => fetchPerms(),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const perms = query.data ?? DEFAULT_PERMISSIONS;

  return {
    perms,
    isLoading: query.isLoading,
    hidden: (entity: string, field: string) => isFieldHidden(perms, entity, field),
    readonly: (entity: string, field: string) => isFieldReadonly(perms, entity, field),
    mask: <T,>(entity: string, field: string, value: T) => maskField(perms, entity, field, value),
  };
}
