import { getApiWithRetry } from "../config/api";
import { translateTrackingPayload } from "../utils/runtimeTranslate";

export const fetchTrackingByCode = async (codigo, options = {}) => {
  const { language = "es", ...requestOptions } = options || {};
  const response = await getApiWithRetry("/api/public/tracking/eventos", {
    // bolipost can wait up to 15 seconds for its upstream provider; leave
    // enough room for the local-event merge and response serialization.
    timeout: 25000,
    retries: 0,
    params: { codigo },
    ...requestOptions,
  });

  return {
    ...response,
    data: await translateTrackingPayload(response.data, language),
  };
};
