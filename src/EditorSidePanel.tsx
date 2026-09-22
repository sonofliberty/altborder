import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  onChangeMode: (mode: EditMode) => void;
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
  transferRegionRows: RegionPanelRow[];
  onToggleTransferRegion: (regionId: string) => void;
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
  divideIsCalculating: boolean;
  newCountryName: string;
  newCountryColor: string;
  onSwapDivideSides: () => void;
  onClearDivideDraft: () => void;
  onChangeNewCountryName: (name: string) => void;
  onChangeNewCountryColor: (color: string) => void;
  canCreateDividedCountry: boolean;
  onCreateDividedCountry: () => void;
  keyboardCutActive: boolean;
  keyboardCutPointCount: number;
  onStartKeyboardCut: () => void;
  onFinishKeyboardCut: () => void;
  onCancelKeyboardCut: () => void;
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
      <PanelNav mode={props.mode} readOnly={props.readOnly} onChangeMode={props.onChangeMode} />

      <div key={props.mode} className="panel-mode-content" role="tabpanel" id="editor-mode-panel" aria-labelledby={`editor-mode-${props.mode}`}>
        {props.mode === "inspect" ? <InspectPanel {...props} /> : null}
        {props.mode === "transfer" ? <TransferPanel {...props} /> : null}
        {props.mode === "divide" ? <DividePanel {...props} /> : null}
        {props.mode === "merge" ? <MergePanel {...props} /> : null}
      </div>

      <details className="panel-about">
        <summary>About map data</summary>
        <p>{props.attribution}</p>
      </details>
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
      />

      {props.selectedEntity ? (
        <section className="context-section">
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
          ) : null}

          {props.inspectRegionRows.length > 0 ? (
            <details className="region-browser">
              <summary>
                <span>Regions</span>
                <small>{props.inspectRegionRows.length}</small>
              </summary>
              <RegionList
                regions={props.inspectRegionRows}
                focusedRegionId={props.inspectFocusedRegion?.id ?? ""}
                onSelect={props.onFocusInspectRegion}
              />
            </details>
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
      <section className="context-section compact-context-card">
        <div className="section-heading">Source country</div>
        {props.selectedEntity ? (
          <CountrySummary key={props.selectedEntity.id} entity={props.selectedEntity} onClear={() => props.onSelectEntity("")} />
        ) : (
          <CountrySearchSelect
            label="Country"
            value={props.selectedEntityId}
            options={props.entityOptions}
            onChange={props.onSelectEntity}
            disabled={props.readOnly}
            placeholder="Search countries"
          />
        )}
      </section>

      {props.selectedEntity ? (
        <section className="workflow-step">
          <div className="section-title-row">
            <div className="section-heading">Regions</div>
            <span>{selectedCount} selected</span>
          </div>
            <div className="switch-row">
              <button
                className={props.brushEnabled ? "active compact" : "compact"}
                disabled={props.readOnly}
                aria-pressed={props.brushEnabled}
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

            <TransferRegionPicker
              regions={props.transferRegionRows}
              selectedRegions={props.selectedTransferRegions}
              readOnly={props.readOnly}
              onToggle={props.onToggleTransferRegion}
            />

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
              <p className="hint">Select regions on the map.</p>
            )}

            {selectedCount > 1 ? (
              <RegionList
                regions={props.selectedTransferRegions}
                focusedRegionId={props.focusedTransferRegion?.id ?? ""}
                onSelect={props.onFocusTransferRegion}
                className="transfer-region-list"
              />
            ) : null}
        </section>
      ) : null}

      {selectedCount > 0 ? (
        <section className="workflow-step transfer-destination">
            <div className="section-heading">Destination</div>
            <CountrySearchSelect
              label="Country"
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
        </section>
      ) : null}
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
        showEditingFields={false}
      />

      {props.selectedEntity ? (
        <div className="tool-card">
          <div className="section-heading">New country</div>
          {!props.readOnly ? (
            <div className="keyboard-cut-controls">
              <button id="keyboard-cut-start" className="compact" onClick={props.onStartKeyboardCut}>
                {props.keyboardCutActive ? "Restart keyboard cut" : "Cut with keyboard"}
              </button>
              {props.keyboardCutActive ? (
                <>
                  <p id="keyboard-cut-help" className="hint" role="status">
                    Use arrow keys to move the marker. Hold Shift to move faster. Press Enter to add a point.
                    Add points on both sides of the country, then press F to finish. Backspace removes a point.
                    Escape cancels. {props.keyboardCutPointCount} {props.keyboardCutPointCount === 1 ? "point" : "points"} placed.
                  </p>
                  <div className="switch-row">
                    <button className="compact" disabled={props.keyboardCutPointCount < 2} onClick={props.onFinishKeyboardCut}>
                      Finish cut
                    </button>
                    <button className="compact" onClick={props.onCancelKeyboardCut}>Cancel</button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {props.divideHasDraft ? (
          <>
            <div className="switch-row">
              <button className="compact" disabled={props.readOnly || !props.divideCanSwap} onClick={props.onSwapDivideSides}>
                <ArrowLeftRight size={15} /> Swap
              </button>
              <button className="compact" disabled={props.readOnly || !props.divideHasDraft} onClick={props.onClearDivideDraft}>
                Clear
              </button>
            </div>
            {props.divideIsCalculating ? <div className="tool-status">Calculating border...</div> : null}
            {props.divideError ? <div className="tool-error">{props.divideError}</div> : null}
            {props.divideCanSwap ? (
              <>
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
            ) : null}
          </>
        ) : (
          <p className="hint">Draw a cut across the country, or click a separate island.</p>
        )}
        </div>
      ) : null}
    </>
  );
}

function TransferRegionPicker({
  regions,
  selectedRegions,
  readOnly,
  onToggle,
}: {
  regions: RegionPanelRow[];
  selectedRegions: RegionPanelRow[];
  readOnly: boolean;
  onToggle: (regionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(selectedRegions.map((region) => region.id)), [selectedRegions]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? regions.filter((region) => region.displayName.toLocaleLowerCase().includes(needle)) : regions;
  }, [query, regions]);

  return (
    <details className="region-picker">
      <summary>Choose regions by name</summary>
      <div className="region-picker-body">
        <label className="field">
          <span>Find region</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="region-picker-list" role="group" aria-label="Source regions">
          {matches.length > 0 ? matches.map((region) => (
            <label key={region.id} className="region-picker-row">
              <input
                type="checkbox"
                checked={selectedIds.has(region.id)}
                disabled={readOnly}
                onChange={() => onToggle(region.id)}
              />
              <span>{region.displayName}</span>
            </label>
          )) : <p className="hint">No matching regions.</p>}
        </div>
      </div>
    </details>
  );
}

function MergePanel(props: EditorSidePanelProps) {
  return (
    <>
      <section className="context-section country-context">
        <div className="section-heading">Add countries</div>
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

      {props.mergeSelectedEntities.length > 0 ? (
        <div className="tool-card">
          <div className="section-title-row">
            <div className="section-heading">Selected countries</div>
            <span>{props.mergeSelectedEntities.length}</span>
          </div>
          <CountryList
            entities={props.mergeSelectedEntities}
            onSelect={props.onZoomToMergeEntity}
            onRemove={props.onRemoveMergeEntity}
          />
          <div className="switch-row">
            <button className="compact" onClick={props.onClearMergeSelection}>Clear</button>
          </div>
          {props.canMerge ? (
            <>
              <label className="field">
                <span>Name</span>
                <input
                  value={props.mergeName}
                  disabled={props.readOnly}
                  onChange={(event) => props.onChangeMergeName(event.target.value)}
                  placeholder="Generated if blank"
                />
              </label>
              <button className="primary wide" disabled={props.readOnly} onClick={props.onMerge}>
                <GitMerge size={16} /> Merge selected
              </button>
            </>
          ) : (
            <p className="hint">Select one more country.</p>
          )}
        </div>
      ) : null}
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
  showEditingFields?: boolean;
}) {
  return (
    <section className="context-section country-context">
      {selectedEntity ? (
        <CountrySummary key={selectedEntity.id} entity={selectedEntity} onClear={() => onSelectEntity("")} />
      ) : (
        <>
          <div className="country-intro">
            <span className="country-intro-kicker">The atlas is yours</span>
            <h2>Your version of the world</h2>
            <p>
              {showEditingFields
                ? "Select a country on the map, or search by name."
                : "Choose a country, then draw its new border."}
            </p>
          </div>
          <CountrySearchSelect
            label="Country"
            value={selectedEntityId}
            options={entityOptions}
            onChange={onSelectEntity}
            disabled={readOnly && !selectedEntity}
            placeholder="Search countries"
          />
        </>
      )}

      {selectedEntity && showEditingFields ? (
        <details className="country-appearance">
          <summary>
            <span>Appearance</span>
            <small>Edit name, color, and flag</small>
          </summary>
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
        </details>
      ) : null}
    </section>
  );
}

function CountrySummary({ entity, onClear }: { entity: CountryEntity; onClear?: () => void }) {
  const regionCount = entity.regionIds.length;
  return (
    <div className="country-summary">
      <div className="country-summary-markers" aria-hidden="true">
        <img className="country-summary-flag" src={getCountryFlagUrl(getCountryFlag(entity))} alt="" />
      </div>
      <div className="country-summary-text">
        <span className="country-summary-kicker">{entity.isCustom ? "Custom country" : "Selected country"}</span>
        <h2 className="country-summary-name">{entity.name}</h2>
        <div className="country-summary-meta">
          <span className="country-swatch" style={{ backgroundColor: entity.color }} aria-hidden="true" />
          <span>{regionCount.toLocaleString()} {regionCount === 1 ? "region" : "regions"}</span>
        </div>
      </div>
      {onClear ? (
        <button className="country-summary-clear" onClick={onClear} title="Change country" aria-label="Change country">
          <X size={15} />
        </button>
      ) : null}
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
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selectedOption?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selectedOption?.name ?? "");
  }, [selectedOption?.name]);

  const filteredOptions = useMemo(
    () => filterCountryOptions(options, query, value),
    [options, query, value],
  );

  useEffect(() => {
    if (!open) return;
    listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, query]);

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
          aria-activedescendant={open && filteredOptions.length > 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(event) => {
            event.currentTarget.select();
            setActiveIndex(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (open && filteredOptions.length > 0) {
                setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + filteredOptions.length) % filteredOptions.length);
              }
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery(selectedOption?.name ?? "");
              return;
            }
            if (event.key === "Enter" && filteredOptions.length > 0 && (open || filteredOptions.length === 1)) {
              event.preventDefault();
              const option = filteredOptions[Math.min(activeIndex, filteredOptions.length - 1)];
              onChange(option.id);
              setQuery(resetAfterChange ? "" : option.name);
              setActiveIndex(0);
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
              setActiveIndex(0);
              setOpen(true);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div ref={listboxRef} className="country-search-results" id={listboxId} role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`${listboxId}-${index}`}
                aria-selected={option.id === value}
                key={option.id}
                className={index === activeIndex ? "keyboard-active" : option.id === value ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(option.id);
                  setQuery(resetAfterChange ? "" : option.name);
                  setActiveIndex(0);
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
        <div key={region.id} role="listitem">
          <button
            className={focusedRegionId === region.id ? "region-row active" : "region-row"}
            onClick={() => onSelect(region.id)}
          >
            <span>{region.displayName}</span>
            <small>{region.type}</small>
          </button>
        </div>
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
        <div key={entity.id} className="country-list-item" role="listitem">
          <button className="region-row" onClick={() => onSelect(entity.id)}>
            <span>{entity.name}</span>
          </button>
          <button className="country-list-remove" aria-label={`Remove ${entity.name}`} onClick={() => onRemove(entity.id)}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PanelNav({
  mode,
  readOnly,
  onChangeMode,
}: {
  mode: EditMode;
  readOnly: boolean;
  onChangeMode: (mode: EditMode) => void;
}) {
  const modes: Array<{ id: EditMode; label: string }> = [
    { id: "inspect", label: "Inspect" },
    { id: "transfer", label: "Transfer" },
    { id: "divide", label: "Divide" },
    { id: "merge", label: "Merge" },
  ];

  return (
    <div className="panel-nav">
      <div className="mode-tabs" role="tablist" aria-label="Editor mode">
        {modes.map((entry, index) => (
          <button
            key={entry.id}
            id={`editor-mode-${entry.id}`}
            role="tab"
            aria-selected={mode === entry.id}
            aria-controls="editor-mode-panel"
            tabIndex={mode === entry.id ? 0 : -1}
            className={mode === entry.id ? "active" : ""}
            onClick={() => onChangeMode(entry.id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === "ArrowRight") nextIndex = (index + 1) % modes.length;
              else if (event.key === "ArrowLeft") nextIndex = (index - 1 + modes.length) % modes.length;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = modes.length - 1;
              else return;
              event.preventDefault();
              onChangeMode(modes[nextIndex].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {readOnly ? <span className="viewer-badge"><Eye size={14} /> View only</span> : null}
    </div>
  );
}
