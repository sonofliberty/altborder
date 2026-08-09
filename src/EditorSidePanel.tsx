import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Brush,
  Check,
  Eye,
  GitMerge,
  Image,
  RotateCcw,
  Search,
  Split,
  Upload,
  X,
} from "lucide-react";
import type { CountrySearchOption } from "./countrySearch";
import { filterCountryOptions } from "./countrySearch";
import { customCountryAccentColor } from "./colorRuntime";
import type { CountryEntity, CountryFlag, EditMode } from "./types";
import {
  builtinCountryFlag,
  countryFlagEquals,
  getCountryFlag,
  getCountryFlagUrl,
  normalizeFlagUpload,
  type FlagOption,
} from "./countryFlags";

type RegionPanelRow = {
  id: string;
  displayName: string;
  type: string;
};

type EditorSidePanelProps = {
  mode: EditMode;
  readOnly: boolean;
  attribution: string;
  entityOptions: CountrySearchOption[];
  selectedEntity?: CountryEntity;
  selectedEntityId: string;
  onSelectEntity: (entityId: string) => void;
  onUpdateEntityName: (name: string) => void;
  onUpdateEntityColor: (color: string) => void;
  flagOptions: FlagOption[];
  defaultEntityFlag: CountryFlag;
  onUpdateEntityFlag: (flag: CountryFlag) => void;
  onResetEntityFlag: () => void;
  onFinishMetadataEdit: () => void;
  inspectFocusedRegion?: RegionPanelRow;
  inspectRegionRows: RegionPanelRow[];
  onFocusInspectRegion: (regionId: string) => void;
  onUpdateFocusedRegionName: (name: string) => void;
  brushEnabled: boolean;
  onToggleBrush: () => void;
  onSelectAllTransferRegions: () => void;
  onClearTransferSelection: () => void;
  selectedTransferRegions: RegionPanelRow[];
  focusedTransferRegion?: RegionPanelRow;
  onFocusTransferRegion: (regionId: string) => void;
  onSeparateRegion: (regionId: string) => void;
  transferTargetOptions: CountrySearchOption[];
  targetEntityId: string;
  onSelectTransferTarget: (entityId: string) => void;
  canTransfer: boolean;
  onApplyTransfer: () => void;
  divideCanSwap: boolean;
  divideHasDraft: boolean;
  divideError: string;
  newCountryName: string;
  newCountryColor: string;
  onSwapDivideSides: () => void;
  onClearDivideDraft: () => void;
  onChangeNewCountryName: (name: string) => void;
  onChangeNewCountryColor: (color: string) => void;
  canCreateDividedCountry: boolean;
  onCreateDividedCountry: () => void;
  mergeAvailableOptions: CountrySearchOption[];
  mergeSelectedEntities: CountrySearchOption[];
  mergeName: string;
  onAddMergeEntity: (entityId: string) => void;
  onZoomToMergeEntity: (entityId: string) => void;
  onRemoveMergeEntity: (entityId: string) => void;
  onClearMergeSelection: () => void;
  onChangeMergeName: (name: string) => void;
  canMerge: boolean;
  onMerge: () => void;
};

export function EditorSidePanel(props: EditorSidePanelProps) {
  return (
    <aside className="side-panel">
      <PanelHeader mode={props.mode} readOnly={props.readOnly} />

      {props.mode === "inspect" ? <InspectPanel {...props} /> : null}
      {props.mode === "transfer" ? <TransferPanel {...props} /> : null}
      {props.mode === "divide" ? <DividePanel {...props} /> : null}
      {props.mode === "merge" ? <MergePanel {...props} /> : null}

      <div className="attribution">{props.attribution}</div>
    </aside>
  );
}

