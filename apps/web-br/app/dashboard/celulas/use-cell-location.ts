"use client";

import { useEffect, useState } from "react";
import {
  getChurchBaseLocation,
  type ChurchBaseCity
} from "./cell-location-api";

type GetToken = () => string | null;
type SetError = (message: string | null) => void;

export function useCellLocation(
  apiBaseUrl: string,
  getToken: GetToken,
  setError: SetError
) {
  const [baseCity, setBaseCity] = useState<ChurchBaseCity | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      return;
    }

    let cancelled = false;

    setIsLoadingLocation(true);

    void getChurchBaseLocation(apiBaseUrl, token)
      .then((data) => {
        if (!cancelled) {
          setBaseCity(data.city);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os bairros."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingLocation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, getToken, setError]);

  function resetLocation() {
    setNeighborhood("");
  }

  return {
    city: baseCity?.name ?? "",
    isLoadingLocation,
    neighborhood,
    neighborhoods: baseCity?.neighborhoods ?? [],
    resetLocation,
    setNeighborhood,
    stateCode: baseCity?.stateCode ?? ""
  };
}
