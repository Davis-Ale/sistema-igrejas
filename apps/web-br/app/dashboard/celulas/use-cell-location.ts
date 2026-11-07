"use client";

import { useEffect, useState } from "react";
import {
  getChurchBaseLocation,
  type ChurchBaseCity
} from "./cell-location-api";

type SetError = (message: string | null) => void;

export function useCellLocation(
  apiBaseUrl: string,
  setError: SetError
) {
  const [baseCity, setBaseCity] = useState<ChurchBaseCity | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingLocation(true);

    void getChurchBaseLocation(apiBaseUrl)
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
  }, [apiBaseUrl, setError]);

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
