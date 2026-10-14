import { handleMobileInstitutionalExtension } from "../../src/features/mobile-v4/institutional-extension.server";
import { requestContext } from "./request-context";
import { handleMobileV4Http } from "../../src/features/mobile-v4/http.server";
import { routeMobileRequest } from "../backend/worker-runtime";

// Runtime bindings hold server secrets; never bundle them into Flutter assets.
export default {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    return routeMobileRequest(request, {
      extension: (r) => requestContext.run(r, () => handleMobileInstitutionalExtension(r)),
      canonical: (r) => requestContext.run(r, () => handleMobileV4Http(r)),
      assets: (r) => env.ASSETS.fetch(r),
    });
  },
};
