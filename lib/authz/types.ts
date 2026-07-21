import type { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";

export interface AuthorizationContext {
  userId: string;
  name: string;
  email: string;
  roles: UserRoleEnum[];
  permissions: readonly Permission[];
  isGlobalScope: boolean;
  communityIds: string[];
}
