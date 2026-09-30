import styles from "./celulas.module.css";
import type { LocationNeighborhood } from "./cell-location-api";

type CellLocationFieldsProps = {
  disabled: boolean;
  neighborhood: string;
  neighborhoods: LocationNeighborhood[];
  onNeighborhoodChange: (value: string) => void;
};

export function CellLocationFields({
  disabled,
  neighborhood,
  neighborhoods,
  onNeighborhoodChange
}: CellLocationFieldsProps) {
  return (
    <label className={styles.field}>
      Bairro
      <select
        disabled={disabled}
        onChange={(event) => onNeighborhoodChange(event.target.value)}
        required
        className={styles.input}
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
