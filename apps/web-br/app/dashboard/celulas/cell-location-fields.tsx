import type { BrazilCity, BrazilState } from "./cell-location-api";

type CellLocationFieldsProps = {
  cities: BrazilCity[];
  city: string;
  disabled: boolean;
  neighborhood: string;
  postalCode: string;
  stateCode: string;
  states: BrazilState[];
  onCityChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onPostalCodeBlur: () => void;
  onPostalCodeChange: (value: string) => void;
  onStateChange: (value: string) => void;
};

const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  font: "inherit",
  padding: "13px 14px"
};

const labelStyle = {
  color: "#cbd5e1",
  display: "grid",
  fontSize: "14px",
  fontWeight: 800,
  gap: "8px"
};

export function CellLocationFields({
  cities,
  city,
  disabled,
  neighborhood,
  postalCode,
  stateCode,
  states,
  onCityChange,
  onNeighborhoodChange,
  onPostalCodeBlur,
  onPostalCodeChange,
  onStateChange
}: CellLocationFieldsProps) {
  return (
    <>
      <label style={labelStyle}>
        CEP
        <input
          inputMode="numeric"
          onBlur={onPostalCodeBlur}
          onChange={(event) => onPostalCodeChange(event.target.value)}
          placeholder="00000-000"
          style={fieldStyle}
          type="text"
          value={postalCode}
        />
      </label>

      <label style={labelStyle}>
        UF
        <select
          disabled={disabled}
          onChange={(event) => onStateChange(event.target.value)}
          required
          style={fieldStyle}
          value={stateCode}
        >
          <option value="">Selecione</option>
          {states.map((state) => (
            <option key={state.id} value={state.code}>
              {state.code} - {state.name}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Cidade
        <select
          disabled={disabled || !stateCode}
          onChange={(event) => onCityChange(event.target.value)}
          required
          style={fieldStyle}
          value={city}
        >
          <option value="">Selecione</option>
          {cities.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Bairro
        <input
          disabled={disabled || !city}
          onChange={(event) => onNeighborhoodChange(event.target.value)}
          required
          style={fieldStyle}
          type="text"
          value={neighborhood}
        />
      </label>
    </>
  );
}