function InspectPanel(props: EditorSidePanelProps) {
  return (
    <>
      <CountryContext
        entityOptions={props.entityOptions}
        selectedEntity={props.selectedEntity}
        selectedEntityId={props.selectedEntityId}
        readOnly={props.readOnly}
        onSelectEntity={props.onSelectEntity}
        onUpdateEntityName={props.onUpdateEntityName}
        onUpdateEntityColor={props.onUpdateEntityColor}
        flagOptions={props.flagOptions}
        defaultEntityFlag={props.defaultEntityFlag}
        onUpdateEntityFlag={props.onUpdateEntityFlag}
        onResetEntityFlag={props.onResetEntityFlag}
        onFinishMetadataEdit={props.onFinishMetadataEdit}
        emptyDescription="Click a country on the map or search below to start exploring."
      />

      {props.selectedEntity ? (
        <section className="context-section">
          <div className="section-heading">Region</div>

          {props.inspectFocusedRegion ? (
            <RegionSummary title="Focused region" name={props.inspectFocusedRegion.displayName}>
              <label className="field">
                <span>Region name</span>
                <input
                  value={props.inspectFocusedRegion.displayName}
                  disabled={props.readOnly}
                  onChange={(event) => props.onUpdateFocusedRegionName(event.target.value)}
                  onBlur={props.onFinishMetadataEdit}
                />
              </label>
            </RegionSummary>
          ) : (
            <p className="hint">Choose a region to inspect it or give it a custom name.</p>
          )}

          {props.inspectRegionRows.length > 0 ? (
            <RegionList
              regions={props.inspectRegionRows}
              focusedRegionId={props.inspectFocusedRegion?.id ?? ""}
              onSelect={props.onFocusInspectRegion}
            />
          ) : (
            <div className="empty-state">This country has no editable regions.</div>
          )}
        </section>
      ) : null}
    </>
  );
}

function TransferPanel(props: EditorSidePanelProps) {
  const selectedCount = props.selectedTransferRegions.length;

  return (
    <>
      <section className="workflow-step">
        <StepHeading number={1} title="Choose a source country" complete={Boolean(props.selectedEntity)} />
        <CountrySearchSelect
          label="Source country"
          value={props.selectedEntityId}
          options={props.entityOptions}
          onChange={props.onSelectEntity}
          disabled={props.readOnly}
          placeholder="Search countries"
        />
        {props.selectedEntity ? (
          <CountrySummary entity={props.selectedEntity} />
        ) : (
          <p className="hint">Pick a country here or click one on the map.</p>
        )}
      </section>

      <section className={props.selectedEntity ? "workflow-step" : "workflow-step is-disabled"}>
        <StepHeading number={2} title="Select regions" complete={selectedCount > 0} />
        {props.selectedEntity ? (
          <>
            <div className="selection-status">
              <strong>{selectedCount}</strong>
              <span>{selectedCount === 1 ? "region selected" : "regions selected"}</span>
            </div>
            <div className="switch-row">
              <button
                className={props.brushEnabled ? "active compact" : "compact"}
                disabled={props.readOnly}
                onClick={props.onToggleBrush}
              >
                <Brush size={15} /> Brush
              </button>
              <button className="compact" disabled={props.readOnly} onClick={props.onSelectAllTransferRegions}>
                All regions
              </button>
              <button
                className="compact"
                disabled={props.readOnly || selectedCount === 0}
                onClick={props.onClearTransferSelection}
              >
                Clear
              </button>
            </div>

            {props.focusedTransferRegion ? (
              <RegionSummary
                title="Focused region"
                name={props.focusedTransferRegion.displayName}
                className="transfer-region-detail"
              >
                <div className="region-actions">
                  <button
                    onClick={() => props.onSeparateRegion(props.focusedTransferRegion!.id)}
                    disabled={props.readOnly}
                  >
                    <Split size={15} /> Separate as country
                  </button>
                </div>
              </RegionSummary>
            ) : (
              <p className="hint">Click regions on the map, use Brush, or select all.</p>
            )}

            {selectedCount > 1 ? (
              <RegionList
                regions={props.selectedTransferRegions}
                focusedRegionId={props.focusedTransferRegion?.id ?? ""}
                onSelect={props.onFocusTransferRegion}
                className="transfer-region-list"
              />
            ) : null}
          </>
        ) : (
          <p className="hint">Choose a source country to unlock region selection.</p>
        )}
      </section>

      <section className={selectedCount > 0 ? "workflow-step" : "workflow-step is-disabled"}>
        <StepHeading number={3} title="Choose a destination" complete={Boolean(props.targetEntityId)} />
        {selectedCount > 0 ? (
          <>
            <CountrySearchSelect
              label="Destination country"
              value={props.targetEntityId}
              options={props.transferTargetOptions}
              onChange={props.onSelectTransferTarget}
              disabled={props.readOnly}
              placeholder="Search destinations"
            />
            <button
              className="primary wide"
              disabled={props.readOnly || !props.canTransfer}
              onClick={props.onApplyTransfer}
            >
              <Check size={16} /> Transfer {selectedCount} {selectedCount === 1 ? "region" : "regions"}
            </button>
          </>
        ) : (
          <p className="hint">Select at least one region before choosing its destination.</p>
        )}
      </section>
    </>
  );
}

