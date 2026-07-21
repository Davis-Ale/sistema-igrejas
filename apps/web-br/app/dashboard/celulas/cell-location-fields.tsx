import type { LocationNeighborhood } from "./cell-location-api";

type CellLocationFieldsProps = {
  disabled: boolean;
  neighborhood: string;
  neighborhoods: LocationNeighborhood[];
  onNeighborhoodChange: (value: string) => void;
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
  disabled,
  neighborhood,
  neighborhoods,
  onNeighborhoodChange
}: CellLocationFieldsProps) {
  return (
    <label style={labelStyle}>
      Bairro
      <select
        disabled={disabled}
        onChange={(event) => onNeighborhoodChange(event.target.value)}
        required
        style={fieldStyle}
        value={neighborhood}
      >
        <option value="">Selecione</option>
        {neighborhoods.map((item) => (
          <option key={item.id} value={item.name}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
