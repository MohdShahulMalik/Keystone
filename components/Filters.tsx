"use client";

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterGroup = {
  label: string;
  options: FilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  multiSelect?: boolean;
};

type FiltersProps = {
  cardName: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  filterGroups?: FilterGroup[];
};

export function Filters({
  cardName,
  searchValue,
  onSearchChange,
  onAdd,
  filterGroups = [],
}: FiltersProps) {
  return (
    <section
      className="rounded-2xl border border-stroke bg-surface-800 p-4 shadow-sm sm:p-6"
      aria-label={`${cardName} filters`}
    >
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`${cardName.toLowerCase()}-search`}
            className="sr-only"
          >
            Search {cardName.toLowerCase()}s
          </label>
          <input
            id={`${cardName.toLowerCase()}-search`}
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={`Search ${cardName.toLowerCase()}s...`}
            className="h-full min-h-10 w-full rounded-xl border border-stroke bg-surface-900 px-5 py-3.5 text-base text-foreground-900 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-foreground-600-subtle focus:border-filter-chip-active-border focus:shadow-filter-chip-active"
          />
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[var(--color-btn-primary-from)] to-[var(--color-btn-primary-to)] px-5 py-3 text-base font-bold text-[var(--color-btn-primary-text)] shadow-[0_4px_16px_hsl(190_100%_42%_/_0.4)] transition-all duration-200 ease-out hover:brightness-105 hover:shadow-[0_6px_20px_hsl(190_100%_42%_/_0.48)]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add {cardName}
        </button>
      </div>

      {filterGroups.length > 0 ? (
        <div className="mt-5 space-y-5">
          {filterGroups.map((group) => (
            <div key={group.label} className="border-t border-stroke pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground-600">
                  {group.label}
                </span>
                {group.multiSelect ? (
                  <span className="text-xs text-foreground-600-subtle">
                    Multi-select
                  </span>
                ) : null}
              </div>

              <div className="scrollbar-hidden flex items-center gap-2 overflow-x-scroll">
                {group.options.map((option) => {
                  const isSelected = group.selectedValues.includes(
                    option.value,
                  );

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => group.onToggle(option.value)}
                      aria-pressed={isSelected}
                      className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-out ${
                        isSelected
                          ? "border-filter-chip-active-border bg-gradient-to-br from-filter-chip-active-from to-filter-chip-active-to text-foreground-900 shadow-filter-chip-active"
                          : "border-stroke bg-surface-800 text-foreground-600 hover:border-filter-chip-active-border"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