function DividePanel(props: EditorSidePanelProps) {
  return (
    <>
      <CountryContext
        entityOptions={props.entityOptions}
        selectedEntity={props.selectedEntity}
        selectedEntityId={props.selectedEntityId}
        readOnly={props.readOnly}
        onSelectEntity={props.onSelectEntity}
        onUpdateEntityName={props.onUpdateEntityName}
        onUpdateEntityColor={props.onUpdateEntityColor}
        flagOptions={props.flagOptions}
        defaultEntityFlag={props.defaultEntityFlag}
        onUpdateEntityFlag={props.onUpdateEntityFlag}
        onResetEntityFlag={props.onResetEntityFlag}
        onFinishMetadataEdit={props.onFinishMetadataEdit}
        emptyDescription="Choose the country you want to divide."
      />

      <div className={props.selectedEntity ? "tool-card" : "tool-card is-disabled"}>
        <div className="section-heading">New country</div>
        {props.selectedEntity ? (
          <>
            <div className="switch-row">
              <button className="compact" disabled={props.readOnly || !props.divideCanSwap} onClick={props.onSwapDivideSides}>
                <ArrowLeftRight size={15} /> Swap
              </button>
              <button className="compact" disabled={props.readOnly || !props.divideHasDraft} onClick={props.onClearDivideDraft}>
                Clear
              </button>
            </div>
            <p className="hint">Draw a cut or click a separate island. Use Swap to choose the new side.</p>
            {props.divideError ? <div className="tool-error">{props.divideError}</div> : null}
            <label className="field">
              <span>Name</span>
              <input
                value={props.newCountryName}
                disabled={props.readOnly}
                onChange={(event) => props.onChangeNewCountryName(event.target.value)}
                placeholder="Required"
              />
            </label>
            <label className="field color-field">
              <span>Color</span>
              <input
                type="color"
                value={props.newCountryColor}
                disabled={props.readOnly}
                onInput={(event) => props.onChangeNewCountryColor(event.currentTarget.value)}
                onChange={(event) => props.onChangeNewCountryColor(event.target.value)}
              />
            </label>
            <button
              className="primary wide"
              disabled={props.readOnly || !props.canCreateDividedCountry}
              onClick={props.onCreateDividedCountry}
            >
              <Split size={16} /> Create country
            </button>
          </>
        ) : (
          <p className="hint">Choose a country first, then draw directly on the map.</p>
        )}
      </div>
    </>
  );
}

function MergePanel(props: EditorSidePanelProps) {
  return (
    <>
      <section className="context-section country-context">
        <div className="section-heading">Add countries</div>
        <p className="hint">Search here or click countries on the map. Click again to remove one.</p>
        <CountrySearchSelect
          label="Country to add"
          value=""
          options={props.mergeAvailableOptions}
          onChange={props.onAddMergeEntity}
          disabled={props.readOnly}
          placeholder="Search countries"
          resetAfterChange
        />
      </section>

      <div className="tool-card">
        <div className="section-heading">Selected countries</div>
        {props.mergeSelectedEntities.length > 0 ? (
          <CountryList
            entities={props.mergeSelectedEntities}
            onSelect={props.onZoomToMergeEntity}
            onRemove={props.onRemoveMergeEntity}
          />
        ) : (
          <div className="empty-state">Click two or more countries on the map.</div>
        )}
        <div className="switch-row">
          <button
            className="compact"
            disabled={props.mergeSelectedEntities.length === 0}
            onClick={props.onClearMergeSelection}
          >
            Clear
          </button>
        </div>
        <label className="field">
          <span>Name</span>
          <input
            value={props.mergeName}
            disabled={props.readOnly}
            onChange={(event) => props.onChangeMergeName(event.target.value)}
            placeholder="Generated if blank"
          />
        </label>
        <button className="primary wide" disabled={props.readOnly || !props.canMerge} onClick={props.onMerge}>
          <GitMerge size={16} /> Merge selected
        </button>
      </div>
    </>
  );
}

