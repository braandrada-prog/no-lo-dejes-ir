import { useCities } from '../hooks/useCities';

export default function CitySelect({ value, onChange, className }) {
  const cities = useCities();

  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      required
      className={className}
    >
      <option value="" disabled>
        Elegí una ciudad
      </option>
      {cities.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}