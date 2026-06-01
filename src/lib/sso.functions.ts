import { createServerFn } from "@tanstack/react-start";
import { verifySsoTokenImpl } from "./sso.server";

export const verifySsoToken = createServerFn({ method: "POST" })
  .inputValidator((data: { sig: string }) => data)
  .handler(async ({ data }) => verifySsoTokenImpl(data?.sig ?? ""));
