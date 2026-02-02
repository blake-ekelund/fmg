import {
  Brand,
  Platform,
  ContentStatus,
} from "../../types";
import { PublishDateField } from "../fields/PublishDateField";
import { BrandSelector } from "../fields/BrandSelector";
import { PlatformSelector } from "../fields/PlatformSelector";

type Props = {
  publishDate: string;
  setPublishDate: (v: string) => void;
  brands: Brand[];
  setBrands: (b: Brand[]) => void;
  platforms: Platform[];
  setPlatforms: (p: Platform[]) => void;
  status: ContentStatus;
  setStatus: (s: ContentStatus) => void;
  locked: boolean;
};

export function SetupSection({
  publishDate,
  setPublishDate,
  brands,
  setBrands,
  platforms,
  setPlatforms,
  locked,
}: Props) {
  function toggle<T>(list: T[], value: T, set: (v: T[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  return (
    <div className="space-y-5 pt-6">
      <PublishDateField
        value={publishDate}
        onChange={setPublishDate}
      />

      <BrandSelector
        brands={brands}
        onToggle={(b) => toggle(brands, b, setBrands)}
        locked={locked}
      />

      <PlatformSelector
        platforms={platforms}
        onToggle={(p) => toggle(platforms, p, setPlatforms)}
        locked={locked}
      />
    </div>
  );
}
