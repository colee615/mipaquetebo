import { getApiErrorMessage } from "../config/api";

export const getLocalizedApiErrorMessage = (t, error, overrides = {}) =>
  getApiErrorMessage(error, {
    config: t("api.config", "API configuration is incomplete"),
    timeout: t("api.timeout", "The request took too long, please try again"),
    network: t("api.network", "Could not connect to the server"),
    invalidCode: t("api.invalidCode", "Invalid or not found code"),
    auth: t("api.auth", "Invalid API credentials"),
    server: t("api.server", "The server encountered a problem"),
    http: t("api.http", "Error while requesting data"),
    unknown: t("api.unknown", "An unexpected error occurred"),
    ...overrides,
  });
