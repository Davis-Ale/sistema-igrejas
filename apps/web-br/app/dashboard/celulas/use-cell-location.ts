"use client";

import { useEffect, useState } from "react";
import {
  listBrazilCities,
  listBrazilStates,
  lookupBrazilPostalCode,
  type BrazilCity,
  type BrazilState
} from "./cell-location-api";

type GetToken = () => string | null;
type SetError = (message: string | null) => void;

export function useCellLocation(
  apiBaseUrl: string,
  getToken: GetToken,
  setError: SetError
) {
  const [states, setStates] = useState<BrazilState[]>([]);
  const [cities, setCities] = useState<BrazilCity[]>([]);
  const [stateCode, setStateCode] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      return;
    }

    let cancelled = false;
    setIsLoadingLocation(true);

    void listBrazilStates(apiBaseUrl, token)
      .then((data) => {
        if (!cancelled) {
          setStates(data);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os estados."
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

  async function handleStateChange(value: string) {
    setStateCode(value);
    setCity("");
    setNeighborhood("");
    setCities([]);

    if (!value) {
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setIsLoadingLocation(true);

    try {
      setCities(await listBrazilCities(apiBaseUrl, token, value));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as cidades."
      );
    } finally {
      setIsLoadingLocation(false);
    }
  }

  async function handlePostalCodeBlur() {
    const normalizedPostalCode = postalCode.replace(/\D/g, "");

    if (normalizedPostalCode.length !== 8) {
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setIsLoadingLocation(true);

    try {
      const location = await lookupBrazilPostalCode(
        apiBaseUrl,
        token,
        normalizedPostalCode
      );

      const loadedCities = await listBrazilCities(
        apiBaseUrl,
        token,
        location.state
      );

      setPostalCode(location.postalCode);
      setStateCode(location.state);
      setCities(loadedCities);
      setCity(location.city);
      setNeighborhood(location.neighborhood);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar o CEP."
      );
    } finally {
      setIsLoadingLocation(false);
    }
  }

  function resetLocation() {
    setStateCode("");
    setCity("");
    setNeighborhood("");
    setPostalCode("");
    setCities([]);
  }

  return {
    cities,
    city,
    handlePostalCodeBlur,
    handleStateChange,
    isLoadingLocation,
    neighborhood,
    postalCode,
    resetLocation,
    setCity,
    setNeighborhood,
    setPostalCode,
    stateCode,
    states
  };
}
