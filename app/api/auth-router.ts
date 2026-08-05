import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { demoRoleValues, findDemoTenant, setDemoRole } from "./queries/users";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery } from "./middleware";
import { scoped } from "./scoped";

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  /**
   * F2: demo role switcher — honest demo impersonation. Updates the caller's
   * membership role in the seeded demo tenant ONLY; validated against the
   * membership role enum.
   *
   * SEC-2: the switcher is strictly confined to the seeded demo tenant. In
   * any other tenant this is a self-privilege-escalation vector (any member
   * could promote themselves to broker_of_record/fintrac_officer), so it is
   * refused with FORBIDDEN.
   */
  chooseDemoRole: authedQuery
    .input(z.object({ role: z.enum(demoRoleValues) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const demoTenant = await findDemoTenant();
      if (!demoTenant || scope.tenantId !== demoTenant.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Demo role switching is only available in the seeded demo tenant",
        });
      }
      await setDemoRole(scope.userId, scope.tenantId, input.role);
      return { ok: true as const, tenantId: scope.tenantId, role: input.role };
    }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