function CountryContext({
  entityOptions,
  selectedEntity,
  selectedEntityId,
  readOnly,
  onSelectEntity,
  onUpdateEntityName,
  onUpdateEntityColor,
  flagOptions,
  defaultEntityFlag,
  onUpdateEntityFlag,
  onResetEntityFlag,
  onFinishMetadataEdit,
  emptyDescription,
  showEditingFields = true,
}: {
  entityOptions: CountrySearchOption[];
  selectedEntity?: CountryEntity;
  selectedEntityId: string;
  readOnly: boolean;
  onSelectEntity: (entityId: string) => void;
  onUpdateEntityName: (name: string) => void;
  onUpdateEntityColor: (color: string) => void;
  flagOptions: FlagOption[];
  defaultEntityFlag: CountryFlag;
  onUpdateEntityFlag: (flag: CountryFlag) => void;
  onResetEntityFlag: () => void;
  onFinishMetadataEdit: () => void;
  emptyDescription: string;
  showEditingFields?: boolean;
}) {
  return (
    <section className="context-section country-context">
      <div className="section-heading">Country</div>

      {selectedEntity ? (
        <CountrySummary entity={selectedEntity} />
      ) : (
        <div className="welcome-card">
          <Search size={20} aria-hidden="true" />
          <div>
            <strong>Choose a country</strong>
            <p>{emptyDescription}</p>
          </div>
        </div>
      )}

      <CountrySearchSelect
        label="Selected country"
        value={selectedEntityId}
        options={entityOptions}
        onChange={onSelectEntity}
        disabled={readOnly && !selectedEntity}
        placeholder="Search countries"
      />

      {selectedEntity && showEditingFields ? (
        <div className="country-edit-fields">
          <label className="field">
            <span>Name</span>
            <input
              value={selectedEntity.name}
              disabled={readOnly}
              onChange={(event) => onUpdateEntityName(event.target.value)}
              onBlur={onFinishMetadataEdit}
            />
          </label>

          <label className="field color-field">
            <span>Color</span>
            <input
              type="color"
              value={selectedEntity.color ?? customCountryAccentColor}
              disabled={readOnly}
              onInput={(event) => onUpdateEntityColor(event.currentTarget.value)}
              onChange={(event) => onUpdateEntityColor(event.target.value)}
              onBlur={onFinishMetadataEdit}
            />
          </label>

          <FlagEditor
            entity={selectedEntity}
            options={flagOptions}
            defaultFlag={defaultEntityFlag}
            disabled={readOnly}
            onChange={onUpdateEntityFlag}
            onReset={onResetEntityFlag}
          />
        </div>
      ) : null}
    </section>
  );
}

function CountrySummary({ entity }: { entity: CountryEntity }) {
  const regionCount = entity.regionIds.length;
  return (
    <div className="country-summary">
      <div className="country-summary-markers" aria-hidden="true">
        <img className="country-summary-flag" src={getCountryFlagUrl(getCountryFlag(entity))} alt="" />
        <span className="country-swatch" style={{ backgroundColor: entity.color }} />
      </div>
      <div className="country-summary-text">
        <strong>{entity.name}</strong>
        <span>
          {entity.isCustom ? "Custom country" : "Base country"} · {regionCount.toLocaleString()} {regionCount === 1 ? "region" : "regions"}
        </span>
      </div>
    </div>
  );
}

function FlagEditor({
  entity,
  options,
  defaultFlag,
  disabled,
  onChange,
  onReset,
}: {
  entity: CountryEntity;
  options: FlagOption[];
  defaultFlag: CountryFlag;
  disabled: boolean;
  onChange: (flag: CountryFlag) => void;
  onReset: () => void;
}) {
  const currentFlag = getCountryFlag(entity);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => setUploadError(""), [entity.id]);

  return (
    <div className="field flag-editor">
      <span>Flag</span>
      <div className="flag-preview-row">
        <img className="flag-preview" src={getCountryFlagUrl(currentFlag)} alt={`${entity.name} flag`} />
        <div>
          <strong>{currentFlag.kind === "custom" ? "Custom image" : "Country flag"}</strong>
          <small>{currentFlag.kind === "builtin" ? currentFlag.id.toUpperCase() : "128 × 96 WebP"}</small>
        </div>
      </div>

      <CountrySearchSelect
        label="Choose a flag"
        value={currentFlag.kind === "builtin" && currentFlag.id !== "neutral" ? currentFlag.id : ""}
        options={options}
        onChange={(flagId) => {
          if (!flagId) return;
          setUploadError("");
          onChange(builtinCountryFlag(flagId));
        }}
        disabled={disabled}
        placeholder="Search flags"
        clearable={false}
      />

      <div className="flag-actions">
        <label className={disabled ? "button-like compact disabled" : "button-like compact"}>
          <Upload size={15} aria-hidden="true" /> Upload image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setUploadError("");
              void normalizeFlagUpload(file)
                .then(onChange)
                .catch((error: unknown) => {
                  setUploadError(error instanceof Error ? error.message : "The image could not be processed.");
                });
            }}
          />
        </label>
        <button
          type="button"
          className="compact"
          disabled={disabled || countryFlagEquals(currentFlag, defaultFlag)}
          onClick={() => {
            setUploadError("");
            onReset();
          }}
        >
          <RotateCcw size={15} aria-hidden="true" /> Reset
        </button>
      </div>
      {uploadError ? <div className="tool-error">{uploadError}</div> : null}
      <p className="hint flag-upload-hint">
        <Image size={13} aria-hidden="true" /> PNG, JPEG, WebP, or SVG. Maximum 2 MiB.
      </p>
    </div>
  );
}

function CountrySearchSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  resetAfterChange = false,
  clearable = true,
}: {
  label: string;
  value: string;
  options: CountrySearchOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  resetAfterChange?: boolean;
  clearable?: boolean;
}) {
  const listboxId = useId();
  const labelId = useId();
  const selectedOption = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selectedOption?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.name ?? "");
  }, [selectedOption?.name]);

  const filteredOptions = useMemo(
    () => filterCountryOptions(options, query, value),
    [options, query, value],
  );

  return (
    <div
      className="field country-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span id={labelId}>{label}</span>
      <div className="country-search-control">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-labelledby={labelId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(event) => {
            event.currentTarget.select();
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery(selectedOption?.name ?? "");
            }
            if (event.key === "Enter" && filteredOptions.length === 1) {
              event.preventDefault();
              const [option] = filteredOptions;
              onChange(option.id);
              setQuery(resetAfterChange ? "" : option.name);
              setOpen(false);
            }
          }}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            className="country-search-clear"
            title="Clear country"
            aria-label="Clear country"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div className="country-search-results" id={listboxId} role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                key={option.id}
                className={option.id === value ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id);
                  setQuery(resetAfterChange ? "" : option.name);
                  setOpen(false);
                }}
              >
                <span>{option.name}</span>
                <small>{option.meta ?? option.id}</small>
              </button>
            ))
          ) : (
            <div className="country-search-empty">No matching countries</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepHeading({ number, title, complete }: { number: number; title: string; complete: boolean }) {
  return (
    <div className="step-heading">
      <span className={complete ? "step-number complete" : "step-number"}>{complete ? <Check size={13} /> : number}</span>
      <strong>{title}</strong>
    </div>
  );
}

function RegionSummary({
  title,
  name,
  className = "",
  children,
}: {
  title: string;
  name: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={["region-detail", className].filter(Boolean).join(" ")}>
      <div className="region-detail-header">
        <span>{title}</span>
        <strong>{name}</strong>
      </div>
      {children}
    </div>
  );
}

function RegionList({
  regions,
  focusedRegionId,
  onSelect,
  className = "",
}: {
  regions: RegionPanelRow[];
  focusedRegionId: string;
  onSelect: (regionId: string) => void;
  className?: string;
}) {
  return (
    <div className={["region-list", className].filter(Boolean).join(" ")} role="list">
      {regions.map((region) => (
        <button
          key={region.id}
          className={focusedRegionId === region.id ? "region-row active" : "region-row"}
          onClick={() => onSelect(region.id)}
          role="listitem"
        >
          <span>{region.displayName}</span>
          <small>{region.type}</small>
        </button>
      ))}
    </div>
  );
}

function CountryList({
  entities,
  onSelect,
  onRemove,
}: {
  entities: CountrySearchOption[];
  onSelect: (entityId: string) => void;
  onRemove: (entityId: string) => void;
}) {
  return (
    <div className="region-list country-list" role="list">
      {entities.map((entity) => (
        <button key={entity.id} className="region-row" onClick={() => onSelect(entity.id)} role="listitem">
          <span>{entity.name}</span>
          <small
            onClick={(event) => {
              event.stopPropagation();
              onRemove(entity.id);
            }}
          >
            Remove
          </small>
        </button>
      ))}
    </div>
  );
}

function PanelHeader({ mode, readOnly }: { mode: EditMode; readOnly: boolean }) {
  return (
    <div className="panel-header">
      <div>
        <span>{readOnly ? "Viewer" : "Editor"}</span>
        <h1>{modeLabel(mode)}</h1>
      </div>
      {readOnly ? <Eye size={20} /> : null}
    </div>
  );
}

function modeLabel(mode: EditMode) {
  switch (mode) {
    case "inspect":
      return "Inspect";
    case "transfer":
      return "Transfer regions";
    case "divide":
      return "Divide country";
    case "merge":
      return "Merge countries";
  }
}
